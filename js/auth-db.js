/**
 * AntiTurno - Autenticación Segura y Base de Datos de Turnos y Vida Personal
 * Persistencia en una base de datos JSON local (ver js/json-db.js → AntiTurnoDB), sin servicios externos.
 * Implementa Web Cryptography API (PBKDF2-HMAC-SHA256 con 100.000 iteraciones + Salt criptográfico).
 * CRUD completo de Turnos Clínicos y Compromisos Personales / Autocuidado.
 * Algoritmo de Detección y Protección Anti-Cruces (Turnos vs Compromisos vs Descanso post-guardia).
 * Compatible con HTTPS (GitHub Pages), localhost y apertura local file://.
 */

class AuthDBService {
  constructor(db) {
    this.db = db || window.JsonDB;

    // La sesión y el último correo NO forman parte de la base de datos exportable.
    this.STORAGE_SESSION_KEY = 'antiturno_session_v2';
    this.STORAGE_LAST_EMAIL_KEY = 'antiturno_last_email_v1';
    this.STORAGE_LAST_EXPORT_KEY = 'antiturno_last_export_v1';
    this.LEGACY_SESSION_KEY = 'cuidadosync_session_v1';

    this.currentUser = null;
    this.isFirebaseReady = false;
    this.firestore = null;
    this.unsubscribeShifts = null;
    this.unsubscribeCommitments = null;

    this.init();
  }

  init() {
    this.initFirebase();
    this.migrateLegacySession();
    this.checkSession();
    if (this.currentUser && this.isFirebaseReady) {
      this.pullUserDataFromFirebase(this.currentUser.id);
      this.setupRealtimeSync(this.currentUser.id);
    }
  }

  /** Conserva la sesión iniciada con la versión anterior (si el usuario existe en la base JSON). */
  migrateLegacySession() {
    try {
      if (localStorage.getItem(this.STORAGE_SESSION_KEY)) return;
      const legacy = localStorage.getItem(this.LEGACY_SESSION_KEY);
      if (!legacy) return;
      const session = JSON.parse(legacy);
      if (session && session.email && !localStorage.getItem(this.STORAGE_LAST_EMAIL_KEY)) {
        localStorage.setItem(this.STORAGE_LAST_EMAIL_KEY, session.email);
      }
      if (session && session.userId && this.findUserById(session.userId) && Date.now() < session.expiresAt) {
        localStorage.setItem(this.STORAGE_SESSION_KEY, JSON.stringify(session));
      }
    } catch (e) {
      console.warn('No se pudo migrar la sesión anterior:', e);
    }
  }

  // ==========================================
  // INICIALIZACIÓN Y SINCRONIZACIÓN FIREBASE CLOUD
  // ==========================================
  initFirebase() {
    try {
      const cfg = (typeof window !== 'undefined' && window.FIREBASE_CONFIG) ? window.FIREBASE_CONFIG : null;
      if (cfg && cfg.apiKey && cfg.projectId && typeof window !== 'undefined' && window.firebase && window.firebase.initializeApp) {
        if (!firebase.apps || !firebase.apps.length) {
          firebase.initializeApp(cfg);
        }
        this.firestore = firebase.firestore();
        this.isFirebaseReady = true;
        console.log('☁️ AntiTurno: Conectado a Firebase Cloud Firestore');
      } else {
        this.isFirebaseReady = false;
      }
    } catch (e) {
      console.warn('⚠️ AntiTurno: Firebase no disponible (operando en modo local seguro):', e);
      this.isFirebaseReady = false;
    }
  }

  getAuthMode() {
    return this.isFirebaseReady ? 'cloud-firebase' : 'local-json';
  }

  async syncUserToFirebase(user) {
    if (!this.isFirebaseReady || !this.firestore || !user) return;
    try {
      const safeDoc = {
        id: user.id,
        name: user.name,
        email: user.email,
        salt: user.salt,
        hash: user.hash,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt || user.createdAt
      };
      await this.firestore.collection('users').doc(user.email).set(safeDoc, { merge: true });
      await this.firestore.collection('users').doc(user.id).set(safeDoc, { merge: true });
    } catch (e) {
      console.warn('Error sincronizando usuario a Firebase:', e);
    }
  }

