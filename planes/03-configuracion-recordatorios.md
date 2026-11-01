# Plan 03 · Configuración y personalización de recordatorios

> Origen: *Primera versión de mi aplicación.docx* → **"Las opciones disponibles son un poco limitadas. Me gustaría que se pudieran personalizar mejor los recordatorios según mis necesidades."**
> PRD: **"Configurar recordatorios: recibir avisos antes de comenzar un turno o cuando haya cambios en el horario."**

## 1. Diagnóstico

| Problema | Evidencia |
|---|---|
| Solo 3 casillas fijas: "Aviso 2h antes", "Uniforme y comida", "Descanso 8h previas". No se puede elegir la anticipación, el mensaje ni agregar más. | `index.html` L418‑L438. |
| **Los recordatorios nunca se disparan**: solo se guardan como booleanos `{ reminder2h, reminderTupper, reminderRest }`. No existe código que use `Notification`, temporizadores ni avisos en la app. | `handleSaveShift` app.js L401‑L424; `saveShift` auth-db.js L630/L645. |
| No hay aviso "cuando haya cambios en el horario" (requisito del PRD). | — |
| No hay preferencias generales: cada turno se configura a mano. | — |
| El archivo `.ics` exportado no incluye alarmas, así que Google Calendar/iPhone tampoco avisan. | `exportCalendarICS` app.js ~L1461. |
| Los compromisos personales no tienen recordatorios. | `saveCommitment` auth-db.js L721. |

## 2. Objetivos

1. Recordatorios **ilimitados y personalizables** por turno: cuándo (minutos/horas/días antes), mensaje y tipo.
2. **Plantillas por tipo de turno** (ej. Noche: siesta 6h antes + preparar comida 2h antes) aplicadas automáticamente a turnos nuevos.
3. Que los recordatorios **realmente avisen**: notificación del sistema + aviso dentro de la app + sonido opcional.
4. Aviso cuando un turno se **crea, modifica o elimina** (cambio de horario).
5. Recordatorios también para **compromisos personales**.
6. Alarmas incluidas en la **exportación .ics** para tener avisos aunque la app esté cerrada.

## 3. Modelo de datos

### 3.1 Recordatorio (nuevo formato)
```js
// shift.reminders (array) — reemplaza el objeto de 3 booleanos
{
  id: 'rem_xxx',
  offsetMinutes: 120,          // anticipación respecto al inicio (o al fin si anchor='end')
  anchor: 'start',             // 'start' | 'end'
  label: 'Salir hacia el hospital',
  category: 'salida',          // salida | comida | uniforme | descanso | hidratacion | personalizado
  enabled: true,
  firedAt: null                // ISO cuando ya se notificó (evita duplicados)
}
```

### 3.2 Preferencias de usuario (nuevo)
```js
// Base de datos JSON (Plan 02): users[].settings.reminderPrefs — se exporta/importa con el resto de datos
{
  notificationsEnabled: true,
  sound: true,
  quietHours: { enabled: false, from: '22:00', to: '06:00' },
  notifyOnChanges: true,
  templates: {
    M: [ { offsetMinutes: 600, label: 'Dormir temprano', category: 'descanso' },
         { offsetMinutes: 90,  label: 'Salir de casa',  category: 'salida' } ],
    T: [ ... ], N: [ ... ], G: [ ... ]
  },
  commitmentDefault: [ { offsetMinutes: 60, label: 'Compromiso en 1 hora' } ]
}
```

### 3.3 Migración (sin perder datos)
Al leer un turno con el formato viejo, convertir automáticamente:
- `reminder2h: true` → `{ offsetMinutes: 120, label: 'Aviso 2h antes de salir', category: 'salida' }`
- `reminderTupper: true` → `{ offsetMinutes: 180, label: 'Preparar uniforme y comida', category: 'comida' }`
- `reminderRest: true` → `{ offsetMinutes: 480, label: 'Descanso 8h previas', category: 'descanso' }`

## 4. Cambios por archivo

### 4.1 Nuevo `js/reminders.js` (motor de recordatorios)
- `ReminderService` con:
  - `requestPermission()` → `Notification.requestPermission()` (solo tras un clic del usuario).
  - `computeTriggerTime(item, reminder)` → fecha exacta (maneja turnos nocturnos que cruzan medianoche).
  - `getUpcoming(hours = 48)` → lista ordenada de próximos avisos de turnos y compromisos.
  - `tick()` cada 30 s (`setInterval`) + al volver a la pestaña (`visibilitychange`): dispara los avisos vencidos no notificados, respeta horas de silencio, marca `firedAt`.
  - `notify(title, body, tag)` → `new Notification(...)` si hay permiso; siempre además `showToast` + sonido opcional (Web Audio, sin archivos externos).
  - `notifyChange(type, shift, before)` → "Tu turno del 5/nov cambió de 07:00 a 15:00".
- Cargar en `index.html` después de `auth-db.js` y antes de `app.js`.

