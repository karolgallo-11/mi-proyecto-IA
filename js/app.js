/**
 * AntiTurno - Controlador Principal de la Aplicación
 * Conecta UI con AuthDB: Autenticación, Formulario Turnos CRUD, Compromisos Personales CRUD,
 * Protección Anti-Cruces, Calendario Dinámico Unificado, Próximas Guardias y Sincronización .ICS.
 */

// ==========================================
// SISTEMA VISUAL Y FUENTE DE VERDAD DE TURNOS (PLAN 01)
// ==========================================
const SHIFT_TYPES = {
  M: {
    code: 'M',
    label: 'Mañana',
    short: 'M',
    icon: 'wb_sunny',
    color: '#F59E0B',
    bg: '#FEF3C7',
    border: '#FCD34D',
    text: '#92400E',
    badgeClass: 'shift-badge-m',
    cardClass: 'shift-card-m',
    borderClass: 'shift-border-m',
    bgClass: 'shift-bg-m',
    heroGradient: 'from-amber-500/15 via-amber-100/30 to-surface-container-lowest',
    heroBorder: 'border-amber-300/60',
    defaults: ['07:00', '15:00'],
    compactHours: '07–15'
  },
  T: {
    code: 'T',
    label: 'Tarde',
    short: 'T',
    icon: 'wb_twilight',
    color: '#EA580C',
    bg: '#FFEDD5',
    border: '#FDBA74',
    text: '#9A3412',
    badgeClass: 'shift-badge-t',
    cardClass: 'shift-card-t',
    borderClass: 'shift-border-t',
    bgClass: 'shift-bg-t',
    heroGradient: 'from-orange-500/15 via-orange-100/30 to-surface-container-lowest',
    heroBorder: 'border-orange-300/60',
    defaults: ['15:00', '23:00'],
    compactHours: '15–23'
  },
  N: {
    code: 'N',
    label: 'Noche',
    short: 'N',
    icon: 'bedtime',
    color: '#4F46E5',
    bg: '#EEF2FF',
    border: '#A5B4FC',
    text: '#3730A3',
    badgeClass: 'shift-badge-n',
    cardClass: 'shift-card-n',
    borderClass: 'shift-border-n',
    bgClass: 'shift-bg-n',
    heroGradient: 'from-indigo-600/15 via-indigo-100/30 to-surface-container-lowest',
    heroBorder: 'border-indigo-300/60',
    defaults: ['23:00', '07:00'],
    compactHours: '23–07'
  },
  G: {
    code: 'G',
    label: 'Guardia 24h',
    short: 'G',
    icon: 'emergency',
    color: '#DC2626',
    bg: '#FEE2E2',
    border: '#FCA5A5',
    text: '#991B1B',
    badgeClass: 'shift-badge-g',
    cardClass: 'shift-card-g',
    borderClass: 'shift-border-g',
    bgClass: 'shift-bg-g',
    heroGradient: 'from-red-600/15 via-red-100/30 to-surface-container-lowest',
    heroBorder: 'border-red-300/60',
    defaults: ['08:00', '08:00'],
    compactHours: '24h'
  }
};

const REST_TYPE = {
  label: 'Descanso post-guardia',
  short: 'Descanso',
  icon: 'spa',
  color: '#10B981',
  bg: '#D1FAE5',
  border: '#A7F3D0',
  text: '#065F46',
  badgeClass: 'shift-badge-rest',
  borderClass: 'shift-border-rest',
  bgClass: 'shift-bg-rest',
  heroGradient: 'from-emerald-500/15 via-emerald-100/30 to-surface-container-lowest',
  heroBorder: 'border-emerald-300/60'
};

