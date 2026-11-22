# 15 · Entrenamiento de 14 ejercicios más ágil: plegar, saltar, reordenar y cerrar bien

**Estado:** propuesta (ronda 2, 2026-11-22) · **Esfuerzo:** M · **Depende de:** —
· **Relacionada con:** 13 (botones de reps), 14 (barra "Siguiente")

## Problema y objetivo

Una sesión FBEOD tiene ~14 ejercicios de una serie. Cada tarjeta mide unos 250–300 px: encabezado,
objetivo, nota fija, línea de calentamiento, tabla y "Añadir serie". En pantalla caben unas 2,5 tarjetas
y la mayor parte de la lista es pasado: ejercicios ya hechos.

- Al marcar ✓ no pasa nada: hay que buscar la siguiente tarjeta deslizando con el dedo sudado.
- Si la máquina está ocupada, mover un ejercicio 6 lugares cuesta 12 toques (Subir/Bajar de a uno).
- La sesión no guarda a qué hora se hizo cada serie. Si olvidas tocar "Terminar", el entrenamiento dura
  4 horas y ensucia la duración en el historial y en los resúmenes.

Objetivo: que la lista muestre **lo que falta**, que llegar al siguiente ejercicio no cueste nada, que
reordenar sea de un toque y que la duración quede bien sin pensar.

## Evidencia

- **Hevy:** "Smart Superset Scrolling" desplaza solo al siguiente ejercicio al completar una serie.
  https://help.hevyapp.com/hc/en-us/articles/33882110558743
- **Strong y Hevy:** reordenan arrastrando la tarjeta.
- **Historial real** (00-indice): 97 % de los ejercicios con una sola serie; ~14 ejercicios por sesión.
- **Calentamiento:** `warmupShow` viene activado por defecto (`src/lib/data.js:196`), aunque el usuario
  no registra calentamientos.

## Qué hay hoy en el código

- **Tarjeta:** `src/views/workout/ExerciseBlock.jsx`.
  - `toggle` (`:394-424`) marca la serie y empieza el descanso. No desplaza ni pliega.
  - Reordenar: "Subir"/"Bajar" en el menú (`:590-591`), con `move(±1)`.
- **Hora de las series:** ✓ no guarda ninguna (`:414`).
- **Terminar:** `finish()` (`src/views/WorkoutEditor.jsx:134`) fija `ended_at = new Date()`.
- **Entrenar** (`src/views/TrainView.jsx`): muestra "Continuar" si hay un entrenamiento en curso, sin
  importar cuántas horas lleva.
- **Comparación de estructura para "Actualizar plantilla":** `structure()` en `WorkoutEditor.jsx:35`.
  No mira el orden de los ejercicios.

## Alcance

### Plegar lo terminado

- Un ejercicio con **todas** sus series hechas se pliega a una línea:
  **"✓ Prensa 86 × 8 ↑"** (mejor serie efectiva y la flecha de la comparación en vivo).
- Tocar la línea lo despliega; se vuelve a plegar al salir del foco o al marcar otro.
- Ajuste "Plegar ejercicios terminados" (activado por defecto).

### Ir al siguiente

- Al marcar la última serie de un ejercicio, la pantalla se desplaza a la primera tarjeta pendiente,
  después del descanso o enseguida según el ajuste.
- **No se desplaza si hay un campo con foco** (estás escribiendo).
- En el encabezado del entrenamiento: **"6 de 14"**. Al tocarlo se abre una lista de los ejercicios con
  ✓ / pendiente para saltar a cualquiera.

### Reordenar con un toque

- Menú (⋯) del ejercicio:
  - **"Hacer ahora"**: lo mueve antes del primer ejercicio pendiente y desplaza hasta él.
  - **"Dejar para el final"**: lo manda al último lugar.
  - Las dos con "Deshacer" 5 s.
- "Subir"/"Bajar" se mantienen.
- Reordenar no dispara "¿Actualizar plantilla?", porque `structure()` no mira el orden. Esto queda
  cubierto por una prueba.

### Modo "una serie por ejercicio"

- Ajuste **"Una serie por ejercicio"**, sugerido al usuario porque coincide con su historial. Hace tres
  cosas:
  - Oculta la línea de calentamiento.
  - Cambia el botón "Añadir serie" de ancho completo por un "+" chico.
  - Acorta la columna "Anterior" a un ícono ↺ que copia lo de la vez anterior.
- Cada tarjeta ahorra ~80 px.

### Hora de cada serie y "olvidé terminar"

- ✓ guarda `at` (ISO) en la serie. Es un campo opcional que no se usa para comparar.
- Al tocar **Terminar**, si la última serie fue hace más de 20 min, la app ofrece
  **"Terminar a las 19:42 (última serie)"** o "Ahora".
- Al abrir la app con un entrenamiento en curso de más de 3 h, la tarjeta de Entrenar pregunta
  **"¿Lo terminaste a las 19:42?"**, con las opciones "Terminar a esa hora" o "Sigo entrenando".
- El resumen al terminar puede mostrar el **descanso real promedio**: la mediana entre las `at`
  consecutivas.

## Casos borde

- Ejercicio sin series: no se pliega.
- Desmarcar una serie de un ejercicio plegado: se despliega.
- Entrenamiento editado después de guardado: sin `at` en las series nuevas; la oferta de hora no
  aparece.
- Historial importado de Strong: sin `at`; no afecta nada.
- Superseries: no existen en la app (fuera de 04), así que no hay grupos que plegar.

## Fuera de alcance

- Arrastrar para reordenar (más complejo en móvil; "Hacer ahora" cubre el caso de la máquina ocupada).
- Cambiar el orden de la plantilla al reordenar.

## Criterios de aceptación

- [ ] Al marcar la única serie de un ejercicio, la tarjeta se pliega a "✓ Nombre peso × reps" y la
      pantalla llega a la siguiente pendiente. Si había un campo con foco, no se desplaza.
- [ ] "6 de 14" abre la lista y tocar un ejercicio lleva a su tarjeta.
- [ ] "Hacer ahora" mueve el ejercicio 8 antes del primer pendiente (posición 4) con un toque, y deshacer
      lo devuelve.
- [ ] Terminar un entrenamiento solo reordenado no pregunta "¿Actualizar plantilla?".
- [ ] "Una serie por ejercicio" oculta el calentamiento y achica "Añadir serie".
- [ ] Con la última serie a las 19:42 y Terminar a las 21:00, se ofrece terminar a las 19:42 y se guarda
      esa hora en `ended_at`.
- [ ] Un entrenamiento en curso de más de 3 h muestra la pregunta en Entrenar.

## Pruebas

- **Unitarias:**
  - `nextPending(exercises, from)`.
  - `suggestEnd(workout, now)`: 20 min, sin `at`, entrenamiento editado.
- **e2e:**
  - Entrenamiento de 4 ejercicios: plegado y desplazamiento automático.
  - "Hacer ahora" con deshacer.
  - Terminar con la oferta de hora, simulando el reloj.
