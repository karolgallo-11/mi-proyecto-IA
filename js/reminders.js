/**
 * AntiTurno - Motor de Recordatorios y Notificaciones Clínicas (Plan 03)
 * 
 * Gestiona recordatorios ilimitados y personalizables por turno y compromiso.
 * - Cálculo temporal exacto (incluye guardias nocturnas que cruzan medianoche).
 * - Notificaciones del sistema (Notification API) + Toasts dentro de la app.
 * - Síntesis de sonido suave de aviso mediante Web Audio API (100% local, sin archivos externos).
 * - Horas de silencio configurables.
 * - Avisos automáticos ante modificaciones o cancelaciones de horario.
 * - Alarmas VALARM para exportación estándar en formato iCalendar (.ics).
 */

class ReminderService {
  constructor() {
    this.timer = null;
    this.audioCtx = null;
    this.isInitialized = false;

    // Categorías con icono Material Symbols y color temático
    this.CATEGORIES = {
      salida: { label: 'Salida / Trayecto', icon: 'directions_walk', color: 'text-primary' },
      comida: { label: 'Uniforme & Comida', icon: 'lunch_dining', color: 'text-secondary' },
      descanso: { label: 'Descanso / Sueño', icon: 'bedtime', color: 'text-tertiary' },
      hidratacion: { label: 'Hidratación', icon: 'water_drop', color: 'text-primary' },
      medicacion: { label: 'Medicación / Salud', icon: 'medication', color: 'text-primary' },
      personalizado: { label: 'Recordatorio', icon: 'notifications', color: 'text-primary' }
    };
  }

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Bucle de comprobación periódico (cada 25 s)
    this.timer = setInterval(() => this.tick(), 25000);

