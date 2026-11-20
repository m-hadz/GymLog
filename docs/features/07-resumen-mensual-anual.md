# 07 · Resumen mensual y anual

**Esfuerzo:** M · **Depende de:** — · **Usa si existen:** 06 (estancados), 08 (músculos), 09 (constancia)

## Problema y objetivo

El perfil muestra totales y gráficos semanales, pero no hay un momento para mirar atrás: "¿cómo me fue
en noviembre?", "¿qué logré este año?". El objetivo: un resumen por mes y otro por año, armados solo
con los datos que ya existen, que se lean en un minuto y comparen contra el periodo anterior.

## Evidencia

- Hevy tiene informe mensual gratis y "Year in Review" cada diciembre (con al menos 10 entrenamientos en
  el año); Boostcamp manda un informe semanal los domingos; JEFIT publica un "recap" anual.
  https://www.hevyapp.com/features/monthly-report/ · https://www.hevyapp.com/features/year-in-review/ ·
  https://www.boostcamp.app/features/weekly-report ·
  https://www.jefit.com/blog/jefit-year-in-review-2025-a-look-back-at-your-strength-journey
- 3 de 4 ángulos lo incluyen (en el de progresión, como "informe de progreso con estado por ejercicio").
- Momento: estamos a fines de noviembre de 2026, a tiempo para el resumen de 2026.

## Qué hay hoy en el código

- `profileSummary()` y `setsByBodyPart()` en `src/views/profile/summary.js`; `computePRs()`,
  `exerciseSessions()` y `workoutVolume()` en `src/lib/stats.js`. Todo se calcula en el cliente.

## Alcance

### Contenido del resumen **mensual**

1. **Totales:** entrenamientos, tiempo total, volumen, series efectivas. Cada uno con la variación contra
   el mes anterior (▲/▼ %, usando el `DeltaBadge` existente).
2. **Días entrenados:** mini calendario del mes con los días marcados.
3. **Constancia:** semanas que cumplieron la meta (si existe la feature 09) o semanas con al menos un
   entrenamiento, y la racha al cierre del mes.
4. **Récords:** cantidad de récords del mes y los 5 más destacados (por mayor mejora relativa del 1RM estimado).
5. **Ejercicios más hechos:** top 5 por series efectivas.
6. **Progreso por ejercicio:** para los ejercicios hechos al menos 2 veces en el mes, estado
   "progresando" (1RM estimado del mes > mes anterior en más de 1 %), "manteniendo" o "bajando".
7. **Distribución por músculo:** series por zona del cuerpo contra el mes anterior (o el mapa de la
   feature 08 si existe).
8. **Mejor semana** del mes por volumen.

### Contenido del resumen **anual**

Lo mismo a escala de año, más:
- barras de entrenamientos y volumen mes a mes, con el mejor mes destacado;
- racha más larga del año;
- mayor mejora de 1RM estimado del año en los 5 ejercicios más hechos (primer mes vs. último mes con datos);
- ejercicios nuevos probados durante el año;
- total de kilos levantados expresado también en algo concreto ("como levantar 12 autos").

### Reglas

- El mes es el calendario local; la semana empieza el lunes (como el resto de la app).
- Si existe la feature 06: sección "Estancados al cierre del mes" y cuántos salieron de esa lista con un reinicio.
- Constancia en modo cadencia (09): racha al cierre del mes, cortes y promedio de días entre entrenamientos.
- Un mes sin entrenamientos no tiene resumen (aparece desactivado en el selector).
- Resumen anual: disponible con al menos 10 entrenamientos en el año.
- El mes en curso se puede ver como "parcial" con la etiqueta "Hasta hoy".

### Interfaz

- Ruta `#/report/2026-11` (mes) y `#/report/2026` (año), cargadas con `lazy()` como las pantallas de gráficos.
- Una sola página con secciones en tarjetas que se recorren con scroll (no diapositivas: más simple y
  accesible), con selector de periodo arriba (‹ noviembre 2026 ›).
- Entrada:
  - Perfil: tarjeta "Resumen de octubre →" que se destaca los primeros 7 días de cada mes.
  - Perfil: tarjeta "Tu 2026 →" visible desde el 15 de diciembre hasta el 31 de enero.
  - Historial: enlace "Ver resumen del mes" en el encabezado de cada mes.
- **Compartir (deseable, no obligatorio para aprobar):** botón que genera una imagen de la tarjeta de
  totales (canvas → PNG) y usa `navigator.share({ files })`; si el navegador no puede compartir archivos, se descarga la imagen.

### Datos

- Sin cambios en la base de datos. Los cálculos van en un módulo puro nuevo, `src/lib/report.js`
  (`monthReport(workouts, year, month)` y `yearReport(workouts, year)`), con tests.

## Casos borde

- Primer mes con datos: sin comparación ("primer mes registrado") en lugar de porcentajes.
- Entrenamientos que cruzan la medianoche del último día del mes: cuentan en el mes en que empezaron.
- Entrenamientos importados de Strong: cuentan igual.
- Con muchos años de datos el cálculo debe seguir siendo instantáneo (menos de 100 ms con 2.000
  entrenamientos en un teléfono).

## Fuera de alcance

- Enviar el resumen como notificación (necesita la infraestructura de la feature 11).
- Comparar contra otros usuarios.

## Criterios de aceptación

- [ ] `#/report/2026-10` muestra totales con variación contra septiembre, calendario, récords, top 5 de
      ejercicios, progreso por ejercicio, distribución por músculo y mejor semana.
- [ ] Con datos de prueba conocidos, cada número coincide con un cálculo a mano (test unitario por sección).
- [ ] Un mes sin entrenamientos aparece desactivado en el selector.
- [ ] El resumen anual de 2026 aparece con 10 o más entrenamientos y no aparece con menos.
- [ ] La tarjeta "Resumen de [mes anterior]" se destaca los primeros 7 días del mes.
- [ ] Con la feature 06, la sección de estancados coincide con la tarjeta "Estancados" del perfil al cierre del mes.
- [ ] Funciona sin conexión y se ve bien en claro y oscuro a 375 px.
- [ ] Con 2.000 entrenamientos de prueba, el cálculo tarda menos de 100 ms (medido en el test).
- [ ] La pantalla se carga aparte y no aumenta el bundle principal.

## Pruebas

- Unitarias (`test/report.test.js`): cada sección con un set de datos fijo; mes sin datos; primer mes;
  entrenamiento que cruza la medianoche; rendimiento.
- e2e: abrir el resumen de un mes con los datos importados del CSV de prueba.
