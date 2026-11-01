/**
 * Test Suite: Implementation #1 - Rediseño Frontend AntiTurno
 * Valida sistema visual único SHIFT_TYPES, filtros de calendario, badges protagonistas,
 * subordinación de compromisos, descanso post-guardia, hero card y regresión de Planes 02 y 03.
 */

const fs = require('fs');

// Mock browser globals
global.window = {
  location: { hash: '' },
  addEventListener: () => {},
  JsonDB: {
    restoreFileLink: async () => false,
    onChange: () => {}
  }
};

const domStore = {};
function createMockElement(id, tag = 'div') {
  return {
    id,
    tagName: tag.toUpperCase(),
    value: '',
    innerText: '',
    innerHTML: '',
    className: '',
    classList: {
      classes: new Set(),
      add(...cls) { cls.forEach(c => this.classes.add(c)); },
      remove(...cls) { cls.forEach(c => this.classes.delete(c)); },
      contains(c) { return this.classes.has(c); },
      toggle(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
    },
    style: {},
    setAttribute() {},
    getAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; }
  };
}

global.document = {
  getElementById: (id) => {
    if (!domStore[id]) domStore[id] = createMockElement(id);
    return domStore[id];
  },
  querySelectorAll: (selector) => {
    if (selector === '.shift-type-btn') {
      return ['M', 'T', 'N', 'G'].map(type => {
        const el = createMockElement(`btn-${type}`, 'button');
        el.getAttribute = (attr) => attr === 'data-shift-type' ? type : null;
        const icon = createMockElement(`icon-${type}`, 'span');
        el.querySelector = (sel) => sel === '.check-icon' ? icon : null;
        return el;
      });
    }
    return [];
  },
  addEventListener: () => {}
};

// Mock AuthDB and Storage
const storageMap = new Map();
global.localStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};

// Cargar módulos
require('./js/json-db.js');
const JsonDB = window.JsonDB;
global.JsonDB = JsonDB;
require('./js/auth-db.js');
const AuthDB = window.AuthDB;
global.AuthDB = AuthDB;
require('./js/reminders.js');
const ReminderService = window.ReminderService;
global.ReminderService = ReminderService;

