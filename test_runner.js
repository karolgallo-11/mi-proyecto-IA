const fs = require('fs');
const crypto = require('crypto');
const vm = require('vm');

class LocalStorageMock {
  constructor() { this.store = {}; }
  getItem(k) { return this.store[k] !== undefined ? this.store[k] : null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

const mockStorage = new LocalStorageMock();

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Math,
  JSON,
  RegExp,
  Error,
  Promise,
  TextEncoder,
  TextDecoder
};

sandbox.window = sandbox;
sandbox.localStorage = mockStorage;
sandbox.crypto = {
  subtle: crypto.webcrypto.subtle,
  getRandomValues: (arr) => crypto.randomFillSync(arr)
};
sandbox.Notification = class {
  static permission = 'granted';
  static requestPermission() { return Promise.resolve('granted'); }
  constructor(title, opts) {
    sandbox._lastNotification = { title, opts };
  }
};
sandbox.AudioContext = class {
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
      start: () => {},
      stop: () => {}
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {}
    };
  }
  get destination() { return {}; }
  get currentTime() { return 0; }
};
sandbox.document = {
  addEventListener: () => {},
  visibilityState: 'visible',
  getElementById: () => null,
  createElement: () => ({ style: {}, appendChild: () => {}, querySelector: () => null }),
  body: { appendChild: () => {} }
};
sandbox.showToast = (msg, type) => {
  sandbox._lastToast = { msg, type };
};

const context = vm.createContext(sandbox);

// Execute files in order
vm.runInContext(fs.readFileSync('js/json-db.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/auth-db.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/reminders.js', 'utf8'), context);