  async pullUserDataFromFirebase(userId) {
    if (!this.isFirebaseReady || !this.firestore || !userId) return;
    try {
      // 1. Descargar turnos del usuario
      const shiftsSnap = await this.firestore.collection('users').doc(userId).collection('shifts').get();
      const remoteShifts = [];
      shiftsSnap.forEach(doc => {
        const data = doc.data();
        if (data && data.id) remoteShifts.push(data);
      });

      if (remoteShifts.length > 0) {
        const otherShifts = this.getAllShiftsFromStorage().filter(s => s.userId !== userId);
        const mergedShifts = [...otherShifts];
        remoteShifts.forEach(rs => {
          const idx = mergedShifts.findIndex(s => s.id === rs.id);
          if (idx >= 0) mergedShifts[idx] = rs;
          else mergedShifts.push(rs);
        });
        this.db.doc.shifts = mergedShifts;
        this.db.save();
      } else {
        const localShifts = this.getShifts();
        for (const s of localShifts) {
          await this.syncShiftToFirebase(s);
        }
      }

      // 2. Descargar compromisos personales del usuario
      const comSnap = await this.firestore.collection('users').doc(userId).collection('commitments').get();
      const remoteComs = [];
      comSnap.forEach(doc => {
        const data = doc.data();
        if (data && data.id) remoteComs.push(data);
      });

      if (remoteComs.length > 0) {
        const otherComs = this.getAllCommitmentsFromStorage().filter(c => c.userId !== userId);
        const mergedComs = [...otherComs];
        remoteComs.forEach(rc => {
          const idx = mergedComs.findIndex(c => c.id === rc.id);
          if (idx >= 0) mergedComs[idx] = rc;
          else mergedComs.push(rc);
        });
        this.db.doc.commitments = mergedComs;
        this.db.save();
      } else {
        const localComs = this.getCommitments();
        for (const c of localComs) {
          await this.syncCommitmentToFirebase(c);
        }
      }
    } catch (err) {
      console.warn('Error descargando datos desde Firestore:', err);
    }
  }

