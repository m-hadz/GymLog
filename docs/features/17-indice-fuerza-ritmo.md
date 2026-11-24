# 17 · Índice de fuerza y ritmo de progreso

**Estado:** implementada (rama `v0.2-analitica`, 2026-11-24; ver "Cómo quedó") · **Esfuerzo:** M · **Depende de:** — (mejor con 16, que limpia
los datos) · **Relacionada con:** 06 (estancamiento), 07 (resumen), 08 (mapa muscular)

## Problema y objetivo

Hoy no se pueden responder estas preguntas:
- **"¿Estoy más fuerte que hace 3 meses, en general?"** El Perfil muestra entrenamientos y volumen por
  semana, y el volumen dice poco con una serie por ejercicio (lo advierte el propio código).
- **"¿Qué ejercicios progresan rápido, cuáles apenas y cuáles van bajando?"** El estancamiento (06) es
  binario: compara 6 sesiones contra 6.
- **"¿Qué músculo o región avanza y cuál no?"** El mapa muscular (08) cuenta series. Con 1 serie ×
  3–4 ejercicios × 3,5 sesiones por semana, el conteo casi no cambia y el mapa queda estático.

Además, cada sesión se ve cruda en los gráficos. Una rep de más o de menos a 7–8 reps mueve el 1RM de
Brzycki **±3,4 %**, más que el umbral para "superar" (0,5 %) y que el de estancamiento (1 %).

Objetivo: una **tendencia** por ejercicio que filtre ese ruido, un **ritmo en %/mes** y un **índice de
fuerza global**, todo calculado en el cliente con lo que ya se guarda.

## Evidencia

- **Caliber, Strength Score:** normaliza por 1RM estimado, se actualiza cada semana y tiene sub-puntajes
  por grupo muscular.
  https://caliberstrong.freshdesk.com/support/solutions/articles/48001257574-strength-score-user-guide
- **Tonal y Boostcamp:** tienen puntajes de fuerza parecidos.
  https://www.tonal.com/blog/level-up-with-tonals-enhanced-strength-score/
- **Tendencia en GymLog:** la feature 03 ya la usa para el peso corporal (`trendSeries` en
  `src/lib/body.js`), por el mismo motivo: un dato suelto es ruido.
- **Theil–Sen:** pendiente robusta. Es la mediana de las pendientes entre pares y aguanta hasta ~29 % de
  valores raros.

## Qué hay hoy en el código

- **1RM de cada sesión por ejercicio:** `exerciseSessions(workouts, exId)` → `bestE1rm`
  (`src/lib/stats.js`), sobre `analysisWorkouts()` (`src/lib/effective.js`), que ya aplica peso
  corporal, por mano, etc.
- **Gráfico de la ficha:** `TrendChart` (`src/charts/charts.jsx`), sin suavizado.
- **Perfil → Progreso:** `src/views/profile/ProgressSection.jsx`.
- **Mapa muscular:** series por grupo (`src/lib/muscles.js`) y por región (`src/lib/regions.js`).
- **Resumen mensual:** `src/lib/report.js` (progreso por ejercicio = primer vs último 1RM del mes).

## Alcance

### Tendencia y ritmo por ejercicio (`src/lib/trend.js`, puro)

- **Tendencia:** media móvil exponencial sobre `ln(1RM)` por sesión, con α ajustado por los días entre
  sesiones (como `trendSeries`).
- **Ritmo:** pendiente de Theil–Sen sobre `ln(1RM)` contra los días, con las últimas 12 sesiones de los
  últimos 120 días. Se pasa a **%/mes**: `(e^(pendiente·30) − 1) × 100`.
- **Requisitos:** al menos **6 sesiones** en la ventana; si no, "pocos datos".
- **Respeta los tramos de la feature 16:** solo usa el tramo actual.

### Índice de fuerza global

- Índice encadenado que parte en **100** en la primera sesión con datos.
- Para cada entrenamiento:
  1. Para cada ejercicio con una sesión previa en los últimos 21 días, se calcula
     `ln(1RM hoy / 1RM tendencia anterior)`.
  2. **Paso del día** = mediana de esos logaritmos. Con menos de 3 ejercicios comparables, el paso es 0.
  3. Índice = índice anterior × e^paso.
- No le afecta que entren o salgan ejercicios ni los pesos irregulares de las máquinas.
- **Dónde se ve:**
  - Perfil → Progreso: gráfico principal con "+6,4 % en 12 semanas".
  - Resumen mensual (07): variación del mes.
  - La imagen para compartir.

### Ritmo por ejercicio y por músculo

- **Ficha del ejercicio:**
  - Línea de tendencia sobre los puntos crudos.
  - "Ritmo: +2,1 %/mes (12 sesiones)".
- **Perfil → "Ritmo por ejercicio":**
  - Lista ordenada con los 3 más rápidos, los 3 más lentos y los que bajan.
  - Tocar uno abre su ficha.
- **Mapa muscular (08):** interruptor **"Series | Progreso"**.
  - En "Progreso", cada grupo o región se pinta con la mediana del ritmo de sus ejercicios en las
    últimas 8 semanas: verde > 1 %/mes, gris entre −0,5 y 1, naranja < −0,5.
  - La hoja del músculo lista sus ejercicios por ritmo.