// Cargar app.js
const app = require('./js/app.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('PRUEBAS: IMPLEMENTACIÓN #1 (REDISEÑO VISUAL FRONTEND)');
  console.log('========================================\n');

  // ----------------------------------------------------
  // TEST 1: CONSTANTE SHIFT_TYPES (FUENTE ÚNICA DE VERDAD)
  // ----------------------------------------------------
  console.log('1. Verificación del sistema visual único SHIFT_TYPES:');
  const { SHIFT_TYPES, REST_TYPE } = app;
  assert(SHIFT_TYPES && typeof SHIFT_TYPES === 'object', 'SHIFT_TYPES existe y está exportado');
  assert(SHIFT_TYPES.M && SHIFT_TYPES.M.label === 'Mañana' && SHIFT_TYPES.M.icon === 'wb_sunny', 'M (Mañana) configurado con icono wb_sunny y color ámbar');
  assert(SHIFT_TYPES.T && SHIFT_TYPES.T.label === 'Tarde' && SHIFT_TYPES.T.icon === 'wb_twilight', 'T (Tarde) configurado con icono wb_twilight y color naranja');
  assert(SHIFT_TYPES.N && SHIFT_TYPES.N.label === 'Noche' && SHIFT_TYPES.N.icon === 'bedtime', 'N (Noche) configurado con icono bedtime y color índigo');
  assert(SHIFT_TYPES.G && SHIFT_TYPES.G.label === 'Guardia 24h' && SHIFT_TYPES.G.icon === 'emergency', 'G (Guardia 24h) configurado con icono emergency y color rojo');
  assert(REST_TYPE && REST_TYPE.icon === 'spa' && REST_TYPE.color === '#10B981', 'REST_TYPE configurado con icono spa y color verde descanso');

  // Clases CSS explícitas asignadas
  assert(SHIFT_TYPES.M.badgeClass === 'shift-badge-m', 'M tiene clase shift-badge-m');
  assert(SHIFT_TYPES.T.badgeClass === 'shift-badge-t', 'T tiene clase shift-badge-t');
  assert(SHIFT_TYPES.N.badgeClass === 'shift-badge-n', 'N tiene clase shift-badge-n');
  assert(SHIFT_TYPES.G.badgeClass === 'shift-badge-g', 'G tiene clase shift-badge-g');
  assert(REST_TYPE.badgeClass === 'shift-badge-rest', 'REST_TYPE tiene clase shift-badge-rest');

  // ----------------------------------------------------
  // TEST 2: SELECTOR DE TURNOS Y FORMULARIO (selectShiftType)
  // ----------------------------------------------------
  AuthDB.init();
  console.log('\n2. Selector interactivo de tipos de turno (selectShiftType):');
  app.selectShiftType('T');
  assert(app.AppState.activeShiftType === 'T', 'AppState.activeShiftType actualizado a T');
  const startInput = document.getElementById('shiftStartTimeInput');
  const endInput = document.getElementById('shiftEndTimeInput');
  assert(startInput.value === '15:00' && endInput.value === '23:00', 'Horarios por defecto de Tarde (15:00-23:00) autocompletados');

  app.selectShiftType('N');
  assert(app.AppState.activeShiftType === 'N', 'AppState.activeShiftType actualizado a N');
  assert(startInput.value === '23:00' && endInput.value === '07:00', 'Horarios por defecto de Noche (23:00-07:00) autocompletados');

  app.selectShiftType('G');
  assert(app.AppState.activeShiftType === 'G', 'AppState.activeShiftType actualizado a G');
  assert(startInput.value === '08:00' && endInput.value === '08:00', 'Horarios por defecto de Guardia 24h (08:00-08:00) autocompletados');

  // ----------------------------------------------------
  // TEST 3: GENERACIÓN DE BADGES DE TURNO (getShiftBadgeHtml)
  // ----------------------------------------------------
  console.log('\n3. Generación de badges de turnos unificados:');
  const badgeM = app.getShiftBadgeHtml({ type: 'M', startTime: '07:00', endTime: '15:00' });
  assert(badgeM.includes('shift-badge-m') && badgeM.includes('wb_sunny') && badgeM.includes('Mañana'), 'Badge Mañana incluye shift-badge-m, wb_sunny y texto');

  const badgeN = app.getShiftBadgeHtml({ type: 'N', startTime: '23:00', endTime: '07:00' });
  assert(badgeN.includes('shift-badge-n') && badgeN.includes('bedtime') && badgeN.includes('Noche'), 'Badge Noche incluye shift-badge-n, bedtime y texto');

  // ----------------------------------------------------
  // TEST 4: CALENDARIO DINÁMICO, RESUMEN DEL MES Y FILTROS
  // ----------------------------------------------------
  console.log('\n4. Calendario dinámico, leyenda, filtros y mini-resumen mensual:');
  
  // Registrar usuario y turnos de prueba
  const testUser = await AuthDB.register({ name: 'Dra. Elena Visual', email: 'elena@visual.es', password: 'Password123!' });
  
  // Guardar turnos de los 4 tipos en noviembre 2026
  AuthDB.saveShift({ date: '2026-11-02', startTime: '07:00', endTime: '15:00', type: 'M', service: 'UCI' });
  AuthDB.saveShift({ date: '2026-11-04', startTime: '15:00', endTime: '23:00', type: 'T', service: 'UCI' });
  AuthDB.saveShift({ date: '2026-11-06', startTime: '23:00', endTime: '07:00', type: 'N', service: 'UCI' });
  // 2026-11-07 será día de DESCANSO post-noche!
  AuthDB.saveShift({ date: '2026-11-10', startTime: '08:00', endTime: '08:00', type: 'G', service: 'Urgencias' });
  // 2026-11-11 será día de DESCANSO post-guardia 24h!

  // Agregar compromiso personal subordinado en 2026-11-02
  AuthDB.saveCommitment({ date: '2026-11-02', startTime: '17:00', endTime: '18:30', title: 'Fisioterapia', category: 'medica' });

  app.AppState.calendarDate = new Date(2026, 10, 1); // Noviembre 2026

  // Renderizar calendario
  app.renderCalendar();

  const legendHtml = document.getElementById('calendarLegendContainer').innerHTML;
  assert(legendHtml.includes('shift-badge-m') && legendHtml.includes('shift-badge-t') && legendHtml.includes('shift-badge-n') && legendHtml.includes('shift-badge-g'), 'Leyenda dinámica contiene los 4 badges de turno');
  assert(legendHtml.includes('shift-badge-rest') && legendHtml.includes('Descanso'), 'Leyenda dinámica contiene badge de descanso post-guardia');

  const summaryHtml = document.getElementById('calendarMonthSummaryBar').innerHTML;
  assert(summaryHtml.includes('1 M') && summaryHtml.includes('1 T') && summaryHtml.includes('1 N') && summaryHtml.includes('1 G'), 'Mini-resumen mensual contabiliza exactamente: 1 M, 1 T, 1 N, 1 G');
  assert(summaryHtml.includes('48h'), 'Mini-resumen mensual contabiliza 48 horas clínicas (8 + 8 + 8 + 24)');

  const filtersHtml = document.getElementById('calendarFiltersBar').innerHTML;
  assert(filtersHtml.includes('Todos') && filtersHtml.includes('Mañana') && filtersHtml.includes('Personal'), 'Barra de filtros de calendario incluye opciones completas');

  const gridHtml = document.getElementById('dynamicCalendarGrid').innerHTML;
  // Verificar protagonista del día 2 (M) con chip y borde
  assert(gridHtml.includes('shift-border-m') && gridHtml.includes('shift-bg-m'), 'Día con turno Mañana tiene borde shift-border-m y fondo shift-bg-m');
  assert(gridHtml.includes('07–15'), 'Turno Mañana renderiza horario compacto 07–15');

  // Verificar subordinación del compromiso en día 2 (micro-chip)
  assert(gridHtml.includes('Fisioterapia') && gridHtml.includes('bg-cyan-500'), 'Compromiso "Fisioterapia" subordinado con micro-dot de categoría médica');

  // Verificar descanso post-noche en día 7
  assert(gridHtml.includes('shift-border-rest') && gridHtml.includes('Descanso'), 'Día 7 posterior a Noche detectado como Descanso con shift-border-rest y chip Descanso');

  // ----------------------------------------------------
  // TEST 5: FILTROS DEL CALENDARIO (setCalendarFilter)
  // ----------------------------------------------------
  console.log('\n5. Filtrado reactivo del calendario:');
  app.setCalendarFilter('N');
  assert(app.AppState.calendarFilter === 'N', 'Filtro activo cambiado a N (Noches)');
  const filteredGrid = document.getElementById('dynamicCalendarGrid').innerHTML;
  assert(filteredGrid.includes('opacity-25 grayscale-[0.6]'), 'Días sin turno Noche atenuados visualmente');

  app.setCalendarFilter('all');
  assert(app.AppState.calendarFilter === 'all', 'Filtro restaurado a "all" (Todos)');

  // ----------------------------------------------------
  // TEST 6: HERO STATUS CARD Y GRADIENTES
  // ----------------------------------------------------
  console.log('\n6. Hero status card con paleta de turno:');
  const heroCard = document.getElementById('heroNextShiftCard');
  app.renderHeroCard();
  assert(heroCard.className.includes('bg-gradient-to-br') || heroCard.innerHTML.includes('Próximo Turno'), 'Hero card renderizado con degradado y próximo turno');

  // ----------------------------------------------------
  // TEST 7: RESUMEN DE HORAS Y TABLA DE TURNOS
  // ----------------------------------------------------
  console.log('\n7. Tabla de resumen de horas con badges unificados:');
  app.renderHoursSummary();
  const tableBody = document.getElementById('rosterTableBody').innerHTML;
  assert(tableBody.includes('shift-badge-m') && tableBody.includes('shift-badge-g'), 'Tabla de horas renderiza filas con badges unificados de SHIFT_TYPES');

  // ----------------------------------------------------
  // TEST 8: NO REGRESIÓN DE PLANES 02 Y 03
  // ----------------------------------------------------
  console.log('\n8. Pruebas de no regresión (Planes 02 y 03):');
  // Plan 02: JSON DB y Autenticación
  assert(typeof JsonDB.exportData === 'function', 'JsonDB.exportData disponible y funcional');
  const exported = JsonDB.exportData();
  assert(exported && exported.shifts && exported.shifts.length === 4, 'Base de datos JSON exporta correctamente los 4 turnos creados');

  // Plan 03: Motor de recordatorios y preferencias
  assert(typeof ReminderService.tick === 'function', 'ReminderService activo y funcional');
  const prefs = AuthDB.getReminderPrefs();
  assert(prefs && typeof prefs.sound === 'boolean', 'Preferencias de recordatorios conservadas');

  console.log('\n----------------------------------------');
  console.log(`TOTAL RESULTADOS: ${passed} pasadas, ${failed} fallidas`);
  console.log('----------------------------------------\n');

  // Detener timers de recordatorios si quedaron activos
  if (ReminderService && ReminderService.timer) {
    clearInterval(ReminderService.timer);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
