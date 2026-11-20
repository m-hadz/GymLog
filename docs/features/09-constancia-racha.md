# 09 · Meta de constancia (día por medio) y racha que se puede reparar

**Esfuerzo:** S · **Depende de:** — · **Relacionada con:** 07

## Problema y objetivo

GymLog ya muestra una racha de semanas seguidas con al menos un entrenamiento, pero:
- está calculada **tres veces por separado** (`TrainView.jsx`, `history/CalendarView.jsx` y
  `profile/summary.js`), con riesgo de que den números distintos;
- con FBEOD (día por medio) "al menos uno por semana" no dice nada: la racha no se corta aunque pases
  5 días sin entrenar;
- un entrenamiento que olvidaste anotar corta la racha y no se puede corregir, porque no hay forma de
  crear un entrenamiento con fecha pasada.

El objetivo: una meta que siga tu ritmo real (**día por medio**), una racha basada en ella que diga
cuándo toca entrenar, y la posibilidad de repararla registrando lo que faltó.

## Evidencia

- Hevy: racha de semanas con al menos un entrenamiento, que se repara registrando un entrenamiento
  pasado. Strong y Hevy tienen widgets de semanas cumplidas. Setgraph tiene un "dial" de racha con días
  de descanso planificados.
  https://help.hevyapp.com/hc/en-us/articles/34467766576279 ·
  https://help.hevyapp.com/hc/en-us/articles/36956630666647
- Estudio de 61.000 personas publicado en Nature (54 intervenciones): la que más aumentó la asistencia
  (+27 %) premiaba **volver** después de faltar, no castigar el corte. Por eso la racha aquí se puede
  reparar y el mensaje al volver es positivo. Solo el 8 % de las intervenciones siguió funcionando al
  terminar: esto ayuda, no reemplaza el hábito.
  https://knowledge.wharton.upenn.edu/podcast/knowledge-at-wharton-podcast/how-science-can-help-you-keep-your-fitness-goal/ ·
  https://www.scimex.org/newsfeed/which-programs-give-gym-goers-the-biggest-boost
- **Simulación con el historial real** (59 entrenamientos):

  | Meta | Cortes en 4 meses | Mejor racha | Racha actual |
  |---|---|---|---|
  | Día por medio, tolerancia 1 día (corta con 4+ días sin entrenar) | 3 | 29 entrenamientos | 29 |
  | Día por medio, tolerancia 2 días | 1 | 58 | 58 (casi nunca se corta: poco útil) |
  | 3 por semana | se corta en varias semanas de 2 (se alternan semanas de 3 y 4) | — | — |

  Por eso el modo recomendado es **día por medio con 1 día de tolerancia**.

## Qué hay hoy en el código

- Tres cálculos de racha semanal (ver arriba). `mondayOf()` en `profile/summary.js`.
- Se puede editar la fecha de un entrenamiento existente, pero no crear uno con fecha pasada.

## Alcance

### Modos de meta

| Modo | Configuración | Cumplir | Racha |
|---|---|---|---|
| Sin meta (por defecto, como hoy) | — | ≥ 1 entrenamiento en la semana | semanas seguidas |
| **Cadencia** (recomendado para FBEOD) | cada **2** días, tolerancia **1** día (ambos editables) | entrenar a más tardar al día `cada + tolerancia` desde el anterior | **entrenamientos seguidos** sin pasarse del límite |
| Semanal | N por semana (1–7) | ≥ N en la semana (lunes a domingo) | semanas seguidas |

- **Cadencia:** con cada = 2 y tolerancia = 1, la racha se corta si pasan **4 o más días** entre dos
  entrenamientos (por fecha local, no por horas). Dos entrenamientos el mismo día cuentan como uno para
  la racha.
- **Pausa planificada:** se puede marcar un rango de días (vacaciones, enfermedad) de hasta 14 días: no
  suma ni corta la racha. Máximo una pausa cada 6 semanas, para que no sea un comodín permanente.
