# 14 · Descanso que se nota con la app abierta, y qué sigue

**Estado:** propuesta (ronda 2, 2026-11-22) · **Esfuerzo:** S–M · **Depende de:** 11 (aviso push)
· **Relacionada con:** 13, 15

## Problema y objetivo

Durante el entrenamiento, la pantalla queda encendida (`keepAwake`) y casi siempre a la vista. En ese
caso:
- **No vibra.** El aviso de fin de descanso usa `navigator.vibrate`, que **no existe en Safari para
  iPhone**.
- **No suena con el teléfono en silencio.** El sonido (Web Audio) lo calla el interruptor de silencio.
- **Se cancela el push.** El aviso push de la feature 11 se cancela a propósito cuando la app está
  visible, porque se supone que suena.

Resultado: con el iPhone en silencio y la app abierta **no hay ningún aviso**. La barra simplemente
desaparece. Además, el descanso es el momento de preparar la próxima máquina (asiento, peso), pero la
barra no dice cuál es.

Objetivo: que el fin del descanso **se note siempre** y que la barra muestre **qué sigue**, con su
objetivo y su nota fija.

## Evidencia

- **Web Audio y el interruptor de silencio:** WebKit usa por defecto la sesión de audio "ambient", que el
  interruptor silencia.
  - Bug: https://auto-bugs.webkit.org/show_bug.cgi?id=237322
  - API para cambiarlo (`navigator.audioSession.type`, Safari 16.4+):
    https://developer.mozilla.org/docs/Web/API/AudioSession/type
- **Vibration API:** no está en Safari para iOS (MDN, caniuse).
- **Truco del `<input type="checkbox" switch>`:** Safari 18 hace vibrar este control al tocarlo. Según
  la librería ios-haptics, se habría cerrado en iOS 26.5. No se puede contar con él.
  https://unpkg.com/ios-haptics@3.1.1/README.md
- **Hevy:** al terminar el descanso avisa y lleva al siguiente ejercicio.
  https://www.hevyapp.com/features/workout-settings/

## Qué hay hoy en el código

- **`src/lib/rest-timer.js`:**
  - `beep()` usa Web Audio y luego `navigator.vibrate?.(...)` (`:49`).
  - `check()` (`:52-63`): con la página visible hace `cancelAlert()` y `closeRestNotifications()`, y
    después `beep()`.
- **`src/components/AppLayout.jsx:94-131`:** la barra de descanso (`#rest-bar`) muestra el tiempo,
  −15/+15, el aviso push apagado y "Saltar". Cuando llega a 0, se va.
- **Datos del ejercicio siguiente:**
  - Objetivo con `suggest` (`src/lib/progression.js`).
  - Nota fija con `prefsOf(id).note` (feature 04).
  - Tarjetas con `data-testid="exercise-card"` en el editor.

## Alcance

### Fin del descanso con la app abierta

- **Al llegar a 0, la barra no se va:**
  - Cambia a un color de alerta y destella 3 veces (sin destellos si está activo "Reducir movimiento").
  - Pasa a contar el tiempo de más: "Descanso terminado · +0:12".
  - Se cierra al marcar la próxima serie, al tocar "Listo" o a los 5 min.
- **Sonido:**
  - Antes del beep, si existe `navigator.audioSession`, se usa `type = 'transient'` para que suene a
    pesar del interruptor de silencio.
  - Si la prueba en el teléfono muestra que pausa la música, se usa `'ambient'` (como hoy) y queda
    como opción en Ajustes.
- **Ajuste nuevo "Avisar también con la app abierta"** (en Aviso de fin de descanso):
  - Encendido: el push no se cancela aunque la app esté visible, así que vibra y suena según los ajustes
    del sistema.
  - Apagado por defecto: puede duplicar el sonido con la app abierta.
- **Pantalla completa opcional** ("Destello de pantalla completa"): un fondo de color que cubre la
  pantalla 1 s, para verlo de lejos.

### "Siguiente" en la barra

- Segunda línea de la barra: **"Siguiente: Jalón al pecho · 63 × 8 · asiento en 4"**.
  - "Siguiente" es el primer ejercicio con series pendientes después del actual (o, si no hay, el
    primero pendiente).
  - El objetivo sale de `suggest` o del placeholder.
  - La nota fija se recorta a 30 caracteres.
- Tocar la línea lleva a esa tarjeta (`scrollIntoView`) sin cerrar el descanso.
- Si quedan series pendientes del ejercicio actual, dice "Siguiente: serie 2 de Prensa · 86 × 8".

### Interfaz

```
┌─────────────────────────────────────────────┐
│  1:12   −15  +15              ⏭             │
│  Siguiente: Jalón al pecho · 63 × 8 · asiento 4 │
└─────────────────────────────────────────────┘
   al llegar a 0 →  [ Descanso terminado · +0:08 ]  (color de alerta)
```

## Casos borde

- Último ejercicio terminado: "Siguiente: terminar el entrenamiento".
- Descanso iniciado fuera de un entrenamiento (desde una plantilla): sin línea de siguiente.
- App en segundo plano: no cambia nada respecto a la feature 11 (el push llega).
- `audioSession` no disponible (iOS < 16.4): solo la barra visual.
- La barra queda ~20 px más alta: comprobar que no tapa el botón "Terminar" a 375 px.

## Fuera de alcance

- Vibración en iPhone con la app abierta (no hay API web confiable).
- Live Activities o la isla dinámica (no hay API web).

## Criterios de aceptación

- [ ] Con el descanso en 0 y la app visible, la barra queda con "Descanso terminado · +0:0N" y se cierra
      al marcar la siguiente serie o con "Listo".
- [ ] Con "Avisar también con la app abierta", el push no se cancela al terminar con la app visible
      (prueba con `pushManager` simulado, como en 11).
- [ ] La barra muestra el siguiente ejercicio con su objetivo y su nota fija; tocarla lleva a esa tarjeta.
- [ ] Con series pendientes del ejercicio actual, "Siguiente" dice el número de serie.
- [ ] Con "Reducir movimiento" no hay destello.
- [ ] En el iPhone del usuario, con el interruptor de silencio activado, el aviso se nota (sonido o
      destello) en 10 de 10 descansos (medido a mano).

## Pruebas

- **Unitaria:** función pura `nextUp(exercises, currentIndex)`.
- **e2e:**
  - Descanso corto (3 s) hasta 0: la barra queda en "terminado".
  - Línea "Siguiente" con nota fija; tocarla desplaza a la tarjeta.
  - Ajuste de push con la app visible.
