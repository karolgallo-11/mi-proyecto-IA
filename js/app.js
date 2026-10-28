/**
 * CuidadoSync - Controlador Principal de la Aplicación
 * Conecta UI con AuthDB: Autenticación, Formulario Turnos CRUD, Compromisos Personales CRUD,
 * Protección Anti-Cruces, Calendario Dinámico Unificado, Próximas Guardias y Sincronización .ICS.
 */

// Estado global de la aplicación
const AppState = {
  currentView: 'dashboard',
  calendarDate: new Date(),
  selectedDate: null,
  activeShiftType: 'M',
  editingShiftId: null,
  activeCategoryFilter: 'all',
  editingCommitmentId: null,
  pendingCommitmentData: null
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
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

  if (!AuthDB.getCurrentUser()) {
    setTimeout(() => {
      openAuthModal('login');
    }, 400);
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
          </div>
          <div class="py-1">
            <button onclick="openSyncModal()" class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-on-surface hover:bg-surface-container rounded-xl text-sm font-medium transition-colors" type="button">
              <span class="material-symbols-outlined text-primary text-lg">calendar_month</span>
              <span>Exportar / Sincronizar (.ics)</span>
            </button>
            <button onclick="openCloudConfigModal()" class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-on-surface hover:bg-surface-container rounded-xl text-sm font-medium transition-colors" type="button">
              <span class="material-symbols-outlined text-primary text-lg">cloud_sync</span>
              <span>Sincronización Nube (Firebase)</span>
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

function openAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  switchAuthTab(mode);
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
  const errBox = document.getElementById('authLoginError');
  const submitBtn = document.getElementById('loginSubmitBtn');

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Iniciando...</span>';

    await AuthDB.login({ email, password, rememberMe: remember });
    closeAuthModal();
    updateAuthUI();
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
    renderPersonalView();
    renderHoursSummary();
    showToast('¡Bienvenida(o)! Has iniciado sesión correctamente.', 'success');
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

    await AuthDB.register({ name, email, password });
    closeAuthModal();
    updateAuthUI();
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
    renderPersonalView();
    renderHoursSummary();
    showToast('¡Cuenta creada con éxito! Bienvenido(a) a CuidadoSync.', 'success');
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

function handleLogout() {
  if (confirm('¿Deseas cerrar tu sesión?')) {
    AuthDB.logout();
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
  const btns = document.querySelectorAll('.shift-type-btn');
  btns.forEach(b => {
    const bType = b.getAttribute('data-shift-type');
    const checkIcon = b.querySelector('.check-icon');
    if (bType === type) {
      b.classList.remove('bg-surface-container-low');
      b.classList.add('ring-2', 'ring-primary', 'bg-surface-container-lowest', 'shadow-xs');
      if (checkIcon) {
        checkIcon.classList.remove('hidden', 'text-secondary/40');
        checkIcon.classList.add('text-primary');
      }
    } else {
      b.classList.remove('ring-2', 'ring-primary', 'bg-surface-container-lowest', 'shadow-xs');
      b.classList.add('bg-surface-container-low');
      if (checkIcon) {
        checkIcon.classList.add('hidden');
        checkIcon.classList.remove('text-primary');
        checkIcon.classList.add('text-secondary/40');
      }
    }
  });

  const startInput = document.getElementById('shiftStartTimeInput');
  const endInput = document.getElementById('shiftEndTimeInput');
  if (startInput && endInput) {
    switch (type) {
      case 'M':
        startInput.value = '07:00';
        endInput.value = '15:00';
        break;
      case 'T':
        startInput.value = '15:00';
        endInput.value = '23:00';
        break;
      case 'N':
        startInput.value = '23:00';
        endInput.value = '07:00';
        break;
      case 'G':
        startInput.value = '08:00';
        endInput.value = '08:00';
        break;
    }
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
  const hospital = document.getElementById('shiftHospitalSelect').value;
  const service = document.getElementById('shiftServiceInput').value;
  const notes = document.getElementById('shiftNotesInput').value;

  const reminder2h = document.getElementById('remind2hCheckbox')?.checked ?? true;
  const reminderTupper = document.getElementById('remindTupperCheckbox')?.checked ?? true;
  const reminderRest = document.getElementById('remindRestCheckbox')?.checked ?? true;

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
      hospital: hospital || 'Hospital Clínico Central',
      service: service || 'UCI Adultos',
      notes: notes || '',
      reminders: { reminder2h, reminderTupper, reminderRest }
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
  document.getElementById('shiftHospitalSelect').value = shift.hospital || 'Hospital Clínico Central';
  document.getElementById('shiftServiceInput').value = shift.service || 'UCI Adultos';
  document.getElementById('shiftNotesInput').value = shift.notes || '';

  if (document.getElementById('remind2hCheckbox')) {
    document.getElementById('remind2hCheckbox').checked = shift.reminders?.reminder2h ?? true;
  }
  if (document.getElementById('remindTupperCheckbox')) {
    document.getElementById('remindTupperCheckbox').checked = shift.reminders?.reminderTupper ?? true;
  }
  if (document.getElementById('remindRestCheckbox')) {
    document.getElementById('remindRestCheckbox').checked = shift.reminders?.reminderRest ?? true;
  }

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
  document.getElementById('shiftHospitalSelect').value = 'Hospital Clínico Central';
  document.getElementById('shiftServiceInput').value = 'UCI Adultos';
  document.getElementById('shiftNotesInput').value = '';

  selectShiftType('M');

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
  medica: { label: 'Cita Médica / Salud', color: 'bg-cyan-100 text-cyan-900 border-cyan-300', icon: 'medical_services' },
  estudio: { label: 'Estudio / Formación', color: 'bg-purple-100 text-purple-900 border-purple-300', icon: 'school' },
  familia: { label: 'Familia & Social', color: 'bg-emerald-100 text-emerald-900 border-emerald-300', icon: 'family_restroom' },
  diligencias: { label: 'Diligencias / Trámites', color: 'bg-slate-100 text-slate-800 border-slate-300', icon: 'task_alt' },
  descanso: { label: 'Descanso / Sueño Protegido', color: 'bg-indigo-100 text-indigo-900 border-indigo-300', icon: 'bed' },
  ejercicio: { label: 'Ejercicio & Deporte', color: 'bg-orange-100 text-orange-900 border-orange-300', icon: 'fitness_center' },
  otro: { label: 'Otro Compromiso', color: 'bg-pink-100 text-pink-900 border-pink-300', icon: 'bookmark' }
};

function openCommitmentModal(defaultDate = null, commitmentId = null) {
  const user = AuthDB.getCurrentUser();
  if (!user) {
    openAuthModal('login');
    showToast('Inicia sesión para gestionar tus compromisos personales.', 'warning');
    return;
  }

  const modal = document.getElementById('commitmentModal');
  const titleElem = document.getElementById('commitmentModalTitle');
  const conflictBanner = document.getElementById('commitmentConflictBanner');
  if (conflictBanner) conflictBanner.classList.add('hidden');
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
  }

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
      notes
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

function renderCalendar() {
  const container = document.getElementById('dynamicCalendarGrid');
  const monthTitle = document.getElementById('calendarMonthTitle');
  if (!container || !monthTitle) return;

  const year = AppState.calendarDate.getFullYear();
  const month = AppState.calendarDate.getMonth();

  monthTitle.innerText = `${MONTH_NAMES[month]} ${year}`;

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const totalDays = lastDayOfMonth.getDate();

  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6;

  const user = AuthDB.getCurrentUser();
  const shifts = user ? AuthDB.getShifts() : [];
  const commitments = user ? AuthDB.getCommitments() : [];

  let html = '';

  // 1. Días del mes anterior
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    html += `
      <div class="min-h-[105px] sm:min-h-[120px] p-2 rounded-xl bg-surface-container-lowest/40 opacity-40 flex flex-col justify-between border border-outline-variant/10">
        <span class="font-label-md text-label-md font-semibold text-on-surface-variant">${dayNum}</span>
      </div>
    `;
  }

  // 2. Días del mes actual
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = isCurrentMonth && today.getDate() === day;
    const dayShifts = shifts.filter(s => s.date === dateStr);
    const dayCommitments = commitments.filter(c => c.date === dateStr);

    let badgesHtml = '';
    // Badges de Turnos
    dayShifts.forEach(s => {
      badgesHtml += getShiftBadgeHtml(s);
    });
    // Badges de Compromisos Personales
    dayCommitments.forEach(c => {
      badgesHtml += getCommitmentBadgeHtml(c);
    });

    const isWeekend = (startDayOfWeek + day - 1) % 7 >= 5;
    const totalEvents = dayShifts.length + dayCommitments.length;

    html += `
      <div onclick="openDayDetailsModal('${dateStr}')" 
           class="min-h-[105px] sm:min-h-[120px] p-2 rounded-xl bg-surface-container-low hover:bg-surface-container transition-all cursor-pointer flex flex-col justify-between border ${isToday ? 'ring-2 ring-primary border-primary shadow-sm bg-surface-container-lowest' : 'border-outline-variant/20'}">
        <div class="flex items-center justify-between">
          <span class="font-label-md text-label-md font-bold ${isToday ? 'text-primary' : (isWeekend ? 'text-primary/80 font-bold' : 'text-on-surface')}">${day}</span>
          ${isToday ? '<span class="px-1.5 py-0.5 rounded-full bg-primary text-on-primary text-[9px] font-bold uppercase tracking-wider">Hoy</span>' : ''}
        </div>
        
        <div class="flex flex-col gap-1 my-1 overflow-hidden">
          ${badgesHtml}
        </div>

        <div class="flex items-center justify-end">
          ${totalEvents === 0 ? '<span class="text-outline-variant/50 text-xs hover:text-primary font-bold">+</span>' : `<span class="text-[10px] text-on-surface-variant font-medium">${totalEvents} act.</span>`}
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
  let badgeClasses = '';
  let label = '';
  let icon = '';

  switch (shift.type) {
    case 'M':
      badgeClasses = 'bg-primary-fixed text-on-primary-fixed-variant border border-primary-fixed-dim/60';
      label = `Mañana (${shift.startTime}-${shift.endTime})`;
      icon = 'wb_sunny';
      break;
    case 'T':
      badgeClasses = 'bg-amber-100 text-amber-900 border border-amber-300';
      label = `Tarde (${shift.startTime}-${shift.endTime})`;
      icon = 'wb_twilight';
      break;
    case 'N':
      badgeClasses = 'bg-tertiary-fixed text-on-tertiary-fixed-variant border border-tertiary-container/30';
      label = `Noche (${shift.startTime}-${shift.endTime})`;
      icon = 'bedtime';
      break;
    case 'G':
      badgeClasses = 'bg-red-100 text-red-900 border border-red-300';
      label = `Guardia 24h (${shift.startTime})`;
      icon = 'emergency';
      break;
    default:
      badgeClasses = 'bg-surface-container-high text-on-surface border border-outline-variant/40';
      label = `Turno (${shift.startTime}-${shift.endTime})`;
      icon = 'schedule';
  }

  return `
    <div class="${badgeClasses} px-1.5 py-0.5 rounded-lg flex items-center gap-1 text-[11px] font-semibold truncate shadow-xs" title="${escapeHTML(label)}">
      <span class="material-symbols-outlined text-[13px] shrink-0">${icon}</span>
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
      let typeLabel = 'Mañana';
      let icon = 'wb_sunny';
      let colorPill = 'bg-primary-fixed text-on-primary-fixed-variant';
      if (s.type === 'T') { typeLabel = 'Tarde'; icon = 'wb_twilight'; colorPill = 'bg-amber-100 text-amber-900'; }
      if (s.type === 'N') { typeLabel = 'Noche'; icon = 'bedtime'; colorPill = 'bg-tertiary-fixed text-on-tertiary-fixed-variant'; }
      if (s.type === 'G') { typeLabel = 'Guardia 24h'; icon = 'emergency'; colorPill = 'bg-red-100 text-red-900'; }

      const duration = AuthDB.calculateShiftHours(s.startTime, s.endTime);

      html += `
        <div class="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-between gap-3 shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${colorPill} flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-xl">${icon}</span>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="${colorPill} px-2 py-0.2 rounded font-label-sm text-[10px] font-bold uppercase">${typeLabel}</span>
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

  html += `
    <div class="pt-3 border-t border-outline-variant/30 flex justify-end">
      <button onclick="closeDayDetailsModal()" class="px-5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  </div>`;

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
    let typeName = 'Mañana';
    let icon = 'wb_sunny';
    let pillClass = 'bg-primary-fixed text-on-primary-fixed-variant';
    if (s.type === 'T') { typeName = 'Tarde'; icon = 'wb_twilight'; pillClass = 'bg-amber-100 text-amber-900'; }
    if (s.type === 'N') { typeName = 'Noche'; icon = 'bedtime'; pillClass = 'bg-tertiary-fixed text-on-tertiary-fixed-variant'; }
    if (s.type === 'G') { typeName = 'Guardia 24h'; icon = 'emergency'; pillClass = 'bg-red-100 text-red-900'; }

    const [y, m, d] = s.date.split('-');
    const formattedDate = `${d}/${m}/${y}`;

    html += `
      <div class="p-4 rounded-xl bg-surface-container-lowest shadow-xs flex items-center justify-between gap-3 hover:bg-surface-container-low transition-colors">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl ${pillClass} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-xl">${icon}</span>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="${pillClass} px-2 py-0.5 rounded font-label-sm text-[10px] font-bold uppercase">${typeName}</span>
              <span class="font-label-sm text-label-sm text-on-surface-variant font-semibold">${formattedDate}</span>
            </div>
            <p class="font-title-md text-title-md text-on-surface font-semibold mt-0.5">${s.startTime} - ${s.endTime} • ${escapeHTML(s.service || 'UCI')}</p>
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
    heroContainer.innerHTML = `
      <div class="relative p-6 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
            <span class="material-symbols-outlined text-3xl">clinical_notes</span>
          </div>
          <div>
            <h2 class="font-headline-md text-headline-md text-on-surface font-bold">¡Bienvenida(o) a CuidadoSync!</h2>
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
    heroContainer.innerHTML = `
      <div class="relative p-6 lg:p-8 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-primary-fixed flex items-center justify-center text-primary shrink-0">
            <span class="material-symbols-outlined text-3xl">verified_user</span>
          </div>
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="bg-primary-fixed text-on-primary-fixed-variant px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-bold uppercase">Descanso Activo</span>
            </div>
            <h2 class="font-headline-md text-headline-md text-on-surface font-bold">No tienes turnos próximos programados</h2>
            <p class="font-body-md text-body-md text-on-surface-variant">Tu tiempo personal está libre de guardias inmediatas.</p>
          </div>
        </div>
        <button onclick="navigateTo('registro')" class="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold flex items-center gap-1.5 shadow-xs transition-all">
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

  let typeName = 'Turno Mañana';
  let typePill = 'bg-primary-fixed text-on-primary-fixed-variant';
  let icon = 'wb_sunny';
  if (nextShift.type === 'T') { typeName = 'Turno Tarde'; typePill = 'bg-amber-100 text-amber-900'; icon = 'wb_twilight'; }
  if (nextShift.type === 'N') { typeName = 'Turno Noche'; typePill = 'bg-tertiary-fixed text-on-tertiary-fixed-variant'; icon = 'bedtime'; }
  if (nextShift.type === 'G') { typeName = 'Guardia 24 Horas'; typePill = 'bg-red-100 text-red-900'; icon = 'emergency'; }

  heroContainer.innerHTML = `
    <div class="relative p-6 lg:p-8 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-6">
      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-5 min-w-0">
        <div class="w-16 h-16 rounded-2xl ${typePill} flex items-center justify-center shrink-0 shadow-inner">
          <span class="material-symbols-outlined text-3xl">${icon}</span>
        </div>
        <div class="flex flex-col min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="${typePill} px-3 py-0.5 rounded-full font-label-sm text-label-sm font-bold tracking-wide uppercase">
              ${typeName} • ${nextShift.startTime} - ${nextShift.endTime}
            </span>
            <span class="bg-surface-container text-on-surface-variant px-2.5 py-0.5 rounded-full font-label-sm text-label-sm flex items-center gap-1">
              <span class="material-symbols-outlined text-sm text-primary">pin_drop</span>
              ${escapeHTML(nextShift.service || 'UCI')} • ${escapeHTML(nextShift.hospital || 'Hospital')}
            </span>
          </div>
          <h1 class="font-headline-lg text-headline-lg text-on-surface tracking-tight truncate">
            Próximo Turno Programado: ${nextShift.date}
          </h1>
          <p class="font-body-md text-body-md text-on-surface-variant flex items-center gap-2 mt-0.5">
            <span>${nextShift.notes ? escapeHTML(nextShift.notes) : 'Sin notas clínicas adicionales registradas'}</span>
          </p>
        </div>
      </div>
      <div class="flex flex-wrap sm:flex-nowrap items-center gap-4 shrink-0">
        <div class="bg-surface-container-low px-5 py-3 rounded-xl flex items-center gap-3">
          <span class="material-symbols-outlined text-tertiary text-2xl">timer</span>
          <div class="flex flex-col">
            <span class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Comienza</span>
            <span class="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">${timeText}</span>
          </div>
        </div>
        <button onclick="editShift('${nextShift.id}')" class="bg-primary hover:bg-primary-container text-on-primary px-4 py-3 rounded-xl flex items-center gap-2 font-title-md text-title-md shadow-sm transition-all" type="button">
          <span class="material-symbols-outlined text-xl">edit_calendar</span>
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
        let typePill = 'bg-primary-fixed text-on-primary-fixed-variant';
        let typeName = 'Mañana';
        if (s.type === 'T') { typePill = 'bg-amber-100 text-amber-900'; typeName = 'Tarde'; }
        if (s.type === 'N') { typePill = 'bg-tertiary-fixed text-on-tertiary-fixed-variant'; typeName = 'Noche'; }
        if (s.type === 'G') { typePill = 'bg-red-100 text-red-900'; typeName = 'Guardia 24h'; }

        rowsHtml += `
          <tr class="hover:bg-surface-container-low transition-colors border-b border-outline-variant/20">
            <td class="px-6 py-4 font-semibold text-on-surface">${s.date}</td>
            <td class="px-6 py-4">
              <span class="${typePill} px-2.5 py-1 rounded-full font-label-sm text-[11px] font-bold uppercase">${typeName}</span>
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
    'PRODID:-//CuidadoSync//Turnos Para Enfermeros//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:CuidadoSync - Turnos y Descansos'
  ];

  // Helper formato fecha ICS YYYYMMDDTHHMMSS
  function formatICSDate(dateStr, timeStr) {
    const cleanDate = dateStr.replace(/-/g, '');
    const cleanTime = (timeStr || '00:00').replace(/:/g, '') + '00';
    return `${cleanDate}T${cleanTime}`;
  }

  // 1. Exportar Turnos
  shifts.forEach(s => {
    let typeName = 'Turno Mañana';
    if (s.type === 'T') typeName = 'Turno Tarde';
    if (s.type === 'N') typeName = 'Turno Noche';
    if (s.type === 'G') typeName = 'Guardia 24h';

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
    icsContent.push(`UID:shift-${s.id}@cuidadosync.app`);
    icsContent.push(`DTSTAMP:${formatICSDate(formatLocalDate(new Date()), '00:00')}Z`);
    icsContent.push(`DTSTART:${formatICSDate(s.date, s.startTime)}`);
    icsContent.push(`DTEND:${formatICSDate(endDateStr, s.endTime)}`);
    icsContent.push(`SUMMARY:🏥 ${typeName} (${s.service || 'UCI'})`);
    icsContent.push(`DESCRIPTION:${escapeICS(s.hospital || 'Hospital')} - ${escapeICS(s.service || 'UCI')}. Notas: ${escapeICS(s.notes || '')}`);
    icsContent.push(`LOCATION:${escapeICS(s.hospital || 'Hospital')}`);
    icsContent.push('END:VEVENT');
  });

  // 2. Exportar Compromisos Personales
  commitments.forEach(c => {
    const cat = COMMITMENT_CATEGORIES[c.category]?.label || 'Compromiso Personal';
    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`UID:com-${c.id}@cuidadosync.app`);
    icsContent.push(`DTSTAMP:${formatICSDate(formatLocalDate(new Date()), '00:00')}Z`);
    icsContent.push(`DTSTART:${formatICSDate(c.date, c.startTime)}`);
    icsContent.push(`DTEND:${formatICSDate(c.date, c.endTime)}`);
    icsContent.push(`SUMMARY:🧘 ${escapeICS(c.title)} [${cat}]`);
    icsContent.push(`DESCRIPTION:Categoría: ${cat}. Notas: ${escapeICS(c.notes || '')}`);
    if (c.location) icsContent.push(`LOCATION:${escapeICS(c.location)}`);
    icsContent.push('END:VEVENT');
  });

  icsContent.push('END:VCALENDAR');

  const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuidadosync_calendario_${formatLocalDate(new Date())}.ics`;
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
// CONFIGURACIÓN DE NUBE (FIREBASE)
// ==========================================
function openCloudConfigModal() {
  const modal = document.getElementById('cloudConfigModal');
  if (!modal) return;
  const config = AuthDB.getFirebaseConfig();
  if (config) {
    document.getElementById('fbApiKey').value = config.apiKey || '';
    document.getElementById('fbProjectId').value = config.projectId || '';
    document.getElementById('fbAuthDomain').value = config.authDomain || '';
  }
  modal.classList.remove('hidden');
}

function closeCloudConfigModal() {
  const modal = document.getElementById('cloudConfigModal');
  if (modal) modal.classList.add('hidden');
}

function saveCloudConfig(event) {
  event.preventDefault();
  const apiKey = document.getElementById('fbApiKey').value.trim();
  const projectId = document.getElementById('fbProjectId').value.trim();
  const authDomain = document.getElementById('fbAuthDomain').value.trim();

  if (!apiKey || !projectId) {
    AuthDB.saveFirebaseConfig(null);
    showToast('Configuración de nube eliminada. Funcionando en modo local seguro.', 'info');
  } else {
    AuthDB.saveFirebaseConfig({ apiKey, projectId, authDomain });
    showToast('¡Configuración de nube guardada con éxito!', 'success');
  }
  closeCloudConfigModal();
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
