# Plan 01 · Rediseño visual del frontend (AntiTurno)

> Origen: *Primera versión de mi aplicación.docx* → **"Diseño visual: me gustaría que fuera más visual y que permitiera diferenciar fácilmente los distintos turnos, mediante colores, etiquetas o una organización más clara en el calendario."**

## 1. Diagnóstico (estado actual)

| Problema | Evidencia en el código |
|---|---|
| Mañana y Noche se ven **idénticos** | `M` usa `bg-primary-fixed` y `N` usa `bg-tertiary-fixed`; en `tailwind.config` ambos son `#E8D5C0` (`index.html` L31 y L41). |
| Paleta monocromática beige/café | Todos los tokens `primary`, `secondary`, `tertiary`, `surface-*`, `outline*` están en la misma gama (`index.html` L27‑L56). |
| Colores de turno repetidos en 4+ lugares | `getShiftBadgeHtml` (app.js ~L938), `renderUpcomingShifts` (~L1239), `renderHeroCard` (~L1341), botones del formulario (index.html L334‑L379), leyenda (index.html ~L186). Cambiar un color obliga a tocar todo. |
| Celdas del calendario poco legibles | Badges de 10‑11 px con texto truncado (`Mañana (07:00-15:00)`); no hay color de fondo por día ni indicador del tipo de turno de un vistazo. |
| Sin modo oscuro ni contraste verificado | `darkMode: "class"` está declarado pero no se usa. Textos `text-on-surface-variant` (#806650) sobre `#F7EFE5` tienen contraste justo. |
| Compromisos y turnos compiten visualmente | Ambos son "píldoras" del mismo tamaño en la celda. |

## 2. Objetivos

1. Cada tipo de turno tiene **color + icono + etiqueta corta** únicos, reconocibles en < 1 segundo.
2. Un **único sistema de colores** (fuente de verdad) usado por calendario, listas, tarjeta principal, formulario, leyenda y resumen.
3. Calendario más claro: el turno es el protagonista de la celda; los compromisos personales son secundarios.
4. Mantener **todas** las funciones existentes (CRUD turnos, compromisos, anti‑cruces, resumen de horas, exportar .ics, base de datos JSON con exportar/importar del Plan 02).
5. Accesible: contraste AA, no depender solo del color (icono + letra), navegable con teclado.

## 3. Sistema visual propuesto

### 3.1 Paleta de turnos (fuente única)

| Tipo | Código | Color base | Fondo suave | Icono | Etiqueta corta |
|---|---|---|---|---|---|
| Mañana | `M` | Amarillo/ámbar `#F59E0B` | `#FEF3C7` | `wb_sunny` | **M** · Mañana |
| Tarde | `T` | Naranja/coral `#F97316` | `#FFEDD5` | `wb_twilight` | **T** · Tarde |
| Noche | `N` | Índigo `#4F46E5` | `#E0E7FF` | `bedtime` | **N** · Noche |
| Guardia 24h | `G` | Rojo `#DC2626` | `#FEE2E2` | `emergency` | **G** · 24h |
| Libre / Descanso | — | Verde `#10B981` | `#D1FAE5` | `spa` | Libre |

> Los compromisos personales conservan sus colores de categoría (`COMMITMENT_CATEGORIES`) pero se renderizan como **puntos/chips pequeños**, no como bloques grandes, para no confundirse con turnos.

### 3.2 Paleta base de la app
- Mantener la identidad cálida (café `#806650`) como color de marca, pero introducir neutros más limpios para superficies (`#FFFFFF`, `#FAFAF9`, `#F5F5F4`) y textos con más contraste (`#292524` / `#57534E`).
- Opcional: modo oscuro con la misma tabla de turnos (colores base ajustados).

## 4. Cambios por archivo

### 4.1 `js/app.js`
1. **Crear constante `SHIFT_TYPES`** (junto a `COMMITMENT_CATEGORIES`):
   ```js
   const SHIFT_TYPES = {
     M: { label: 'Mañana', short: 'M', icon: 'wb_sunny',    css: 'shift-m', defaults: ['07:00','15:00'] },
     T: { label: 'Tarde',  short: 'T', icon: 'wb_twilight', css: 'shift-t', defaults: ['15:00','23:00'] },
     N: { label: 'Noche',  short: 'N', icon: 'bedtime',     css: 'shift-n', defaults: ['23:00','07:00'] },
     G: { label: 'Guardia 24h', short: 'G', icon: 'emergency', css: 'shift-g', defaults: ['08:00','08:00'] }
   };
   ```
2. Refactorizar para que usen `SHIFT_TYPES`: `getShiftBadgeHtml`, `renderUpcomingShifts`, `renderHeroCard`, `openDayDetailsModal`, `renderHoursSummary`, `selectShiftType` (horarios por defecto).
3. **`renderCalendar`** rediseñado:
   - Franja/borde izquierdo de color del turno principal del día + fondo suave.
   - Chip grande con letra (`M/T/N/G`) + horario compacto (`07–15`).
   - Compromisos como puntos de color (máx. 3 + "+N").
   - Indicador visual de día "post‑noche" (descanso recomendado) usando la lógica anti‑cruces existente.
   - Vista móvil: celdas compactas con solo la letra y color; detalle al tocar.
4. **Filtros de calendario** (nuevo): chips "Todos · Mañana · Tarde · Noche · Guardia · Personal" que atenúan lo no seleccionado. Estado en `AppState.calendarFilter`.
5. **Mini‑resumen del mes** encima del calendario: conteo por tipo (ej. `6 M · 4 T · 5 N · 1 G`) con sus colores.

### 4.2 `index.html`
1. Actualizar `tailwind.config` con tokens nuevos (`shift-m`, `shift-m-soft`, etc.) y neutros con mejor contraste.
2. Añadir en `<style>` clases utilitarias `.shift-m/.shift-t/.shift-n/.shift-g` (fondo suave, borde, texto) para usar desde JS.
3. **Leyenda** (≈L186): regenerarla desde `SHIFT_TYPES` (contenedor vacío rellenado por JS) para que nunca se desincronice.
4. **Botones de tipo de turno** (L334‑L379): cada tarjeta con su color propio, estado seleccionado claro (fondo del color + check), no solo `ring-primary`.
5. **Tarjeta principal (hero)**: fondo con degradado del color del próximo turno.
6. Menú de usuario: la opción "Sincronización Nube (Firebase)" se sustituye por **"Mis datos (JSON)"** (definido en el Plan 02); aplicar el mismo estilo visual.
7. Cabecera/nav: revisar contraste de los estados activos; quitar el `::-webkit-scrollbar { display:none }` global (afecta accesibilidad en escritorio) o limitarlo a contenedores concretos.

### 4.3 Accesibilidad
- Contraste mínimo 4.5:1 en textos de chips (validar cada par color/fondo).
- Siempre letra + icono además del color (daltonismo).
- `aria-label` en celdas del calendario: "Martes 4 de noviembre: Turno Noche 23:00 a 07:00, 1 compromiso".
- Foco visible en celdas y botones (`focus-visible:ring`).

## 5. Pasos de ejecución

1. Crear `SHIFT_TYPES` y clases CSS de turno (sin cambiar aún la UI).
2. Refactorizar todas las funciones de render para usar `SHIFT_TYPES` → verificar que nada se rompió.
3. Aplicar nueva paleta en `tailwind.config` y clases base.
4. Rediseñar celdas de calendario + leyenda dinámica + filtros + mini‑resumen.
5. Rediseñar formulario de registro (botones de tipo) y tarjeta principal.
6. Ajustar listas (Próximas Guardias, Vida Personal, Resumen de horas) y modal de detalle del día.
7. Revisión responsive (360 px, 768 px, 1280 px+) y de accesibilidad.

## 6. Verificación

- [ ] Crear un turno de cada tipo el mismo mes → los 4 colores son claramente distintos en calendario, leyenda, próximas guardias, hero y resumen.
- [ ] Filtros del calendario muestran/atenúan correctamente.
- [ ] Compromisos personales visibles pero subordinados a los turnos.
- [ ] CRUD de turnos y compromisos, anti‑cruces, resumen de horas y exportación .ics siguen funcionando.
- [ ] Vista móvil legible; navegación inferior correcta.
- [ ] Sin errores en la consola del navegador.

## 7. Riesgos

- `app.js` e `index.html` son grandes (~70 KB cada uno): los cambios se harán por secciones pequeñas y verificables.
- Tailwind por CDN genera clases en tiempo de ejecución: las clases construidas dinámicamente en JS deben existir literalmente en el código (por eso se usan clases CSS propias `.shift-*`).

