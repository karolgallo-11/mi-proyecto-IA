/**
 * AntiTurno - Base de Datos JSON (AntiTurnoDB)
 *
 * Toda la información de la aplicación (usuarios, turnos, compromisos y preferencias)
 * vive en UN SOLO documento JSON versionado:
 *   - Persistido en localStorage bajo la clave `antiturno_db_v2`.
 *   - Exportable / importable como archivo `antiturno-db-AAAA-MM-DD.json` (copia de seguridad
 *     y forma de pasar los datos a otro dispositivo).
 *   - Opcional (Chrome / Edge escritorio): vinculado a un archivo .json del equipo mediante la
 *     File System Access API, que se actualiza automáticamente al guardar.
 *
 * No requiere servidor ni cuentas en servicios externos: funciona en GitHub Pages, localhost y file://.
 */

class AntiTurnoDB {
  constructor(storage) {
    this.storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);

    this.APP_NAME = 'AntiTurno';
    this.VERSION = 2;
    this.DB_KEY = 'antiturno_db_v2';
    this.COLLECTIONS = ['users', 'shifts', 'commitments'];

    // Claves del formato anterior (v1) – se leen para migrar, nunca se borran.
    this.LEGACY_KEYS = {
      users: 'cuidadosync_users_v1',
      shifts: 'cuidadosync_shifts_v1',
      commitments: 'cuidadosync_commitments_v1'
    };

    // Archivo vinculado (File System Access API)
    this.fileHandle = null;
    this.fileNeedsPermission = false;
    this.lastFileSaveAt = null;
    this.fileSaveTimer = null;
    this.IDB_NAME = 'antiturno_file_link';
    this.IDB_STORE = 'handles';

