/**
 * CuidadoSync - Controlador Principal de la Aplicación
 * Conecta UI con AuthDB: Autenticación, Formulario CRUD, Calendario Dinámico, Próximas Guardias y Resumen de Horas.
 */

// Estado global de la aplicación
const AppState = {
  currentView: 'dashboard',
  calendarDate: new Date(),
  selectedDate: null,
  activeShiftType: 'M',
  editingShiftId: null
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar servicio de autenticación
  AuthDB.init();

  // Actualizar UI según estado de sesión
  updateAuthUI();

  // Inicializar fecha por defecto en formulario de turnos
  const todayStr = formatLocalDate(new Date());
  const dateInput = document.getElementById('shiftDateInput');
  if (dateInput) dateInput.value = todayStr;

  // Renderizar vistas dinámicas
  renderCalendar();
  renderUpcomingShifts();
  renderHeroCard();
  renderHoursSummary();

  // Manejar enrutador inicial según URL hash
  const initialHash = window.location.hash.replace('#', '');
  const validViews = ['dashboard', 'registro', 'personal', 'resumen'];
  navigateTo(validViews.includes(initialHash) ? initialHash : 'dashboard');

  // Si no hay usuario autenticado, sugerir inicio de sesión
  if (!AuthDB.getCurrentUser()) {
    setTimeout(() => {
      openAuthModal('login');
    }, 400);
  }
});