// Estado global de la aplicación
const AppState = {
  currentView: 'dashboard',
  calendarDate: new Date(),
  selectedDate: null,
  activeShiftType: 'M',
  calendarFilter: 'all', // 'all' | 'M' | 'T' | 'N' | 'G' | 'personal'
  editingShiftId: null,
  activeCategoryFilter: 'all',
  editingCommitmentId: null,
  pendingCommitmentData: null,
  shiftReminders: [],
  commitmentReminders: []
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
window.addEventListener('antiturno-data-synced', () => {
  renderCalendar();
  renderUpcomingShifts();
  renderHeroCard();
  renderPersonalView();
  renderHoursSummary();
  renderUpcomingReminders();

  // Iniciar motor de recordatorios y avisos clínicos (Plan 03)
  if (typeof ReminderService !== 'undefined') {
    ReminderService.init();
  }
  renderUpcomingReminders();
  updateAuthUI();
});

window.addEventListener('antiturno-reminder-prefs-changed', () => {
  renderUpcomingReminders();
});

document.addEventListener('DOMContentLoaded', () => {
  AuthDB.init();
  updateAuthUI();

  // Fecha inicial en formulario de turnos
  const todayStr = formatLocalDate(new Date());
  const dateInput = document.getElementById('shiftDateInput');
  if (dateInput) dateInput.value = todayStr;

  // Renderizar vistas dinámicas
  renderCalendar();
  renderUpcomingShifts();
  renderHeroCard();
  renderPersonalView();
  renderHoursSummary();

  // Enrutador hash inicial
  const initialHash = window.location.hash.replace('#', '');
  const validViews = ['dashboard', 'registro', 'personal', 'resumen'];
  navigateTo(validViews.includes(initialHash) ? initialHash : 'dashboard');

  // Restaurar vínculo a archivo local si existe (Chrome/Edge)
  if (window.JsonDB && typeof window.JsonDB.restoreFileLink === 'function') {
    window.JsonDB.restoreFileLink().catch(() => {});
    window.JsonDB.onChange(() => {
      renderDataModalStatus();
    });
  }

  if (!AuthDB.getCurrentUser()) {
    setTimeout(() => {
      openAuthModal('login');
    }, 400);
  } else {
    checkBackupReminderNotice();
  }
});

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==========================================
// CONTROLADOR DE NAVEGACIÓN (SPA)
// ==========================================
function navigateTo(viewName) {
  const views = ['dashboard', 'registro', 'personal', 'resumen'];
  if (!views.includes(viewName)) viewName = 'dashboard';
  AppState.currentView = viewName;

  views.forEach(v => {
    const panel = document.getElementById('view-' + v);
    if (panel) {
      if (v === viewName) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    }
  });

  // Estilos Desktop
  const desktopLinks = document.querySelectorAll('[data-desktop-nav]');
  desktopLinks.forEach(link => {
    const target = link.getAttribute('data-desktop-nav');
    if (target === viewName) {
      link.className = 'px-3.5 py-2 transition-colors bg-primary-container text-on-primary-container font-semibold rounded-lg shadow-xs';
      link.setAttribute('aria-current', 'page');
    } else {
      link.className = 'px-3.5 py-2 rounded-lg font-title-md text-title-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors';
      link.removeAttribute('aria-current');
    }
  });

  // Estilos Mobile
  const mobileBtns = document.querySelectorAll('[data-mobile-nav]');
  mobileBtns.forEach(btn => {
    const target = btn.getAttribute('data-mobile-nav');
    if (target === viewName) {
      btn.className = 'mobile-nav-btn flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all text-primary font-bold bg-primary-container/15';
    } else {
      btn.className = 'mobile-nav-btn flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all text-on-surface-variant hover:text-on-surface';
    }
  });

  if (window.location.hash !== '#' + viewName) {
    window.location.hash = viewName;
  }

  if (viewName === 'dashboard') {
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
  } else if (viewName === 'personal') {
    renderPersonalView();
  } else if (viewName === 'resumen') {
    renderHoursSummary();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (['dashboard', 'registro', 'personal', 'resumen'].includes(hash)) {
    navigateTo(hash);
  }
});

// ==========================================
// AUTENTICACIÓN Y PERFIL DE USUARIO
// ==========================================
function updateAuthUI() {
  const user = AuthDB.getCurrentUser();
  const profileContainer = document.getElementById('userProfileArea');
  if (!profileContainer) return;

  const headerBadge = document.getElementById('headerHospitalBadge');
  if (headerBadge) {
    if (AuthDB.isFirebaseReady) {
      headerBadge.innerText = 'AntiTurno • Nube Activa (Firebase)';
    } else {
      headerBadge.innerText = 'AntiTurno • Gestión Clínica';
    }
  }

  if (user) {
    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    profileContainer.innerHTML = `
      <div class="relative group">
        <button id="userMenuBtn" onclick="toggleUserDropdown()" class="flex items-center gap-space-sm pl-space-sm py-1 px-2 rounded-xl hover:bg-surface-container transition-all" type="button">
          <div class="w-9 h-9 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center ring-2 ring-primary-fixed text-sm shadow-xs">
            ${initials}
          </div>
          <div class="hidden md:flex flex-col text-left">
            <span class="font-title-md text-title-md text-on-surface font-semibold leading-tight">${escapeHTML(user.name)}</span>
            <span class="font-label-sm text-label-sm text-primary font-medium">Cuenta Activa</span>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant text-lg ml-0.5">expand_more</span>
        </button>

        <div id="userDropdown" class="hidden absolute right-0 mt-2 w-64 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/40 p-2 z-50 animate-in fade-in">
          <div class="p-3 border-b border-outline-variant/30">
            <p class="font-title-md text-title-md text-on-surface font-bold truncate">${escapeHTML(user.name)}</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${escapeHTML(user.email)}</p>
            ${AuthDB.isFirebaseReady
              ? '<div class="mt-2 px-2.5 py-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 rounded-lg flex items-center gap-1.5 border border-emerald-200"><span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span>Nube Sincronizada (Firebase)</span></div>'
              : '<div class="mt-2 px-2.5 py-1 text-[10px] font-bold text-stone-700 bg-stone-100 rounded-lg flex items-center gap-1.5 border border-stone-200"><span class="w-2 h-2 rounded-full bg-stone-400"></span><span>Modo Local (JSON)</span></div>'
            }
          </div>
          <div class="py-1">
            <button onclick="openSyncModal()" class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-on-surface hover:bg-surface-container rounded-xl text-sm font-medium transition-colors" type="button">
              <span class="material-symbols-outlined text-primary text-lg">calendar_month</span>
              <span>Exportar / Sincronizar (.ics)</span>
            </button>
            <button onclick="openDataModal()" class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-on-surface hover:bg-surface-container rounded-xl text-sm font-medium transition-colors" type="button">
              <span class="material-symbols-outlined text-primary text-lg">folder_open</span>
              <span>Mis datos (JSON)</span>
            </button>
            <button onclick="openReminderPrefsModal()" class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-on-surface hover:bg-surface-container rounded-xl text-sm font-medium transition-colors" type="button">
              <span class="material-symbols-outlined text-primary text-lg">tune</span>
              <span>Preferencias de Recordatorios</span>
            </button>
            <button onclick="handleLogout()" class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-error hover:bg-error-container/30 rounded-xl text-sm font-semibold transition-colors mt-1" type="button">
              <span class="material-symbols-outlined text-lg">logout</span>
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    profileContainer.innerHTML = `
      <button onclick="openAuthModal('login')" class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-title-md text-title-md shadow-xs transition-all" type="button">
        <span class="material-symbols-outlined text-lg">login</span>
        <span>Iniciar Sesión</span>
      </button>
    `;
  }
}

function toggleUserDropdown() {
  const dd = document.getElementById('userDropdown');
  if (dd) dd.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const btn = document.getElementById('userMenuBtn');
  const dd = document.getElementById('userDropdown');
  if (dd && !dd.classList.contains('hidden') && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
    dd.classList.add('hidden');
  }
});

function togglePasswordVisibility(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  if (btn) {
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon) icon.innerText = isPassword ? 'visibility_off' : 'visibility';
  }
}

function openAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  switchAuthTab(mode);

  // Prellenar último correo recordado
  const lastEmail = AuthDB.getLastEmail();
  const emailInput = document.getElementById('loginEmailInput');
  const rememberEmailCb = document.getElementById('loginRememberEmailCheckbox');
  if (emailInput) {
    if (lastEmail) {
      emailInput.value = lastEmail;
      if (rememberEmailCb) rememberEmailCb.checked = true;
      setTimeout(() => {
        const passInput = document.getElementById('loginPasswordInput');
        if (passInput && mode === 'login') passInput.focus();
      }, 100);
    } else {
      if (rememberEmailCb) rememberEmailCb.checked = true;
      setTimeout(() => {
        if (mode === 'login') emailInput.focus();
      }, 100);
    }
  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('hidden');
  clearAuthErrors();
}

function switchAuthTab(mode) {
  const loginTab = document.getElementById('tabLoginBtn');
  const registerTab = document.getElementById('tabRegisterBtn');
  const loginForm = document.getElementById('authLoginForm');
  const registerForm = document.getElementById('authRegisterForm');

  clearAuthErrors();

  if (mode === 'login') {
    loginTab.className = 'flex-1 py-2.5 text-center font-title-md text-title-md font-bold text-primary border-b-2 border-primary';
    registerTab.className = 'flex-1 py-2.5 text-center font-title-md text-title-md font-semibold text-on-surface-variant border-b-2 border-transparent hover:text-on-surface';
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  } else {
    registerTab.className = 'flex-1 py-2.5 text-center font-title-md text-title-md font-bold text-primary border-b-2 border-primary';
    loginTab.className = 'flex-1 py-2.5 text-center font-title-md text-title-md font-semibold text-on-surface-variant border-b-2 border-transparent hover:text-on-surface';
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  }
}

function clearAuthErrors() {
  const errLogin = document.getElementById('authLoginError');
  const errReg = document.getElementById('authRegisterError');
  if (errLogin) { errLogin.innerText = ''; errLogin.classList.add('hidden'); }
  if (errReg) { errReg.innerText = ''; errReg.classList.add('hidden'); }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  clearAuthErrors();
  const email = document.getElementById('loginEmailInput').value;
  const password = document.getElementById('loginPasswordInput').value;
  const remember = document.getElementById('loginRememberCheckbox')?.checked ?? true;
  const rememberEmail = document.getElementById('loginRememberEmailCheckbox')?.checked ?? true;
  const errBox = document.getElementById('authLoginError');
  const submitBtn = document.getElementById('loginSubmitBtn');

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Iniciando...</span>';

    const user = await AuthDB.login({ email, password, rememberMe: remember, rememberEmail });

    // Credential Management API (autoguardado nativo del navegador si está disponible)
    if (window.PasswordCredential && navigator.credentials && typeof navigator.credentials.store === 'function') {
      try {
        await navigator.credentials.store(new PasswordCredential({
          id: email,
          password: password,
          name: user?.name || email
        }));
      } catch (credErr) {
        // Ignorar si el usuario rechaza o el navegador no lo permite en este contexto
      }
    }

    closeAuthModal();
    updateAuthUI();
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
    renderPersonalView();
    renderHoursSummary();
    showToast('¡Bienvenida(o)! Has iniciado sesión correctamente.', 'success');
    checkBackupReminderNotice();
  } catch (error) {
    if (errBox) {
      errBox.innerText = error.message;
      errBox.classList.remove('hidden');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Iniciar Sesión</span>';
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  clearAuthErrors();
  const name = document.getElementById('regNameInput').value;
  const email = document.getElementById('regEmailInput').value;
  const password = document.getElementById('regPasswordInput').value;
  const confirmPassword = document.getElementById('regConfirmPasswordInput').value;
  const rememberEmail = document.getElementById('regRememberEmailCheckbox')?.checked ?? true;
  const errBox = document.getElementById('authRegisterError');
  const submitBtn = document.getElementById('regSubmitBtn');

  if (password !== confirmPassword) {
    if (errBox) {
      errBox.innerText = 'Las contraseñas no coinciden.';
      errBox.classList.remove('hidden');
    }
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Creando cuenta...</span>';

    const user = await AuthDB.register({ name, email, password, rememberEmail });

    // Prellenar en el formulario de login para futuros accesos
    const loginEmailEl = document.getElementById('loginEmailInput');
    if (loginEmailEl && rememberEmail) loginEmailEl.value = email;

    // Guardar credenciales en el navegador si está disponible
    if (window.PasswordCredential && navigator.credentials && typeof navigator.credentials.store === 'function') {
      try {
        await navigator.credentials.store(new PasswordCredential({
          id: email,
          password: password,
          name: user?.name || name
        }));
      } catch (credErr) {}
    }

    closeAuthModal();
    updateAuthUI();
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
    renderPersonalView();
    renderHoursSummary();
    showToast('¡Cuenta creada con éxito! Bienvenido(a) a AntiTurno.', 'success');
  } catch (error) {
    if (errBox) {
      errBox.innerText = error.message;
      errBox.classList.remove('hidden');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Crear Mi Cuenta</span>';
  }
}

async function handleLogout() {
  if (confirm('¿Deseas cerrar tu sesión?')) {
    await AuthDB.logout();
    updateAuthUI();
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
    renderPersonalView();
    renderHoursSummary();
    showToast('Sesión cerrada correctamente.', 'info');
    navigateTo('dashboard');
  }
}

// ==========================================
// REGISTRO Y GESTIÓN DE TURNOS (CRUD)
// ==========================================
function selectShiftType(type) {
  AppState.activeShiftType = type;
  if (!AppState.editingShiftId && typeof applyShiftTemplateReminders === 'function') {
    applyShiftTemplateReminders(type);
  }

  const btns = document.querySelectorAll('.shift-type-btn');
  btns.forEach(b => {
    const bType = b.getAttribute('data-shift-type');
    const checkIcon = b.querySelector('.check-icon');
    const isSelected = bType === type;

    // Resetear clases seleccionadas previas
    b.classList.remove(
      'shift-card-m-selected', 'shift-card-t-selected', 'shift-card-n-selected', 'shift-card-g-selected',
      'ring-2', 'ring-primary', 'bg-surface-container-lowest', 'shadow-xs', 'shadow-sm'
    );

    if (isSelected) {
      b.classList.add(`shift-card-${bType.toLowerCase()}-selected`, 'shadow-sm');
      if (checkIcon) {
        checkIcon.classList.remove('hidden');
      }
    } else {
      if (checkIcon) {
        checkIcon.classList.add('hidden');
      }
    }
  });

  const startInput = document.getElementById('shiftStartTimeInput');
  const endInput = document.getElementById('shiftEndTimeInput');
  if (!AppState.editingShiftId && startInput && endInput && SHIFT_TYPES[type]) {
    startInput.value = SHIFT_TYPES[type].defaults[0];
    endInput.value = SHIFT_TYPES[type].defaults[1];
  }
}

function handleSaveShift(event) {
  if (event) event.preventDefault();

  const user = AuthDB.getCurrentUser();
  if (!user) {
    openAuthModal('login');
    showToast('Inicia sesión para guardar tus turnos en tu cuenta.', 'warning');
    return;
  }

  const shiftId = AppState.editingShiftId;
  const date = document.getElementById('shiftDateInput').value;
  const startTime = document.getElementById('shiftStartTimeInput').value;
  const endTime = document.getElementById('shiftEndTimeInput').value;
  const hospEl = document.getElementById('shiftHospitalInput') || document.getElementById('shiftHospitalSelect');
  const hospital = hospEl ? hospEl.value.trim() : '';
  const service = document.getElementById('shiftServiceInput').value;
  const notes = document.getElementById('shiftNotesInput').value;

  // Recordatorios dinámicos configurados en la interfaz (Plan 03)
  const reminders = AppState.shiftReminders;

  if (!date) {
    showToast('Por favor selecciona la fecha del turno.', 'error');
    return;
  }
  if (!startTime || !endTime) {
    showToast('Por favor especifica hora de inicio y fin.', 'error');
    return;
  }

  try {
    const shiftData = {
      id: shiftId,
      date,
      startTime,
      endTime,
      type: AppState.activeShiftType,
      hospital: hospital || '',
      service: service || 'UCI Adultos',
      notes: notes || '',
      reminders: AppState.shiftReminders
    };

    AuthDB.saveShift(shiftData);
    showToast(shiftId ? '¡Turno modificado correctamente!' : '¡Turno guardado con éxito!', 'success');

    resetShiftForm();
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
    renderPersonalView();
    renderHoursSummary();
    navigateTo('dashboard');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function editShift(shiftId) {
  const shift = AuthDB.getShiftById(shiftId);
  if (!shift) {
    showToast('No se encontró el turno seleccionado.', 'error');
    return;
  }

  AppState.editingShiftId = shift.id;

  document.getElementById('shiftDateInput').value = shift.date;
  document.getElementById('shiftStartTimeInput').value = shift.startTime;
  document.getElementById('shiftEndTimeInput').value = shift.endTime;
  const editHospEl = document.getElementById('shiftHospitalInput') || document.getElementById('shiftHospitalSelect');
  if (editHospEl) editHospEl.value = shift.hospital || '';
  document.getElementById('shiftServiceInput').value = shift.service || 'UCI Adultos';
  document.getElementById('shiftNotesInput').value = shift.notes || '';

  AppState.shiftReminders = Array.isArray(shift.reminders)
    ? JSON.parse(JSON.stringify(shift.reminders))
    : AuthDB.normalizeReminders(shift.reminders, shift.type);
  renderShiftRemindersEditor();

  selectShiftType(shift.type || 'M');

  const formTitle = document.getElementById('shiftFormTitle');
  if (formTitle) formTitle.innerText = 'Modificar Turno Asignado';

  const saveBtnText = document.getElementById('saveShiftBtnText');
  if (saveBtnText) saveBtnText.innerText = 'Actualizar Turno';

  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  const deleteBtn = document.getElementById('deleteShiftBtn');
  if (deleteBtn) deleteBtn.classList.remove('hidden');

  closeDayDetailsModal();
  navigateTo('registro');
}

function cancelEditShift() {
  resetShiftForm();
  showToast('Edición cancelada.', 'info');
  navigateTo('dashboard');
}

function handleDeleteShift() {
  if (!AppState.editingShiftId) return;
  if (confirm('¿Estás seguro de que deseas eliminar este turno? Esta acción no se puede deshacer.')) {
    try {
      AuthDB.deleteShift(AppState.editingShiftId);
      showToast('Turno eliminado correctamente.', 'success');
      resetShiftForm();
      renderCalendar();
      renderUpcomingShifts();
      renderHeroCard();
      renderPersonalView();
      renderHoursSummary();
      navigateTo('dashboard');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

function resetShiftForm() {
  AppState.editingShiftId = null;

  const todayStr = formatLocalDate(new Date());
  document.getElementById('shiftDateInput').value = todayStr;
  const resetHospEl = document.getElementById('shiftHospitalInput') || document.getElementById('shiftHospitalSelect');
  if (resetHospEl) resetHospEl.value = '';
  document.getElementById('shiftServiceInput').value = 'UCI Adultos';
  document.getElementById('shiftNotesInput').value = '';

  selectShiftType('M');
  applyShiftTemplateReminders('M');

  const formTitle = document.getElementById('shiftFormTitle');
  if (formTitle) formTitle.innerText = 'Planificar Nuevo Turno';

  const saveBtnText = document.getElementById('saveShiftBtnText');
  if (saveBtnText) saveBtnText.innerText = 'Guardar Turno';

  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.classList.add('hidden');

  const deleteBtn = document.getElementById('deleteShiftBtn');
  if (deleteBtn) deleteBtn.classList.add('hidden');
}

// ==========================================
// COMPROMISOS PERSONALES & PROTECCIÓN ANTI-CRUCES
// ==========================================
const COMMITMENT_CATEGORIES = {
  medica: { label: 'Cita Médica / Salud', color: 'bg-cyan-100 text-cyan-900 border-cyan-300', dot: 'bg-cyan-500', icon: 'medical_services' },
  estudio: { label: 'Estudio / Formación', color: 'bg-purple-100 text-purple-900 border-purple-300', dot: 'bg-purple-500', icon: 'school' },
  familia: { label: 'Familia & Social', color: 'bg-emerald-100 text-emerald-900 border-emerald-300', dot: 'bg-emerald-500', icon: 'family_restroom' },
  diligencias: { label: 'Diligencias / Trámites', color: 'bg-slate-100 text-slate-800 border-slate-300', dot: 'bg-slate-500', icon: 'task_alt' },
  descanso: { label: 'Descanso / Sueño Protegido', color: 'bg-indigo-100 text-indigo-900 border-indigo-300', dot: 'bg-indigo-500', icon: 'bed' },
  ejercicio: { label: 'Ejercicio & Deporte', color: 'bg-orange-100 text-orange-900 border-orange-300', dot: 'bg-orange-500', icon: 'fitness_center' },
  otro: { label: 'Otro Compromiso', color: 'bg-pink-100 text-pink-900 border-pink-300', dot: 'bg-pink-500', icon: 'bookmark' }
};

function openCommitmentModal(defaultDate = null, commitmentId = null) {
  const modal = document.getElementById('commitmentModal');
  const titleElem = document.getElementById('commitmentModalTitle');
  const conflictBanner = document.getElementById('commitmentConflictBanner');
  if (conflictBanner) conflictBanner.classList.add('hidden');

  AppState.editingCommitmentId = commitmentId;
  AppState.pendingCommitmentData = null;

  if (commitmentId) {
    const com = AuthDB.getCommitmentById(commitmentId);
    if (!com) {
      showToast('No se encontró el compromiso personal.', 'error');
      return;
    }
    AppState.editingCommitmentId = com.id;
    if (titleElem) titleElem.innerText = 'Modificar Compromiso Personal';
    document.getElementById('comTitleInput').value = com.title || '';
    document.getElementById('comCategorySelect').value = com.category || 'otro';
    document.getElementById('comDateInput').value = com.date || formatLocalDate(new Date());
    document.getElementById('comStartTimeInput').value = com.startTime || '10:00';
    document.getElementById('comEndTimeInput').value = com.endTime || '12:00';
    document.getElementById('comLocationInput').value = com.location || '';
    document.getElementById('comNotesInput').value = com.notes || '';
    AppState.commitmentReminders = Array.isArray(com.reminders)
      ? JSON.parse(JSON.stringify(com.reminders))
      : AuthDB.normalizeReminders(com.reminders, 'commitmentDefault');
  } else {
    AppState.editingCommitmentId = null;
    if (titleElem) titleElem.innerText = 'Nuevo Compromiso Personal';
    document.getElementById('comTitleInput').value = '';
    document.getElementById('comCategorySelect').value = 'medica';
    document.getElementById('comDateInput').value = defaultDate || formatLocalDate(new Date());
    document.getElementById('comStartTimeInput').value = '10:00';
    document.getElementById('comEndTimeInput').value = '12:00';
    document.getElementById('comLocationInput').value = '';
    document.getElementById('comNotesInput').value = '';
    const prefs = AuthDB.getReminderPrefs();
    AppState.commitmentReminders = JSON.parse(JSON.stringify(prefs.commitmentDefault || []));
  }

  renderCommitmentRemindersEditor();
  if (modal) modal.classList.remove('hidden');
}

function closeCommitmentModal() {
  const modal = document.getElementById('commitmentModal');
  if (modal) modal.classList.add('hidden');
  AppState.editingCommitmentId = null;
  AppState.pendingCommitmentData = null;
}

function handleSaveCommitment(event, forceSave = false) {
  if (event) event.preventDefault();

  const user = AuthDB.getCurrentUser();
  if (!user) {
    openAuthModal('login');
    return;
  }

  let commitmentData = null;
  if (forceSave && AppState.pendingCommitmentData) {
    commitmentData = AppState.pendingCommitmentData;
  } else {
    const title = document.getElementById('comTitleInput').value;
    const category = document.getElementById('comCategorySelect').value;
    const date = document.getElementById('comDateInput').value;
    const startTime = document.getElementById('comStartTimeInput').value;
    const endTime = document.getElementById('comEndTimeInput').value;
    const location = document.getElementById('comLocationInput').value;
    const notes = document.getElementById('comNotesInput').value;

    if (!title || title.trim().length === 0) {
      showToast('Por favor escribe un título para el compromiso.', 'error');
      return;
    }
    if (!date) {
      showToast('Por favor selecciona la fecha.', 'error');
      return;
    }
    if (!startTime || !endTime) {
      showToast('Por favor especifica hora de inicio y fin.', 'error');
      return;
    }

    commitmentData = {
      id: AppState.editingCommitmentId,
      title,
      category,
      date,
      startTime,
      endTime,
      location,
      notes,
      reminders: AppState.commitmentReminders
    };

    // ALGORITMO PROTECCIÓN ANTI-CRUCES
    const conflict = AuthDB.checkConflict(date, startTime, endTime, AppState.editingCommitmentId);
    if (conflict.hasConflict) {
      AppState.pendingCommitmentData = commitmentData;
      const banner = document.getElementById('commitmentConflictBanner');
      const bannerTitle = document.getElementById('conflictBannerTitle');
      const bannerMsg = document.getElementById('conflictBannerMessage');

      if (banner && bannerTitle && bannerMsg) {
        bannerTitle.innerText = conflict.title;
        bannerMsg.innerText = conflict.message;
        banner.classList.remove('hidden');
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return; // Esperar decisión del usuario
    }
  }

  try {
    AuthDB.saveCommitment(commitmentData);
    showToast(commitmentData.id ? '¡Compromiso modificado con éxito!' : '¡Compromiso personal guardado con éxito!', 'success');
    closeCommitmentModal();
    renderPersonalView();
    renderCalendar();

    if (AppState.selectedDate) {
      openDayDetailsModal(AppState.selectedDate);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function editCommitment(id) {
  openCommitmentModal(null, id);
}

function handleDeleteCommitment(id) {
  if (confirm('¿Deseas eliminar este compromiso personal?')) {
    try {
      AuthDB.deleteCommitment(id);
      showToast('Compromiso eliminado correctamente.', 'success');
      renderPersonalView();
      renderCalendar();
      if (AppState.selectedDate) {
        openDayDetailsModal(AppState.selectedDate);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function filterCommitments(category) {
  AppState.activeCategoryFilter = category;
  renderPersonalView();
}

function renderPersonalView() {
  const container = document.getElementById('personalCommitmentsList');
  if (!container) return;

  const user = AuthDB.getCurrentUser();
  if (!user) {
    container.innerHTML = `
      <div class="p-8 rounded-2xl bg-surface-container-low text-center">
        <span class="material-symbols-outlined text-4xl text-outline-variant mb-2">lock</span>
        <h3 class="font-headline-md text-lg font-bold text-on-surface">Inicia sesión para gestionar tu vida personal</h3>
        <p class="text-xs text-on-surface-variant mt-1 mb-4">Guarda tus citas médicas, estudio y descansos de manera privada.</p>
        <button onclick="openAuthModal('login')" class="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-bold shadow-xs">
          Iniciar Sesión
        </button>
      </div>
    `;
    return;
  }

  const allCommitments = AuthDB.getCommitments();
  const filter = AppState.activeCategoryFilter;
  const filtered = filter === 'all' ? allCommitments : allCommitments.filter(c => c.category === filter);

  // Actualizar métricas
  const totalElem = document.getElementById('personalTotalCount');
  if (totalElem) totalElem.innerText = allCommitments.length;

  // Calcular horas de autocuidado este mes
  const currentMonthIdx = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  let totalPersonalHours = 0;
  let conflictCount = 0;

  allCommitments.forEach(c => {
    const d = new Date(c.date + 'T00:00:00');
    if (d.getMonth() === currentMonthIdx && d.getFullYear() === currentYear) {
      totalPersonalHours += AuthDB.calculateShiftHours(c.startTime, c.endTime);
    }
    const conf = AuthDB.checkConflict(c.date, c.startTime, c.endTime, c.id);
    if (conf.hasConflict) conflictCount++;
  });

  const hoursElem = document.getElementById('personalHoursCount');
  if (hoursElem) hoursElem.innerText = totalPersonalHours.toFixed(1) + 'h';

  const conflictBadge = document.getElementById('personalConflictCountBadge');
  if (conflictBadge) {
    conflictBadge.innerText = conflictCount > 0 ? `${conflictCount} cruce(s) detectado(s)` : 'Sin cruces activos';
    conflictBadge.className = conflictCount > 0 ? 'text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full' : 'text-xs font-bold text-primary bg-primary-fixed px-2.5 py-1 rounded-full';
  }

  // Actualizar botones de filtro
  const filterBtns = document.querySelectorAll('.cat-filter-btn');
  filterBtns.forEach(btn => {
    const cat = btn.getAttribute('data-cat-filter');
    if (cat === filter) {
      btn.className = 'cat-filter-btn px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-on-primary shadow-xs transition-colors';
    } else {
      btn.className = 'cat-filter-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors';
    }
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-10 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 text-center flex flex-col items-center">
        <div class="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center text-primary mb-3">
          <span class="material-symbols-outlined text-3xl">event_note</span>
        </div>
        <h4 class="font-headline-md text-lg font-bold text-on-surface">No hay compromisos en esta categoría</h4>
        <p class="text-xs text-on-surface-variant mt-1 mb-5">Programa citas médicas, tiempo con familia o descanso para proteger tu bienestar.</p>
        <button onclick="openCommitmentModal()" class="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm shadow-xs flex items-center gap-2">
          <span class="material-symbols-outlined text-xl">add_circle</span>
          <span>Nuevo compromiso personal</span>
        </button>
      </div>
    `;
    return;
  }

  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
  filtered.forEach(c => {
    const meta = COMMITMENT_CATEGORIES[c.category] || COMMITMENT_CATEGORIES.otro;
    const duration = AuthDB.calculateShiftHours(c.startTime, c.endTime);
    const [y, m, d] = c.date.split('-');
    const formattedDate = `${d}/${m}/${y}`;
    const conf = AuthDB.checkConflict(c.date, c.startTime, c.endTime, c.id);

    html += `
      <div class="p-5 rounded-2xl bg-surface-container-lowest border ${conf.hasConflict ? 'border-amber-400 ring-2 ring-amber-300/50' : 'border-outline-variant/30'} shadow-sm flex flex-col justify-between gap-3 hover:shadow-md transition-shadow">
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="${meta.color} px-2.5 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
              <span class="material-symbols-outlined text-sm">${meta.icon}</span>
              <span>${meta.label}</span>
            </span>
            <span class="text-xs font-bold text-on-surface-variant">${formattedDate}</span>
          </div>

          <h3 class="font-headline-md text-base font-bold text-on-surface">${escapeHTML(c.title)}</h3>
          
          <div class="flex items-center gap-2 text-xs text-on-surface-variant mt-1.5 font-medium">
            <span class="material-symbols-outlined text-sm text-primary">schedule</span>
            <span>${c.startTime} - ${c.endTime} (${duration}h)</span>
            ${c.location ? `<span class="flex items-center gap-1 ml-2"><span class="material-symbols-outlined text-sm text-primary">pin_drop</span>${escapeHTML(c.location)}</span>` : ''}
          </div>

          ${c.notes ? `<p class="text-xs text-on-surface-variant mt-2 italic font-serif bg-surface-container-low p-2 rounded-lg">"${escapeHTML(c.notes)}"</p>` : ''}

          ${conf.hasConflict ? `
            <div class="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] flex items-start gap-1.5 font-medium">
              <span class="material-symbols-outlined text-amber-600 text-base shrink-0">warning</span>
              <span><strong>Aviso de Cruce:</strong> ${conf.message}</span>
            </div>
          ` : ''}
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
          <button onclick="editCommitment('${c.id}')" class="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold flex items-center gap-1 transition-colors">
            <span class="material-symbols-outlined text-sm">edit</span>
            <span>Editar</span>
          </button>
          <button onclick="handleDeleteCommitment('${c.id}')" class="px-3 py-1.5 rounded-lg bg-error-container/40 hover:bg-error-container text-error text-xs font-bold flex items-center gap-1 transition-colors">
            <span class="material-symbols-outlined text-sm">delete</span>
            <span>Eliminar</span>
          </button>
        </div>
      </div>
    `;
  });
  html += '</div>';

  container.innerHTML = html;
}

// ==========================================
// CALENDARIO DINÁMICO UNIFICADO (TURNOS + COMPROMISOS)
// ==========================================
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function setCalendarFilter(filter) {
  AppState.calendarFilter = filter;
  renderCalendar();
}

function renderCalendarLegend() {
  const container = document.getElementById('calendarLegendContainer');
  if (!container) return;

  let html = '';
  Object.keys(SHIFT_TYPES).forEach(k => {
    const st = SHIFT_TYPES[k];
    html += `
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${st.badgeClass}">
        <span class="material-symbols-outlined text-[12px]">${st.icon}</span>
        <span>${st.label}</span>
      </span>
    `;
  });
  html += `
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${REST_TYPE.badgeClass}">
      <span class="material-symbols-outlined text-[12px]">${REST_TYPE.icon}</span>
      <span>Descanso</span>
    </span>
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300">
      <span class="w-2 h-2 rounded-full bg-purple-600"></span> Personal
    </span>
  `;
  container.innerHTML = html;
}

function renderCalendarFilters() {
  const container = document.getElementById('calendarFiltersBar');
  if (!container) return;

  const current = AppState.calendarFilter || 'all';

  const filterOptions = [
    { id: 'all', label: 'Todos' },
    { id: 'M', label: 'Mañana', badgeClass: 'shift-badge-m', icon: 'wb_sunny' },
    { id: 'T', label: 'Tarde', badgeClass: 'shift-badge-t', icon: 'wb_twilight' },
    { id: 'N', label: 'Noche', badgeClass: 'shift-badge-n', icon: 'bedtime' },
    { id: 'G', label: 'Guardia 24h', badgeClass: 'shift-badge-g', icon: 'emergency' },
    { id: 'personal', label: 'Personal', icon: 'self_improvement' }
  ];

  let html = '<span class="text-on-surface-variant font-bold text-[11px] mr-1">Filtrar:</span>';
  filterOptions.forEach(opt => {
    const isActive = current === opt.id;
    let activeStyle = '';
    if (isActive) {
      if (opt.id === 'all') {
        activeStyle = 'bg-primary text-on-primary font-bold shadow-xs';
      } else if (opt.badgeClass) {
        activeStyle = `${opt.badgeClass} ring-2 ring-offset-1 ring-current font-bold shadow-xs`;
      } else {
        activeStyle = 'bg-purple-600 text-white font-bold shadow-xs';
      }
    } else {
      activeStyle = 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/30';
    }

    html += `
      <button type="button" onclick="setCalendarFilter('${opt.id}')"
              class="px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 transition-all ${activeStyle}"
              title="Filtrar por ${opt.label}">
        ${opt.icon ? `<span class="material-symbols-outlined text-[13px]">${opt.icon}</span>` : ''}
        <span>${opt.label}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

function renderCalendarMonthSummary(shifts, year, month) {
  const container = document.getElementById('calendarMonthSummaryBar');
  if (!container) return;

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthShifts = shifts.filter(s => s.date && s.date.startsWith(monthPrefix));

  let countM = 0;
  let countT = 0;
  let countN = 0;
  let countG = 0;
  let totalHours = 0;

  monthShifts.forEach(s => {
    if (s.type === 'M') countM++;
    else if (s.type === 'T') countT++;
    else if (s.type === 'N') countN++;
    else if (s.type === 'G') countG++;
    totalHours += AuthDB.calculateShiftHours(s.startTime, s.endTime);
  });

  container.innerHTML = `
    <span class="text-on-surface-variant font-bold text-[11px]">Mes:</span>
    <span class="shift-badge-m px-2 py-0.5 rounded-md font-bold flex items-center gap-1" title="${countM} turnos de mañana">
      <span class="material-symbols-outlined text-[12px]">wb_sunny</span>
      <span>${countM} M</span>
    </span>
    <span class="shift-badge-t px-2 py-0.5 rounded-md font-bold flex items-center gap-1" title="${countT} turnos de tarde">
      <span class="material-symbols-outlined text-[12px]">wb_twilight</span>
      <span>${countT} T</span>
    </span>
    <span class="shift-badge-n px-2 py-0.5 rounded-md font-bold flex items-center gap-1" title="${countN} turnos de noche">
      <span class="material-symbols-outlined text-[12px]">bedtime</span>
      <span>${countN} N</span>
    </span>
    <span class="shift-badge-g px-2 py-0.5 rounded-md font-bold flex items-center gap-1" title="${countG} guardias de 24h">
      <span class="material-symbols-outlined text-[12px]">emergency</span>
      <span>${countG} G</span>
    </span>
    <span class="bg-surface-container text-on-surface px-2 py-0.5 rounded-md font-bold border border-outline-variant/30" title="Total de horas clínicas en el mes">
      ${totalHours.toFixed(0)}h
    </span>
  `;
}

function renderCalendar() {
  const container = document.getElementById('dynamicCalendarGrid');
  const monthTitle = document.getElementById('calendarMonthTitle');
  if (!container || !monthTitle) return;

  const year = AppState.calendarDate.getFullYear();
  const month = AppState.calendarDate.getMonth();

  monthTitle.innerText = `${MONTH_NAMES[month]} ${year}`;

  renderCalendarLegend();
  renderCalendarFilters();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const totalDays = lastDayOfMonth.getDate();

  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6;

  const user = AuthDB.getCurrentUser();
  const shifts = user ? AuthDB.getShifts() : [];
  const commitments = user ? AuthDB.getCommitments() : [];

  renderCalendarMonthSummary(shifts, year, month);

  let html = '';

  // 1. Días del mes anterior
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    html += `
      <div class="min-h-[75px] sm:min-h-[120px] p-1 sm:p-2 rounded-lg sm:rounded-xl bg-surface-container-lowest/40 opacity-40 flex flex-col justify-between border border-outline-variant/10">
        <span class="font-label-md text-label-md font-semibold text-on-surface-variant">${dayNum}</span>
      </div>
    `;
  }

  // 2. Días del mes actual
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const currentFilter = AppState.calendarFilter || 'all';

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = isCurrentMonth && today.getDate() === day;
    const dayShifts = shifts.filter(s => s.date === dateStr);
    const dayCommitments = commitments.filter(c => c.date === dateStr);

    // Detección de descanso post-noche / post-guardia
    const prevDayDate = new Date(year, month, day - 1);
    const prevDateStr = `${prevDayDate.getFullYear()}-${String(prevDayDate.getMonth() + 1).padStart(2, '0')}-${String(prevDayDate.getDate()).padStart(2, '0')}`;
    const prevShifts = shifts.filter(s => s.date === prevDateStr);
    const hadOvernightOr24 = prevShifts.some(s => s.type === 'N' || s.type === 'G');
    const isPostGuardiaRest = hadOvernightOr24 && dayShifts.length === 0;

    // Filtros del calendario
    let isFilteredOut = false;
    if (currentFilter !== 'all') {
      if (currentFilter === 'personal') {
        isFilteredOut = dayCommitments.length === 0;
      } else {
        isFilteredOut = !dayShifts.some(s => s.type === currentFilter);
      }
    }

    // Estilo base de celda y bordes
    let cellBgClass = 'bg-surface-container-low';
    let cellBorderClass = isToday
      ? 'ring-2 ring-primary border-primary shadow-sm bg-surface-container-lowest'
      : 'border-outline-variant/20';

    if (dayShifts.length > 0) {
      const primaryShift = dayShifts[0];
      const st = SHIFT_TYPES[primaryShift.type] || SHIFT_TYPES.M;
      cellBorderClass += ` ${st.borderClass}`;
      cellBgClass = st.bgClass;
    } else if (isPostGuardiaRest) {
      cellBorderClass += ` ${REST_TYPE.borderClass}`;
      cellBgClass = REST_TYPE.bgClass;
    }

    // Badges de Turnos (Protagonistas)
    let badgesHtml = '';
    dayShifts.forEach(s => {
      const st = SHIFT_TYPES[s.type] || SHIFT_TYPES.M;
      const compactTime = s.type === 'G' ? '24h' : `${s.startTime.slice(0, 2)}–${s.endTime.slice(0, 2)}`;
      badgesHtml += `
        <div class="${st.badgeClass} px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg flex items-center justify-between text-[10px] sm:text-[11px] font-bold shadow-xs truncate" title="${escapeHTML(st.label)} (${s.startTime}-${s.endTime})">
          <span class="flex items-center gap-0.5 sm:gap-1 truncate">
            <span class="material-symbols-outlined text-[12px] sm:text-[13px] shrink-0">${st.icon}</span>
            <span class="font-extrabold">${st.short}</span>
            <span class="truncate hidden md:inline text-[10px] font-normal opacity-90">${st.label}</span>
          </span>
          <span class="text-[9px] sm:text-[10px] font-mono shrink-0 ml-0.5 hidden sm:inline opacity-90 font-semibold">${compactTime}</span>
        </div>
      `;
    });

    // Indicador visual de descanso post-noche/post-guardia
    if (isPostGuardiaRest) {
      badgesHtml += `
        <div class="${REST_TYPE.badgeClass} px-1 sm:px-1.5 py-0.5 rounded-md sm:rounded-lg flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] font-bold truncate shadow-xs" title="Día de descanso recomendado tras guardia de noche o 24h">
          <span class="material-symbols-outlined text-[12px] shrink-0">${REST_TYPE.icon}</span>
          <span class="truncate">Descanso</span>
        </div>
      `;
    }

    // Badges de Compromisos Personales (Subordinados: micro-chips discretos)
    if (dayCommitments.length > 0) {
      const maxVisibleComs = 2;
      const visibleComs = dayCommitments.slice(0, maxVisibleComs);
      const remainingComs = dayCommitments.length - maxVisibleComs;

      visibleComs.forEach(c => {
        const meta = COMMITMENT_CATEGORIES[c.category] || COMMITMENT_CATEGORIES.otro;
        badgesHtml += `
          <div class="flex items-center gap-1 px-1 sm:px-1.5 py-0.5 rounded bg-surface-container-lowest/90 border border-outline-variant/30 text-[9px] sm:text-[10px] text-on-surface font-medium truncate shadow-2xs" title="${escapeHTML(c.title)} (${c.startTime})">
            <span class="w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot || 'bg-primary'}"></span>
            <span class="truncate">${escapeHTML(c.title)}</span>
          </div>
        `;
      });
      if (remainingComs > 0) {
        badgesHtml += `<span class="text-[9px] text-on-surface-variant font-semibold pl-1">+${remainingComs} más</span>`;
      }
    }

    const isWeekend = (startDayOfWeek + day - 1) % 7 >= 5;
    const totalEvents = dayShifts.length + dayCommitments.length;
    const filterClass = isFilteredOut ? 'opacity-25 grayscale-[0.6]' : 'opacity-100';

    const ariaLabel = `${day} de ${MONTH_NAMES[month]}: ${dayShifts.map(s => `${SHIFT_TYPES[s.type]?.label || 'Turno'} de ${s.startTime} a ${s.endTime}`).join(', ') || (isPostGuardiaRest ? 'Descanso post-guardia' : 'Sin turnos')}${dayCommitments.length ? `, ${dayCommitments.length} compromiso(s)` : ''}`;

    html += `
      <div onclick="openDayDetailsModal('${dateStr}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDayDetailsModal('${dateStr}');}"
           role="button"
           tabindex="0"
           aria-label="${escapeHTML(ariaLabel)}"
           class="min-h-[75px] sm:min-h-[120px] p-1 sm:p-2 rounded-lg sm:rounded-xl ${cellBgClass} hover:bg-surface-container transition-all cursor-pointer flex flex-col justify-between border ${cellBorderClass} ${filterClass} focus-visible:ring-2 focus-visible:ring-primary focus:outline-none">
        <div class="flex items-center justify-between">
          <span class="font-label-md text-label-md font-bold ${isToday ? 'text-primary' : (isWeekend ? 'text-primary/80 font-bold' : 'text-on-surface')}">${day}</span>
          ${isToday ? '<span class="px-1.5 py-0.5 rounded-full bg-primary text-on-primary text-[9px] font-bold uppercase tracking-wider">Hoy</span>' : ''}
        </div>
        
        <div class="flex flex-col gap-1 my-1 overflow-hidden">
          ${badgesHtml}
        </div>

        <div class="flex items-center justify-end">
          ${totalEvents === 0 && !isPostGuardiaRest ? '<span class="text-outline-variant/50 text-xs hover:text-primary font-bold">+</span>' : `<span class="text-[10px] text-on-surface-variant font-medium">${totalEvents} act.</span>`}
        </div>
      </div>
    `;
  }

  // 3. Días del mes siguiente
  const totalRendered = startDayOfWeek + totalDays;
  const nextDays = (7 - (totalRendered % 7)) % 7;
  for (let day = 1; day <= nextDays; day++) {
    html += `
      <div class="min-h-[105px] sm:min-h-[120px] p-2 rounded-xl bg-surface-container-lowest/40 opacity-40 flex flex-col justify-between border border-outline-variant/10">
        <span class="font-label-md text-label-md font-semibold text-on-surface-variant">${day}</span>
      </div>
    `;
  }

  container.innerHTML = html;
}

function getShiftBadgeHtml(shift) {
  const st = SHIFT_TYPES[shift.type] || SHIFT_TYPES.M;
  const label = `${st.label} (${shift.startTime}-${shift.endTime})`;
  return `
    <div class="${st.badgeClass} px-2 py-0.5 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold truncate shadow-xs" title="${escapeHTML(label)}">
      <span class="material-symbols-outlined text-[13px] shrink-0">${st.icon}</span>
      <span class="truncate">${escapeHTML(label)}</span>
    </div>
  `;
}

function getCommitmentBadgeHtml(com) {
  const meta = COMMITMENT_CATEGORIES[com.category] || COMMITMENT_CATEGORIES.otro;
  return `
    <div class="${meta.color} px-1.5 py-0.5 rounded-lg flex items-center gap-1 text-[10px] font-semibold truncate shadow-xs border" title="${escapeHTML(com.title)} (${com.startTime})">
      <span class="material-symbols-outlined text-[12px] shrink-0">${meta.icon}</span>
      <span class="truncate">${escapeHTML(com.title)}</span>
    </div>
  `;
}

function prevMonth() {
  AppState.calendarDate.setMonth(AppState.calendarDate.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  AppState.calendarDate.setMonth(AppState.calendarDate.getMonth() + 1);
  renderCalendar();
}

function currentMonth() {
  AppState.calendarDate = new Date();
  renderCalendar();
}

// ==========================================
// DETALLE DE DÍA (TURNOS + COMPROMISOS)
// ==========================================
function openDayDetailsModal(dateStr) {
  AppState.selectedDate = dateStr;
  const modal = document.getElementById('dayDetailsModal');
  const title = document.getElementById('dayDetailsTitle');
  const content = document.getElementById('dayDetailsContent');
  if (!modal || !title || !content) return;

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dateObj.getDay()];
  title.innerText = `${dayName}, ${d} de ${MONTH_NAMES[m - 1]} de ${y}`;

  const user = AuthDB.getCurrentUser();
  if (!user) {
    content.innerHTML = `
      <div class="text-center py-8">
        <span class="material-symbols-outlined text-4xl text-outline-variant mb-2">lock</span>
        <p class="font-title-md text-title-md text-on-surface font-semibold">Inicia sesión para gestionar tu agenda</p>
        <button onclick="closeDayDetailsModal(); openAuthModal('login');" class="mt-4 px-4 py-2 rounded-xl bg-primary text-on-primary font-bold shadow-xs">
          Iniciar Sesión
        </button>
      </div>
    `;
    modal.classList.remove('hidden');
    return;
  }

  const shifts = AuthDB.getShiftsForDate(dateStr);
  const commitments = AuthDB.getCommitmentsForDate(dateStr);

  let html = '<div class="flex flex-col gap-6">';

  // 1. SECCIÓN TURNOS CLÍNICOS
  html += `
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between pb-1 border-b border-outline-variant/30">
        <h4 class="font-headline-md text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
          <span class="material-symbols-outlined text-base">local_hospital</span>
          <span>Turnos Clínicos (${shifts.length})</span>
        </h4>
        <button onclick="scheduleShiftOnDate('${dateStr}')" class="text-xs text-primary font-bold hover:underline flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Añadir Turno
        </button>
      </div>
  `;

  if (shifts.length === 0) {
    html += `
      <div class="p-3.5 rounded-xl bg-surface-container-low text-xs text-on-surface-variant flex items-center justify-between">
        <span>Sin turnos clínicos programados en este día.</span>
        <button onclick="scheduleShiftOnDate('${dateStr}')" class="text-primary font-bold hover:underline">Programar</button>
      </div>
    `;
  } else {
    shifts.forEach(s => {
      const st = SHIFT_TYPES[s.type] || SHIFT_TYPES.M;
      const duration = AuthDB.calculateShiftHours(s.startTime, s.endTime);

      html += `
        <div class="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-between gap-3 shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${st.badgeClass} flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-xl">${st.icon}</span>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="${st.badgeClass} px-2 py-0.5 rounded font-label-sm text-[10px] font-bold uppercase flex items-center gap-1">
                  <span class="material-symbols-outlined text-xs">${st.icon}</span>
                  ${st.label}
                </span>
                <span class="text-xs font-bold text-on-surface">${s.startTime} - ${s.endTime} (${duration}h)</span>
              </div>
              <p class="text-xs text-on-surface font-semibold mt-0.5">${escapeHTML(s.service || 'UCI')} • ${escapeHTML(s.hospital || 'Hospital')}</p>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="editShift('${s.id}')" class="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors" title="Editar turno">
              <span class="material-symbols-outlined text-base">edit</span>
            </button>
            <button onclick="confirmDeleteFromModal('${s.id}')" class="p-1.5 rounded-lg hover:bg-error-container text-on-surface-variant hover:text-error transition-colors" title="Eliminar turno">
              <span class="material-symbols-outlined text-base">delete</span>
            </button>
          </div>
        </div>
      `;
    });
  }
  html += '</div>';

  // 2. SECCIÓN COMPROMISOS PERSONALES
  html += `
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between pb-1 border-b border-outline-variant/30">
        <h4 class="font-headline-md text-sm font-bold text-tertiary uppercase tracking-wider flex items-center gap-1.5">
          <span class="material-symbols-outlined text-base">self_improvement</span>
          <span>Vida Personal & Autocuidado (${commitments.length})</span>
        </h4>
        <button onclick="closeDayDetailsModal(); openCommitmentModal('${dateStr}')" class="text-xs text-tertiary font-bold hover:underline flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Nuevo compromiso
        </button>
      </div>
  `;

  if (commitments.length === 0) {
    html += `
      <div class="p-3.5 rounded-xl bg-surface-container-low text-xs text-on-surface-variant flex items-center justify-between">
        <span>Sin compromisos personales registrados.</span>
        <button onclick="closeDayDetailsModal(); openCommitmentModal('${dateStr}')" class="text-tertiary font-bold hover:underline">Registrar Cita o Descanso</button>
      </div>
    `;
  } else {
    commitments.forEach(c => {
      const meta = COMMITMENT_CATEGORIES[c.category] || COMMITMENT_CATEGORIES.otro;
      const duration = AuthDB.calculateShiftHours(c.startTime, c.endTime);

      html += `
        <div class="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-between gap-3 shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${meta.color} flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-xl">${meta.icon}</span>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="${meta.color} px-2 py-0.2 rounded font-label-sm text-[10px] font-bold uppercase">${meta.label}</span>
                <span class="text-xs font-bold text-on-surface">${c.startTime} - ${c.endTime} (${duration}h)</span>
              </div>
              <p class="text-xs text-on-surface font-bold mt-0.5">${escapeHTML(c.title)}</p>
              ${c.location ? `<p class="text-[11px] text-on-surface-variant flex items-center gap-0.5"><span class="material-symbols-outlined text-xs">pin_drop</span>${escapeHTML(c.location)}</p>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="closeDayDetailsModal(); editCommitment('${c.id}')" class="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors" title="Editar compromiso">
              <span class="material-symbols-outlined text-base">edit</span>
            </button>
            <button onclick="handleDeleteCommitment('${c.id}')" class="p-1.5 rounded-lg hover:bg-error-container text-on-surface-variant hover:text-error transition-colors" title="Eliminar compromiso">
              <span class="material-symbols-outlined text-base">delete</span>
            </button>
          </div>
        </div>
      `;
    });
  }
  html += '</div>';

  html += '</div>';
  content.innerHTML = html;
  modal.classList.remove('hidden');
}

function closeDayDetailsModal() {
  const modal = document.getElementById('dayDetailsModal');
  if (modal) modal.classList.add('hidden');
}

function scheduleShiftOnDate(dateStr) {
  closeDayDetailsModal();
  resetShiftForm();
  document.getElementById('shiftDateInput').value = dateStr;
  navigateTo('registro');
}

function confirmDeleteFromModal(shiftId) {
  if (confirm('¿Eliminar este turno de tu programación?')) {
    try {
      AuthDB.deleteShift(shiftId);
      showToast('Turno eliminado correctamente.', 'success');
      renderCalendar();
      renderUpcomingShifts();
      renderHeroCard();
      renderPersonalView();
      renderHoursSummary();
      openDayDetailsModal(AppState.selectedDate);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
}

// ==========================================
// PRÓXIMAS GUARDIAS (LISTA DINÁMICA)
// ==========================================
function renderUpcomingShifts() {
  const container = document.getElementById('upcomingShiftsList');
  if (!container) return;

  const user = AuthDB.getCurrentUser();
  if (!user) {
    container.innerHTML = `
      <div class="p-6 rounded-2xl bg-surface-container-low text-center">
        <span class="material-symbols-outlined text-3xl text-outline-variant mb-1">lock</span>
        <p class="font-title-md text-title-md text-on-surface font-semibold">Inicia sesión para ver tus guardias</p>
      </div>
    `;
    return;
  }

  const shifts = AuthDB.getShifts();
  const now = new Date();
  const upcoming = shifts.filter(s => {
    const shiftDate = new Date(`${s.date}T${s.startTime || '00:00'}:00`);
    return shiftDate >= now || s.date === formatLocalDate(now);
  }).slice(0, 4);

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="p-6 rounded-2xl bg-surface-container-low text-center flex flex-col items-center">
        <span class="material-symbols-outlined text-3xl text-outline-variant mb-2">event_available</span>
        <p class="font-title-md text-title-md text-on-surface font-semibold">No tienes guardias próximas</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-1 mb-4">¡Estás al día! Agrega tu siguiente turno.</p>
        <button onclick="navigateTo('registro')" class="px-4 py-2 rounded-xl bg-primary text-on-primary font-bold text-sm flex items-center gap-1 shadow-xs">
          <span class="material-symbols-outlined text-base">add</span>
          <span>Nuevo Turno</span>
        </button>
      </div>
    `;
    return;
  }

  let html = '<div class="flex flex-col gap-3">';
  upcoming.forEach(s => {
    const st = SHIFT_TYPES[s.type] || SHIFT_TYPES.M;
    const [y, m, d] = s.date.split('-');
    const formattedDate = `${d}/${m}/${y}`;

    html += `
      <div class="p-4 rounded-xl bg-surface-container-lowest shadow-xs flex items-center justify-between gap-3 hover:bg-surface-container-low transition-colors border-l-4 ${st.borderClass} border border-outline-variant/20">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl ${st.badgeClass} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-xl">${st.icon}</span>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="${st.badgeClass} px-2 py-0.5 rounded font-label-sm text-[10px] font-bold uppercase flex items-center gap-1">
                <span class="material-symbols-outlined text-xs">${st.icon}</span>
                ${st.label}
              </span>
              <span class="font-label-sm text-xs text-on-surface-variant font-semibold">${formattedDate}</span>
            </div>
            <p class="font-title-md text-sm text-on-surface font-semibold mt-0.5">${s.startTime} - ${s.endTime} • ${escapeHTML(s.service || 'UCI')}</p>
          </div>
        </div>
        <button onclick="editShift('${s.id}')" class="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors" title="Editar turno">
          <span class="material-symbols-outlined text-lg">edit</span>
        </button>
      </div>
    `;
  });
  html += '</div>';

  container.innerHTML = html;
}

// ==========================================
// HERO STATUS CARD
// ==========================================
function renderHeroCard() {
  const heroContainer = document.getElementById('heroNextShiftCard');
  if (!heroContainer) return;

  const user = AuthDB.getCurrentUser();
  if (!user) {
    heroContainer.className = 'relative overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/30';
    heroContainer.innerHTML = `
      <div class="relative p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
            <span class="material-symbols-outlined text-3xl">clinical_notes</span>
          </div>
          <div>
            <h2 class="font-headline-md text-headline-md text-on-surface font-bold">¡Bienvenida(o) a AntiTurno!</h2>
            <p class="font-body-md text-body-md text-on-surface-variant">Inicia sesión para ver tu próximo turno y descansos regulados.</p>
          </div>
        </div>
        <button onclick="openAuthModal('login')" class="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-bold shadow-xs">
          Iniciar Sesión
        </button>
      </div>
    `;
    return;
  }

  const nextShift = AuthDB.getNextUpcomingShift();

  if (!nextShift) {
    heroContainer.className = `relative overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm border ${REST_TYPE.borderClass} bg-gradient-to-br ${REST_TYPE.heroGradient}`;
    heroContainer.innerHTML = `
      <div class="relative p-5 sm:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl ${REST_TYPE.badgeClass} flex items-center justify-center shrink-0 shadow-sm">
            <span class="material-symbols-outlined text-3xl">${REST_TYPE.icon}</span>
          </div>
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="${REST_TYPE.badgeClass} px-2.5 py-0.5 rounded-full font-label-sm text-xs font-bold uppercase flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">${REST_TYPE.icon}</span>
                Descanso Activo
              </span>
            </div>
            <h2 class="font-headline-md text-lg sm:text-xl text-on-surface font-bold">No tienes turnos próximos programados</h2>
            <p class="font-body-md text-xs sm:text-sm text-on-surface-variant">Tu tiempo personal está libre de guardias inmediatas.</p>
          </div>
        </div>
        <button onclick="navigateTo('registro')" class="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm flex items-center gap-1.5 shadow-xs transition-all">
          <span class="material-symbols-outlined">add_circle</span>
          <span>Nuevo Turno</span>
        </button>
      </div>
    `;
    return;
  }

  const now = new Date();
  const shiftStart = new Date(`${nextShift.date}T${nextShift.startTime || '00:00'}:00`);
  const diffMs = shiftStart - now;

  let timeText = 'Hoy';
  if (diffMs > 0) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    timeText = hours > 24 ? `en ${Math.floor(hours / 24)} días` : `en ${hours}h ${mins}m`;
  } else {
    timeText = '¡En curso ahora!';
  }

  const st = SHIFT_TYPES[nextShift.type] || SHIFT_TYPES.M;
  heroContainer.className = `relative overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm border ${st.heroBorder} bg-gradient-to-br ${st.heroGradient}`;

  heroContainer.innerHTML = `
    <div class="relative p-5 sm:p-6 lg:p-8 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 sm:gap-6">
      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-5 min-w-0">
        <div class="w-16 h-16 rounded-2xl ${st.badgeClass} flex items-center justify-center shrink-0 shadow-md">
          <span class="material-symbols-outlined text-3xl">${st.icon}</span>
        </div>
        <div class="flex flex-col min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="${st.badgeClass} px-3 py-0.5 rounded-full font-label-sm text-xs font-bold tracking-wide uppercase flex items-center gap-1.5 shadow-2xs">
              <span class="material-symbols-outlined text-sm">${st.icon}</span>
              Turno ${st.label} • ${nextShift.startTime} - ${nextShift.endTime}
            </span>
            <span class="bg-surface-container-lowest/80 text-on-surface px-2.5 py-0.5 rounded-full font-label-sm text-xs flex items-center gap-1 border border-outline-variant/30">
              <span class="material-symbols-outlined text-sm text-primary">pin_drop</span>
              ${escapeHTML(nextShift.service || 'UCI')} • ${escapeHTML(nextShift.hospital || 'Hospital')}
            </span>
          </div>
          <h1 class="font-headline-lg text-xl sm:text-2xl text-on-surface font-extrabold tracking-tight truncate">
            Próximo Turno Programado: ${nextShift.date}
          </h1>
          <p class="font-body-md text-xs sm:text-sm text-on-surface-variant flex items-center gap-2 mt-0.5">
            <span>${nextShift.notes ? escapeHTML(nextShift.notes) : 'Sin notas clínicas adicionales registradas'}</span>
          </p>
        </div>
      </div>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full sm:w-auto">
        <div class="bg-surface-container-lowest/90 border border-outline-variant/30 px-5 py-3 rounded-xl flex items-center gap-3 shadow-2xs">
          <span class="material-symbols-outlined text-primary text-2xl">timer</span>
          <div class="flex flex-col">
            <span class="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Comienza</span>
            <span class="font-headline-md text-base sm:text-lg text-on-surface font-extrabold tracking-tight">${timeText}</span>
          </div>
        </div>
        <button onclick="editShift('${nextShift.id}')" class="bg-primary hover:bg-primary-container text-on-primary px-4 py-3 rounded-xl flex items-center gap-2 font-title-md text-sm font-bold shadow-sm transition-all" type="button">
          <span class="material-symbols-outlined text-lg">edit_calendar</span>
          <span>Modificar</span>
        </button>
      </div>
    </div>
  `;
}

// ==========================================
// RESUMEN DE HORAS COMPUTADAS
// ==========================================
function renderHoursSummary() {
  const summary = AuthDB.getHoursSummary(AppState.calendarDate.getFullYear(), AppState.calendarDate.getMonth());

  const totalHoursElem = document.getElementById('summaryTotalHours');
  if (totalHoursElem) totalHoursElem.innerText = summary.totalHours.toFixed(1);

  const nightHoursElem = document.getElementById('summaryNightHours');
  if (nightHoursElem) nightHoursElem.innerText = summary.nightHours.toFixed(1) + 'h';

  const dayHoursElem = document.getElementById('summaryDayHours');
  if (dayHoursElem) dayHoursElem.innerText = summary.dayHours.toFixed(1) + 'h';

  const shiftsCountElem = document.getElementById('summaryShiftCount');
  if (shiftsCountElem) shiftsCountElem.innerText = summary.shiftCount;

  const tableBody = document.getElementById('rosterTableBody');
  if (tableBody) {
    const user = AuthDB.getCurrentUser();
    const shifts = user ? AuthDB.getShifts() : [];

    if (shifts.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-8 text-center text-on-surface-variant font-medium">
            No tienes turnos registrados para el cómputo de horas. Registra tu primer turno para ver el desglose.
          </td>
        </tr>
      `;
    } else {
      let rowsHtml = '';
      shifts.forEach(s => {
        const hours = AuthDB.calculateShiftHours(s.startTime, s.endTime);
        const st = SHIFT_TYPES[s.type] || SHIFT_TYPES.M;

        rowsHtml += `
          <tr class="hover:bg-surface-container-low transition-colors border-b border-outline-variant/20">
            <td class="px-6 py-4 font-semibold text-on-surface">${s.date}</td>
            <td class="px-6 py-4">
              <span class="${st.badgeClass} px-2.5 py-1 rounded-full font-label-sm text-[11px] font-bold uppercase inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-xs">${st.icon}</span>
                ${st.label}
              </span>
            </td>
            <td class="px-6 py-4 text-on-surface">${s.startTime} - ${s.endTime}</td>
            <td class="px-6 py-4 font-bold text-on-surface">${hours} h</td>
            <td class="px-6 py-4 text-on-surface-variant">${escapeHTML(s.service || 'UCI')}</td>
            <td class="px-6 py-4 text-right">
              <button onclick="editShift('${s.id}')" class="text-primary hover:text-primary-container font-semibold text-sm mr-2">Editar</button>
              <button onclick="confirmDeleteFromModal('${s.id}')" class="text-error hover:underline font-semibold text-sm">Eliminar</button>
            </td>
          </tr>
        `;
      });
      tableBody.innerHTML = rowsHtml;
    }
  }
}

// ==========================================
// SINCRONIZACIÓN HONESTA & EXPORTACIÓN .ICS
// ==========================================
function openSyncModal() {
  const modal = document.getElementById('syncCalendarModal');
  if (modal) modal.classList.remove('hidden');
}

function closeSyncModal() {
  const modal = document.getElementById('syncCalendarModal');
  if (modal) modal.classList.add('hidden');
}

function exportCalendarICS() {
  const user = AuthDB.getCurrentUser();
  if (!user) {
    showToast('Inicia sesión para exportar tu calendario.', 'warning');
    return;
  }

  const shifts = AuthDB.getShifts();
  const commitments = AuthDB.getCommitments();

  if (shifts.length === 0 && commitments.length === 0) {
    showToast('No tienes eventos ni turnos para exportar.', 'info');
    return;
  }

  // Generación estándar formato iCalendar (.ics)
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AntiTurno//Turnos Para Enfermeros//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:AntiTurno - Turnos y Descansos'
  ];

  // Helper formato fecha ICS YYYYMMDDTHHMMSS
  function formatICSDate(dateStr, timeStr) {
    const cleanDate = dateStr.replace(/-/g, '');
    const cleanTime = (timeStr || '00:00').replace(/:/g, '') + '00';
    return `${cleanDate}T${cleanTime}`;
  }

  // 1. Exportar Turnos
  shifts.forEach(s => {
    const st = SHIFT_TYPES[s.type] || SHIFT_TYPES.M;
    const typeName = `Turno ${st.label}`;

    // Manejar paso de medianoche
    let endDateStr = s.date;
    const [h1] = s.startTime.split(':').map(Number);
    const [h2] = s.endTime.split(':').map(Number);
    if (h2 <= h1) {
      const d = new Date(s.date + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      endDateStr = d.toISOString().split('T')[0];
    }

    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`UID:shift-${s.id}@antiturno.app`);
    icsContent.push(`DTSTAMP:${formatICSDate(formatLocalDate(new Date()), '00:00')}Z`);
    icsContent.push(`DTSTART:${formatICSDate(s.date, s.startTime)}`);
    icsContent.push(`DTEND:${formatICSDate(endDateStr, s.endTime)}`);
    icsContent.push(`SUMMARY:🏥 ${typeName} (${s.service || 'UCI'})`);
    icsContent.push(`DESCRIPTION:${escapeICS(s.hospital || 'Hospital')} - ${escapeICS(s.service || 'UCI')}. Notas: ${escapeICS(s.notes || '')}`);
    icsContent.push(`LOCATION:${escapeICS(s.hospital || 'Hospital')}`);
    // Alarmas VALARM para recordatorios activos
    const shiftReminders = AuthDB.normalizeReminders(s.reminders, s.type);
    shiftReminders.forEach(r => {
      if (r.enabled !== false && Number(r.offsetMinutes) > 0) {
        icsContent.push('BEGIN:VALARM');
        icsContent.push('ACTION:DISPLAY');
        icsContent.push(`DESCRIPTION:${escapeICS(r.label || 'Aviso de turno')}`);
        icsContent.push(`TRIGGER:-PT${r.offsetMinutes}M`);
        icsContent.push('END:VALARM');
      }
    });
    icsContent.push('END:VEVENT');
  });

  // 2. Exportar Compromisos Personales
  commitments.forEach(c => {
    const cat = COMMITMENT_CATEGORIES[c.category]?.label || 'Compromiso Personal';
    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`UID:com-${c.id}@antiturno.app`);
    icsContent.push(`DTSTAMP:${formatICSDate(formatLocalDate(new Date()), '00:00')}Z`);
    icsContent.push(`DTSTART:${formatICSDate(c.date, c.startTime)}`);
    icsContent.push(`DTEND:${formatICSDate(c.date, c.endTime)}`);
    icsContent.push(`SUMMARY:🧘 ${escapeICS(c.title)} [${cat}]`);
    icsContent.push(`DESCRIPTION:Categoría: ${cat}. Notas: ${escapeICS(c.notes || '')}`);
    if (c.location) icsContent.push(`LOCATION:${escapeICS(c.location)}`);
    // Alarmas VALARM para compromisos
    const comReminders = AuthDB.normalizeReminders(c.reminders, 'commitmentDefault');
    comReminders.forEach(r => {
      if (r.enabled !== false && Number(r.offsetMinutes) > 0) {
        icsContent.push('BEGIN:VALARM');
        icsContent.push('ACTION:DISPLAY');
        icsContent.push(`DESCRIPTION:${escapeICS(r.label || 'Aviso de compromiso')}`);
        icsContent.push(`TRIGGER:-PT${r.offsetMinutes}M`);
        icsContent.push('END:VALARM');
      }
    });
    icsContent.push('END:VEVENT');
  });

  icsContent.push('END:VCALENDAR');

  const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `antiturno_calendario_${formatLocalDate(new Date())}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('¡Archivo .ics descargado! Puedes abrirlo en Google Calendar, iPhone o Outlook.', 'success');
  closeSyncModal();
}

function escapeICS(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// ==========================================
// GESTIÓN DE DATOS JSON (EXPORTAR / IMPORTAR / VINCULAR)
// ==========================================
function openDataModal(initialMode = null) {
  const modal = document.getElementById('dataModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderDataModalStatus();

  if (initialMode === 'import') {
    setTimeout(() => {
      const fileInput = document.getElementById('dbImportFileInput');
      if (fileInput) fileInput.focus();
    }, 150);
  }
}

function closeDataModal() {
  const modal = document.getElementById('dataModal');
  if (modal) modal.classList.add('hidden');
}

function renderDataModalStatus() {
  const statsEl = document.getElementById('dataModalStats');
  const fileSectionEl = document.getElementById('dbFileLinkSection');
  if (!window.JsonDB) return;

  const currentUser = AuthDB.getCurrentUser();
  const stats = window.JsonDB.getStats(currentUser ? currentUser.id : null);
  const lastExport = AuthDB.getLastExportAt();

  if (statsEl) {
    const exportText = lastExport
      ? new Date(lastExport).toLocaleDateString()
      : 'Sin copia reciente';
    statsEl.innerHTML = `
      <div class="p-2">
        <span class="block text-lg font-bold text-primary">${stats.shifts}</span>
        <span class="text-[11px] text-on-surface-variant font-medium">Turnos ${currentUser ? 'tuyos' : 'totales'}</span>
      </div>
      <div class="p-2 border-x border-outline-variant/40">
        <span class="block text-lg font-bold text-primary">${stats.commitments}</span>
        <span class="text-[11px] text-on-surface-variant font-medium">Compromisos</span>
      </div>
      <div class="p-2">
        <span class="block text-xs font-bold text-on-surface truncate" title="${exportText}">${exportText}</span>
        <span class="text-[11px] text-on-surface-variant font-medium">Último respaldo</span>
      </div>
    `;
  }

  if (fileSectionEl) {
    const fileStatus = window.JsonDB.getFileStatus();
    if (!fileStatus.supported) {
      fileSectionEl.innerHTML = `
        <div class="flex items-center gap-2 text-on-surface-variant font-medium text-xs">
          <span class="material-symbols-outlined text-base">info</span>
          <span>Guardado automático en archivo disponible en Chrome o Edge para computador. En este dispositivo puedes usar <strong>Exportar / Importar</strong>.</span>
        </div>
      `;
    } else if (fileStatus.linked) {
      const lastSaveText = fileStatus.lastSaveAt
        ? new Date(fileStatus.lastSaveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Al guardar cambios';
      fileSectionEl.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-primary font-bold text-sm">
            <span class="material-symbols-outlined text-lg">check_circle</span>
            <span>Archivo local vinculado</span>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Auto-guardado activo</span>
        </div>
        <p class="text-xs text-on-surface-variant">
          Archivo: <code class="font-bold text-on-surface">${escapeHTML(fileStatus.fileName || 'antiturno-db.json')}</code>
          ${fileStatus.needsPermission ? ' · <span class="text-error font-bold">Requiere reactivar permiso tras recargar</span>' : ' · Guardado a las ' + lastSaveText}
        </p>
        <div class="flex gap-2 pt-1">
          ${fileStatus.needsPermission ? `
            <button type="button" onclick="handleReconnectFile()" class="py-1.5 px-3 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-xs">
              Reactivar Permiso
            </button>
          ` : ''}
          <button type="button" onclick="handleUnlinkFile()" class="py-1.5 px-3 rounded-xl bg-surface-container hover:bg-error-container text-on-surface hover:text-error text-xs font-semibold transition-colors">
            Desvincular Archivo
          </button>
        </div>
      `;
    } else {
      fileSectionEl.innerHTML = `
        <div class="flex items-center gap-2 text-primary font-bold text-sm">
          <span class="material-symbols-outlined text-lg">save_as</span>
          <span>Vincular archivo .json en tu computador (Opcional)</span>
        </div>
        <p class="text-xs text-on-surface-variant leading-relaxed">
          Si usas Chrome o Edge de escritorio, puedes vincular un archivo <code>antiturno-db.json</code> de tu disco. Cualquier cambio que hagas en la app se guardará automáticamente en él.
        </p>
        <div class="flex flex-wrap gap-2 pt-1">
          <button type="button" onclick="handleLinkNewFile()" class="py-1.5 px-3 rounded-xl bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-all flex items-center gap-1.5">
            <span class="material-symbols-outlined text-sm">add</span>
            <span>Crear y Vincular Archivo</span>
          </button>
          <button type="button" onclick="handleLinkExistingFile()" class="py-1.5 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-all flex items-center gap-1.5">
            <span class="material-symbols-outlined text-sm">folder_open</span>
            <span>Abrir y Vincular Existente</span>
          </button>
        </div>
      `;
    }
  }
}