    // Comprobación al volver a la pestaña
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.tick();
      });
    }

    // Escuchar avisos de cambios en turnos
    if (typeof window !== 'undefined') {
      window.addEventListener('antiturno-shift-changed', (e) => {
        if (e.detail) this.notifyShiftChange(e.detail);
      });
    }

    // Primera pasada suave diferida
    setTimeout(() => this.tick(), 1500);
  }

  // ==========================================
  // PERMISOS Y ESTADO DE NOTIFICACIONES
  // ==========================================
  getPermissionStatus() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission; // 'granted' | 'denied' | 'default'
  }

  async requestPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      throw new Error('Tu navegador no soporta notificaciones de sistema. Usaremos avisos dentro de la aplicación.');
    }
    const result = await Notification.requestPermission();
    return result;
  }

  // ==========================================
  // SÍNTESIS DE AUDIO (Web Audio API)
  // ==========================================
  playChime() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      // Nota 1 (C5 - 523.25 Hz)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.36);

      // Nota 2 (E5 - 659.25 Hz)
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.12);
      gain2.gain.setValueAtTime(0.001, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.15, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.56);
    } catch (e) {
      // Silenciar errores de audio si el navegador bloquea autoplay
    }
  }

  // ==========================================
  // CÁLCULO DE TIEMPO EXACTO
  // ==========================================
  computeTriggerDate(dateStr, timeStr, offsetMinutes = 120, anchor = 'start', isOvernightEnd = false) {
    if (!dateStr || !timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(`${dateStr}T00:00:00`);
    if (anchor === 'end' && isOvernightEnd) {
      d.setDate(d.getDate() + 1);
    }
    d.setHours(h, m, 0, 0);
    return new Date(d.getTime() - (Number(offsetMinutes) || 0) * 60 * 1000);
  }

  isQuietHours(date = new Date(), quietHours = null) {
    if (!quietHours || !quietHours.enabled || !quietHours.from || !quietHours.to) return false;
    const [fromH, fromM] = quietHours.from.split(':').map(Number);
    const [toH, toM] = quietHours.to.split(':').map(Number);
    const currentM = date.getHours() * 60 + date.getMinutes();
    const startM = fromH * 60 + fromM;
    const endM = toH * 60 + toM;

    if (startM > endM) {
      // Cruza medianoche (ej: 22:00 a 06:00)
      return currentM >= startM || currentM < endM;
    }
    return currentM >= startM && currentM < endM;
  }

  // ==========================================
  // PRÓXIMOS RECORDATORIOS (PARA DASHBOARD Y VISTAS)
  // ==========================================
  getUpcoming(hoursWindow = 48) {
    if (typeof window === 'undefined' || !window.AuthDB) return [];
    const user = window.AuthDB.getCurrentUser();
    if (!user) return [];

    const now = new Date();
    const maxDate = new Date(now.getTime() + hoursWindow * 60 * 60 * 1000);
    const list = [];

    // 1. Turnos clínicos
    const shifts = window.AuthDB.getShifts();
    shifts.forEach(s => {
      const [h1] = (s.startTime || '00:00').split(':').map(Number);
      const [h2] = (s.endTime || '00:00').split(':').map(Number);
      const isOvernight = h2 <= h1;
      const reminders = s.reminders || [];

      reminders.forEach(r => {
        if (r.enabled === false) return;
        const targetTime = r.anchor === 'end' ? s.endTime : s.startTime;
        const trigger = this.computeTriggerDate(s.date, targetTime, r.offsetMinutes, r.anchor, isOvernight);
        if (trigger && trigger >= now && trigger <= maxDate) {
          list.push({
            id: r.id,
            itemId: s.id,
            itemType: 'shift',
            itemTitle: this.formatShiftTitle(s),
            itemDate: s.date,
            itemStartTime: s.startTime,
            itemEndTime: s.endTime,
            itemHospital: s.hospital,
            itemService: s.service,
            label: r.label || 'Aviso de turno',
            category: r.category || 'personalizado',
            offsetMinutes: r.offsetMinutes,
            triggerDate: trigger,
            firedAt: r.firedAt,
            enabled: r.enabled
          });
        }
      });
    });

    // 2. Compromisos personales
    const commitments = window.AuthDB.getCommitments();
    commitments.forEach(c => {
      const reminders = c.reminders || [];
      reminders.forEach(r => {
        if (r.enabled === false) return;
        const targetTime = r.anchor === 'end' ? c.endTime : c.startTime;
        const trigger = this.computeTriggerDate(c.date, targetTime, r.offsetMinutes, r.anchor, false);
        if (trigger && trigger >= now && trigger <= maxDate) {
          list.push({
            id: r.id,
            itemId: c.id,
            itemType: 'commitment',
            itemTitle: c.title || 'Compromiso personal',
            itemDate: c.date,
            itemStartTime: c.startTime,
            itemEndTime: c.endTime,
            itemLocation: c.location,
            label: r.label || 'Aviso de compromiso',
            category: r.category || 'personalizado',
            offsetMinutes: r.offsetMinutes,
            triggerDate: trigger,
            firedAt: r.firedAt,
            enabled: r.enabled
          });
        }
      });
    });

    return list.sort((a, b) => a.triggerDate - b.triggerDate);
  }

  formatShiftTitle(s) {
    let t = 'Turno Clínico';
    if (s.type === 'M') t = 'Turno Mañana';
    if (s.type === 'T') t = 'Turno Tarde';
    if (s.type === 'N') t = 'Turno Noche';
    if (s.type === 'G') t = 'Guardia 24h';
    return `${t} (${s.startTime} - ${s.endTime})`;
  }

  // ==========================================
  // DISPARADOR PERIÓDICO (TICK)
  // ==========================================
  tick() {
    if (typeof window === 'undefined' || !window.AuthDB) return;
    const user = window.AuthDB.getCurrentUser();
    if (!user) return;

    const prefs = window.AuthDB.getReminderPrefs();
    const now = new Date();
    const maxPastMs = 24 * 60 * 60 * 1000; // No disparar alertas con más de 24h de antigüedad

    // Revisar turnos
    const shifts = window.AuthDB.getShifts();
    shifts.forEach(s => {
      const [h1] = (s.startTime || '00:00').split(':').map(Number);
      const [h2] = (s.endTime || '00:00').split(':').map(Number);
      const isOvernight = h2 <= h1;
      const reminders = s.reminders || [];

      reminders.forEach(r => {
        if (r.enabled === false || r.firedAt) return;
        const targetTime = r.anchor === 'end' ? s.endTime : s.startTime;
        const trigger = this.computeTriggerDate(s.date, targetTime, r.offsetMinutes, r.anchor, isOvernight);
        if (trigger && trigger <= now && (now - trigger) < maxPastMs) {
          this.fireReminder({
            type: 'shift',
            item: s,
            reminder: r,
            title: `AntiTurno: ${r.label}`,
            body: `${this.formatShiftTitle(s)} en ${s.hospital || 'Hospital Central'}${s.service ? ' · ' + s.service : ''}.`,
            prefs
          });
        }
      });
    });

    // Revisar compromisos
    const commitments = window.AuthDB.getCommitments();
    commitments.forEach(c => {
      const reminders = c.reminders || [];
      reminders.forEach(r => {
        if (r.enabled === false || r.firedAt) return;
        const targetTime = r.anchor === 'end' ? c.endTime : c.startTime;
        const trigger = this.computeTriggerDate(c.date, targetTime, r.offsetMinutes, r.anchor, false);
        if (trigger && trigger <= now && (now - trigger) < maxPastMs) {
          this.fireReminder({
            type: 'commitment',
            item: c,
            reminder: r,
            title: `AntiTurno: ${r.label}`,
            body: `Compromiso: ${c.title} (${c.startTime} - ${c.endTime})${c.location ? ' en ' + c.location : ''}.`,
            prefs
          });
        }
      });
    });
  }

  fireReminder({ type, item, reminder, title, body, prefs }) {
    const isQuiet = this.isQuietHours(new Date(), prefs.quietHours);

    // 1. Marcar como disparado en la base de datos JSON de inmediato para evitar repeticiones
    window.AuthDB.markReminderFired(type === 'shift' ? 'shifts' : 'commitments', item.id, reminder.id);

    // 2. Si son horas de silencio, no emitir sonido ni notificación del sistema intrusiva
    if (isQuiet) {
      if (typeof showToast === 'function') {
        showToast(`🌙 [Horas de silencio] ${title}: ${body}`, 'info');
      }
      return;
    }

    // 3. Sonido
    if (prefs.sound !== false) {
      this.playChime();
    }

    // 4. Notificación del sistema
    if (prefs.notificationsEnabled !== false && this.getPermissionStatus() === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="%23806650"/><text x="50%" y="54%" font-size="32" text-anchor="middle" dominant-baseline="middle" fill="white">⏰</text></svg>',
          tag: `rem-${reminder.id}`,
          renotify: true
        });
      } catch (e) {
        console.warn('No se pudo enviar notificación del sistema:', e);
      }
    }

    // 5. Toast visual dentro de la app
    if (typeof showToast === 'function') {
      showToast(`⏰ ${title} · ${body}`, 'info');
    }

    // Refrescar lista de recordatorios en UI si existe
    if (typeof renderUpcomingReminders === 'function') {
      renderUpcomingReminders();
    }
  }

  // ==========================================
  // AVISOS ANTE CAMBIOS EN HORARIOS (PRD)
  // ==========================================
  notifyShiftChange({ action, before, after }) {
    if (typeof window === 'undefined' || !window.AuthDB) return;
    const prefs = window.AuthDB.getReminderPrefs();
    if (prefs.notifyOnChanges === false) return;

    let title = '';
    let body = '';

    if (action === 'update' && before && after) {
      const timeChanged = before.date !== after.date || before.startTime !== after.startTime || before.endTime !== after.endTime;
      const hospChanged = before.hospital !== after.hospital || before.service !== after.service;
      if (!timeChanged && !hospChanged) return;

      title = 'Cambio de Horario Registrado';
      body = `Tu turno del ${after.date} ahora es de ${after.startTime} a ${after.endTime} en ${after.hospital || 'Hospital'}${after.service ? ' (' + after.service + ')' : ''}.`;
    } else if (action === 'delete' && before) {
      title = 'Turno Cancelado';
      body = `El turno del ${before.date} (${before.startTime} - ${before.endTime}) ha sido eliminado.`;
    } else if (action === 'create' && after) {
      title = 'Nuevo Turno Programado';
      body = `Has programado turno para el ${after.date} de ${after.startTime} a ${after.endTime}.`;
    }

    if (!title) return;

    if (prefs.sound !== false) this.playChime();

    if (prefs.notificationsEnabled !== false && this.getPermissionStatus() === 'granted') {
      try {
        new Notification(`AntiTurno: ${title}`, { body, tag: `shift-change-${Date.now()}` });
      } catch (e) {}
    }

    if (typeof showToast === 'function') {
      showToast(`📢 ${title}: ${body}`, 'info');
    }
  }
}

// Instancia global
if (typeof window !== 'undefined') {
  window.ReminderService = new ReminderService();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReminderService };
}

