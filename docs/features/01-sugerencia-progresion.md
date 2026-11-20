# 01 · Sugerencia de progresión (superar el 1RM estimado)

**Estado:** implementada en v0.0.6 · **Esfuerzo:** M · **Depende de:** base común A (preferencias por ejercicio) y B (cargas posibles)
· **Relacionada con:** 06 (reinicio), 12

## Problema y objetivo

Con una sola serie al fallo por ejercicio, cada sesión es un intento de **superar la vez anterior**. Hoy
la columna "Anterior" muestra lo que hiciste y la comparación en vivo colorea el resultado por 1RM
estimado, pero el objetivo concreto ("¿cuántas reps necesito con este peso para mejorar?", "¿y si subo
a la siguiente placa?") queda en tu cabeza, y con pesos de máquina irregulares (14,7, 16,2, 86 kg) la
cuenta no es obvia.

El objetivo: en cada ejercicio, la app muestra **el objetivo para superar tu 1RM estimado**, con el mismo
peso y con el siguiente peso posible, y el ✓ autocompleta el que corresponda.

## Evidencia

- Lo más pedido en todos los ángulos investigados: 678 votos en Bevel ("automated progressive overload",
  estado *Planned*) y 1.100 en Caliber ("adaptive weight suggestions", *In Progress*).
  https://feedback.bevel.health/feature-requests/p/automated-progressive-overload-for-workouts ·
  https://feedback.caliberstrong.com
- Strong no lo tiene. En Hevy solo existe dentro de "Hevy Trainer" (de pago) y para planes generados por
  Hevy. Reseñas de ambas piden progresión automática en rutinas propias.
- Referencias: Alpha Progression (objetivo por serie, sugiere más reps cuando el siguiente peso es un
  salto muy grande, "no te pide recargar la barra por una mejora teórica insignificante"), Hevy Trainer,
  Liftosaur `dp()`, Boostcamp.
  https://alphaprogression.com/en/blog/alpha-progression-guide · https://www.hevyapp.com/features/workout-plan-generator/ ·
  https://www.liftosaur.com/doc/liftoscript · https://www.boostcamp.app/features/auto-progression
- Quejas a evitar: Fitbod ("cuando espero subir peso me da una serie de 15 reps"), MacroFactor (cargas
  imposibles; reps altísimas cuando el salto de carga es grande).
  https://dr-muscle.com/fitbod-app-review-alternative/ ·
  https://help.macrofactorapp.com/en/articles/392-why-am-i-being-recommended-very-high-reps

## Qué hay hoy en el código

- `e1rm()` (Brzycki) en `src/lib/stats.js`. `setFeedback()` (`src/lib/workout.js`) ya compara cada serie por
  1RM estimado: verde si supera la vez anterior en más de 0,5 %.
- Al empezar desde una plantilla, cada serie trae `target: { weight, reps }` copiado de la plantilla; el
  campo vacío lo muestra como placeholder y el ✓ autocompleta con lo anterior o el objetivo.

## Alcance

### Regla principal: superar el 1RM (por defecto en todos los ejercicios con peso)

**Referencia:** la mejor serie efectiva (`isWorking`; tipos `N` y `F`) de la **última sesión** de ese
ejercicio, con su 1RM estimado `E`. Por defecto se usa la última sesión en cualquier entrenamiento;
un ajuste por ejercicio permite usar solo la misma plantilla.

**"Superar"** = 1RM estimado mayor que `E × 1,005`, el mismo umbral con que la comparación en vivo
pinta verde.

Para un peso `W`, las reps necesarias son el menor `r` con `e1rm(W, r) > E × 1,005`.

La app calcula dos opciones:

| Opción | Peso | Reps |
|---|---|---|
| **Mismo peso** | `W` de la referencia | reps necesarias con `W` |
| **Subir peso** | `nextLoad(W)` (base común B: siguiente peso conocido o `W` + mínimo aumento) | reps necesarias con ese peso |

**Cuál se propone como principal** (la que autocompleta el ✓):
1. Si las reps necesarias con el mismo peso superan `rep_max` del ejercicio (por defecto 12) → **subir peso**.
2. Si no → **mismo peso**.
3. Si `W` ya está en `max_load` (tope de la máquina) → solo **mismo peso**, y si las reps necesarias
   superan `rep_max`, la línea lo dice: "Estás en el tope de la máquina".

**Primera vez** (sin historial): sin sugerencia; se usa el objetivo de la plantilla.

**Vuelta después de una pausa:** si la última sesión del ejercicio fue hace 14 días o más, el objetivo
pasa a **igualar** (no superar) `E` con `lowerLoad(W, 10 %)`, y la línea dice "vuelta después de una
pausa". Es la misma idea del reinicio (06): menos peso, más reps, mismo esfuerzo.

**Ejercicios sin peso** (reps solas): objetivo = reps de la vez anterior + 1.

**Varias series** (el 3 % de los casos, o ejercicios con 2 series): la regla se aplica a la primera serie
efectiva; las demás muestran su "Anterior" como hoy.

### Ejemplos (calculados con la fórmula de la app)

| Vez anterior | Mismo peso | Subir peso | Se propone |
|---|---|---|---|
| Lat Pulldown 77 × 11 (mínimo aumento 5) | 77 × 12 | 82 × 10 | 77 × 12 |
| Chest Press 63 × 7 (mínimo aumento 2) | 63 × 8 | 65 × 7 | 63 × 8 |
| Curl con mancuerna 18 × 12 (mínimo aumento 2) | 18 × 13 | 20 × 10 | **20 × 10** (13 > 12) |
| Chest Fly 86 × 6, tope de la máquina 86 | 86 × 7 | — | 86 × 7 |
| Barra 60 × 10 (discos hasta 1,25) | 60 × 11 | 62,5 × 10 | 60 × 11 |

### Interfaz

- Bajo el nombre del ejercicio, una línea: **"Para superar: 63 × 8 · o 65 × 7"**, con la opción principal
  primero. Tocar la otra opción la vuelve principal en esa sesión (cambia el placeholder y el ✓).
- El placeholder de la serie muestra la opción principal y el ✓ la autocompleta (igual que hoy con el
  objetivo de la plantilla).
- Al marcar la serie, la comparación en vivo sigue igual (verde, gris, naranja, récord).
- La calculadora de discos se abre con el peso propuesto.
- **Ajustes del ejercicio** (ficha → "Ajustes del ejercicio"): mínimo aumento, tope de la máquina,
  `rep_max` ("Subir peso cuando pases de N reps") y "Comparar solo con la misma plantilla".
- Ajuste general en Perfil: "Mostrar objetivo para superar" (activado por defecto).

### Datos

- Usa `exercise_prefs` (`min_increment`, `max_load`, `rep_max`). Sin cambios en plantillas.
- Serie del entrenamiento: `target` pasa a incluir `source: 'plantilla' | 'superar' | 'pausa'` y la
  alternativa elegida, para mostrar el motivo y poder auditarlo.
- Cálculo en un módulo puro nuevo, `src/lib/progression.js` (sin DOM), con tests.

## Casos borde

- Brzycki pierde precisión sobre 12–15 reps; por eso `rep_max` por defecto es 12 y la opción "mismo
  peso" nunca propone más de 15 reps (si haría falta más, se propone subir peso).
- Peso conocido raro en el historial (una sesión en otra máquina): `nextLoad` puede proponerlo; se puede
  corregir fijando el mínimo aumento y, si molesta, borrando o editando esa sesión.
- La sugerencia se calcula al **empezar** el entrenamiento; si se edita el historial a mitad, no cambia.
- Entrenamiento vacío o repetido desde el historial: también muestra el objetivo (no depende de la plantilla).
- Ejercicios por tiempo (04): fuera de esta regla.

## Fuera de alcance

- Doble progresión con varias series y rango de reps por plantilla (no calza con una serie por ejercicio;
  se puede agregar después si cambia la forma de entrenar).
- Autorregulación por RPE/RIR (no se registra RPE).
- Programas por porcentaje (12).

## Criterios de aceptación

- [ ] Con la vez anterior Chest Press 63 × 7 y mínimo aumento 2, la línea dice "Para superar: 63 × 8 · o 65 × 7",
      el placeholder muestra 63 × 8 y el ✓ en vacío guarda 63 × 8.
- [ ] Curl con mancuerna 18 × 12 propone 20 × 10 como principal, porque 18 × 13 pasa de 12 reps.
- [ ] Con tope de máquina 86 y vez anterior 86 × 6, solo aparece 86 × 7.
- [ ] Con pesos conocidos 14,7 / 16,2 y vez anterior 14,7 × 12, la opción de subir usa 16,2 kg (no 14,7 + mínimo aumento).
- [ ] Tocar la opción alternativa la vuelve principal en esa sesión.
- [ ] Hacer exactamente las reps propuestas pinta la serie de verde en la comparación en vivo
      (la regla y la comparación usan el mismo umbral).
- [ ] Ninguna propuesta pasa de 15 reps ni del tope de la máquina.
- [ ] Sin historial del ejercicio no aparece la línea y se usa el objetivo de la plantilla.
- [ ] Última sesión hace 20 días con 63 × 7 (pesos conocidos 57 y 63) → propone igualar con 57 × 10 y dice
      "vuelta después de una pausa".
- [ ] Desactivar "Mostrar objetivo para superar" deja la app exactamente como hoy (test de regresión e2e).
- [ ] Las series de calentamiento y drop sets no se usan como referencia.
- [ ] Funciona sin conexión.

## Notas de implementación (v0.0.6)

- El objetivo se calcula mientras el entrenamiento está en curso, contra el historial sin ese
  entrenamiento; en la práctica es lo mismo que calcularlo al empezar.
- La pregunta del mínimo aumento es un enlace bajo la línea ("¿Cuánto es lo mínimo que puedes
  subirle?") en máquinas, poleas y otros sin mínimo aumento definido. No es una ventana emergente
  para no interrumpir la serie; desaparece al guardarlo.
- La elección de la otra opción se guarda en el ejercicio del entrenamiento (`goal_alt: true`); al
  marcar la serie, `target` guarda `{ weight, reps, source }`.

## Pruebas

- Unitarias (`test/progression.test.js`): cada fila de la tabla de ejemplos, tope de máquina, pesos
  conocidos, límite de 15 reps, pausa, sin peso, sin historial.
- e2e: dos entrenamientos con el mismo ejercicio; en el tercero, revisar la línea, el placeholder y que ✓
  guarde la opción principal.
