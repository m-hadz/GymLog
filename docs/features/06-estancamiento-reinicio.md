# 06 · Estancamiento y reinicio (menos peso, más reps, mismo esfuerzo)

**Estado:** implementada en v0.0.9 · **Esfuerzo:** S · **Depende de:** 01 (usa su cálculo de "superar") y base común B
· **Relacionada con:** 10 (reemplazar ejercicio)

## Problema y objetivo

Con 14 ejercicios por sesión es fácil no notar que uno lleva semanas en el mismo 63 × 6–7. La respuesta
a un estancamiento en esta forma de entrenar **no** es una semana de descarga ni rendir menos: es bajar
el peso un porcentaje y hacer más reps al mismo esfuerzo (0–1 RIR), buscando igualmente superar el 1RM
estimado. El objetivo:
1. detectar los ejercicios estancados con una regla que no dé falsas alarmas con una serie al fallo;
2. proponer el **reinicio** (peso − X %, reps para superar el 1RM) en un toque.

## Evidencia

- Pocas apps grandes lo traen integrado (Strong, Hevy y Setgraph no tienen avisos de estancamiento).
  Tillen avisa tras 3 sesiones sin subir y ofrece bajar al 90 %; Dr. Muscle sugiere bajar el peso si cae
  el 1RM; servicios pagados que leen los datos de Hevy venden "detecta cuando el progreso se estanca".
  https://tillen-marketing.pages.dev/docs/stall-detected · https://dr-muscle.com/deload/ ·
  https://www.athletedata.health/integrations/hevy
- **Calibración con el historial real** (59 entrenamientos, una serie al fallo por ejercicio):

  | Regla | Ventanas marcadas | Hoy marcaría |
  |---|---|---|
  | 3 sesiones sin superar a la anterior (la de Tillen) | 34 % | ~4 por sesión: demasiado ruido |
  | Sin récord histórico de 1RM en 10 sesiones | 27 % | 10, incluido Lat Pulldown, que está progresando (77 × 8 → 11) |
  | **Promedio de las últimas 6 sesiones ≤ promedio de las 6 anteriores + 1 %** | 30 % | **7**, todos estancados de verdad |

  Los 7 de la regla elegida: Chest Press (Machine) 63 × 6–7 en las 6; Chest Fly 86 × 5–6; Leg Extension
  (Machine) 90 × 4; Shoulder Press (Machine) 45 × 6–7; Unilateral Leg Extension 41 × 6–7; Reverse Curl
  (Barbell) 20 × 9–12; Lat Pulldown (Cable) 59–61 × 4–7. No marca Lat Pulldown (Machine).

## Qué hay hoy en el código

- 1RM estimado por sesión (`exerciseSessions().bestE1rm`, `src/lib/stats.js`).
- La comparación en vivo y los récords ya comparan por 1RM estimado, así que una sesión de reinicio con
  menos peso y más reps se compara de forma justa: **no hace falta marcarla ni excluirla de nada**.

## Alcance

### Detección

Para cada ejercicio con peso, con sus sesiones ordenadas (mejor 1RM estimado de cada sesión):
- Se necesitan al menos **12 sesiones** y que la última sea de los últimos 21 días (si no, aplica la
  regla de pausa de 01).
- **Estancado** si el promedio del 1RM de las **últimas 6** no supera en más de **1 %** al promedio de las
  **6 anteriores**.
- Los parámetros (6 sesiones, 1 %) quedan como constantes en un solo lugar para poder ajustarlos.
- Ejercicios sin peso: lo mismo con las reps. Ejercicios por tiempo: no se evalúan.

### Reinicio

- Peso del reinicio = `lowerLoad(W, X %)` (base común B), con `W` = peso de la última sesión y
  **X = 10 % por defecto** (ajuste general, 5–15 %).
- Reps objetivo = las necesarias para **superar** el 1RM de la última sesión con ese peso (mismo cálculo
  que 01). Si harían falta más de 15 reps, se usa un porcentaje menor (el mayor entre 5 % y 10 % que deje
  el objetivo en 15 reps o menos).
- Ejemplo: Chest Press 63 × 7 (pesos conocidos 57 y 63) → reinicio **57 × 10**.
- El reinicio es una opción más en la línea de 01: "Para superar: 63 × 8 · o 65 × 7 · **reinicio 57 × 10**".
  En un ejercicio estancado, el reinicio pasa a ser la opción principal (autocompleta el ✓); las otras
  siguen a un toque.
- La sesión de reinicio es una sesión normal: cuenta para récords, comparación, volumen y para la
  detección (si supera el 1RM, el ejercicio deja de estar estancado por sí solo).

### Interfaz