    this.listeners = [];
    this.data = null;
    this.load();
  }

  // ==========================================
  // CARGA, GUARDADO Y MIGRACIÓN
  // ==========================================
  createEmptyDoc() {
    return {
      app: this.APP_NAME,
      version: this.VERSION,
      updatedAt: new Date().toISOString(),
      users: [],
      shifts: [],
      commitments: []
    };
  }

  load() {
    let doc = null;
    try {
      const raw = this.storage ? this.storage.getItem(this.DB_KEY) : null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Validación estructural (no estricta) para no descartar datos propios por un campo faltante
          if (parsed && parsed.app === this.APP_NAME && this.COLLECTIONS.every(n => Array.isArray(parsed[n]))) {
            doc = parsed;
          } else {
            throw new Error('Estructura inesperada');
          }
        } catch (parseErr) {
          // Guardar copia del contenido dañado antes de reconstruir
          this.storage.setItem(this.DB_KEY + '_corrupt_backup', raw);
          console.warn('Base de datos JSON dañada; se guardó una copia y se reconstruirá:', parseErr);
        }
      }
    } catch (e) {
      console.warn('No se pudo leer la base de datos JSON:', e);
    }

    if (!doc) {
      doc = this.migrateFromV1();
      this.data = doc;
      this.persistLocal();
    } else {
      this.data = doc;
    }
    return this.data;
  }

  /**
   * Une las claves sueltas del formato v1 en el nuevo documento JSON.
   * Las claves antiguas se conservan como copia de seguridad.
   */
  migrateFromV1() {
    const doc = this.createEmptyDoc();
    let migrated = 0;
    for (const name of this.COLLECTIONS) {
      try {
        const raw = this.storage ? this.storage.getItem(this.LEGACY_KEYS[name]) : null;
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr)) {
          doc[name] = arr.filter(item => item && typeof item === 'object' && item.id);
          migrated += doc[name].length;
        }
      } catch (e) {
        console.warn(`No se pudo migrar la colección ${name}:`, e);
      }
    }
    // Completar campos nuevos de usuario
    doc.users = doc.users.map(u => ({
      ...u,
      updatedAt: u.updatedAt || u.createdAt || new Date().toISOString(),
      settings: u.settings || { rememberEmail: true }
    }));
    doc.migratedFrom = migrated > 0 ? 'v1' : null;
    return doc;
  }

  persistLocal() {
    if (!this.storage) return;
    this.storage.setItem(this.DB_KEY, JSON.stringify(this.data));
  }

  save() {
    this.data.updatedAt = new Date().toISOString();
    this.persistLocal();
    this.scheduleFileSave();
    this.emitChange();
  }

  onChange(fn) {
    if (typeof fn === 'function') this.listeners.push(fn);
  }

  emitChange() {
    this.listeners.forEach(fn => {
      try { fn(this.data); } catch (e) { console.warn(e); }
    });
  }

  // ==========================================
  // CRUD GENÉRICO
  // ==========================================
  assertCollection(name) {
    if (!this.COLLECTIONS.includes(name)) {
      throw new Error(`Colección desconocida: ${name}`);
    }
  }

  getCollection(name) {
    this.assertCollection(name);
    return Array.isArray(this.data[name]) ? this.data[name] : [];
  }

  find(name, predicate) {
    return this.getCollection(name).filter(predicate);
  }

  findOne(name, predicate) {
    return this.getCollection(name).find(predicate) || null;
  }

  insert(name, obj) {
    this.assertCollection(name);
    if (!obj || !obj.id) throw new Error('El registro necesita un id.');
    this.data[name].push(obj);
    this.save();
    return obj;
  }

  update(name, id, patch) {
    this.assertCollection(name);
    const idx = this.data[name].findIndex(item => item.id === id);
    if (idx === -1) return null;
    this.data[name][idx] = { ...this.data[name][idx], ...patch };
    this.save();
    return this.data[name][idx];
  }

  remove(name, id) {
    this.assertCollection(name);
    const idx = this.data[name].findIndex(item => item.id === id);
    if (idx === -1) return null;
    const removed = this.data[name].splice(idx, 1)[0];
    this.save();
    return removed;
  }

  removeWhere(name, predicate) {
    this.assertCollection(name);
    const before = this.data[name].length;
    this.data[name] = this.data[name].filter(item => !predicate(item));
    const removed = before - this.data[name].length;
    if (removed > 0) this.save();
    return removed;
  }

  getStats(userId = null) {
    const filterUser = item => !userId || item.userId === userId;
    return {
      users: userId ? this.getCollection('users').filter(u => u.id === userId).length : this.getCollection('users').length,
      shifts: this.getCollection('shifts').filter(filterUser).length,
      commitments: this.getCollection('commitments').filter(filterUser).length,
      updatedAt: this.data.updatedAt
    };
  }

  // ==========================================
  // VALIDACIÓN
  // ==========================================
  validate(doc) {
    const errors = [];
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return { valid: false, errors: ['El archivo no contiene un objeto JSON.'] };
    }
    if (doc.app !== this.APP_NAME) errors.push('El archivo no pertenece a AntiTurno.');
    if (typeof doc.version !== 'number') errors.push('Falta la versión de la base de datos.');
    else if (doc.version > this.VERSION) errors.push('El archivo fue creado con una versión más nueva de AntiTurno.');

    for (const name of this.COLLECTIONS) {
      if (!Array.isArray(doc[name])) {
        errors.push(`Falta la lista "${name}".`);
        continue;
      }
      doc[name].forEach((item, i) => {
        if (!item || typeof item !== 'object' || !item.id) {
          errors.push(`Registro ${i + 1} de "${name}" sin id.`);
        }
      });
    }

    (doc.users || []).forEach((u, i) => {
      if (u && (!u.email || !u.hash || !u.salt)) errors.push(`Usuario ${i + 1} incompleto (correo o credenciales).`);
    });
    ['shifts', 'commitments'].forEach(name => {
      (doc[name] || []).forEach((item, i) => {
        if (item && (!item.userId || !item.date || !item.startTime || !item.endTime)) {
          errors.push(`Registro ${i + 1} de "${name}" incompleto.`);
        }
      });
    });

    return { valid: errors.length === 0, errors: errors.slice(0, 8) };
  }

  // ==========================================
  // EXPORTAR / IMPORTAR
  // ==========================================
  /** Devuelve una copia del documento (completo o solo de un usuario). */
  exportData(userId = null) {
    const copy = JSON.parse(JSON.stringify(this.data));
    if (userId) {
      copy.users = copy.users.filter(u => u.id === userId);
      copy.shifts = copy.shifts.filter(s => s.userId === userId);
      copy.commitments = copy.commitments.filter(c => c.userId === userId);
    }
    copy.exportedAt = new Date().toISOString();
    delete copy.migratedFrom;
    return copy;
  }

  exportToFile(userId = null) {
    const doc = this.exportData(userId);
    const json = JSON.stringify(doc, null, 2);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fileName = `antiturno-db-${stamp}.json`;

    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { fileName, size: json.length, doc };
  }

  /** Lee y valida el texto de un archivo .json. Lanza Error si es inválido. */
  parseImport(text) {
    let doc;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      throw new Error('El archivo no es un JSON válido.');
    }
    const check = this.validate(doc);
    if (!check.valid) {
      throw new Error('Archivo no válido: ' + check.errors.join(' '));
    }
    return doc;
  }

  /**
   * Calcula lo que pasaría al importar, sin modificar nada.
   */
  previewImport(doc, mode = 'merge') {
    const summary = { mode, users: { added: 0, updated: 0 }, shifts: { added: 0, updated: 0 }, commitments: { added: 0, updated: 0 } };
    if (mode === 'replace') {
      summary.users.added = doc.users.length;
      summary.shifts.added = doc.shifts.length;
      summary.commitments.added = doc.commitments.length;
      return summary;
    }
    const sim = this.mergeDocs(JSON.parse(JSON.stringify(this.data)), doc);
    return sim.summary;
  }

  /**
   * Aplica la importación.
   * - merge: combina por id; si un registro existe en ambos lados gana el `updatedAt` más reciente.
   *          Los usuarios se identifican por correo (si el id difiere, sus datos se reasignan al usuario existente).
   * - replace: sustituye toda la base de datos por el archivo.
   */
  importData(doc, mode = 'merge') {
    const check = this.validate(doc);
    if (!check.valid) throw new Error('Archivo no válido: ' + check.errors.join(' '));

    let summary;
    if (mode === 'replace') {
      summary = this.previewImport(doc, 'replace');
      const fresh = this.createEmptyDoc();
      for (const name of this.COLLECTIONS) fresh[name] = JSON.parse(JSON.stringify(doc[name]));
      this.data = fresh;
    } else {
      const result = this.mergeDocs(this.data, doc);
      this.data = result.doc;
      summary = result.summary;
    }
    this.data.app = this.APP_NAME;
    this.data.version = this.VERSION;
    this.save();
    return summary;
  }

  mergeDocs(target, incoming) {
    const summary = { mode: 'merge', users: { added: 0, updated: 0 }, shifts: { added: 0, updated: 0 }, commitments: { added: 0, updated: 0 } };
    const isNewer = (a, b) => new Date(a.updatedAt || a.createdAt || 0) > new Date(b.updatedAt || b.createdAt || 0);
    const idMap = {}; // id importado -> id local (cuando el mismo correo tiene distinto id)

    // 1. Usuarios (por correo)
    for (const inc of incoming.users) {
      const email = String(inc.email || '').trim().toLowerCase();
      const existing = target.users.find(u => u.email === email) || target.users.find(u => u.id === inc.id);
      if (!existing) {
        target.users.push(JSON.parse(JSON.stringify({ ...inc, email })));
        summary.users.added++;
      } else {
        if (existing.id !== inc.id) idMap[inc.id] = existing.id;
        if (isNewer(inc, existing)) {
          Object.assign(existing, {
            name: inc.name, salt: inc.salt, hash: inc.hash,
            settings: inc.settings || existing.settings,
            updatedAt: inc.updatedAt
          });
          summary.users.updated++;
        }
      }
    }

    // 2. Turnos y compromisos (por id)
    for (const name of ['shifts', 'commitments']) {
      for (const raw of incoming[name]) {
        const inc = JSON.parse(JSON.stringify(raw));
        if (idMap[inc.userId]) inc.userId = idMap[inc.userId];
        const idx = target[name].findIndex(x => x.id === inc.id);
        if (idx === -1) {
          target[name].push(inc);
          summary[name].added++;
        } else if (isNewer(inc, target[name][idx])) {
          target[name][idx] = inc;
          summary[name].updated++;
        }
      }
    }
    return { doc: target, summary };
  }

  // ==========================================
  // ARCHIVO VINCULADO (File System Access API)
  // ==========================================
  isFileLinkSupported() {
    return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function' && typeof window.indexedDB !== 'undefined';
  }

  getFileStatus() {
    return {
      supported: this.isFileLinkSupported(),
      linked: !!this.fileHandle,
      fileName: this.fileHandle ? this.fileHandle.name : null,
      needsPermission: this.fileNeedsPermission,
      lastSaveAt: this.lastFileSaveAt
    };
  }

  /** Crea/elige un archivo nuevo y escribe en él la base de datos actual. */
  async linkNewFile() {
    if (!this.isFileLinkSupported()) throw new Error('Tu navegador no permite vincular archivos. Usa Exportar / Importar.');
    const handle = await window.showSaveFilePicker({
      suggestedName: 'antiturno-db.json',
      types: [{ description: 'Base de datos AntiTurno', accept: { 'application/json': ['.json'] } }]
    });
    this.fileHandle = handle;
    this.fileNeedsPermission = false;
    await this.storeHandle(handle);
    await this.writeToFile();
    this.emitChange();
    return this.getFileStatus();
  }

  /** Abre un archivo .json existente, combina sus datos y lo deja vinculado. */
  async linkExistingFile(mode = 'merge') {
    if (!this.isFileLinkSupported()) throw new Error('Tu navegador no permite vincular archivos. Usa Exportar / Importar.');
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Base de datos AntiTurno', accept: { 'application/json': ['.json'] } }],
      multiple: false
    });
    const file = await handle.getFile();
    const text = await file.text();
    let summary = null;
    if (text.trim().length > 0) {
      const doc = this.parseImport(text);
      summary = this.importData(doc, mode);
    }
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Se necesita permiso de escritura para vincular el archivo.');
    this.fileHandle = handle;
    this.fileNeedsPermission = false;
    await this.storeHandle(handle);
    await this.writeToFile();
    this.emitChange();
    return summary;
  }

  /** Vuelve a pedir permiso al archivo vinculado (requiere un clic del usuario). */
  async reconnectFile() {
    if (!this.fileHandle) return false;
    const perm = await this.fileHandle.requestPermission({ mode: 'readwrite' });
    this.fileNeedsPermission = perm !== 'granted';
    if (!this.fileNeedsPermission) await this.writeToFile();
    this.emitChange();
    return !this.fileNeedsPermission;
  }

  async unlinkFile() {
    this.fileHandle = null;
    this.fileNeedsPermission = false;
    this.lastFileSaveAt = null;
    await this.deleteStoredHandle();
    this.emitChange();
  }

  scheduleFileSave() {
    if (!this.fileHandle || this.fileNeedsPermission) return;
    clearTimeout(this.fileSaveTimer);
    this.fileSaveTimer = setTimeout(() => {
      this.writeToFile().catch(e => console.warn('No se pudo guardar en el archivo vinculado:', e));
    }, 500);
  }

  async writeToFile() {
    if (!this.fileHandle) return;
    const perm = await this.fileHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      this.fileNeedsPermission = true;
      this.emitChange();
      return;
    }
    const writable = await this.fileHandle.createWritable();
    await writable.write(JSON.stringify(this.exportData(), null, 2));
    await writable.close();
    this.lastFileSaveAt = new Date().toISOString();
  }

  /** Recupera el archivo vinculado en una visita anterior (si existe). */
  async restoreFileLink() {
    if (!this.isFileLinkSupported()) return;
    try {
      const handle = await this.readStoredHandle();
      if (!handle) return;
      this.fileHandle = handle;
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      this.fileNeedsPermission = perm !== 'granted';
      this.emitChange();
    } catch (e) {
      console.warn('No se pudo restaurar el archivo vinculado:', e);
    }
  }

  openIDB() {
    return new Promise((resolve, reject) => {
      const req = window.indexedDB.open(this.IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async idbRequest(mode, fn) {
    const db = await this.openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.IDB_STORE, mode);
      const req = fn(tx.objectStore(this.IDB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  storeHandle(handle) { return this.idbRequest('readwrite', s => s.put(handle, 'db-file')); }
  readStoredHandle() { return this.idbRequest('readonly', s => s.get('db-file')); }
  deleteStoredHandle() { return this.idbRequest('readwrite', s => s.delete('db-file')).catch(() => {}); }
}

if (typeof window !== 'undefined') {
  window.AntiTurnoDB = AntiTurnoDB;
  window.JsonDB = new AntiTurnoDB();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AntiTurnoDB };
}