// Helper de formato YYYY-MM-DD local
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

  // Cambiar visibilidad de paneles
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

  // Estilos de navegación en barra superior (escritorio)
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

  // Estilos de navegación en menú inferior (celular)
  const mobileBtns = document.querySelectorAll('[data-mobile-nav]');
  mobileBtns.forEach(btn => {
    const target = btn.getAttribute('data-mobile-nav');
    if (target === viewName) {
      btn.className = 'mobile-nav-btn flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all text-primary font-bold bg-primary-container/15';
    } else {
      btn.className = 'mobile-nav-btn flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all text-on-surface-variant hover:text-on-surface';
    }
  });

  // Sincronizar hash
  if (window.location.hash !== '#' + viewName) {
    window.location.hash = viewName;
  }

  // Refrescar datos según la vista
  if (viewName === 'dashboard') {
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
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

        <!-- Menú desplegable -->
        <div id="userDropdown" class="hidden absolute right-0 mt-2 w-64 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/40 p-2 z-50 animate-in fade-in">
          <div class="p-3 border-b border-outline-variant/30">
            <p class="font-title-md text-title-md text-on-surface font-bold truncate">${escapeHTML(user.name)}</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${escapeHTML(user.email)}</p>
          </div>
          <div class="py-1">
            <button onclick="openCloudConfigModal()" class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-on-surface hover:bg-surface-container rounded-xl text-sm font-medium transition-colors" type="button">
              <span class="material-symbols-outlined text-primary text-lg">cloud_sync</span>
              <span>Sincronización en la Nube</span>
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

// Cerrar dropdown al hacer clic fuera
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

  // Auto-ajustar horarios sugeridos según tipo
  const startInput = document.getElementById('shiftStartTimeInput');
  const endInput = document.getElementById('shiftEndTimeInput');
  if (startInput && endInput) {
    switch (type) {
      case 'M': // Mañana
        startInput.value = '07:00';
        endInput.value = '15:00';
        break;
      case 'T': // Tarde
        startInput.value = '15:00';
        endInput.value = '23:00';
        break;
      case 'N': // Noche
        startInput.value = '23:00';
        endInput.value = '07:00';
        break;
      case 'G': // Guardia 24h
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
      reminders: {
        reminder2h,
        reminderTupper,
        reminderRest
      }
    };

    const saved = AuthDB.saveShift(shiftData);
    showToast(shiftId ? '¡Turno modificado correctamente!' : '¡Turno guardado con éxito!', 'success');

    // Resetear formulario
    resetShiftForm();

    // Actualizar calendario, próximas guardias y métricas
    renderCalendar();
    renderUpcomingShifts();
    renderHeroCard();
    renderHoursSummary();

    // Redirigir a vista de calendario para ver el turno registrado
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

  // Llenar campos del formulario
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

  // Activar tipo
  selectShiftType(shift.type || 'M');

  // Ajustar textos e interfaz de edición
  const formTitle = document.getElementById('shiftFormTitle');
  if (formTitle) formTitle.innerText = 'Modificar Turno Asignado';

  const saveBtnText = document.getElementById('saveShiftBtnText');
  if (saveBtnText) saveBtnText.innerText = 'Actualizar Turno';

  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  const deleteBtn = document.getElementById('deleteShiftBtn');
  if (deleteBtn) deleteBtn.classList.remove('hidden');

  // Cerrar modal de día si estaba abierto
  closeDayDetailsModal();

  // Ir al formulario de registro
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
// CALENDARIO DINÁMICO
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

  // Días del mes actual
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const totalDays = lastDayOfMonth.getDate();

  // Día de la semana en que inicia el mes (0 = Domingo, 1 = Lunes en España/Latam: normalizar para que 0 sea Lunes)
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6; // Domingo

  // Turnos del usuario
  const user = AuthDB.getCurrentUser();
  const shifts = user ? AuthDB.getShifts() : [];

  let html = '';

  // 1. Días de relleno del mes anterior
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    html += `
      <div class="min-h-[105px] sm:min-h-[120px] p-2 rounded-xl bg-surface-container-lowest/40 opacity-40 flex flex-col justify-between border border-outline-variant/10">
        <div class="flex items-center justify-between">
          <span class="font-label-md text-label-md font-semibold text-on-surface-variant">${dayNum}</span>
        </div>
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

    let shiftBadgesHtml = '';
    dayShifts.forEach(s => {
      shiftBadgesHtml += getShiftBadgeHtml(s);
    });

    const isWeekend = (startDayOfWeek + day - 1) % 7 >= 5;

    html += `
      <div onclick="openDayDetailsModal('${dateStr}')" 
           class="min-h-[105px] sm:min-h-[120px] p-2 rounded-xl bg-surface-container-low hover:bg-surface-container transition-all cursor-pointer flex flex-col justify-between border ${isToday ? 'ring-2 ring-primary border-primary shadow-sm bg-surface-container-lowest' : 'border-outline-variant/20'}">
        <div class="flex items-center justify-between">
          <span class="font-label-md text-label-md font-bold ${isToday ? 'text-primary' : (isWeekend ? 'text-primary/80 font-bold' : 'text-on-surface')}">${day}</span>
          ${isToday ? '<span class="px-1.5 py-0.5 rounded-full bg-primary text-on-primary text-[9px] font-bold uppercase tracking-wider">Hoy</span>' : ''}
        </div>
        <div class="flex flex-col gap-1 my-1 overflow-hidden">
          ${shiftBadgesHtml}
        </div>
        <div class="flex items-center justify-end">
          ${dayShifts.length === 0 ? '<span class="material-symbols-outlined text-outline-variant/50 text-sm hover:text-primary transition-colors" title="Agregar turno">+</span>' : `<span class="text-[10px] text-on-surface-variant font-medium">${dayShifts.length} turno${dayShifts.length > 1 ? 's' : ''}</span>`}
        </div>
      </div>
    `;
  }

  // 3. Días de relleno del mes siguiente
  const totalRendered = startDayOfWeek + totalDays;
  const nextDays = (7 - (totalRendered % 7)) % 7;
  for (let day = 1; day <= nextDays; day++) {
    html += `
      <div class="min-h-[105px] sm:min-h-[120px] p-2 rounded-xl bg-surface-container-lowest/40 opacity-40 flex flex-col justify-between border border-outline-variant/10">
        <div class="flex items-center justify-between">
          <span class="font-label-md text-label-md font-semibold text-on-surface-variant">${day}</span>
        </div>
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
    <div class="${badgeClasses} px-1.5 py-0.5 rounded-lg flex items-center gap-1 text-[11px] font-semibold truncate shadow-xs">
      <span class="material-symbols-outlined text-[13px] shrink-0">${icon}</span>
      <span class="truncate">${escapeHTML(label)}</span>
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
// DETALLE DE DÍA (CONSULTAR, EDITAR, ELIMINAR)
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
        <p class="font-title-md text-title-md text-on-surface font-semibold">Inicia sesión para gestionar turnos</p>
        <button onclick="closeDayDetailsModal(); openAuthModal('login');" class="mt-4 px-4 py-2 rounded-xl bg-primary text-on-primary font-bold shadow-xs">
          Iniciar Sesión
        </button>
      </div>
    `;
    modal.classList.remove('hidden');
    return;
  }

  const shifts = AuthDB.getShiftsForDate(dateStr);

  if (shifts.length === 0) {
    content.innerHTML = `
      <div class="text-center py-8 flex flex-col items-center">
        <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-3">
          <span class="material-symbols-outlined text-3xl">event_busy</span>
        </div>
        <p class="font-title-md text-title-md text-on-surface font-semibold">No tienes turnos programados en este día</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-1 mb-5">Día libre o periodo de descanso clínico.</p>
        <button onclick="scheduleShiftOnDate('${dateStr}')" class="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold flex items-center gap-2 shadow-xs transition-all">
          <span class="material-symbols-outlined">add_circle</span>
          <span>Programar Turno Aquí</span>
        </button>
      </div>
    `;
  } else {
    let listHtml = '<div class="flex flex-col gap-3">';
    shifts.forEach(s => {
      let typeLabel = 'Mañana';
      let icon = 'wb_sunny';
      let colorPill = 'bg-primary-fixed text-on-primary-fixed-variant';
      if (s.type === 'T') { typeLabel = 'Tarde'; icon = 'wb_twilight'; colorPill = 'bg-amber-100 text-amber-900'; }
      if (s.type === 'N') { typeLabel = 'Noche'; icon = 'bedtime'; colorPill = 'bg-tertiary-fixed text-on-tertiary-fixed-variant'; }
      if (s.type === 'G') { typeLabel = 'Guardia 24h'; icon = 'emergency'; colorPill = 'bg-red-100 text-red-900'; }

      const duration = AuthDB.calculateShiftHours(s.startTime, s.endTime);

      listHtml += `
        <div class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="w-12 h-12 rounded-xl ${colorPill} flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-2xl">${icon}</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="${colorPill} px-2 py-0.5 rounded-md font-label-sm text-[10px] font-bold uppercase tracking-wider">${typeLabel}</span>
                <span class="font-body-sm text-body-sm font-semibold text-on-surface">${s.startTime} - ${s.endTime} (${duration}h)</span>
              </div>
              <p class="font-title-md text-title-md text-on-surface font-bold mt-1">${escapeHTML(s.service || 'UCI Adultos')} - ${escapeHTML(s.hospital || 'Hospital')}</p>
              ${s.notes ? `<p class="font-body-sm text-body-sm text-on-surface-variant mt-1 italic font-serif">"${escapeHTML(s.notes)}"</p>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-outline-variant/20">
            <button onclick="editShift('${s.id}')" class="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-title-md text-title-md flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-base">edit</span>
              <span>Editar</span>
            </button>
            <button onclick="confirmDeleteFromModal('${s.id}')" class="px-3 py-1.5 rounded-lg bg-error-container/40 hover:bg-error-container text-error font-title-md text-title-md flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-base">delete</span>
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      `;
    });
    listHtml += '</div>';

    listHtml += `
      <div class="mt-4 pt-3 border-t border-outline-variant/30 flex justify-between items-center">
        <button onclick="scheduleShiftOnDate('${dateStr}')" class="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-bold flex items-center gap-1.5 transition-colors">
          <span class="material-symbols-outlined text-lg">add</span>
          <span>Añadir Otro Turno</span>
        </button>
        <button onclick="closeDayDetailsModal()" class="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-medium hover:bg-surface-container-high transition-colors">
          Cerrar
        </button>
      </div>
    `;

    content.innerHTML = listHtml;
  }

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
// HERO STATUS CARD (CUENTA REGRESIVA PRÓXIMO TURNO)
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

  // Calcular tiempo restante
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

  // KPIs
  const totalHoursElem = document.getElementById('summaryTotalHours');
  if (totalHoursElem) totalHoursElem.innerText = summary.totalHours.toFixed(1);

  const nightHoursElem = document.getElementById('summaryNightHours');
  if (nightHoursElem) nightHoursElem.innerText = summary.nightHours.toFixed(1) + 'h';

  const dayHoursElem = document.getElementById('summaryDayHours');
  if (dayHoursElem) dayHoursElem.innerText = summary.dayHours.toFixed(1) + 'h';

  const shiftsCountElem = document.getElementById('summaryShiftCount');
  if (shiftsCountElem) shiftsCountElem.innerText = summary.shiftCount;

  // Actualizar tabla detallada de jornadas
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

  // Animación entrada
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  // Animación salida
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