- **Entrenamiento en curso:** junto al nombre del ejercicio estancado, una etiqueta "Estancado". Tocarla
  abre una hoja con las últimas 12 sesiones (minigráfico), el reinicio propuesto y las acciones:
  "Usar reinicio" (por defecto ya está), "Probar otro ejercicio" (abre 10, reemplazar) e
  "Ignorar por 7 sesiones".
- **Perfil → Progreso:** tarjeta "Estancados (7)" con la lista; cada fila abre la ficha del ejercicio.
- **Ficha del ejercicio:** etiqueta "Estancado desde el 3 nov" sobre el gráfico de 1RM.
- **Tope de la máquina:** si el ejercicio está en su `max_load` (01) y estancado, la hoja lo dice y
  sugiere también "Probar otro ejercicio" o la versión unilateral.

### Datos

- Sin cambios de esquema. "Ignorar por 7 sesiones" se guarda por ejercicio en `exercise_prefs`
  (campo `stall_snooze_until` con la fecha de la sesión desde la que vuelve a evaluarse).
- Funciones puras en `src/lib/progression.js`: `stallStatus(sessions)` y `resetTarget(lastSet, exercise, pct)`.

## Casos borde

- Ejercicio nuevo o que se hace poco: menos de 12 sesiones → no se evalúa.
- Cambiar de máquina sin cambiar el ejercicio en la app: los 1RM no son comparables; la solución es
  usar otro ejercicio (o editar el historial).
- Reinicio que no alcanza el objetivo: es una sesión normal; la siguiente vuelve a calcular objetivos
  desde ella.

## Fuera de alcance

- Semanas de descarga, sesiones "livianas" y marcas de descarga (no calzan con esta forma de entrenar).
- Detectar fatiga general.

## Criterios de aceptación

- [ ] `stallStatus` marca estancado con promedios 75,6 / 75,6 y no lo marca si las últimas 6 promedian 1,5 %
      más (tests con series sintéticas).
- [ ] Con menos de 12 sesiones, o la última hace más de 21 días, no se marca.
- [ ] Corrido localmente contra el historial real de noviembre 2026 (sin subir esos datos al repo),
      marca los 7 ejercicios listados arriba y **no** marca Lat Pulldown (Machine).
- [ ] En un ejercicio estancado, la línea muestra el reinicio como opción principal y el ✓ lo guarda.
- [ ] Chest Press 63 × 7 con pesos conocidos 57 y 63 propone reinicio 57 × 10.
- [ ] Si el reinicio necesitaría más de 15 reps, se usa un porcentaje menor y el objetivo queda en 15 o menos.
- [ ] Hacer el reinicio y superar el 1RM pinta la serie de verde y, con suficientes sesiones, el
      ejercicio sale de la lista de estancados sin hacer nada más.
- [ ] "Ignorar por 7 sesiones" oculta la etiqueta de ese ejercicio durante 7 sesiones y se sincroniza.
- [ ] La tarjeta "Estancados" del perfil lista los mismos ejercicios que las etiquetas.
- [ ] El porcentaje del reinicio se puede cambiar en Ajustes (5–15 %).

## Notas de implementación (v0.0.9)

- `stallStatus` y `resetTarget` en `src/lib/progression.js` (constantes `STALL_*` y `RESET_*` al inicio de
  esa sección); `suggest({ stalled, resetPct })` agrega `reset`. `src/lib/stalls.js` calcula el estado de
  todos los ejercicios sobre la carga efectiva (04/05), cacheado; hook `useStalls()`.
- Línea del objetivo con tres opciones (reinicio, principal, alternativa); la elegida se guarda en
  `exercises[].goal_pick` (reemplaza a `goal_alt`, que se sigue leyendo). El ✓ guarda `target.source = 'reinicio'`.
- "Ignorar por 7 sesiones" guarda en `stall_snooze_until` el `started_at` de la última sesión; vuelve a
  evaluarse después de 7 sesiones más.
- El calentamiento automático de una plantilla usa el peso del reinicio si el ejercicio está estancado.
- "Probar otro ejercicio" queda para la feature 10 (reemplazar ejercicio), que aún no existe.
- Con el historial real al 21 nov 2026 marca 6: Chest Fly, Chest Press (Machine), Lat Pulldown (Cable),
  Leg Extension (Machine), Reverse Curl (Barbell) y Unilateral Leg Extension. Shoulder Press (Machine) y
  Lat Pulldown (Machine) no se hacen desde el 14 oct (más de 21 días): aplica la pausa y no se evalúan.

## Pruebas

- Unitarias: `stallStatus` (umbral, mínimo de sesiones, pausa, sin peso), `resetTarget` (redondeo con pesos
  conocidos, límite de 15 reps).
- Script local (no se sube) que corre la detección sobre el historial real y lista los marcados.
- e2e: con datos sintéticos de 12 sesiones planas, el ejercicio aparece como estancado con el reinicio.
