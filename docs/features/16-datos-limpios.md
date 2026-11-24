# 16 · Datos limpios: errores de tipeo, cambio de máquina y deshacer

**Estado:** propuesta (ronda 2, 2026-11-22) · **Esfuerzo:** S–M · **Depende de:** base común A
(`exercise_prefs`) · **Relacionada con:** 01, 06, 17 (todo lo que usa el 1RM de la serie)

## Problema y objetivo

Con una sola serie por ejercicio, **un dato malo contamina todo**:
- **Un error de tipeo.** Escribir 865 en vez de 86,5 se marca como récord (`setFeedback` lo da por
  `pr`). Desde ahí la sugerencia de progresión (01), el estancamiento (06) y cualquier tendencia (17) se
  calculan sobre un 1RM imposible.
- **Cambiar de máquina sin cambiar el ejercicio.** Pasa por un gimnasio distinto, una máquina reemplazada
  o un ajuste de pines. Los 1RM dejan de ser comparables y hoy la única salida es editar el historial a
  mano. Ya lo reconoce el caso borde del doc 06.
- **"Eliminar serie" no tiene deshacer**, a diferencia de "Quitar ejercicio".

Objetivo: **frenar el error antes de que se guarde**, poder decir "esta es otra máquina" sin perder el
historial, y deshacer cualquier borrado.

## Evidencia

- **Hevy:** dedica una página de ayuda a revisar si un récord es real.
  https://help.hevyapp.com/hc/en-us/articles/38279531346455
- **Pesos irregulares:** son muy variables (14,7, 16,2, 86 kg) y hay 38 ejercicios propios. Un decimal
  mal puesto es fácil.
- **Ruido de una serie:** una rep de más o de menos a 7–8 reps mueve el 1RM de Brzycki ±3,4 %. Por eso
  un salto de más de 12–15 % no es progreso normal entre sesiones.

## Qué hay hoy en el código

- **Feedback de la serie:** `setFeedback` en `src/lib/workout.js` (comparación en vivo y récord). Se
  llama desde `toggle` en `src/views/workout/ExerciseBlock.jsx:415`.
- **Aviso de récord:** `notify.record` (`ExerciseBlock.jsx:419`).
- **Eliminar serie:** `onDelete={() => update((d) => { d.exercises[ei].sets.splice(si, 1); })}`
  (`ExerciseBlock.jsx:195`), sin deshacer. Quitar un ejercicio sí usa `notify.undo`.
- **Datos que comparan sesiones:**
  - Récords: `src/lib/stats.js`.
  - Sugerencia: `src/lib/progression.js`.
  - Estancamiento: `src/lib/stalls.js` y `progression.js`.
  - Resumen: `src/lib/report.js`.

## Alcance

### Confirmar un valor raro al marcar ✓

- Al marcar una serie efectiva, se compara con la referencia: la mejor serie efectiva de la última
  sesión, o la tendencia de la feature 17 si existe. Se pide confirmación si se cumple alguna de estas:
  - el **peso** es ≥ 1,5 × o ≤ 0,5 × el de la referencia;
  - el **1RM estimado** sube más de un 15 %.
- La confirmación va **en la misma fila**, sin diálogo:
  **"¿86,5 o 865?"** `[86,5]` `[865 es correcto]`.
  - Si hay un decimal probable (÷10), se ofrece directo.
  - Si no, solo "¿Es correcto? Sí / Corregir".
- Hasta confirmar, la serie queda marcada pero **sin** récord ni aviso de récord.
- No bloquea: si no se responde, al terminar se guarda tal cual y la confirmación queda en el resumen.

### Otra máquina: tramos

- La hoja de confirmación ofrece una tercera opción, **"Otra máquina"**, también disponible en la ficha
  del ejercicio como "Empezar un tramo nuevo desde hoy".
- Se guarda en `exercise_prefs.segments`: lista de fechas ISO donde empieza un tramo.
- Récords, objetivo para superar (01), estancamiento (06), tendencias (17) y "Anterior" **no comparan
  sesiones de tramos distintos**. Para la primera sesión del tramo nuevo, el objetivo es "repetir" con
  las reps de la vez anterior y sin peso.
- **Ficha del ejercicio:**
  - El gráfico muestra los tramos con un corte vertical.
  - Récords por tramo, y el récord "de siempre" con su fecha.
- Se puede borrar un corte desde la ficha.

### Deshacer al eliminar una serie

- "Eliminar serie" usa `notify.undo` 5 s, igual que quitar un ejercicio.

### Datos

```sql
alter table exercise_prefs add column if not exists segments text[]; -- 16: inicio de cada tramo (ISO)
```

## Casos borde

- **Primera sesión de un ejercicio:** no hay referencia y no se confirma nada.
- **Saltos legítimos grandes:** al volver de una pausa o con pocas sesiones, se confirma una vez.
  Responder "Es correcto" no vuelve a preguntar por ese mismo valor en ese ejercicio.
- **Ejercicios de tiempo:** se compara el tiempo con los mismos umbrales.
- **Peso corporal, lastre y asistido (04):** se compara la carga efectiva.
- **Series de calentamiento y drop:** no se revisan.
- **Tramo nuevo con un programa activo (12):** el máximo de entrenamiento no cambia solo; se avisa
  "¿Cambiar también el máximo?".

## Fuera de alcance

- Detectar errores en el historial ya guardado (un asistente de "revisar valores raros" queda para
  después).
- Unir dos ejercicios distintos en uno.

## Criterios de aceptación

- [ ] Con la vez anterior 86 × 8, escribir 865 y marcar ✓ muestra "¿86,5 o 865?". Elegir 86,5 corrige la
      serie, y no hay aviso de récord con 865.
- [ ] Un 1RM 10 % mayor que la referencia no pide confirmación; uno 20 % mayor sí.
- [ ] "Otra máquina" agrega un corte, y desde ahí "Anterior", el objetivo, los récords y el
      estancamiento ignoran las sesiones previas del ejercicio. El gráfico de la ficha muestra el corte.
- [ ] Borrar el corte desde la ficha vuelve todo como antes.
- [ ] "Eliminar serie" tiene deshacer y restaura la serie en su lugar.
- [ ] `segments` se sincroniza a otro dispositivo y entra en el respaldo JSON.

## Pruebas

- **Unitarias:**
  - `suspicious(set, ref)` con peso, decimal y 1RM.
  - `sessionsInSegment(sessions, segments, date)`.
  - Récords y objetivo con tramos.
- **e2e:**
  - Tipeo con corrección.
  - Corte "otra máquina" y su efecto en "Anterior".
  - Deshacer al eliminar serie.
