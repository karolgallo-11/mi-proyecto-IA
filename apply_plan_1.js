const fs = require('fs');
const path = require('path');

// 1. UPDATE index.html
let html = fs.readFileSync('index.html', 'utf8');

// Replace tailwind config and style
const oldConfigAndStyleRegex = /<script id="tailwind-config">[\s\S]*?<\/style>/;
const newConfigAndStyle = `<script id="tailwind-config">
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "primary": "#806650",
            "primary-container": "#B89B80",
            "on-primary": "#ffffff",
            "on-primary-container": "#49372B",
            "primary-fixed": "#E8D5C0",
            "primary-fixed-dim": "#D8C2AA",
            "on-primary-fixed-variant": "#49372B",
            "secondary": "#B89B80",
            "secondary-container": "#E8D5C0",
            "on-secondary": "#ffffff",
            "on-secondary-container": "#49372B",
            "tertiary": "#806650",
            "tertiary-container": "#D8C2AA",
            "on-tertiary": "#ffffff",
            "tertiary-fixed": "#E8D5C0",
            "on-tertiary-fixed-variant": "#49372B",
            "background": "#FAF9F6",
            "on-background": "#292524",
            "surface": "#FAF9F6",
            "on-surface": "#292524",
            "surface-container-lowest": "#ffffff",
            "surface-container-low": "#F5F5F4",
            "surface-container": "#E7E5E4",
            "surface-container-high": "#D6D3D1",
            "on-surface-variant": "#57534E",
            "outline": "#A8A29E",
            "outline-variant": "#E7E5E4",
            "error": "#ba1a1a",
            "error-container": "#ffdad6",
            "on-error": "#ffffff",
            // Tokens de turnos clínicos (Plan 01)
            "shift-m": "#F59E0B",
            "shift-m-soft": "#FEF3C7",
            "shift-t": "#EA580C",
            "shift-t-soft": "#FFEDD5",
            "shift-n": "#4F46E5",
            "shift-n-soft": "#EEF2FF",
            "shift-g": "#DC2626",
            "shift-g-soft": "#FEE2E2",
            "shift-rest": "#10B981",
            "shift-rest-soft": "#D1FAE5"
          },
          fontFamily: {
            "headline-lg": ["Plus Jakarta Sans", "sans-serif"],
            "headline-md": ["Plus Jakarta Sans", "sans-serif"],
            "title-lg": ["Plus Jakarta Sans", "sans-serif"],
            "title-md": ["Inter", "sans-serif"],
            "body-lg": ["Inter", "sans-serif"],
            "body-md": ["Inter", "sans-serif"],
            "body-sm": ["Inter", "sans-serif"],
            "label-sm": ["Inter", "sans-serif"]
          }
        }
      }
    };
  </script>

  <style>
    @layer base {
      html, body { margin: 0; padding: 0; }
      body { overscroll-behavior: none; }
    }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    .app-view { animation: fadeIn 0.18s ease-in-out; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    button, a { -webkit-tap-highlight-color: transparent; }

    /* ========================================== */
    /* SISTEMA VISUAL DE TURNOS (PLAN 01)         */
    /* Clases explícitas para compatibilidad CDN   */
    /* ========================================== */
    /* Badges & Chips */
    .shift-badge-m { background-color: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; }
    .shift-badge-t { background-color: #FFEDD5; color: #9A3412; border: 1px solid #FDBA74; }
    .shift-badge-n { background-color: #EEF2FF; color: #3730A3; border: 1px solid #A5B4FC; }
    .shift-badge-g { background-color: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; }
    .shift-badge-rest { background-color: #D1FAE5; color: #065F46; border: 1px solid #A7F3D0; }

    /* Bordes de turno en celdas de calendario */
    .shift-border-m { border-left: 4px solid #F59E0B !important; }
    .shift-border-t { border-left: 4px solid #EA580C !important; }
    .shift-border-n { border-left: 4px solid #4F46E5 !important; }
    .shift-border-g { border-left: 4px solid #DC2626 !important; }
    .shift-border-rest { border-left: 4px solid #10B981 !important; }

    /* Fondos suaves para celdas del calendario */
    .shift-bg-m { background-color: #FFFDF5; }
    .shift-bg-t { background-color: #FFFBF7; }
    .shift-bg-n { background-color: #F8F9FF; }
    .shift-bg-g { background-color: #FFF8F8; }
    .shift-bg-rest { background-color: #F3FCF7; }

    /* Selector de Turnos (Cards de Formulario) */
    .shift-card-m-selected {
      background-color: #FEF3C7 !important;
      border-color: #F59E0B !important;
      box-shadow: 0 0 0 2px #F59E0B !important;
    }
    .shift-card-t-selected {
      background-color: #FFEDD5 !important;
      border-color: #EA580C !important;
      box-shadow: 0 0 0 2px #EA580C !important;
    }
    .shift-card-n-selected {
      background-color: #EEF2FF !important;
      border-color: #4F46E5 !important;
      box-shadow: 0 0 0 2px #4F46E5 !important;
    }
    .shift-card-g-selected {
      background-color: #FEE2E2 !important;
      border-color: #DC2626 !important;
      box-shadow: 0 0 0 2px #DC2626 !important;
    }
  </style>`;

html = html.replace(oldConfigAndStyleRegex, newConfigAndStyle);