> **Limitación importante**: una página web estática (GitHub Pages) solo puede notificar **mientras la app esté abierta** (pestaña o app instalada en segundo plano reciente). Para avisos con la app cerrada se usan las **alarmas .ics** (punto 4.5). Las *push notifications* reales requerirían un servidor propio (fuera de alcance, ya que el proyecto usa una base de datos JSON sin backend).

### 4.2 `index.html` — formulario de turno (sección "Configuración de Recordatorios")
Reemplazar las 3 casillas por un **editor de recordatorios**:
- Lista de recordatorios del turno, cada uno con: interruptor on/off, cantidad + unidad (`min | h | días`), "antes del inicio / antes del fin", etiqueta editable, icono por categoría, botón eliminar.
- Botón **"+ Añadir recordatorio"** y chips rápidos: `15 min`, `1 h`, `2 h`, `1 día antes`.
- Botón **"Usar plantilla de turno Noche"** (se pre‑aplica según el tipo seleccionado).
- Vista previa: "Te avisaremos el lunes 3/nov a las 21:00".

### 4.3 Nuevo panel "Preferencias de recordatorios"
Accesible desde el menú de usuario (y un engranaje en la sección de recordatorios):
- Activar notificaciones (botón que pide permiso + estado: permitido / bloqueado / no soportado).
- Sonido on/off, horas de silencio, avisar cambios de horario.
- Editor de **plantillas por tipo de turno** (M/T/N/G) y para compromisos.
- Botón **"Probar notificación"**.

### 4.4 `js/auth-db.js`
- `saveShift`/`saveCommitment`: aceptar `reminders` como array; si no viene, aplicar plantilla del tipo.
- `normalizeReminders(item)`: migración del formato viejo (3.3).
- `getReminderPrefs()` / `saveReminderPrefs()` guardadas en la base JSON (`AntiTurnoDB`, `users[].settings.reminderPrefs`).
- `firedAt` de cada recordatorio se guarda en la base JSON; al **importar** un archivo se conservan los `firedAt` para no repetir avisos ya mostrados.
- Emitir evento `antiturno-shift-changed` con `{ action, before, after }` para que `ReminderService` avise cambios.

### 4.5 `js/app.js`
- `handleSaveShift` / `editShift` / `resetShiftForm`: leer y pintar el editor de recordatorios en lugar de los 3 checkboxes.
- Modal de compromisos: mini‑editor de recordatorios (mismo componente).
- Tarjeta del dashboard **"Próximos recordatorios"** (siguientes 48 h).
- `exportCalendarICS`: añadir bloques `VALARM` por cada recordatorio activo:
  ```
  BEGIN:VALARM
  ACTION:DISPLAY
  DESCRIPTION:Salir hacia el hospital
  TRIGGER:-PT120M
  END:VALARM
  ```
- Iniciar `ReminderService` en `DOMContentLoaded` y reiniciar al iniciar/cerrar sesión.

## 5. Pasos de ejecución

1. Modelo de datos + migración en `auth-db.js` (con prueba de que los turnos viejos siguen cargando).
2. Preferencias de usuario en la base JSON con plantillas por defecto.
3. `reminders.js`: cálculo de horarios, `tick()`, notificaciones y toasts.
4. Editor de recordatorios en el formulario de turno.
5. Panel de preferencias + prueba de notificación.
6. Recordatorios en compromisos personales.
7. Avisos por cambio de horario.
8. Alarmas `VALARM` en la exportación `.ics`.
9. Tarjeta "Próximos recordatorios" en el dashboard.

## 6. Verificación

- [ ] Turnos creados antes del cambio conservan sus recordatorios (migrados).
- [ ] Crear turno con recordatorio a 2 min → llega notificación del sistema y toast dentro de la app.
- [ ] Turno de noche (23:00‑07:00) calcula bien los avisos que caen el día anterior.
- [ ] Plantilla de tipo se aplica al crear turno nuevo y se puede editar.
- [ ] Horas de silencio suprimen la notificación del sistema (se muestra al volver).
- [ ] Editar la hora de un turno → aviso de "cambio de horario".
- [ ] No se repite la misma notificación al recargar la página.
- [ ] `.ics` importado en Google Calendar muestra las alarmas.
- [ ] Con permiso denegado, la app sigue funcionando con avisos internos y explica cómo activarlo.

## 7. Riesgos / notas

- Las notificaciones requieren HTTPS (GitHub Pages ✔) y permiso del usuario.
- iOS Safari solo permite notificaciones web si la app se **instala en la pantalla de inicio** (PWA). Agregar `manifest.json` + service worker básico puede incluirse como mejora opcional.
- **Depende del Plan 02** (base de datos JSON): debe ejecutarse después de él.
- Si este plan se ejecuta **después** del Plan 01, el editor de recordatorios usará directamente el nuevo sistema visual (`SHIFT_TYPES`).

