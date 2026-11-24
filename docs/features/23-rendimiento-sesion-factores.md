# 23 · Rendimiento de la sesión y qué lo explica

**Estado:** implementada (rama `v0.2-analitica`, 2026-11-24) · **Esfuerzo:** M · **Depende de:** 17 (tendencia
local) · **Relacionada con:** 01 (objetivo para superar), 15 (hora de cada serie)

## Problema y objetivo

Al terminar un entrenamiento solo se ve el volumen contra la vez anterior. El volumen dice poco con una
serie por ejercicio, y la vez anterior también es ruidosa (±2,8 % por sesión). No hay forma de saber:

- si la sesión fue **buena o mala para ti**, separando el progreso normal del día;
- si **algo la explica**: los días de descanso, la hora o el peso corporal.

Objetivo: un **puntaje de la sesión**, y un análisis de factores que **solo afirme un efecto cuando tus
datos lo respaldan**. Si no hay efecto detectable, se dice "sin diferencia detectable"; no se inventan
consejos.

## Evidencia (historial real, en local, sin subirlo)

- 59 sesiones con al menos 3 ejercicios con residuo contra su tendencia local.
- **Días de descanso:** 3+ días +0,7 % [−1,7, +3,7] (n=10); 2 días −0,4 % [−2,9, +1,8] (n=47).
  Sin diferencia detectable.
- **Hora:** la noche daba −1,4 % [−2,9, −0,0] con el intervalo del 95 % sin corregir. Al corregir por
  comparar 3 grupos (Bonferroni) queda en [−3,3, +0,2]: sin diferencia detectable. Sin la corrección,
  la app habría afirmado un efecto que probablemente es azar.
- **Peso corporal:** 1 registro, no se puede analizar.
- **Descanso real entre series:** 0 series con hora. Por eso esta versión empieza a guardarla.
- Distribución de "contra tu tendencia" por sesión: p10 −3,3 %, p50 −0,1 %, p90 +4,5 %.

## Alcance

### Datos

- **Hora de cada serie (`at`):** se guarda al marcar ✓ en el entrenamiento en curso. Desmarcar la
  borra. No viaja a las plantillas.
- **Residuo** de cada sesión de cada ejercicio: `ln(1RM)` menos la recta Theil–Sen de las ±4 sesiones
  vecinas a menos de 35 días, sin contar la propia (`localResiduals`). Es simétrico: no se confunde con
  el progreso, como pasaba con una media móvil causal.

### Puntaje de la sesión (`sessionScore`)

- **Superados, igualados o bajo** la vez anterior, por ejercicio. Solo cuenta si la vez anterior fue
  hace 21 días o menos. Usa el mismo umbral de 0,5 % que la comparación en vivo.
- **Contra tu tendencia:** media de `ln(1RM / esperado)`. Lo esperado es la recta de las 8 sesiones
  anteriores (60 días), sin mirar el futuro y extrapolando como máximo 14 días.
- **Percentil** entre tus sesiones. Desde el percentil 80 es "de tus mejores"; hasta el 20, "más baja
  de lo normal".
- **Dónde se ve:**
  - Resumen del entrenamiento: tarjeta "Rendimiento".
  - Historial: etiqueta "6/15 ↑" (verde si superó al menos la mitad, naranja si más de la mitad quedó
    bajo).

### Qué lo explica (`compareGroups`)

- **Factores:**
  - días desde el entrenamiento anterior (≤1, 2, 3+);
  - hora (mañana < 12, tarde < 18, noche);
  - peso corporal en las últimas 2 semanas (bajando, estable o subiendo, ±0,3 kg; requiere 4 registros);
  - descanso antes del ejercicio (< 2, 2–3, > 3 min; desde la hora de las series).
- **Efecto:** media del grupo menos la media del resto, con intervalo bootstrap (1.000 remuestreos,
  semilla fija) al 95 %, **corregido por la cantidad de grupos comparados**. Se afirma solo si el
  intervalo no cruza 0 y el efecto es de al menos 0,5 %. Con menos de 6 sesiones en el grupo, "pocos
  datos" (15 para el descanso, que es por ejercicio).
- **En la tarjeta de la sesión:** los factores de ese día que tienen un efecto real ("Hora del día:
  noche. En tu historial rindes −1,8 %"). Si ninguno lo tiene, se lista lo medido y se dice que no
  cambia tu rendimiento de forma detectable.
- **Perfil → Análisis:** tarjeta "¿Qué explica tu rendimiento?" con cada grupo, su efecto, intervalo y
  veredicto.

## Casos borde

- Sesión con menos de 3 ejercicios con residuo: no entra al análisis de factores, pero sí tiene puntaje.
- Primera sesión de un ejercicio: no suma a superados, igualados ni bajo.
- Ejercicios de tiempo: fuera.
- Series sin hora (todo lo anterior a esta versión): el factor de descanso dice que se mide desde ahora.

## Fuera de alcance

- Sueño, estrés o comida (no se registran).
- Cambiar el objetivo para superar según un factor. Solo el orden (24) tiene un aviso en vivo.

## Criterios de aceptación

- [x] Un efecto sintético de −3 % en un grupo se detecta como "peor". Un factor de puro ruido da "Sin
      diferencia detectable". Un grupo de 4 da "Pocos datos" (test).
- [x] Puntaje: superados, igualados y bajo; "contra lo esperado" negativo si rindió menos (test).
- [x] Al terminar, el resumen muestra "Rendimiento". El historial muestra la etiqueta. Las series
      guardan `at` (e2e).
- [x] Con el historial real, ningún factor se afirma (todos los intervalos corregidos cruzan 0).

## Pruebas

- `test/analytics.test.js`: puntaje, percentil y factores.
- e2e "análisis": tarjeta de factores, puntaje en el resumen, etiqueta en el historial, hora de la serie.
