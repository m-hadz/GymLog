# 25 · Fórmula personal reps → 1RM

**Estado:** implementada (rama `v0.2-analitica`, 2026-11-24) · **Esfuerzo:** M · **Depende de:** 17
(tendencia local) · **Relacionada con:** 01, 06, 26 (todo lo que usa el 1RM estimado)

## Problema y objetivo

Toda la app decide con el 1RM estimado de Brzycki: récords, objetivo para superar, reinicio,
comparación en vivo, tendencias y metas. Brzycki supone que todos rinden igual a 3 que a 12 reps, pero
la resistencia varía entre personas. Si para ti 10 reps "valen" más que 5, la app te pide subir de
reps cuando en realidad estás igual, y premia hacer más reps con menos peso.

Objetivo: **medir el sesgo de Brzycki en tus datos** y corregirlo solo si es real.

## Evidencia (historial real, en local)

Residuo de Brzycki contra la tendencia local de cada ejercicio, por rango de reps:

| Reps | Sesiones | Brzycki vs tendencia |
|---|---|---|
| 1–5 | 161 | −1,0 % |
| 6–8 | 466 | −0,05 % |
| 9–12 | 131 | +1,9 % |
| 13–15 | 4 | +11,8 % |

- Pendiente **β = 0,68 % por rep** [0,49, 0,85] (bootstrap del 90 %), alrededor de 7 reps. Con muchas
  reps, Brzycki te sobreestima.
- Ejemplo: 57 × 10 da 76,0 kg con Brzycki y **74,5** con la fórmula personal; 63 × 7 da 75,6 con
  las dos. El reinicio 57 × 10 de la feature 06 quedaba "por encima" de 63 × 7 solo por la fórmula.

## Alcance

### Modelo (`src/lib/repmodel.js`, puro)

- `e1rm = Brzycki × exp(−β · (reps − R0))`. R0 es la mediana de tus reps, así que tus valores
  habituales casi no cambian.
- **Calibración:**
  - mejor serie por sesión (sin drop sets, hasta 15 reps);
  - residuo contra la tendencia local;
  - se descartan los residuos a más de 4 MAD;
  - pendiente por mínimos cuadrados centrada;
  - intervalo bootstrap del 90 % (300 remuestreos, semilla fija).
- **Se usa solo si:**
  - hay al menos 60 residuos, 15 con ≤ 5 reps y 15 con ≥ 9;
  - el intervalo no cruza 0;
  - |β| ≥ 0,2 %/rep.
- β se limita a ±1,5 %/rep. Si no hay confianza, el factor es 1 (Brzycki puro).

### Aplicación (`src/lib/stats.js`, `src/lib/effective.js`)

- `brzycki()` es la fórmula pura. `e1rm()` multiplica por el ajuste vigente (`setRepAdjust`) y nunca
  devuelve menos que el peso levantado. `weightForReps()` es su inverso exacto.
- `effective.js` calibra el modelo al calcular los entrenamientos con carga efectiva, y lo memoriza con
  la misma clave más el ajuste. Mientras calibra usa Brzycki puro, para no ser circular.
- Con eso, sin tocar cada pantalla, usan la fórmula personal:
  - récords;
  - objetivo para superar y reinicio;
  - comparación ✓ en vivo;
  - tendencias, índice y metas.
- **Ajuste sincronizado** (`user_settings.data.formula`): `auto` (por defecto: la tuya si es confiable)
  u `off` (siempre Brzycki).

### Interfaz

- **Perfil → Análisis → "Tu fórmula de reps → 1RM":**
  - el sesgo en palabras, con su intervalo;
  - la tabla por rango de reps;
  - un ejemplo con 100 kg;
  - el interruptor.
- **Ficha → Gráficas:** "1RM estimado con tu fórmula personal" cuando está en uso.

## Casos borde

- **Pocos datos de un extremo** (por ejemplo, nunca bajas de 6 reps): "pocos", con los conteos.
- **1 rep:** el 1RM es el peso, sin ajuste.
- **Récords históricos:** se recalculan con la fórmula vigente, así que un récord puede cambiar de
  sesión al activarla. Es intencional: compara con la misma vara.

## Criterios de aceptación

- [x] Con un sesgo sintético de 0,7 %/rep, β se recupera con ±0,3 % y con confianza. Sin sesgo, no hay
      confianza y el factor es 1 (test).
- [x] `weightForReps(e1rm(w, r), r) = w` con ajuste, y `e1rm(w, r) ≥ w` (test).
- [x] El interruptor se sincroniza (e2e).
- [x] Con el historial real: β = 0,68 %/rep con confianza.

## Pruebas

- `test/analytics.test.js`: "fórmula personal" y "e1rm con ajuste".
- e2e "análisis": interruptor de la fórmula.