- **Reparar:** registrar un entrenamiento con fecha pasada recalcula la racha.
- **Mejor racha:** máximo histórico (se calcula, no se almacena).
- Un único módulo `src/lib/streak.js` con `streakStats(workouts, goal, pauses, today)` reemplaza los
  tres cálculos actuales.

### Registrar un entrenamiento pasado

- En el calendario, tocar un día sin entrenamiento → "Registrar entrenamiento este día".
- Abre el editor de entrenamiento (el mismo de "editar entrenamiento pasado") con inicio ese día a las
  18:00 y duración 1 h, editables; se puede partir vacío o desde una plantilla.
- No usa el entrenamiento en curso, no inicia temporizadores y no muestra comparación en vivo.

### Interfaz

- **Entrenar**, tarjeta de constancia en modo cadencia:
  - "Hoy toca" (si hoy es el día 2 desde el último), "Mañana toca", o "Último día para no cortar la
    racha" (día 3), con la racha: "29 seguidos".
  - En modo semanal: anillo "2 de 3 esta semana". Sin meta: como hoy.
- **Al terminar un entrenamiento:** el resumen dice "30 seguidos" (o "Semana 23 seguida" en modo semanal).
- **Al volver después de un corte:** mensaje positivo ("Volviste. Primer entrenamiento de una nueva
  racha"), nunca "perdiste tu racha de 29".
- **Calendario:** días de pausa marcados; los cortes de racha se ven como un hueco.
- **Perfil:** mejor racha y franja de los últimos 30 días (entrenado / descanso esperado / pausa / corte).
- **Ajustes:** modo, cada cuántos días, tolerancia, N por semana, y "Agregar pausa".

### Datos

La meta y las pausas deben estar en todos los dispositivos, así que no van en los ajustes locales.
Tabla `user_settings` de una fila (`id = 'me'`, `data jsonb`), sincronizada como las demás:
`{ goal: { mode: 'cadencia', every_days: 2, tolerance: 1, per_week: null }, pauses: [{ from, to }] }`.
Esta tabla sirve también para ajustes futuros que deban sincronizarse.

## Casos borde

- Cambiar el modo o la tolerancia recalcula la racha hacia atrás (se muestra antes de guardar:
  "Con tolerancia 1 tu racha sería de 29").
- Entrenamiento a las 23:50 y otro a las 00:10: son días distintos.
- Cambio de horario de verano: se camina por fechas, no por milisegundos (como hoy).
- Entrenamiento editado a otra fecha: se recalcula todo.
- Primer entrenamiento registrado: racha 1.

## Fuera de alcance

- Notificaciones "hoy toca" (necesitan la infraestructura de la feature 11).
- Medallas o logros.

## Criterios de aceptación

- [ ] Los tres lugares que hoy calculan racha usan `streakStats()` y muestran el mismo número (test).
- [ ] Sin meta configurada, la racha da lo mismo que hoy con los datos de prueba (test de regresión).
- [ ] Cadencia 2 + tolerancia 1: intervalos de 2 y 3 días mantienen la racha; uno de 4 días la corta (test).
- [ ] Corrido localmente contra el historial real de noviembre 2026: racha actual 29, mejor racha 29, 3 cortes.
- [ ] La tarjeta de Entrenar dice "Hoy toca", "Mañana toca" o "Último día para no cortar la racha" según
      los días desde el último entrenamiento.
- [ ] Modo semanal 3: una semana con 2 entrenamientos corta la racha; con 3, cumple.
- [ ] Desde el calendario se puede registrar un entrenamiento en un día pasado, y si llena el hueco, la
      racha se repara.
- [ ] Una pausa de hasta 14 días no corta la racha; una segunda pausa dentro de 6 semanas no se permite.
- [ ] Al volver después de un corte, el mensaje es el positivo y no menciona la racha perdida.
- [ ] La meta y las pausas se sincronizan a otro dispositivo.

## Pruebas

- Unitarias (`test/streak.test.js`): los tres modos, tolerancia, pausas, reparación, mismo día,
  medianoche, cambio de horario, mejor racha.
- Script local (no se sube) que calcula la racha con el historial real.
- e2e: registrar un entrenamiento pasado desde el calendario y ver la racha actualizada.