function handleExportDB(mode = 'user') {
  if (!window.JsonDB) return;
  const user = AuthDB.getCurrentUser();
  const userId = (mode === 'user' && user) ? user.id : null;
  try {
    const res = window.JsonDB.exportToFile(userId);
    AuthDB.markExported();
    renderDataModalStatus();
    showToast(`Copia descargada: ${res.fileName}`, 'success');
  } catch (err) {
    showToast('Error al exportar: ' + err.message, 'error');
  }
}

async function handleImportDB() {
  const fileInput = document.getElementById('dbImportFileInput');
  const modeSelect = document.getElementById('dbImportModeSelect');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    showToast('Por favor selecciona un archivo .json para importar.', 'error');
    return;
  }

  const file = fileInput.files[0];
  const mode = modeSelect ? modeSelect.value : 'merge';

  try {
    const text = await file.text();
    const doc = window.JsonDB.parseImport(text);
    const preview = window.JsonDB.previewImport(doc, mode);

    const msg = mode === 'replace'
      ? `Atención: Esta acción reemplazará toda tu base de datos actual con:\n- ${preview.users.incoming} usuario(s)\n- ${preview.shifts.incoming} turno(s)\n- ${preview.commitments.incoming} compromiso(s).\n\n¿Deseas continuar?`
      : `Se importarán:\n- ${preview.shifts.toAdd} turnos nuevos (${preview.shifts.toUpdate} actualizados)\n- ${preview.commitments.toAdd} compromisos nuevos (${preview.commitments.toUpdate} actualizados).\n\n¿Deseas continuar?`;

    if (!confirm(msg)) return;

    const summary = window.JsonDB.importData(doc, mode);
    AuthDB.checkSession();
    updateAuthUI();
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
    renderPersonalView();
    renderHoursSummary();
    renderDataModalStatus();
    fileInput.value = '';
    showToast(`¡Importación exitosa! (${summary.shifts.added + summary.shifts.updated} turnos procesados).`, 'success');
  } catch (err) {
    showToast('Error al importar archivo: ' + err.message, 'error');
  }
}

