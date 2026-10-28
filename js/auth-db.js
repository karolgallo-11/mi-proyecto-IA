/**
 * CuidadoSync - Autenticación Segura y Base de Datos de Turnos y Vida Personal
 * Implementa Web Cryptography API (PBKDF2-HMAC-SHA256 con 100.000 iteraciones + Salt criptográfico)
 * Almacenamiento persistente multi-usuario aislado por ID.
 * CRUD completo de Turnos Clínicos y Compromisos Personales / Autocuidado.
 * Algoritmo de Detección y Protección Anti-Cruces (Turnos vs Compromisos vs Descanso post-guardia).
 * Compatible con HTTPS (GitHub Pages), localhost y apertura local file://.
 */

class AuthDBService {
  constructor() {
    this.STORAGE_USERS_KEY = 'cuidadosync_users_v1';
    this.STORAGE_SHIFTS_KEY = 'cuidadosync_shifts_v1';
    this.STORAGE_COMMITMENTS_KEY = 'cuidadosync_commitments_v1';
    this.STORAGE_SESSION_KEY = 'cuidadosync_session_v1';
    this.STORAGE_FIREBASE_KEY = 'cuidadosync_firebase_config_v1';
    this.currentUser = null;
    this.init();
  }

  init() {
    this.checkSession();
  }