## Cómo quedó (cambios respecto de la propuesta, por análisis del historial real)

Calibrado en local con el historial real (62 entrenamientos, 2026-07-13 a 2026-11-23, sin subirlo):

- **Ruido medido:** la mediana del error absoluto de una sesión contra su tendencia local es **2,8 %**
  (rms 5,7 %). Confirma que no hay que mirar sesiones sueltas.
- **Paso del índice:** media recortada (10 % por lado) en vez de mediana. Con 3–5 ejercicios por día, la
  mediana descartaba casi toda la información.
- **Fase de aprendizaje:** las **3 primeras sesiones** de cada ejercicio no entran al índice. Sin esto,
  el índice daba +100 % en 4 meses mientras la mediana de los ejercicios subía +26 %: cada ejercicio
  nuevo aporta su subida inicial por técnica, y al rotar ejercicios esas subidas se encadenan. Con 3
  sesiones de aprendizaje queda en +60 %, coherente con la media (no la mediana) de los ritmos.
- **El 100 es el día anterior al primer paso**, no el primer entrenamiento.
- **Rango del ritmo:** intervalo de confianza del 90 % de Theil–Sen (método de Sen, aproximación normal
  de Kendall). El estado ("Subiendo", "Plano", "Bajando") se marca **"incierto"** si el intervalo no lo
  respalda. Además del mínimo de 6 sesiones se exigen **21 días** entre la primera y la última.
- **Dónde se ve:**
  - **Perfil → Análisis** (`#/analysis`, vista diferida): índice con su gráfico, y ranking de ritmos
    con barra e intervalo.
  - **Perfil → Progreso:** una entrada con el índice actual y su variación de 4 y 12 semanas. La de 12
    semanas solo se muestra si el índice tiene esa antigüedad.
  - **Resumen mensual y anual:** sección "Fuerza" con el índice al inicio y al final del periodo.
- **Ficha:** línea de tendencia punteada sobre el 1RM estimado, y tarjeta "Ritmo de progreso".
- **Mapa "Progreso":** mediana del ritmo de los ejercicios del grupo con ritmo medido (últimos 4 meses).
  Hoy es solo por grupo; por región queda pendiente.
- **Tramos de la feature 16:** no aplica todavía, porque 16 no está implementada.
- **Rendimiento:** 2.000 entrenamientos sintéticos → índice, tendencias, ritmos, residuos y fórmula en
  ~140 ms (test).
- **Código:**
  - `src/lib/trend.js`: puro.
  - `src/lib/insights.js`: arma los datos y memoriza.
  - `src/views/AnalysisView.jsx`.
  - `src/views/exercises/ExerciseInsights.jsx`.
  - `src/views/profile/AnalysisCard.jsx`.
  - Modo progreso en `MuscleSection.jsx`.
- **Tests:** `test/analytics.test.js` y la e2e "análisis".

## Casos borde

- Ejercicio sin peso (peso corporal sin registro): se usa la carga efectiva; si no hay, reps.
- Ejercicios de tiempo: fuera del índice.
- Pausa larga (> 21 días): el índice no avanza esos días (no hay pasos), sin saltos.
- Región con un solo ejercicio: se indica "1 ejercicio" para no sobreinterpretar.
- Pocas sesiones al principio del historial: el índice parte cuando haya 3 ejercicios comparables.

## Fuera de alcance

- Fecha estimada para metas por ejercicio: es la feature 26.
- Comparar con otras personas o con estándares de fuerza.

## Criterios de aceptación

- [x] Una serie sintética que sube 2 %/mes con ruido de ±3 % da un ritmo de 2 ± 0,5 %/mes (test).
- [x] Un valor raro aislado (+30 %) casi no mueve el ritmo (Theil–Sen) ni la tendencia (test).
- [x] Con todos los ejercicios subiendo 1 % por sesión, el índice sube ~1 % por sesión. Agregar o quitar
      un ejercicio a mitad de periodo no produce un salto (test).
- [x] La ficha muestra la tendencia y el ritmo. Con menos de 6 sesiones dice "pocos datos".
- [x] El mapa en modo "Progreso" pinta en verde un grupo cuyos ejercicios suben más de 1 %/mes.
- [x] Con 2.000 entrenamientos de prueba, el índice y los ritmos se calculan en menos de 150 ms.
- [x] Corrido en local contra el historial real (sin subirlo al repo): 21 ejercicios con ritmo (13
      subiendo, 5 planos, 3 bajando), con mediana de +6 %/mes. En la e2e, el ejercicio estancado de la
      feature 06 (Chest Press 63 × 7 plano) da ritmo 0 %/mes, "Plano".

## Pruebas

- **Unitarias en `test/analytics.test.js`:**
  - Theil–Sen y EMA con huecos.
  - Índice encadenado.
  - Rendimiento.
- **e2e:**
  - Perfil muestra el índice.
  - Ficha con el ritmo.
  - Mapa en modo Progreso.
