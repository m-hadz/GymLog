# 26 · Metas por ejercicio con fecha estimada

**Estado:** implementada (rama `v0.2-analitica`, 2026-11-24) · **Esfuerzo:** S–M · **Depende de:** 17
(ritmo), 25 (fórmula)

## Problema y objetivo

"Quiero hacer 80 kg × 8 en press": hoy no hay dónde anotarlo ni forma de saber si es realista. Con el
ritmo (17) se puede estimar **cuándo**, con un **rango honesto**, y decir que no llega si el ritmo es
plano.

## Alcance

### Cálculo (`src/lib/goals.js`, puro)

- La meta se guarda como **peso × reps**. Su 1RM se recalcula con la fórmula vigente (25).
- **Meses que faltan** = `ln(meta / tendencia actual) / ln(1 + ritmo)`, con el ritmo en %/mes de 17. El
  rango de fechas sale del intervalo del ritmo: la fecha temprana del límite alto y la tardía del bajo.
- **Estados:**
  - **lograda:** el mejor 1RM desde que se creó la meta la alcanza.
  - **en camino:** hay fecha; si la tendencia ya llegó, "puede salir en cualquier sesión".
  - **plana:** con un ritmo menor a 0,3 %/mes, o más de 24 meses, no se da fecha y se dice cuánto
    falta.
  - **pocos:** sin ritmo medido.
- **Meta sugerida:** la tendencia proyectada 2 meses a tu ritmo (mínimo +1 %/mes), expresada a tus
  reps de la última sesión y redondeada a 0,5 kg hacia arriba.

### Datos y lógica (`src/lib/insights.js`)

- Las metas viven en `user_settings.data.goals`: `{id, ex, weight, reps, target, start, created,
  done_at, done_wid}`. Viajan con la cuenta, sin tabla nueva. Hay una meta abierta por ejercicio.
- Al guardar un entrenamiento (en curso, editado o pasado), `checkGoals` marca como logradas las que se
  alcanzaron, con el entrenamiento que las logró.

### Interfaz

- **Ficha → Gráficas, tarjeta "Ritmo de progreso":** "Poner una meta" abre la hoja con la sugerida, que
  muestra el 1RM de la meta y cuánto está sobre tu tendencia. Con una meta: barra de avance, la fecha
  estimada con su rango, y "Quitar". Debajo, las últimas logradas.
- **Resumen al terminar:** "Meta lograda: …" en la tarjeta de rendimiento.
- **Perfil → Análisis → Metas:** abiertas, con su avance y la fecha o el estado; y las logradas.
- **Resumen mensual y anual:** las metas logradas en el periodo, en la sección "Fuerza".
- Solo para ejercicios de peso y reps: con lastre o asistidos, la carga efectiva haría confuso el peso.

## Casos borde

- Si cambia la fórmula (25), el 1RM de la meta se recalcula. La meta sigue siendo peso × reps.
- Meta por debajo de la tendencia: "en camino" con 0 meses ("puede salir en cualquier sesión").
- Borrar el entrenamiento que la logró no la desmarca.

## Criterios de aceptación

- [x] Con ritmo de 4 %/mes [2, 8] y meta un 10 % arriba: meses = ln 1,1 / ln 1,04, y la fecha queda
      dentro del rango. Con 0,1 %/mes: "plana". Con el mejor sobre la meta: "lograda" (test).
- [x] Poner una meta 75 × 8 muestra la fecha estimada. Un entrenamiento con 77,5 × 8 la marca lograda,
      y se ve en el resumen (e2e).

## Pruebas

- `test/analytics.test.js`: "metas".
- e2e "análisis": crear la meta, fecha, lograrla.