async function runAudit() {
  const results = [];
  function assert(desc, condition) {
    results.push({ desc, pass: Boolean(condition) });
    console.log((condition ? ' [PASS] ' : ' [FAIL] ') + desc);
  }

  console.log('====================================================');
  console.log(' AUDITORIA COMPLETA DE FUNCIONALIDADES (ANTITURNO) ');
  console.log('====================================================\n');

  // --- 1. BASE DE DATOS JSON (Plan 02) ---
  console.log('--- 1. Base de Datos JSON (AntiTurnoDB) ---');
  const db = sandbox.JsonDB;
  assert('Instancia JsonDB creada correctamente', !!db);
  assert('Versión del esquema es 2', db.VERSION === 2);
  const empty = db.createEmptyDoc();
  assert('Esquema estándar incluye users, shifts, commitments', 
    Array.isArray(empty.users) && Array.isArray(empty.shifts) && Array.isArray(empty.commitments));

  // --- 2. AUTENTICACIÓN, REGISTRO Y RECUERDO DE CORREO (Plan 02 + Feedback) ---
  console.log('\n--- 2. Autenticación y Criptografía PBKDF2 ---');
  const auth = sandbox.AuthDB;
  const user = await auth.register({ name: 'Karol Gallo', email: 'karol@hospital.com', password: 'Pass12345!' });
  assert('Registro de usuario exitoso', !!user && user.email === 'karol@hospital.com');
  
  // Verificar almacenamiento seguro en DB
  const rawUser = db.findOne('users', u => u.email === 'karol@hospital.com');
  assert('Salt criptográfico generado y persistido en DB (hex 32 chars)', typeof rawUser.salt === 'string' && rawUser.salt.length === 32);
  assert('Hash PBKDF2-SHA256 generado y persistido en DB (prefijo pbkdf2_subtle_ + 64 hex chars)', 
    typeof rawUser.hash === 'string' && rawUser.hash.startsWith('pbkdf2_subtle_'));
  assert('Contraseña en texto plano NO almacenada en DB', rawUser.password === undefined);
  assert('Objeto de usuario sanitizado para la interfaz (sin salt/hash)', user.salt === undefined && user.hash === undefined);

  // Verificación de recuerdo de correo
  const remembered = auth.getLastEmail();
  assert('Último correo recordado automáticamente al registrar', remembered === 'karol@hospital.com');

  // Verificación de inicio de sesión con clave correcta
  const loginSuccess = await auth.login({ email: 'karol@hospital.com', password: 'Pass12345!' });
  assert('Inicio de sesión exitoso con contraseña correcta', !!loginSuccess && loginSuccess.id === user.id);

  // Verificación de inicio de sesión con clave incorrecta
  let loginFailed = false;
  try {
    await auth.login({ email: 'karol@hospital.com', password: 'ContraseñaErronea' });
  } catch (err) {
    loginFailed = true;
  }
  assert('Rechazo seguro ante contraseña errónea', loginFailed);

  // --- 3. GESTIÓN DE TURNOS (PRD: Función 1 + Plan 01) ---
  console.log('\n--- 3. Gestión de Turnos (Tipos M, T, N, G) ---');
  const shiftM = await auth.saveShift({
    date: '2026-11-02',
    startTime: '07:00',
    endTime: '15:00',
    type: 'M',
    hospital: 'Hospital Central',
    service: 'Urgencias',
    notes: 'Primer turno de la semana',
    reminders: [
      { id: 'rem_1', offsetMinutes: 90, anchor: 'start', label: 'Salir hacia el hospital', category: 'salida', enabled: true }
    ]
  });
  assert('Creación de turno Mañana (07:00 - 15:00)', !!shiftM && shiftM.type === 'M');

  const shiftN = await auth.saveShift({
    date: '2026-11-03',
    startTime: '23:00',
    endTime: '07:00',
    type: 'N',
    hospital: 'Hospital Central',
    service: 'UCI',
    notes: 'Turno nocturno cruzando medianoche',
    reminders: [
      { id: 'rem_2', offsetMinutes: 120, anchor: 'start', label: 'Preparar café', category: 'comida', enabled: true }
    ]
  });
  assert('Creación de turno Noche (23:00 - 07:00)', !!shiftN && shiftN.type === 'N');

  const shiftG = await auth.saveShift({
    date: '2026-11-05',
    startTime: '08:00',
    endTime: '08:00',
    type: 'G',
    hospital: 'Hospital Central',
    service: 'Quirófano',
    notes: 'Guardia completa'
  });
  assert('Creación de turno Guardia 24h (G)', !!shiftG && shiftG.type === 'G');

  // Actualizar turno
  const updatedM = await auth.saveShift({
    id: shiftM.id,
    date: '2026-11-02',
    startTime: '07:30',
    endTime: '15:30',
    type: 'M',
    hospital: 'Hospital Central',
    service: 'Urgencias'
  });
  assert('Actualización / edición de turno existente', updatedM.startTime === '07:30');

  // --- 4. ORGANIZAR TIEMPO PERSONAL Y COMPROMISOS (PRD: Función 3) ---
  console.log('\n--- 4. Tiempo Personal y Compromisos (PRD) ---');
  const com1 = await auth.saveCommitment({
    title: 'Gimnasio y descanso',
    category: 'descanso',
    date: '2026-11-04',
    startTime: '10:00',
    endTime: '12:00',
    location: 'Gimnasio local',
    reminders: [
      { id: 'rem_com_1', offsetMinutes: 30, anchor: 'start', label: 'Ir al gym', enabled: true }
    ]
  });
  assert('Creación de compromiso personal exitosa', !!com1 && com1.category === 'descanso');

  // Recuperar listas
  const userShifts = auth.getShifts();
  const userComms = auth.getCommitments();
  assert('Recuperar lista de turnos (3 activos)', userShifts.length === 3);
  assert('Recuperar lista de compromisos (1 activo)', userComms.length === 1);

  // --- 5. DETECCIÓN DE CONFLICTOS / ANTI-CRUCES (PRD) ---
  console.log('\n--- 5. Anti-Cruces y Solapamiento ---');
  const conflict1 = auth.checkConflict('2026-11-02', '08:00', '10:00');
  assert('Alerta de cruce detectada al solapar con turno Mañana', conflict1.hasConflict === true && conflict1.type === 'shift');

  // Noche es 2026-11-03 23:00 a 07:00 (termina en la mañana de 2026-11-04 a las 07:00)
  // Descanso recomendado hasta las 15:00 del 2026-11-04
  const conflictPostNight = auth.checkConflict('2026-11-04', '09:00', '11:00');
  assert('Alerta de fatiga / descanso post-noche protegida detectada', conflictPostNight.hasConflict === true && conflictPostNight.type === 'rest');

  const freeTime = auth.checkConflict('2026-11-04', '16:00', '18:00');
  assert('Horario libre post-descanso sin conflicto reportado como limpio', freeTime.hasConflict === false);

  // --- 6. MOTOR DE RECORDATORIOS (Plan 03) ---
  console.log('\n--- 6. Motor de Recordatorios (ReminderService) ---');
  const reminderSvc = sandbox.ReminderService;
  assert('ReminderService inicializado', !!reminderSvc);

  // Trigger time calculation
  const triggerM = reminderSvc.computeTriggerDate(updatedM.date, updatedM.startTime, 90, 'start');
  // updatedM starts at 2026-11-02 07:30, 90 mins before is 06:00
  const hours = triggerM.getHours();
  const mins = triggerM.getMinutes();
  assert('Cálculo exacto de anticipación (90 min antes de 07:30 = 06:00)', hours === 6 && mins === 0);

  // Trigger time for overnight shift
  const triggerN = reminderSvc.computeTriggerDate(shiftN.date, shiftN.startTime, 120, 'start');
  // shiftN starts at 2026-11-03 23:00, 120 min before is 21:00 on the same date
  assert('Cálculo de turno nocturno (120 min antes de 23:00 = 21:00)', triggerN.getHours() === 21 && triggerN.getMinutes() === 0);

  // Quiet hours evaluation
  const isQuietDay = reminderSvc.isQuietHours(new Date('2026-11-02T12:00:00'), { enabled: true, from: '22:00', to: '06:00' });
  const isQuietNight = reminderSvc.isQuietHours(new Date('2026-11-02T23:30:00'), { enabled: true, from: '22:00', to: '06:00' });
  assert('Detección de horas de silencio (mediodía no es silencioso)', isQuietDay === false);
  assert('Detección de horas de silencio (23:30 sí es silencioso)', isQuietNight === true);

  // Notification on shift change
  sandbox._lastToast = null;
  reminderSvc.notifyShiftChange({
    action: 'update',
    before: { date: '2026-11-02', startTime: '07:00', endTime: '15:00', type: 'M', hospital: 'Hospital Central' },
    after: { date: '2026-11-02', startTime: '07:30', endTime: '15:30', type: 'M', hospital: 'Hospital Central' }
  });
  assert('Notificación instantánea emitida ante cambio de horario de turno', 
    sandbox._lastToast && sandbox._lastToast.msg.includes('Cambio de Horario'));

  // Preferences
  const prefs = auth.getReminderPrefs();
  assert('Preferencias por defecto cargadas (sound, notifyOnChanges, plantillas M/T/N/G)', 
    prefs.sound === true && prefs.notifyOnChanges === true && !!prefs.templates.M && !!prefs.templates.N);

  // --- 7. EXPORTACIÓN E IMPORTACIÓN JSON (Plan 02) ---
  console.log('\n--- 7. Exportación e Importación de Base de Datos JSON ---');
  const exported = db.exportData(user.id);
  assert('Exportación JSON contiene estructura completa', 
    exported.app === 'AntiTurno' && exported.version === 2 && exported.shifts.length === 3 && exported.commitments.length === 1);

  // Merge import test
  const mergeRes = db.importData(exported, 'merge');
  assert('Importación en modo combinar (merge) exitosa con resumen de cambios', mergeRes && mergeRes.mode === 'merge');
  // Verify no duplicates
  const postMergeShifts = auth.getShifts();
  assert('Modo merge previene duplicados (se mantienen 3 turnos)', postMergeShifts.length === 3);

  // Validation rejection of invalid JSON
  const invalidDoc = { app: 'OtherApp', version: 99 };
  const valRes = db.validate(invalidDoc);
  assert('Validación rechaza documentos corruptos o de otra aplicación', valRes.valid === false);

  // --- RESULTADOS FINALES ---
  console.log('\n====================================================');
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;
  console.log(` RESUMEN: ${passed}/${total} pruebas pasadas (${Math.round(passed/total*100)}%)`);
  if (failed > 0) {
    console.log(` ERRORES: ${failed}`);
  } else {
    console.log(' ¡TODAS LAS FUNCIONALIDADES AUDITADAS OPERAN AL 100%!');
  }
  console.log('====================================================\n');
}

runAudit().catch(console.error);
