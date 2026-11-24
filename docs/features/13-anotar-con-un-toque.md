# 13 · Anotar la serie con un toque (y una fila de serie legible y fácil de tocar)

**Estado:** propuesta (ronda 2, 2026-11-22) · **Esfuerzo:** M · **Depende de:** 01 (objetivo para superar),
base común B (mínimo aumento) · **Relacionada con:** 14 (descanso), 16 (errores de tipeo)

## Problema y objetivo

Con una serie al fallo, lo único que no se sabe antes de hacerla son **las reps**. El peso casi siempre es
el del objetivo o el de la vez anterior. Aun así, cada ejercicio cuesta 3 toques o más: tocar el campo,
escribir con el teclado del sistema, tocar ✓. Son ~14 ejercicios por sesión, con las manos sudadas y a
veces con una sola mano.

Además, la fila de serie es difícil de leer y de tocar:
- La sugerencia va en el texto de fondo (placeholder) de los campos, con opacidad 0,6. En modo oscuro
  da un contraste de ~2,5:1. La meta y lo de la vez anterior se ven exactamente igual.
- Los botones miden menos de 44 pt.

Objetivo: **un toque por ejercicio** en el caso normal (hiciste el peso propuesto y anotas las reps),
y una fila que se lea a un metro de distancia y se toque sin errores.

## Evidencia

- **SmartGym 7.11:** agregó un teclado propio con +/− "para no borrar y reescribir".
  https://smartgymapp.com/releases/smartgym-7-11
- **Tablero de Bevel:** 101 votos piden un teclado numérico para el peso y las series. Un usuario cuenta
  que se cambió a Strong a mitad de sesión porque ahí anotar "funciona bien".
  https://feedback.bevel.health/feature-requests/p/use-keypad-for-entering-weight-sets
- **Apple HIG:** zona táctil mínima de 44 × 44 pt. **WCAG 2.5.8** pide 24 px como mínimo (AA) y
  **2.5.5** pide 44 px (AAA). **WCAG 1.4.3** pide un contraste de 4,5:1 para texto con información.
- Contraste medido con los colores de `src/theme.js`: la sugerencia da 2,47:1 en modo oscuro y 1,88:1 en
  modo claro.

## Qué hay hoy en el código

- **Placeholder de la serie:** `src/views/workout/ExerciseBlock.jsx:177`,
  `ph = (prescribed && s.target) || goal || p || s.target`. Se pinta con `opacity: 0.6`
  (`src/views/workout/workout.module.css:240`).