// Replace calendar header & legend
const oldCalendarHeaderRegex = /<!-- Barra de Control del Calendario -->[\s\S]*?<!-- Cabecera de días de la semana -->/;
const newCalendarHeader = `<!-- Barra de Control del Calendario -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/30">
              <div class="flex items-center gap-3">
                <h2 id="calendarMonthTitle" class="font-headline-lg text-xl sm:text-2xl font-bold text-on-surface">Octubre 2026</h2>
                <div class="flex items-center bg-surface-container-low rounded-xl p-1 border border-outline-variant/40">
                  <button onclick="prevMonth()" class="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors" title="Mes Anterior">
                    <span class="material-symbols-outlined text-lg">chevron_left</span>
                  </button>
                  <button onclick="currentMonth()" class="px-2.5 py-1 rounded-lg text-xs font-bold text-primary hover:bg-surface-container transition-colors">
                    Hoy
                  </button>
                  <button onclick="nextMonth()" class="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors" title="Mes Siguiente">
                    <span class="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </div>
              </div>

              <!-- Leyenda Dinámica de Colores -->
              <div id="calendarLegendContainer" class="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] font-semibold">
                <!-- Inyectado dinámicamente desde SHIFT_TYPES -->
              </div>
            </div>

            <!-- Barra de Filtros y Resumen Rápido del Mes -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1 pb-2 border-b border-outline-variant/20">
              <!-- Filtros de Tipo de Turno / Actividad -->
              <div id="calendarFiltersBar" class="flex flex-wrap items-center gap-1.5 text-xs">
                <!-- Inyectado dinámicamente con chips: Todos, Mañana, Tarde, Noche, Guardia 24h, Personal -->
              </div>

              <!-- Mini-Resumen Mensual de Conteo -->
              <div id="calendarMonthSummaryBar" class="flex flex-wrap items-center gap-2 text-xs">
                <!-- Inyectado dinámicamente: ej. 6 M · 4 T · 5 N · 1 G · 168h -->
              </div>
            </div>

            <!-- Cabecera de días de la semana -->`;

html = html.replace(oldCalendarHeaderRegex, newCalendarHeader);

// Replace shift form buttons in view-registro
const oldShiftCardsRegex = /<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">[\s\S]*?<!-- 3\. Horarios Personalizables/;
const newShiftCards = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              <!-- Mañana -->
              <button type="button" data-shift-type="M" onclick="selectShiftType('M')" class="shift-type-btn text-left p-4 rounded-xl shift-card-m-selected bg-surface-container-low transition-all flex flex-col justify-between h-28 relative border border-amber-300 hover:border-amber-500 shadow-sm">
                <div class="flex items-center justify-between">
                  <span class="w-8 h-8 rounded-lg shift-badge-m flex items-center justify-center font-bold text-sm">
                    <span class="material-symbols-outlined text-base">wb_sunny</span>
                  </span>
                  <span class="check-icon material-symbols-outlined text-amber-700 text-xl">check_circle</span>
                </div>
                <div>
                  <h4 class="font-title-md font-bold text-amber-950">Mañana</h4>
                  <p class="font-body-sm text-xs text-amber-900/80">07:00 a 15:00 (8h)</p>
                </div>
              </button>

              <!-- Tarde -->
              <button type="button" data-shift-type="T" onclick="selectShiftType('T')" class="shift-type-btn text-left p-4 rounded-xl bg-surface-container-low transition-all flex flex-col justify-between h-28 relative border border-orange-200 hover:border-orange-500">
                <div class="flex items-center justify-between">
                  <span class="w-8 h-8 rounded-lg shift-badge-t flex items-center justify-center font-bold text-sm">
                    <span class="material-symbols-outlined text-base">wb_twilight</span>
                  </span>
                  <span class="check-icon material-symbols-outlined text-orange-600 text-xl hidden">check_circle</span>
                </div>
                <div>
                  <h4 class="font-title-md font-bold text-orange-950">Tarde</h4>
                  <p class="font-body-sm text-xs text-orange-900/80">15:00 a 23:00 (8h)</p>
                </div>
              </button>

              <!-- Noche -->
              <button type="button" data-shift-type="N" onclick="selectShiftType('N')" class="shift-type-btn text-left p-4 rounded-xl bg-surface-container-low transition-all flex flex-col justify-between h-28 relative border border-indigo-200 hover:border-indigo-500">
                <div class="flex items-center justify-between">
                  <span class="w-8 h-8 rounded-lg shift-badge-n flex items-center justify-center font-bold text-sm">
                    <span class="material-symbols-outlined text-base">bedtime</span>
                  </span>
                  <span class="check-icon material-symbols-outlined text-indigo-600 text-xl hidden">check_circle</span>
                </div>
                <div>
                  <h4 class="font-title-md font-bold text-indigo-950">Noche</h4>
                  <p class="font-body-sm text-xs text-indigo-900/80">23:00 a 07:00 (8h)</p>
                </div>
              </button>

              <!-- Guardia 24h -->
              <button type="button" data-shift-type="G" onclick="selectShiftType('G')" class="shift-type-btn text-left p-4 rounded-xl bg-surface-container-low transition-all flex flex-col justify-between h-28 relative border border-red-200 hover:border-red-500">
                <div class="flex items-center justify-between">
                  <span class="w-8 h-8 rounded-lg shift-badge-g flex items-center justify-center font-bold text-sm">
                    <span class="material-symbols-outlined text-base">emergency</span>
                  </span>
                  <span class="check-icon material-symbols-outlined text-red-600 text-xl hidden">check_circle</span>
                </div>
                <div>
                  <h4 class="font-title-md font-bold text-red-950">Guardia 24h</h4>
                  <p class="font-body-sm text-xs text-red-900/80">08:00 a 08:00 (24h)</p>
                </div>
              </button>

            </div>
          </div>

          <!-- 3. Horarios Personalizables`;

html = html.replace(oldShiftCardsRegex, newShiftCards);

fs.writeFileSync('index.html', html, 'utf8');
console.log('index.html updated successfully!');