  // ==========================================
  // CRIPTOGRAFÍA SEGURA (Web Crypto API + Fallback)
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
        console.warn('Web Crypto Subtle no disponible o restringido, usando motor criptográfico compatible:', e);
      }
    }
    return 'sha256_compat_' + this.sha256(salt + ':' + password + ':' + salt);
  }

  sha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
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
    try {
      const data = localStorage.getItem(this.STORAGE_USERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al leer usuarios de localStorage:', e);
      return [];
    }
  }

  saveAllUsers(users) {
    localStorage.setItem(this.STORAGE_USERS_KEY, JSON.stringify(users));
  }

  async register({ name, email, password }) {
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

    const users = this.getAllUsers();
    if (users.some(u => u.email === cleanEmail)) {
      throw new Error('Ya existe una cuenta registrada con este correo electrónico.');
    }

    const salt = this.generateSalt();
    const hash = await this.hashPassword(password, salt);

    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
      name: name.trim(),
      email: cleanEmail,
      salt: salt,
      hash: hash,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveAllUsers(users);

    this.createSession(newUser);
    this.syncRegisterFirebase(cleanEmail, password);

    return this.sanitizeUser(newUser);
  }

  async login({ email, password, rememberMe = true }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      throw new Error('Por favor ingresa correo y contraseña.');
    }

    const users = this.getAllUsers();
    const user = users.find(u => u.email === cleanEmail);
    if (!user) {
      throw new Error('No existe ninguna cuenta con este correo.');
    }

    const inputHash = await this.hashPassword(password, user.salt);
    if (inputHash !== user.hash) {
      throw new Error('Contraseña incorrecta. Por favor intenta de nuevo.');
    }

    this.createSession(user, rememberMe);
    this.syncLoginFirebase(cleanEmail, password);

    return this.sanitizeUser(user);
  }

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
      if (Date.now() > session.expiresAt) {
        this.logout();
        return null;
      }
      this.currentUser = {
        id: session.userId,
        name: session.name,
        email: session.email
      };
      return this.currentUser;
    } catch (e) {
      this.currentUser = null;
      return null;
    }
  }

  logout() {
    localStorage.removeItem(this.STORAGE_SESSION_KEY);
    this.currentUser = null;
    if (window.firebase && window.firebase.auth) {
      try { window.firebase.auth().signOut(); } catch(e) {}
    }
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
  // GESTIÓN DE TURNOS (CRUD AISLADO POR USUARIO)
  // ==========================================
  getAllShiftsFromStorage() {
    try {
      const data = localStorage.getItem(this.STORAGE_SHIFTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al leer turnos de localStorage:', e);
      return [];
    }
  }

  saveAllShiftsToStorage(shifts) {
    localStorage.setItem(this.STORAGE_SHIFTS_KEY, JSON.stringify(shifts));
  }

  getShifts() {
    const user = this.getCurrentUser();
    if (!user) return [];
    const all = this.getAllShiftsFromStorage();
    return all
      .filter(s => s.userId === user.id)
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.startTime || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.startTime || '00:00'}`);
        return dateA - dateB;
      });
  }

  getShiftById(shiftId) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const all = this.getAllShiftsFromStorage();
    return all.find(s => s.id === shiftId && s.userId === user.id) || null;
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

    const all = this.getAllShiftsFromStorage();
    let savedShift = null;

    if (shiftData.id) {
      const index = all.findIndex(s => s.id === shiftData.id && s.userId === user.id);
      if (index === -1) {
        throw new Error('El turno que intentas modificar no existe o no te pertenece.');
      }
      all[index] = {
        ...all[index],
        date: shiftData.date,
        startTime: shiftData.startTime,
        endTime: shiftData.endTime,
        type: shiftData.type,
        hospital: shiftData.hospital || 'Hospital Clínico Central',
        service: shiftData.service || 'UCI Adultos',
        notes: shiftData.notes || '',
        reminders: shiftData.reminders || { reminder2h: true, reminderTupper: true, reminderRest: true },
        updatedAt: new Date().toISOString()
      };
      savedShift = all[index];
    } else {
      savedShift = {
        id: 'shf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
        userId: user.id,
        date: shiftData.date,
        startTime: shiftData.startTime,
        endTime: shiftData.endTime,
        type: shiftData.type,
        hospital: shiftData.hospital || 'Hospital Clínico Central',
        service: shiftData.service || 'UCI Adultos',
        notes: shiftData.notes || '',
        reminders: shiftData.reminders || { reminder2h: true, reminderTupper: true, reminderRest: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      all.push(savedShift);
    }

    this.saveAllShiftsToStorage(all);
    this.syncShiftToFirebase(savedShift);

    return savedShift;
  }

  deleteShift(shiftId) {
    const user = this.getCurrentUser();
    if (!user) {
      throw new Error('Debes iniciar sesión para eliminar turnos.');
    }

    const all = this.getAllShiftsFromStorage();
    const index = all.findIndex(s => s.id === shiftId && s.userId === user.id);
    if (index === -1) {
      throw new Error('El turno no existe o no pertenece a tu cuenta.');
    }

    const deleted = all.splice(index, 1)[0];
    this.saveAllShiftsToStorage(all);
    this.deleteShiftFromFirebase(shiftId);

    return deleted;
  }

  // ==========================================
  // GESTIÓN DE COMPROMISOS PERSONALES (CRUD)
  // ==========================================
  getAllCommitmentsFromStorage() {
    try {
      const data = localStorage.getItem(this.STORAGE_COMMITMENTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al leer compromisos de localStorage:', e);
      return [];
    }
  }

  saveAllCommitmentsToStorage(commitments) {
    localStorage.setItem(this.STORAGE_COMMITMENTS_KEY, JSON.stringify(commitments));
  }

  getCommitments() {
    const user = this.getCurrentUser();
    if (!user) return [];
    const all = this.getAllCommitmentsFromStorage();
    return all
      .filter(c => c.userId === user.id)
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.startTime || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.startTime || '00:00'}`);
        return dateA - dateB;
      });
  }

  getCommitmentById(id) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const all = this.getAllCommitmentsFromStorage();
    return all.find(c => c.id === id && c.userId === user.id) || null;
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

    const all = this.getAllCommitmentsFromStorage();
    let saved = null;

    if (commitmentData.id) {
      const idx = all.findIndex(c => c.id === commitmentData.id && c.userId === user.id);
      if (idx === -1) {
        throw new Error('El compromiso que intentas modificar no existe o no te pertenece.');
      }
      all[idx] = {
        ...all[idx],
        title: commitmentData.title.trim(),
        category: commitmentData.category || 'otro',
        date: commitmentData.date,
        startTime: commitmentData.startTime,
        endTime: commitmentData.endTime,
        location: commitmentData.location ? commitmentData.location.trim() : '',
        notes: commitmentData.notes ? commitmentData.notes.trim() : '',
        updatedAt: new Date().toISOString()
      };
      saved = all[idx];
    } else {
      saved = {
        id: 'com_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
        userId: user.id,
        title: commitmentData.title.trim(),
        category: commitmentData.category || 'otro',
        date: commitmentData.date,
        startTime: commitmentData.startTime,
        endTime: commitmentData.endTime,
        location: commitmentData.location ? commitmentData.location.trim() : '',
        notes: commitmentData.notes ? commitmentData.notes.trim() : '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      all.push(saved);
    }

    this.saveAllCommitmentsToStorage(all);
    return saved;
  }

  deleteCommitment(id) {
    const user = this.getCurrentUser();
    if (!user) {
      throw new Error('Debes iniciar sesión para eliminar compromisos.');
    }

    const all = this.getAllCommitmentsFromStorage();
    const idx = all.findIndex(c => c.id === id && c.userId === user.id);
    if (idx === -1) {
      throw new Error('El compromiso no existe o no te pertenece.');
    }

    const deleted = all.splice(idx, 1)[0];
    this.saveAllCommitmentsToStorage(all);
    return deleted;
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
            message: `Este compromiso coincide con tu ${shiftName} programado de ${s.startTime} a ${s.endTime} en ${s.hospital || 'Hospital'} (${s.service || 'UCI'}).`,
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
          // El turno terminó en dateStr a las sh2:sm2
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

          // Descanso protegido obligatorio post-noche (8 horas post-salida)
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
  // INTEGRACIÓN CON LA NUBE (FIREBASE OPCIONAL)
  // ==========================================
  getFirebaseConfig() {
    try {
      const data = localStorage.getItem(this.STORAGE_FIREBASE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  saveFirebaseConfig(config) {
    if (!config) {
      localStorage.removeItem(this.STORAGE_FIREBASE_KEY);
    } else {
      localStorage.setItem(this.STORAGE_FIREBASE_KEY, JSON.stringify(config));
    }
  }

  syncRegisterFirebase(email, password) {
    if (window.firebase && window.firebase.auth && this.getFirebaseConfig()) {
      try {
        window.firebase.auth().createUserWithEmailAndPassword(email, password).catch(console.warn);
      } catch (e) {}
    }
  }

  syncLoginFirebase(email, password) {
    if (window.firebase && window.firebase.auth && this.getFirebaseConfig()) {
      try {
        window.firebase.auth().signInWithEmailAndPassword(email, password).catch(console.warn);
      } catch (e) {}
    }
  }

  syncShiftToFirebase(shift) {
    if (window.firebase && window.firebase.firestore && this.getFirebaseConfig() && this.currentUser) {
      try {
        const db = window.firebase.firestore();
        db.collection('users').doc(this.currentUser.id).collection('shifts').doc(shift.id).set(shift).catch(console.warn);
      } catch (e) {}
    }
  }

  deleteShiftFromFirebase(shiftId) {
    if (window.firebase && window.firebase.firestore && this.getFirebaseConfig() && this.currentUser) {
      try {
        const db = window.firebase.firestore();
        db.collection('users').doc(this.currentUser.id).collection('shifts').doc(shiftId).delete().catch(console.warn);
      } catch (e) {}
    }
  }
}

// Instancia global
window.AuthDB = new AuthDBService();