- **✓ en una serie vacía** (`ExerciseBlock.jsx:409-420`): guarda las reps y el peso del placeholder. Si
  hay un objetivo para superar, guarda **el objetivo**. Es un criterio de la feature 01 ("el ✓ en vacío
  guarda 63 × 8"). Con una serie al fallo, las reps reales casi nunca son exactamente las propuestas, así
  que es fácil registrar un "superado" que no ocurrió si se toca ✓ sin escribir.
- **Tamaños actuales** (`workout.module.css`):
  - Botón de tipo de serie: 34 × 34 (`:165`).
  - ✓: 40 × 38 (`:263`).
  - Campos: 38 de alto (`:223`).
  - Menú del ejercicio: 36 (`ExerciseBlock.jsx`, `ActionIcon size={36}`).
  - Chip de descanso: ~22 px.
- **Mínimo aumento:** `prefsOf(id).min_increment` y `nextLoad`/`lowerLoad` en `src/lib/loads.js`
  (base común B).

## Alcance

### Botones de reps

- Bajo la **primera serie pendiente** de cada ejercicio (solo una a la vez) aparece una fila de botones
  de reps centrada en la referencia: `6 · 7 · [8] · 9 · 10`. La referencia es el objetivo para superar
  si existe; si no, las reps de la vez anterior o las de la plantilla. Muestra 5 botones (ref −2 a
  ref +2) más un "…" que abre el teclado.
- **Un toque en un botón:**
  1. Anota esas reps y el peso que se ve (lo escrito, o si no el del placeholder).
  2. Marca ✓.
  3. Empieza el descanso.
  4. Muestra la comparación en vivo, como hoy.
- Hacer las reps del objetivo o más pinta el botón en verde antes de tocarlo, porque supera el 1RM con
  ese peso. Así se ve qué número hay que alcanzar.
- Los botones solo aparecen en ejercicios de **peso × reps** (y lastre/asistido de la feature 04). Los de
  tiempo siguen con su cronómetro.
- Ajuste "Botones de reps" (activado por defecto) en Ajustes → Entrenamiento.

### Peso con − / +

- Al tocar el campo de peso aparecen `−` y `+` a sus lados, con el paso de esa máquina:
  `nextLoad`/`lowerLoad` (base común B), que usa pesos conocidos y respeta `max_load`. Por ejemplo, en
  una máquina con pesos conocidos 86 → 88,3.
- Con barra, el paso es el más chico que se puede armar con los discos configurados.

### ✓ con los campos vacíos

- Se mantiene el comportamiento de 01 (guardar el objetivo), pero se agrega un ajuste **"✓ vacío"**:
  - **"Guarda la propuesta"** (hoy).
  - **"Pide las reps"**: resalta los botones de reps y no guarda nada.
- Por defecto queda **"Pide las reps"** cuando los botones están activos, porque así se anota en un
  toque y el ✓ vacío ya no hace falta. El criterio de 01 sigue valiendo con el ajuste en "Guarda la
  propuesta".

### Fila legible y táctil

- **Placeholder:** sin `opacity`.
  - La **meta** usa el tono `brand-2` (#a6bcfb, ~7,3:1) con peso 600 y una flechita ↑.
  - Lo **anterior** usa `dark-1` (#b8bdc6, ~7,2:1).
  - Lo escrito por ti va en blanco con peso 650.
  - En modo claro se usan los equivalentes con ≥ 4,5:1.
- **Zonas táctiles:**
  - Fila de 48 px, ✓ de 48 × 44, campos de 44 de alto.
  - El botón de tipo de serie se ve de 36 px, pero su zona táctil es de 44 (con `::after` `inset: -4px`).
  - Chip de descanso de 32 px de alto como mínimo.
- **Ícono de ✓ hecho:** blanco sobre `teal-6` da 2,55:1, bajo el 3:1 que pide WCAG 1.4.11. Pasa a
  `teal-8` (3,95:1) o a ícono oscuro sobre `teal-6`.
- **Etiqueta de récord:** pasa de 9 px a 11 px como mínimo.

### Interfaz

```
 1  [ 86   ]  [ 8↑ ]   ✓        ← meta en azul claro, anterior en gris claro
    6   7  [8]  9  10   …       ← 1 toque = anota, ✓ y descanso
```

## Casos borde

- Sin historial ni objetivo: no hay botones (no hay referencia), se usa el teclado como hoy.
- Referencia de 1–3 reps: los botones empiezan en 1 (no hay reps ≤ 0).
- Ejercicio con varias series: los botones van solo en la primera pendiente; al marcarla, pasan a la
  siguiente.
- Calentamientos (`W`) y drops (`D`): sin botones (no son la serie al fallo).
- Serie prescrita por un programa (feature 12, "5+"): los botones se centran en las reps mínimas (5).
- Tocar un botón por error: el ✓ ya desmarca; además se muestra "Deshacer" 4 s.

## Fuera de alcance

- Teclado numérico propio que reemplace al del sistema (más esfuerzo; los botones cubren el caso común).
- Anotar por voz.

## Criterios de aceptación

- [ ] Con objetivo 63 × 8, la fila muestra `6 7 [8] 9 10`; tocar 9 guarda 63 × 9, marca ✓, empieza el
      descanso y pinta la serie de verde en la comparación en vivo.
- [ ] Con el peso escrito a mano (60), tocar 8 guarda 60 × 8, no 63 × 8.
- [ ] Con el ajuste "Pide las reps", tocar ✓ con los campos vacíos no guarda nada y resalta los botones.
      Con "Guarda la propuesta" se comporta como hoy (criterio de 01).
- [ ] `+` en una máquina con pesos conocidos 86 / 88,3 propone 88,3; con `max_load` 86 no sube.
- [ ] Ninguna zona táctil de la fila de serie mide menos de 44 × 44 px (prueba e2e con `boundingBox`).
- [ ] La meta y lo anterior tienen un contraste ≥ 4,5:1 en modo claro y en oscuro, y se distinguen entre
      sí (color y flecha).
- [ ] A 375 px de ancho, la fila no se desarma con peso, reps, RPE y ✓.
- [ ] Desactivar "Botones de reps" deja la fila como hoy, solo con el nuevo contraste y los tamaños.

## Pruebas

- **Unitarias:** referencia de los botones (objetivo, anterior, plantilla, programa) y `±` con pesos
  conocidos y tope.
- **e2e:**
  - Anotar un entrenamiento de 3 ejercicios solo con los botones.
  - Comparar contra el ajuste apagado.
  - Medir zonas táctiles con `boundingBox`.