async function handleLinkNewFile() {
  try {
    await window.JsonDB.linkNewFile();
    renderDataModalStatus();
    showToast('¡Archivo vinculado! Los cambios se guardarán automáticamente en disco.', 'success');
  } catch (err) {
    if (err.name !== 'AbortError') showToast(err.message, 'error');
  }
}

async function handleLinkExistingFile() {
  try {
    const mode = document.getElementById('dbImportModeSelect')?.value || 'merge';
    await window.JsonDB.linkExistingFile(mode);
    AuthDB.checkSession();
    updateAuthUI();
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
    renderPersonalView();
    renderHoursSummary();
    renderDataModalStatus();
    showToast('¡Archivo vinculado e importado con éxito!', 'success');
  } catch (err) {
    if (err.name !== 'AbortError') showToast(err.message, 'error');
  }
}

async function handleReconnectFile() {
  try {
    const ok = await window.JsonDB.reconnectFile();
    renderDataModalStatus();
    if (ok) showToast('Permiso concedido para guardar en archivo vinculado.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleUnlinkFile() {
  if (confirm('¿Deseas desvincular el archivo local? Tus turnos seguirán guardados en la app.')) {
    await window.JsonDB.unlinkFile();
    renderDataModalStatus();
    showToast('Archivo desvinculado.', 'info');
  }
}

function checkBackupReminderNotice() {
  const user = AuthDB.getCurrentUser();
  if (!user) return;
  const shifts = AuthDB.getShifts();
  if (shifts.length < 3) return;
  const lastExport = AuthDB.getLastExportAt();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (!lastExport || (Date.now() - new Date(lastExport).getTime() > sevenDaysMs)) {
    setTimeout(() => {
      showToast('💡 Te recomendamos descargar una copia de tus turnos desde "Mis datos (JSON)".', 'info');
    }, 2500);
  }
}

// ==========================================
// UTILIDADES (TOAST & ESCAPE)
// ==========================================
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('globalToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'globalToastContainer';
    toastContainer.className = 'fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  let bgClass = 'bg-inverse-surface text-inverse-on-surface';
  let icon = 'info';
  if (type === 'success') { bgClass = 'bg-primary text-on-primary'; icon = 'check_circle'; }
  if (type === 'error') { bgClass = 'bg-error text-on-error'; icon = 'error'; }
  if (type === 'warning') { bgClass = 'bg-amber-600 text-white'; icon = 'warning'; }

  toast.className = `${bgClass} px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 transition-all transform translate-y-4 opacity-0 pointer-events-auto text-sm font-medium`;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-xl shrink-0">${icon}</span>
    <span class="flex-1">${escapeHTML(message)}</span>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-4', 'opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==========================================
// EDITOR Y GESTOR DE RECORDATORIOS (PLAN 03)
// ==========================================

function formatReminderOffset(minutes) {
  const m = Number(minutes) || 0;
  if (m >= 1440 && m % 1440 === 0) return `${m / 1440} día(s)`;
  if (m >= 60 && m % 60 === 0) return `${m / 60} h`;
  return `${m} min`;
}

function computeReminderPreviewText(dateStr, timeStr, offsetMinutes, anchor = 'start') {
  if (!dateStr || !timeStr || typeof ReminderService === 'undefined') return '';
  try {
    const d = ReminderService.computeTriggerDate(dateStr, timeStr, offsetMinutes, anchor);
    if (!d) return '';
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const diaNom = dias[d.getDay()];
    const diaNum = d.getDate();
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const mesNom = meses[d.getMonth()];
    const hora = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Aviso: ${diaNom} ${diaNum} ${mesNom} ${hora}`;
  } catch (e) {
    return '';
  }
}

function renderShiftRemindersEditor() {
  const container = document.getElementById('shiftRemindersList');
  if (!container) return;

  const dateVal = document.getElementById('shiftDateInput')?.value || formatLocalDate(new Date());
  const startVal = document.getElementById('shiftStartTimeInput')?.value || '07:00';
  const endVal = document.getElementById('shiftEndTimeInput')?.value || '15:00';

  if (!AppState.shiftReminders || AppState.shiftReminders.length === 0) {
    container.innerHTML = `
      <div class="p-3 rounded-xl bg-surface-container-low border border-dashed border-outline-variant/40 text-center text-xs text-on-surface-variant">
        <span>No hay recordatorios configurados para este turno. Usa los chips rápidos arriba o añade uno personalizado.</span>
      </div>
    `;
    return;
  }

  const categoryIcons = {
    salida: 'directions_walk',
    comida: 'lunch_dining',
    descanso: 'bedtime',
    hidratacion: 'water_drop',
    medicacion: 'medication',
    personalizado: 'notifications'
  };

  container.innerHTML = AppState.shiftReminders.map((r, idx) => {
    const targetTime = r.anchor === 'end' ? endVal : startVal;
    const preview = computeReminderPreviewText(dateVal, targetTime, r.offsetMinutes, r.anchor);
    const icon = categoryIcons[r.category] || 'notifications';

    return `
      <div class="p-3 rounded-xl bg-surface-container-low border border-outline-variant/40 flex flex-col gap-2 transition-all">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-1">
            <input type="checkbox" ${r.enabled !== false ? 'checked' : ''} onchange="toggleShiftReminder(${idx}, this.checked)" class="w-4 h-4 accent-primary rounded cursor-pointer" title="Activar/desactivar este aviso"/>
            <span class="material-symbols-outlined text-primary text-lg">${icon}</span>
            <input type="text" value="${escapeHTML(r.label || '')}" onchange="updateShiftReminderField(${idx}, 'label', this.value)" placeholder="Descripción del aviso (ej: Salir de casa)" class="flex-1 bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary font-medium"/>
          </div>
          <button type="button" onclick="removeShiftReminder(${idx})" class="p-1 rounded-lg hover:bg-error-container/30 text-on-surface-variant hover:text-error transition-colors cursor-pointer" title="Eliminar recordatorio">
            <span class="material-symbols-outlined text-base">delete</span>
          </button>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-outline-variant/20">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-on-surface-variant text-[11px]">Anticipación:</span>
            <input type="number" min="0" max="10080" value="${r.offsetMinutes}" onchange="updateShiftReminderField(${idx}, 'offsetMinutes', Number(this.value))" class="w-16 bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-2 py-0.5 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary text-center font-bold"/>
            <span class="text-on-surface-variant text-[11px]">minutos (${formatReminderOffset(r.offsetMinutes)})</span>
            
            <select onchange="updateShiftReminderField(${idx}, 'anchor', this.value)" class="bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-2 py-0.5 text-[11px] text-on-surface outline-none">
              <option value="start" ${r.anchor === 'start' ? 'selected' : ''}>antes del inicio</option>
              <option value="end" ${r.anchor === 'end' ? 'selected' : ''}>antes del fin</option>
            </select>

            <select onchange="updateShiftReminderField(${idx}, 'category', this.value)" class="bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-2 py-0.5 text-[11px] text-on-surface outline-none">
              <option value="salida" ${r.category === 'salida' ? 'selected' : ''}>🚶 Trayecto</option>
              <option value="comida" ${r.category === 'comida' ? 'selected' : ''}>🍱 Comida/Uniforme</option>
              <option value="descanso" ${r.category === 'descanso' ? 'selected' : ''}>🛌 Descanso</option>
              <option value="hidratacion" ${r.category === 'hidratacion' ? 'selected' : ''}>💧 Hidratación</option>
              <option value="medicacion" ${r.category === 'medicacion' ? 'selected' : ''}>💊 Salud</option>
              <option value="personalizado" ${r.category === 'personalizado' ? 'selected' : ''}>📌 Personalizado</option>
            </select>
          </div>

          <span class="text-[11px] text-primary font-semibold">${preview}</span>
        </div>
      </div>
    `;
  }).join('');
}

function addQuickReminder(offsetMinutes, anchor = 'start', label = 'Recordatorio', category = 'personalizado') {
  AppState.shiftReminders.push({
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    offsetMinutes: Number(offsetMinutes),
    anchor,
    label,
    category,
    enabled: true,
    firedAt: null
  });
  renderShiftRemindersEditor();
}

function addNewCustomReminder(target = 'shift') {
  const newRem = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    offsetMinutes: 120,
    anchor: 'start',
    label: 'Nuevo recordatorio',
    category: 'personalizado',
    enabled: true,
    firedAt: null
  };
  if (target === 'shift') {
    AppState.shiftReminders.push(newRem);
    renderShiftRemindersEditor();
  } else {
    AppState.commitmentReminders.push(newRem);
    renderCommitmentRemindersEditor();
  }
}

function removeShiftReminder(idx) {
  AppState.shiftReminders.splice(idx, 1);
  renderShiftRemindersEditor();
}

function toggleShiftReminder(idx, checked) {
  if (AppState.shiftReminders[idx]) {
    AppState.shiftReminders[idx].enabled = checked;
    renderShiftRemindersEditor();
  }
}

function updateShiftReminderField(idx, field, value) {
  if (AppState.shiftReminders[idx]) {
    AppState.shiftReminders[idx][field] = value;
    renderShiftRemindersEditor();
  }
}

function applyShiftTemplateReminders(type = null) {
  const targetType = type || AppState.activeShiftType || 'M';
  const prefs = AuthDB.getReminderPrefs();
  const tpl = (prefs.templates && prefs.templates[targetType]) || [];
  AppState.shiftReminders = JSON.parse(JSON.stringify(tpl));
  renderShiftRemindersEditor();
}

// ==========================================
// RECORDATORIOS EN COMPROMISOS PERSONALES
// ==========================================

function renderCommitmentRemindersEditor() {
  const container = document.getElementById('commitmentRemindersList');
  if (!container) return;

  if (!AppState.commitmentReminders || AppState.commitmentReminders.length === 0) {
    container.innerHTML = `
      <p class="text-[11px] text-on-surface-variant italic">Sin avisos para este compromiso.</p>
    `;
    return;
  }

  container.innerHTML = AppState.commitmentReminders.map((r, idx) => {
    return `
      <div class="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs">
        <div class="flex items-center gap-2 flex-1">
          <input type="checkbox" ${r.enabled !== false ? 'checked' : ''} onchange="AppState.commitmentReminders[${idx}].enabled = this.checked;" class="w-3.5 h-3.5 accent-primary rounded cursor-pointer"/>
          <input type="text" value="${escapeHTML(r.label || '')}" onchange="AppState.commitmentReminders[${idx}].label = this.value;" class="flex-1 bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-2 py-0.5 text-xs text-on-surface outline-none"/>
          <input type="number" value="${r.offsetMinutes}" onchange="AppState.commitmentReminders[${idx}].offsetMinutes = Number(this.value);" class="w-14 bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-1 py-0.5 text-xs text-center font-bold outline-none"/>
          <span class="text-[10px] text-on-surface-variant">min antes</span>
        </div>
        <button type="button" onclick="removeCommitmentReminder(${idx})" class="text-on-surface-variant hover:text-error p-1 cursor-pointer">
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
    `;
  }).join('');
}

function addQuickReminderCommitment(offsetMinutes, label) {
  AppState.commitmentReminders.push({
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    offsetMinutes: Number(offsetMinutes),
    anchor: 'start',
    label,
    category: 'personalizado',
    enabled: true,
    firedAt: null
  });
  renderCommitmentRemindersEditor();
}

function removeCommitmentReminder(idx) {
  AppState.commitmentReminders.splice(idx, 1);
  renderCommitmentRemindersEditor();
}

// ==========================================
// WIDGET DASHBOARD: PRÓXIMOS RECORDATORIOS
// ==========================================

function renderUpcomingReminders() {
  const container = document.getElementById('upcomingRemindersList');
  if (!container || typeof ReminderService === 'undefined') return;

  const upcoming = ReminderService.getUpcoming(48);

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 text-center flex flex-col items-center gap-1.5 text-on-surface-variant">
        <span class="material-symbols-outlined text-2xl text-primary/60">notifications_paused</span>
        <p class="text-xs font-medium">No hay avisos programados para las próximas 48h.</p>
        <span class="text-[11px] text-on-surface-variant/80">Se activarán según tus plantillas y turnos.</span>
      </div>
    `;
    return;
  }

  const categoryIcons = {
    salida: 'directions_walk',
    comida: 'lunch_dining',
    descanso: 'bedtime',
    hidratacion: 'water_drop',
    medicacion: 'medication',
    personalizado: 'notifications'
  };

  container.innerHTML = upcoming.slice(0, 5).map(item => {
    const icon = categoryIcons[item.category] || 'notifications';
    const hora = item.triggerDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const now = new Date();
    let diaLabel = '';
    if (item.triggerDate.toDateString() === now.toDateString()) {
      diaLabel = 'Hoy';
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (item.triggerDate.toDateString() === tomorrow.toDateString()) {
        diaLabel = 'Mañana';
      } else {
        diaLabel = item.triggerDate.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
      }
    }

    return `
      <div class="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3 transition-colors hover:bg-surface-container">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-base">${icon}</span>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-bold text-on-surface truncate">${escapeHTML(item.label)}</p>
            <p class="text-[11px] text-on-surface-variant truncate">${escapeHTML(item.itemTitle)}</p>
          </div>
        </div>
        <div class="text-right shrink-0">
          <span class="inline-block px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant text-[10px] font-bold">${diaLabel} ${hora}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// MODAL DE PREFERENCIAS DE RECORDATORIOS
// ==========================================

function openReminderPrefsModal() {
  const modal = document.getElementById('reminderPrefsModal');
  if (!modal) return;

  const prefs = AuthDB.getReminderPrefs();
  renderPermissionBoxUI();

  const soundCb = document.getElementById('prefSoundCheckbox');
  if (soundCb) soundCb.checked = prefs.sound !== false;

  const notifyChangesCb = document.getElementById('prefNotifyChangesCheckbox');
  if (notifyChangesCb) notifyChangesCb.checked = prefs.notifyOnChanges !== false;

  const quietCb = document.getElementById('prefQuietEnabledCheckbox');
  if (quietCb) quietCb.checked = !!prefs.quietHours?.enabled;

  const quietFrom = document.getElementById('prefQuietFromInput');
  if (quietFrom) quietFrom.value = prefs.quietHours?.from || '22:00';

  const quietTo = document.getElementById('prefQuietToInput');
  if (quietTo) quietTo.value = prefs.quietHours?.to || '06:00';

  modal.classList.remove('hidden');
}

function closeReminderPrefsModal() {
  const modal = document.getElementById('reminderPrefsModal');
  if (modal) modal.classList.add('hidden');
}

function renderPermissionBoxUI() {
  const box = document.getElementById('notifPermissionBox');
  if (!box || typeof ReminderService === 'undefined') return;

  const status = ReminderService.getPermissionStatus();

  if (status === 'granted') {
    box.innerHTML = `
      <div class="flex items-center gap-2.5 text-primary">
        <span class="material-symbols-outlined text-2xl">check_circle</span>
        <div>
          <span class="text-xs font-bold text-on-surface block">Notificaciones del sistema activadas</span>
          <span class="text-[11px] text-on-surface-variant">Recibirás alertas en tu escritorio o pantalla de bloqueo</span>
        </div>
      </div>
      <span class="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">Concedido</span>
    `;
  } else if (status === 'denied') {
    box.innerHTML = `
      <div class="flex items-center gap-2.5 text-error">
        <span class="material-symbols-outlined text-2xl">notifications_off</span>
        <div>
          <span class="text-xs font-bold text-on-surface block">Notificaciones bloqueadas en el navegador</span>
          <span class="text-[11px] text-on-surface-variant">Actívalas en el candado de la barra de direcciones de tu navegador</span>
        </div>
      </div>
      <span class="px-2.5 py-1 rounded-full bg-error-container text-error text-xs font-bold shrink-0">Bloqueado</span>
    `;
  } else {
    box.innerHTML = `
      <div class="flex items-center gap-2.5">
        <span class="material-symbols-outlined text-primary text-2xl">notifications</span>
        <div>
          <span class="text-xs font-bold text-on-surface block">Notificaciones del sistema</span>
          <span class="text-[11px] text-on-surface-variant">Permite a AntiTurno avisarte antes de cada guardia</span>
        </div>
      </div>
      <button type="button" onclick="requestNotificationPermissionFromUI()" class="px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-xs hover:bg-primary-container transition-colors shrink-0 cursor-pointer">
        Activar Avisos
      </button>
    `;
  }
}

async function requestNotificationPermissionFromUI() {
  try {
    const res = await ReminderService.requestPermission();
    renderPermissionBoxUI();
    if (res === 'granted') {
      showToast('¡Notificaciones activadas con éxito!', 'success');
      ReminderService.playChime();
    } else {
      showToast('Permiso de notificaciones no concedido.', 'info');
    }
  } catch (e) {
    showToast(e.message, 'warning');
  }
}

function testReminderAlert() {
  if (typeof ReminderService === 'undefined') return;
  ReminderService.playChime();
  if (ReminderService.getPermissionStatus() === 'granted') {
    try {
      new Notification('AntiTurno: Recordatorio de Prueba', {
        body: '¡Excelente! Los recordatorios clínicos funcionan con sonido y notificación del sistema.',
        tag: 'test-reminder'
      });
    } catch (e) {}
  }
  showToast('⏰ ¡Aviso de prueba ejecutado con sonido y toast!', 'success');
}

function saveReminderPrefsFromUI() {
  const sound = document.getElementById('prefSoundCheckbox')?.checked ?? true;
  const notifyOnChanges = document.getElementById('prefNotifyChangesCheckbox')?.checked ?? true;
  const quietEnabled = document.getElementById('prefQuietEnabledCheckbox')?.checked ?? false;
  const quietFrom = document.getElementById('prefQuietFromInput')?.value || '22:00';
  const quietTo = document.getElementById('prefQuietToInput')?.value || '06:00';

  const currentPrefs = AuthDB.getReminderPrefs();
  const updated = {
    ...currentPrefs,
    sound,
    notifyOnChanges,
    quietHours: {
      enabled: quietEnabled,
      from: quietFrom,
      to: quietTo
    }
  };

  AuthDB.saveReminderPrefs(updated);
  closeReminderPrefsModal();
  renderUpcomingReminders();
  showToast('¡Preferencias de recordatorios guardadas!', 'success');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AppState,
    SHIFT_TYPES,
    REST_TYPE,
    COMMITMENT_CATEGORIES,
    selectShiftType,
    setCalendarFilter,
    getShiftBadgeHtml,
    renderCalendar,
    renderCalendarFilters,
    renderCalendarLegend,
    renderCalendarMonthSummary,
    renderHeroCard,
    renderUpcomingShifts,
    renderHoursSummary
  };
}