  setupRealtimeSync(userId) {
    if (!this.isFirebaseReady || !this.firestore || !userId) return;
    if (this.unsubscribeShifts) this.unsubscribeShifts();
    if (this.unsubscribeCommitments) this.unsubscribeCommitments();

    try {
      this.unsubscribeShifts = this.firestore
        .collection('users')
        .doc(userId)
        .collection('shifts')
        .onSnapshot(snapshot => {
          let changed = false;
          snapshot.docChanges().forEach(change => {
            const shift = change.doc.data();
            if (change.type === 'added' || change.type === 'modified') {
              const exists = this.db.findOne('shifts', s => s.id === shift.id);
              if (exists) {
                this.db.update('shifts', shift.id, shift);
              } else {
                this.db.insert('shifts', shift);
              }
              changed = true;
            } else if (change.type === 'removed') {
              this.db.remove('shifts', change.doc.id);
              changed = true;
            }
          });
          if (changed && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('antiturno-data-synced'));
          }
        }, err => console.warn('Snapshot shifts error:', err));

      this.unsubscribeCommitments = this.firestore
        .collection('users')
        .doc(userId)
        .collection('commitments')
        .onSnapshot(snapshot => {
          let changed = false;
          snapshot.docChanges().forEach(change => {
            const com = change.doc.data();
            if (change.type === 'added' || change.type === 'modified') {
              const exists = this.db.findOne('commitments', c => c.id === com.id);
              if (exists) {
                this.db.update('commitments', com.id, com);
              } else {
                this.db.insert('commitments', com);
              }
              changed = true;
            } else if (change.type === 'removed') {
              this.db.remove('commitments', change.doc.id);
              changed = true;
            }
          });
          if (changed && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('antiturno-data-synced'));
          }
        }, err => console.warn('Snapshot commitments error:', err));
    } catch (e) {
      console.warn('Error setting up realtime sync:', e);
    }
  }

  async syncShiftToFirebase(shift) {
    if (!this.isFirebaseReady || !this.firestore || !this.currentUser || !shift) return;
    try {
      await this.firestore
        .collection('users')
        .doc(this.currentUser.id)
        .collection('shifts')
        .doc(shift.id)
        .set(shift, { merge: true });
    } catch (e) {
      console.warn('Error guardando turno en Firestore:', e);
    }
  }

  async deleteShiftFromFirebase(shiftId) {
    if (!this.isFirebaseReady || !this.firestore || !this.currentUser || !shiftId) return;
    try {
      await this.firestore
        .collection('users')
        .doc(this.currentUser.id)
        .collection('shifts')
        .doc(shiftId)
        .delete();
    } catch (e) {
      console.warn('Error eliminando turno de Firestore:', e);
    }
  }

  async syncCommitmentToFirebase(com) {
    if (!this.isFirebaseReady || !this.firestore || !this.currentUser || !com) return;
    try {
      await this.firestore
        .collection('users')
        .doc(this.currentUser.id)
        .collection('commitments')
        .doc(com.id)
        .set(com, { merge: true });
    } catch (e) {
      console.warn('Error guardando compromiso en Firestore:', e);
    }
  }

  async deleteCommitmentFromFirebase(comId) {
    if (!this.isFirebaseReady || !this.firestore || !this.currentUser || !comId) return;
    try {
      await this.firestore
        .collection('users')
        .doc(this.currentUser.id)
        .collection('commitments')
        .doc(comId)
        .delete();
    } catch (e) {
      console.warn('Error eliminando compromiso de Firestore:', e);
    }
  }

  // ==========================================
  // CRIPTOGRAFÍA SEGURA LOCAL (PBKDF2 + SHA-256 Fallback)
  // ==========================================
  generateSalt() {
    if (window.crypto && window.crypto.getRandomValues) {
      const array = new Uint8Array(16);
      window.crypto.getRandomValues(array);
      return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let s = '';
    for (let i = 0; i < 32; i++) {
      s += Math.floor(Math.random() * 16).toString(16);
    }
    return s;
  }

  async hashPassword(password, salt) {
    if (window.crypto && window.crypto.subtle) {
      try {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
          "raw",
          enc.encode(password),
          { name: "PBKDF2" },
          false,
          ["deriveBits", "deriveKey"]
        );
        const derivedKey = await window.crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: enc.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
          },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"]
        );
        const exported = await window.crypto.subtle.exportKey("raw", derivedKey);
        const hashArray = Array.from(new Uint8Array(exported));
        return 'pbkdf2_subtle_' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        console.warn('Web Crypto Subtle no disponible, usando motor criptográfico compatible:', e);
      }
    }
    return 'sha256_compat_' + this.sha256(salt + ':' + password + ':' + salt);
  }

  sha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    let hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    const words = [];
    const asciiBitLength = ascii.length * 8;
    let i = 0;
    while (i < ascii.length) {
      words[i >> 2] |= (ascii.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
      i++;
    }
    words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
    words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

    for (let j = 0; j < words.length; j += 16) {
      const w = [];
      for (let idx = 0; idx < 16; idx++) w[idx] = words[j + idx] || 0;
      for (let idx = 16; idx < 64; idx++) {
        const s0 = rightRotate(w[idx - 15], 7) ^ rightRotate(w[idx - 15], 18) ^ (w[idx - 15] >>> 3);
        const s1 = rightRotate(w[idx - 2], 17) ^ rightRotate(w[idx - 2], 19) ^ (w[idx - 2] >>> 10);
        w[idx] = (w[idx - 16] + s0 + w[idx - 7] + s1) | 0;
      }

      let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
      let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

      for (let idx = 0; idx < 64; idx++) {
        const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        const ch = (e & f) ^ ((~e) & g);
        const temp1 = (h + S1 + ch + k[idx] + w[idx]) | 0;
        const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) | 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) | 0;
      }

      hash[0] = (hash[0] + a) | 0;
      hash[1] = (hash[1] + b) | 0;
      hash[2] = (hash[2] + c) | 0;
      hash[3] = (hash[3] + d) | 0;
      hash[4] = (hash[4] + e) | 0;
      hash[5] = (hash[5] + f) | 0;
      hash[6] = (hash[6] + g) | 0;
      hash[7] = (hash[7] + h) | 0;
    }

    let result = '';
    for (let idx = 0; idx < 8; idx++) {
      for (let b = 3; b >= 0; b--) {
        const byte = (hash[idx] >> (b * 8)) & 255;
        result += byte.toString(16).padStart(2, '0');
      }
    }
    return result;
  }

  // ==========================================
  // GESTIÓN DE USUARIOS Y AUTENTICACIÓN
  // ==========================================
  getAllUsers() {
    return this.db.getCollection('users');
  }

  findUserByEmail(email) {
    const clean = (email || '').trim().toLowerCase();
    return this.db.findOne('users', u => u.email === clean);
  }

  findUserById(id) {
    return this.db.findOne('users', u => u.id === id);
  }

  async register({ name, email, password, rememberEmail = true, rememberMe = true }) {
    if (!name || name.trim().length < 2) {
      throw new Error('Por favor ingresa un nombre válido (al menos 2 caracteres).');
    }
    const cleanEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Por favor ingresa un correo electrónico válido.');
    }
    if (!password || password.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }

    if (this.findUserByEmail(cleanEmail)) {
      throw new Error('Ya existe una cuenta registrada con este correo electrónico.');
    }

    if (this.isFirebaseReady && this.firestore) {
      try {
        const remoteDoc = await this.firestore.collection('users').doc(cleanEmail).get();
        if (remoteDoc.exists) {
          throw new Error('Ya existe una cuenta registrada con este correo electrónico.');
        }
      } catch (e) {
        if (e.message.includes('Ya existe')) throw e;
      }
    }

    const salt = this.generateSalt();
    const hash = await this.hashPassword(password, salt);
    const now = new Date().toISOString();

    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
      name: name.trim(),
      email: cleanEmail,
      salt: salt,
      hash: hash,
      createdAt: now,
      updatedAt: now,
      settings: { rememberEmail: !!rememberEmail }
    };

    this.db.insert('users', newUser);
    await this.syncUserToFirebase(newUser);

    this.handleRememberEmail(cleanEmail, rememberEmail);
    this.createSession(newUser, rememberMe);
    if (this.isFirebaseReady) {
      this.setupRealtimeSync(newUser.id);
    }
    return this.sanitizeUser(newUser);
  }

  async login({ email, password, rememberMe = true, rememberEmail = true }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      throw new Error('Por favor ingresa correo y contraseña.');
    }

    let user = this.findUserByEmail(cleanEmail);

    // Si no está en este dispositivo, buscar la cuenta en la nube (Firebase Firestore)
    if (!user && this.isFirebaseReady && this.firestore) {
      try {
        const remoteDoc = await this.firestore.collection('users').doc(cleanEmail).get();
        if (remoteDoc.exists) {
          user = remoteDoc.data();
          this.db.insert('users', user);
        }
      } catch (e) {
        console.warn('Error consultando usuario en Firebase:', e);
      }
    }

    if (!user) {
      throw new Error('No existe ninguna cuenta con este correo electrónico.');
    }

    const inputHash = await this.hashPassword(password, user.salt);
    if (inputHash !== user.hash) {
      throw new Error('Contraseña incorrecta. Por favor intenta de nuevo.');
    }

    this.handleRememberEmail(cleanEmail, rememberEmail);
    this.createSession(user, rememberMe);

    // Sincronizar automáticamente turnos y compromisos desde la nube
    if (this.isFirebaseReady) {
      await this.pullUserDataFromFirebase(user.id);
      this.setupRealtimeSync(user.id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('antiturno-data-synced'));
      }
    }

    return this.sanitizeUser(user);
  }

  async changePassword(currentPassword, newPassword) {
    const session = this.getCurrentUser();
    if (!session) throw new Error('Debes iniciar sesión.');
    const user = this.findUserById(session.id);
    if (!user) throw new Error('No se encontró la cuenta.');
    if (!newPassword || newPassword.length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
    }
    const currentHash = await this.hashPassword(currentPassword || '', user.salt);
    if (currentHash !== user.hash) {
      throw new Error('La contraseña actual no es correcta.');
    }
    const salt = this.generateSalt();
    const hash = await this.hashPassword(newPassword, salt);
    this.db.update('users', user.id, { salt, hash, updatedAt: new Date().toISOString() });
    return true;
  }

  async deleteAccount(password) {
    const session = this.getCurrentUser();
    if (!session) throw new Error('Debes iniciar sesión.');
    const user = this.findUserById(session.id);
    if (!user) throw new Error('No se encontró la cuenta.');
    const inputHash = await this.hashPassword(password || '', user.salt);
    if (inputHash !== user.hash) {
      throw new Error('Contraseña incorrecta. La cuenta no fue eliminada.');
    }
    this.db.removeWhere('shifts', s => s.userId === user.id);
    this.db.removeWhere('commitments', c => c.userId === user.id);
    this.db.remove('users', user.id);
    if (this.getLastEmail() === user.email) this.clearLastEmail();
    await this.logout();
    return true;
  }

  // ---------- Último correo recordado ----------
  handleRememberEmail(email, remember) {
    if (remember) this.saveLastEmail(email);
    else this.clearLastEmail();
  }

  saveLastEmail(email) {
    try { localStorage.setItem(this.STORAGE_LAST_EMAIL_KEY, (email || '').trim().toLowerCase()); } catch (e) {}
  }

  getLastEmail() {
    try { return localStorage.getItem(this.STORAGE_LAST_EMAIL_KEY) || ''; } catch (e) { return ''; }
  }

  clearLastEmail() {
    try { localStorage.removeItem(this.STORAGE_LAST_EMAIL_KEY); } catch (e) {}
  }

  // ---------- Copias de seguridad ----------
  markExported() {
    try { localStorage.setItem(this.STORAGE_LAST_EXPORT_KEY, new Date().toISOString()); } catch (e) {}
  }

  getLastExportAt() {
    try { return localStorage.getItem(this.STORAGE_LAST_EXPORT_KEY); } catch (e) { return null; }
  }

  // ---------- Sesión ----------
  createSession(user, rememberMe = true) {
    const session = {
      token: 'tok_' + Date.now() + '_' + Math.random().toString(36).substr(2, 10),
      userId: user.id,
      name: user.name,
      email: user.email,
      expiresAt: Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)
    };
    localStorage.setItem(this.STORAGE_SESSION_KEY, JSON.stringify(session));
    this.currentUser = this.sanitizeUser(user);
    return session;
  }

  checkSession() {
    try {
      const sessionData = localStorage.getItem(this.STORAGE_SESSION_KEY);
      if (!sessionData) {
        this.currentUser = null;
        return null;
      }
      const session = JSON.parse(sessionData);
      const user = this.findUserById(session.userId);
      if (Date.now() > session.expiresAt || !user) {
        // Sesión vencida o la cuenta ya no existe en la base JSON (ej. tras importar en modo reemplazar)
        localStorage.removeItem(this.STORAGE_SESSION_KEY);
        this.currentUser = null;
        return null;
      }
      this.currentUser = this.sanitizeUser(user);
      return this.currentUser;
    } catch (e) {
      this.currentUser = null;
      return null;
    }
  }

  async logout() {
    localStorage.removeItem(this.STORAGE_SESSION_KEY);
    this.currentUser = null;
  }

  getCurrentUser() {
    if (!this.currentUser) {
      this.checkSession();
    }
    return this.currentUser;
  }

  sanitizeUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    };
  }

  // ==========================================
  // GESTIÓN DE TURNOS (CRUD)
  // ==========================================
  getAllShiftsFromStorage() {
    return this.db.getCollection('shifts');
  }

  getShifts() {
    const user = this.getCurrentUser();
    if (!user) return [];
    return this.db.find('shifts', s => s.userId === user.id)
      .map(s => ({ ...s, reminders: this.normalizeReminders(s.reminders, s.type) }))
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.startTime || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.startTime || '00:00'}`);
        return dateA - dateB;
      });
  }

  getShiftById(shiftId) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const s = this.db.findOne('shifts', item => item.id === shiftId && item.userId === user.id);
    return s ? { ...s, reminders: this.normalizeReminders(s.reminders, s.type) } : null;
  }

  getShiftsForDate(dateStr) {
    const user = this.getCurrentUser();
    if (!user) return [];
    const shifts = this.getShifts();
    return shifts.filter(s => s.date === dateStr);
  }

  saveShift(shiftData) {
    const user = this.getCurrentUser();
    if (!user) {
      throw new Error('Debes iniciar sesión para registrar turnos.');
    }

    if (!shiftData.date) {
      throw new Error('Por favor selecciona la fecha del turno.');
    }
    if (!shiftData.startTime || !shiftData.endTime) {
      throw new Error('Por favor indica la hora de inicio y de fin.');
    }
    if (!shiftData.type) {
      shiftData.type = 'M';
    }

    const now = new Date().toISOString();
    const normalizedReminders = this.normalizeReminders(shiftData.reminders, shiftData.type);

    const fields = {
      date: shiftData.date,
      startTime: shiftData.startTime,
      endTime: shiftData.endTime,
      type: shiftData.type,
      hospital: (shiftData.hospital || '').trim(),
      service: (shiftData.service || '').trim(),
      notes: (shiftData.notes || '').trim(),
      reminders: normalizedReminders,
      updatedAt: now
    };

    if (shiftData.id) {
      const existing = this.getShiftById(shiftData.id);
      if (!existing) {
        throw new Error('El turno que intentas modificar no existe o no te pertenece.');
      }
      const updated = this.db.update('shifts', shiftData.id, fields);
      if (this.isFirebaseReady) this.syncShiftToFirebase({ ...existing, ...fields });
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('antiturno-shift-changed', {
            detail: { action: 'update', before: existing, after: { ...existing, ...fields } }
          }));
        }
      } catch (e) {}
      return { ...existing, ...fields };
    }

    const savedShift = {
      id: 'shf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
      userId: user.id,
      ...fields,
      createdAt: now
    };
    const inserted = this.db.insert('shifts', savedShift);
    if (this.isFirebaseReady) this.syncShiftToFirebase(savedShift);
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('antiturno-shift-changed', {
          detail: { action: 'create', after: savedShift }
        }));
      }
    } catch (e) {}
    return inserted;
  }

  deleteShift(shiftId) {
    const user = this.getCurrentUser();
    if (!user) {
      throw new Error('Debes iniciar sesión para eliminar turnos.');
    }
    const existing = this.getShiftById(shiftId);
    if (!existing) {
      throw new Error('El turno no existe o no pertenece a tu cuenta.');
    }
    const deleted = this.db.remove('shifts', shiftId);
    if (this.isFirebaseReady) this.deleteShiftFromFirebase(shiftId);
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('antiturno-shift-changed', {
          detail: { action: 'delete', before: existing }
        }));
      }
    } catch (e) {}
    return deleted;
  }

  // ==========================================
  // GESTIÓN DE COMPROMISOS PERSONALES (CRUD)
  // ==========================================
  getAllCommitmentsFromStorage() {
    return this.db.getCollection('commitments');
  }

  getCommitments() {
    const user = this.getCurrentUser();
    if (!user) return [];
    return this.db.find('commitments', c => c.userId === user.id)
      .map(c => ({ ...c, reminders: this.normalizeReminders(c.reminders, 'commitmentDefault') }))
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.startTime || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.startTime || '00:00'}`);
        return dateA - dateB;
      });
  }

  getCommitmentById(id) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const c = this.db.findOne('commitments', item => item.id === id && item.userId === user.id);
    return c ? { ...c, reminders: this.normalizeReminders(c.reminders, 'commitmentDefault') } : null;
  }

  getCommitmentsForDate(dateStr) {
    const user = this.getCurrentUser();
    if (!user) return [];
    const commitments = this.getCommitments();
    return commitments.filter(c => c.date === dateStr);
  }

  saveCommitment(commitmentData) {
    const user = this.getCurrentUser();
    if (!user) {
      throw new Error('Debes iniciar sesión para registrar compromisos personales.');
    }

    if (!commitmentData.title || commitmentData.title.trim().length === 0) {
      throw new Error('Por favor escribe un título para el compromiso.');
    }
    if (!commitmentData.date) {
      throw new Error('Por favor selecciona la fecha del compromiso.');
    }
    if (!commitmentData.startTime || !commitmentData.endTime) {
      throw new Error('Por favor especifica la hora de inicio y de fin.');
    }

    const now = new Date().toISOString();
    const normalizedReminders = this.normalizeReminders(commitmentData.reminders, 'commitmentDefault');
    const fields = {
      title: commitmentData.title.trim(),
      category: commitmentData.category || 'otro',
      date: commitmentData.date,
      startTime: commitmentData.startTime,
      endTime: commitmentData.endTime,
      location: commitmentData.location ? commitmentData.location.trim() : '',
      notes: commitmentData.notes ? commitmentData.notes.trim() : '',
      reminders: normalizedReminders,
      updatedAt: now
    };

    if (commitmentData.id) {
      if (!this.getCommitmentById(commitmentData.id)) {
        throw new Error('El compromiso que intentas modificar no existe o no te pertenece.');
      }
      return this.db.update('commitments', commitmentData.id, fields);
    }

    const saved = {
      id: 'com_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
      userId: user.id,
      ...fields,
      createdAt: now
    };
    return this.db.insert('commitments', saved);
  }

  deleteCommitment(id) {
    const user = this.getCurrentUser();
    if (!user) {
      throw new Error('Debes iniciar sesión para eliminar compromisos.');
    }
    if (!this.getCommitmentById(id)) {
      throw new Error('El compromiso no existe o no te pertenece.');
    }
    return this.db.remove('commitments', id);
  }

  // ==========================================
  // PROTECCIÓN ANTI-CRUCES (Algoritmo de Solapamientos)
  // ==========================================
  checkConflict(dateStr, startTimeStr, endTimeStr, excludeCommitmentId = null) {
    const user = this.getCurrentUser();
    if (!user) return { hasConflict: false };

    // Convertir horario del compromiso a minutos del día
    const [h1, m1] = startTimeStr.split(':').map(Number);
    const [h2, m2] = endTimeStr.split(':').map(Number);
    let cStart = h1 * 60 + m1;
    let cEnd = h2 * 60 + m2;
    if (cEnd <= cStart) cEnd += 24 * 60; // Cruza medianoche

    const shifts = this.getShifts();

    // 1. Revisar cruce directo con turnos en la misma fecha
    for (const s of shifts) {
      if (s.date === dateStr) {
        const [sh1, sm1] = s.startTime.split(':').map(Number);
        const [sh2, sm2] = s.endTime.split(':').map(Number);
        let sStart = sh1 * 60 + sm1;
        let sEnd = sh2 * 60 + sm2;
        if (sEnd <= sStart) sEnd += 24 * 60;

        // Comprobar intersección de intervalos: (startA < endB && startB < endA)
        if (cStart < sEnd && sStart < cEnd) {
          let shiftName = 'Turno Clínico';
          if (s.type === 'M') shiftName = 'Turno Mañana';
          if (s.type === 'T') shiftName = 'Turno Tarde';
          if (s.type === 'N') shiftName = 'Turno Noche';
          if (s.type === 'G') shiftName = 'Guardia 24h';

          return {
            hasConflict: true,
            type: 'shift',
            title: `Cruce Directo con ${shiftName}`,
            message: `Este compromiso coincide con tu ${shiftName} programado de ${s.startTime} a ${s.endTime} en ${s.hospital || 'Centro Hospitalario'}${s.service ? ' (' + s.service + ')' : ''}.`,
            item: s
          };
        }
      }

      // Si el turno era nocturno del día anterior y terminó en la mañana de dateStr
      const prevDate = new Date(dateStr + 'T00:00:00');
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];

      if (s.date === prevDateStr && (s.type === 'N' || s.type === 'G')) {
        const [sh1, sm1] = s.startTime.split(':').map(Number);
        const [sh2, sm2] = s.endTime.split(':').map(Number);
        let sStart = sh1 * 60 + sm1;
        let sEnd = sh2 * 60 + sm2;
        if (sEnd <= sStart) {
          const morningEndMin = sh2 * 60 + sm2;
          if (cStart < morningEndMin) {
            return {
              hasConflict: true,
              type: 'shift',
              title: 'Cruce con Guardia Nocturna en Curso',
              message: `Tu turno nocturno iniciado ayer aún estará activo hasta las ${s.endTime} de esta mañana.`,
              item: s
            };
          }

          // Descanso protegido post-noche (8 horas post-salida)
          const restEndMin = morningEndMin + 8 * 60;
          if (cStart < restEndMin) {
            const restEndH = Math.floor(restEndMin / 60);
            const restEndM = restEndMin % 60;
            const formattedRestEnd = `${String(restEndH).padStart(2, '0')}:${String(restEndM).padStart(2, '0')}`;

            return {
              hasConflict: true,
              type: 'rest',
              title: 'Solapamiento con Descanso Post-Guardia',
              message: `Tras salir de tu guardia nocturna a las ${s.endTime}, tu ventana recomendada de descanso y sueño reparador se extiende hasta las ${formattedRestEnd}. Programar actividades aquí puede generar fatiga acumulada.`,
              item: s
            };
          }
        }
      }
    }

    return { hasConflict: false };
  }

  // ==========================================
  // CÁLCULOS DINÁMICOS DE HORAS
  // ==========================================
  calculateShiftHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [h1, m1] = startTime.split(':').map(Number);
    const [h2, m2] = endTime.split(':').map(Number);
    let startMin = h1 * 60 + m1;
    let endMin = h2 * 60 + m2;
    if (endMin <= startMin) {
      endMin += 24 * 60;
    }
    return Math.round(((endMin - startMin) / 60) * 10) / 10;
  }

  getHoursSummary(year, month) {
    const shifts = this.getShifts();
    const targetMonthShifts = shifts.filter(s => {
      if (!s.date) return false;
      const d = new Date(s.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    });

    let totalHours = 0;
    let nightHours = 0;
    let dayHours = 0;
    let morningCount = 0;
    let afternoonCount = 0;
    let nightCount = 0;
    let guardiaCount = 0;

    targetMonthShifts.forEach(s => {
      const h = this.calculateShiftHours(s.startTime, s.endTime);
      totalHours += h;
      if (s.type === 'N') {
        nightHours += h;
        nightCount++;
      } else if (s.type === 'G') {
        nightHours += Math.min(10, h * 0.4);
        dayHours += Math.max(0, h - (h * 0.4));
        guardiaCount++;
      } else if (s.type === 'M') {
        dayHours += h;
        morningCount++;
      } else if (s.type === 'T') {
        dayHours += h;
        afternoonCount++;
      }
    });

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      nightHours: Math.round(nightHours * 10) / 10,
      dayHours: Math.round(dayHours * 10) / 10,
      shiftCount: targetMonthShifts.length,
      counts: {
        morning: morningCount,
        afternoon: afternoonCount,
        night: nightCount,
        guardia: guardiaCount
      }
    };
  }

  getNextUpcomingShift() {
    const shifts = this.getShifts();
    const now = new Date();
    for (const s of shifts) {
      const shiftDateTime = new Date(`${s.date}T${s.startTime || '00:00'}:00`);
      if (shiftDateTime >= now) {
        return s;
      }
    }
    return null;
  }

  // ==========================================
  // CONFIGURACIÓN Y GESTIÓN DE RECORDATORIOS (PLAN 03)
  // ==========================================
  getDefaultReminderPrefs() {
    return {
      notificationsEnabled: true,
      sound: true,
      quietHours: { enabled: false, from: '22:00', to: '06:00' },
      notifyOnChanges: true,
      templates: {
        M: [
          { id: 'tpl_m_1', offsetMinutes: 480, anchor: 'start', label: 'Dormir temprano (8h descanso)', category: 'descanso', enabled: true, firedAt: null },
          { id: 'tpl_m_2', offsetMinutes: 90, anchor: 'start', label: 'Salir hacia el hospital', category: 'salida', enabled: true, firedAt: null }
        ],
        T: [
          { id: 'tpl_t_1', offsetMinutes: 120, anchor: 'start', label: 'Almorzar y preparar uniforme', category: 'comida', enabled: true, firedAt: null },
          { id: 'tpl_t_2', offsetMinutes: 60, anchor: 'start', label: 'Salir hacia el hospital', category: 'salida', enabled: true, firedAt: null }
        ],
        N: [
          { id: 'tpl_n_1', offsetMinutes: 360, anchor: 'start', label: 'Siesta reparadora (6h antes)', category: 'descanso', enabled: true, firedAt: null },
          { id: 'tpl_n_2', offsetMinutes: 120, anchor: 'start', label: 'Cena ligera y café', category: 'comida', enabled: true, firedAt: null }
        ],
        G: [
          { id: 'tpl_g_1', offsetMinutes: 480, anchor: 'start', label: 'Descanso previo a guardia 24h', category: 'descanso', enabled: true, firedAt: null },
          { id: 'tpl_g_2', offsetMinutes: 120, anchor: 'start', label: 'Revisar víveres y mudas de uniforme', category: 'comida', enabled: true, firedAt: null }
        ]
      },
      commitmentDefault: [
        { id: 'tpl_com_1', offsetMinutes: 60, anchor: 'start', label: 'Compromiso personal en 1 hora', category: 'personalizado', enabled: true, firedAt: null }
      ]
    };
  }

  getReminderPrefs() {
    const user = this.getCurrentUser();
    if (user && this.db) {
      const fullUser = this.findUserById(user.id);
      if (fullUser && fullUser.settings && fullUser.settings.reminderPrefs) {
        return { ...this.getDefaultReminderPrefs(), ...fullUser.settings.reminderPrefs };
      }
    }
    try {
      const local = (typeof localStorage !== 'undefined' ? localStorage.getItem('antiturno_reminder_prefs_v1') : null);
      if (local) return { ...this.getDefaultReminderPrefs(), ...JSON.parse(local) };
    } catch (e) {}
    return this.getDefaultReminderPrefs();
  }

  saveReminderPrefs(prefs) {
    const merged = { ...this.getDefaultReminderPrefs(), ...prefs };
    const user = this.getCurrentUser();
    if (user && this.db) {
      const fullUser = this.findUserById(user.id);
      if (fullUser) {
        const settings = fullUser.settings || {};
        settings.reminderPrefs = merged;
        this.db.update('users', user.id, { settings, updatedAt: new Date().toISOString() });
      }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('antiturno_reminder_prefs_v1', JSON.stringify(merged));
      }
    } catch (e) {}
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('antiturno-reminder-prefs-changed', { detail: merged }));
      }
    } catch (e) {}
    return merged;
  }

  normalizeReminders(reminders, defaultType = 'M') {
    if (Array.isArray(reminders)) {
      return reminders.map((r, idx) => ({
        id: r.id || 'rem_' + Date.now() + '_' + idx,
        offsetMinutes: Number(r.offsetMinutes ?? 120),
        anchor: r.anchor === 'end' ? 'end' : 'start',
        label: (r.label || 'Recordatorio').trim(),
        category: r.category || 'personalizado',
        enabled: r.enabled !== false,
        firedAt: r.firedAt || null
      }));
    }

    // Formato legado de 3 booleanos { reminder2h, reminderTupper, reminderRest }
    if (reminders && typeof reminders === 'object') {
      const list = [];
      if (reminders.reminderRest) {
        list.push({
          id: 'rem_legacy_rest',
          offsetMinutes: 480,
          anchor: 'start',
          label: 'Descanso 8h previas',
          category: 'descanso',
          enabled: true,
          firedAt: null
        });
      }
      if (reminders.reminderTupper) {
        list.push({
          id: 'rem_legacy_tupper',
          offsetMinutes: 180,
          anchor: 'start',
          label: 'Preparar uniforme y comida',
          category: 'comida',
          enabled: true,
          firedAt: null
        });
      }
      if (reminders.reminder2h) {
        list.push({
          id: 'rem_legacy_2h',
          offsetMinutes: 120,
          anchor: 'start',
          label: 'Aviso 2h antes de salir',
          category: 'salida',
          enabled: true,
          firedAt: null
        });
      }
      if (list.length > 0) return list;
    }

    // Plantilla según tipo
    const prefs = this.getReminderPrefs();
    if (defaultType === 'commitmentDefault') {
      return JSON.parse(JSON.stringify(prefs.commitmentDefault || []));
    }
    const tpl = (prefs.templates && prefs.templates[defaultType]) || [];
    return JSON.parse(JSON.stringify(tpl));
  }

  markReminderFired(collection, itemId, reminderId, firedAt = new Date().toISOString()) {
    const item = this.db.findOne(collection, x => x.id === itemId);
    if (!item) return false;
    const reminders = this.normalizeReminders(item.reminders, item.type || 'commitmentDefault');
    const target = reminders.find(r => r.id === reminderId);
    if (!target) return false;
    target.firedAt = firedAt;
    this.db.update(collection, itemId, { reminders, updatedAt: new Date().toISOString() });
    return true;
  }

}


// Instancia global
window.AuthDB = new AuthDBService();
