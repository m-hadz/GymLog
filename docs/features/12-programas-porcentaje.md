# 12 · Programas por porcentaje del máximo de entrenamiento (5/3/1, GZCLP)

**Estado:** implementada en v0.1 · **Esfuerzo:** M–L · **Depende de:** base común A (máximo de entrenamiento por ejercicio) y B (cargas
posibles) · **Relacionada con:** 01

## Problema y objetivo

Los programas de fuerza más usados (5/3/1, GZCLP, nSuns) prescriben cada serie como un **porcentaje de un
máximo de entrenamiento** ("5 × 85 %") y cambian de semana en semana. En GymLog, como en Strong y Hevy,
eso obliga a calcular y escribir cada peso a mano. El objetivo: definir series como % del máximo, y
tener 5/3/1 y GZCLP listos para usar, con su progresión automática.

> **Implementada en v0.1 a pedido (2026-11-22)**, aunque era la de prioridad más baja.
>
> **Prioridad más baja (respondido el 2026-11-20):** tu entrenamiento es FBEOD con una serie al fallo por
> ejercicio, sin programas por porcentaje ni semanas de descarga. Este documento queda como referencia por
> si eso cambia; no está pensado para implementarse ahora.

## Evidencia

- Ni Strong ni Hevy lo soportan ("hay que calcular y escribir cada peso", según una comparación).
  Existen al menos 8 apps dedicadas solo a 5/3/1 en la App Store. Lo tienen Liftosaur, Boostcamp
  (programas gratis con máximo que se actualiza solo) y FitNotes 2 (series como % de un máximo).
  https://hardy.app/articles/hevy-vs-strong · https://www.liftosaur.com/programs/nsuns ·
  https://www.boostcamp.app/methodology/nsuns · https://apps.apple.com/us/app/fitnotes-2-gym-workout-log/id1538896016
- Reglas públicas de los programas: https://thefitness.wiki/5-3-1-primer/ · https://thefitness.wiki/routines/gzclp/
- Quejas a evitar: la navegación confusa de Boostcamp y la curva de aprendizaje del lenguaje de scripts
  de Liftosaur. Por eso aquí no hay lenguaje de programación: programas predefinidos y porcentajes simples.

## Qué hay hoy en el código

- Plantillas con carpetas; series `{ type, weight, reps }`; objetivo copiado al empezar (`startWorkout`).
- 1RM estimado por ejercicio (`exerciseRecords().e1rm`).

## Alcance

### 1. Máximo de entrenamiento (TM) por ejercicio

- `exercise_prefs.training_max` (kg).
- Valor sugerido al configurarlo: **90 % del mejor 1RM estimado** de los últimos 3 meses, redondeado hacia
  abajo; siempre editable a mano (manda lo manual).
- Se muestra y edita en la ficha del ejercicio, con su historial de cambios (fecha y motivo: manual o
  programa).

### 2. Series por porcentaje en cualquier plantilla

- Una serie de plantilla puede ser de peso fijo (como hoy) o **% del TM**: `{ pct: 85, reps: 5, amrap: true }`.
- Al empezar, el peso = `roundLoad(TM × pct, 'nearest')`. Si el ejercicio no tiene TM, se pide en ese momento.
- `amrap` ("5+"): la serie muestra "5+" y se espera que hagas todas las reps posibles; las reps reales se
  usan para la progresión.

### 3. Programas

Entidad nueva: un programa es una secuencia de **semanas × días**, donde cada día es una plantilla
generada, más un estado (semana y día actual, TMs, etapas).

```sql
create table if not exists programs (
  id          text primary key,
  name        text not null,
  kind        text not null,               -- '531' | 'gzclp'
  config      jsonb not null default '{}', -- ejercicios elegidos, días por semana, opciones
  state       jsonb not null default '{}', -- { week, day, stages: {...}, history: [...] }
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

Las plantillas de cada día se generan en una carpeta con el nombre del programa, para reutilizar todo lo
que ya existe (editor, inicio, historial).

**5/3/1 (básico, 4 días):** ejercicios principales sentadilla, press banca, peso muerto, press militar
(elegibles).
- Semana 1: 65 % × 5, 75 % × 5, 85 % × 5+
- Semana 2: 70 % × 3, 80 % × 3, 90 % × 3+
- Semana 3: 75 % × 5, 85 % × 3, 95 % × 1+
- Semana 4 (descarga, opcional, **desactivada por defecto**): 40 % × 5, 50 % × 5, 60 % × 5. Es una sesión
  normal para el resto de la app (no hay marca de descarga).
- Al terminar el ciclo: TM +2,5 kg en ejercicios de tren superior y +5 kg en tren inferior, con
  confirmación ("¿Subir tus máximos?") y opción de no subir el de un ejercicio.
- Accesorios: los que el usuario agregue a cada día de la plantilla (sin regla, o con la regla de la feature 01).

**GZCLP (3 o 4 días, A1/B1/A2/B2):**
- **T1** (5 × 3+ en el principal del día): si se completan todas las reps → +2,5 kg (superior) / +5 kg
  (inferior) la próxima vez. Si falla → pasa a 6 × 2+ con el mismo peso; si falla → 10 × 1+; si falla en
  10 × 1 → nueva prueba de 5RM (se pide) y vuelve a 5 × 3 con el 85 % de ese 5RM.
- **T2** (3 × 10): éxito → +2,5 / +5 kg. Falla → 3 × 8, luego 3 × 6; si falla en 3 × 6 → vuelve a 3 × 10
  con el último peso logrado en 3 × 10 + 7,5–10 kg (configurable).
- **T3** (3 × 15+): cuando la última serie llega a 25 reps → +2,5 kg.
- Las etapas y pesos de cada ejercicio viven en `state.stages`.

**nSuns:** fuera de alcance de esta versión (la tabla de progresión según el AMRAP varía entre fuentes).

### Interfaz

- **Entrenar → "Programas"**: crear desde "5/3/1" o "GZCLP" con un asistente de 3 pasos: elegir ejercicios
  principales → confirmar TMs (sugeridos desde el historial) → días por semana.
- Tarjeta del programa activo en "Entrenar": "5/3/1 · Semana 2 · Día 3 (Peso muerto)" con botón
  **"Empezar"**, que abre el día que corresponde.
- Al terminar un día del programa, el resumen muestra lo que cambia para la próxima vez
  ("T1 sentadilla: 5 × 3 con 102,5 kg").
- Se puede saltar un día, repetir uno o mover el programa a otra semana desde el menú de la tarjeta.
- Un solo programa activo a la vez (se pueden pausar y retomar).

## Casos borde

- Cambiar el TM a mano a mitad de ciclo: aplica desde el siguiente entrenamiento.
- Entrenamiento de un día del programa descartado: el programa no avanza.
- Entrenamiento editado después (por ejemplo, corregir reps de la serie AMRAP): se recalcula la decisión
  de progresión de ese día si todavía es el último.
- Peso por porcentaje que no se puede armar: redondeo al más cercano; si hay empate, hacia arriba.
- Ejercicio "por mano" (feature 05): los porcentajes aplican al peso por mancuerna.

## Fuera de alcance

- Lenguaje de scripts para programas propios.
- nSuns, Texas Method, programas de pago o de coaches.
- Autorregulación por RPE.

## Criterios de aceptación

- [ ] Con TM 100 kg en sentadilla, el día de sentadilla de la semana 1 de 5/3/1 propone 65 × 5, 75 × 5,
      85 × 5+ (con barra de 20 kg y discos estándar).
- [ ] La semana 3 propone 75 × 5, 85 × 3, 95 × 1+, y la semana 4 solo aparece si se activó la descarga.
- [ ] Al terminar el ciclo se ofrece subir los TM (+2,5 superior, +5 inferior) y se puede excluir uno.
- [ ] GZCLP: fallar el T1 en 5 × 3 cambia el siguiente a 6 × 2 con el mismo peso; fallar en 10 × 1 pide
      una prueba de 5RM y reinicia en 5 × 3 al 85 %.
- [ ] GZCLP: T3 con 25 reps en la última serie sube 2,5 kg la siguiente vez.
- [ ] La tarjeta del programa muestra semana y día, y "Empezar" abre el día correcto.
- [ ] Saltar un día y repetir uno funcionan y quedan reflejados en la tarjeta.
- [ ] Cualquier plantilla (fuera de un programa) puede usar series en % del TM.
- [ ] Todos los pesos propuestos se pueden armar con el equipo configurado.
- [ ] Programas, TM y estado se sincronizan entre dispositivos y entran en el respaldo JSON.
- [ ] Funciona sin conexión.

## Notas de implementación (v0.1)

- `src/lib/programs.js` (puro): `dayPlan`, `completeDay` (progresión GZCLP, avance, fin de ciclo de
  5/3/1), `redoLastDay`, `nextPosition`/`prevPosition`, `suggestTM`, `gzclpStart`. `src/lib/program-runtime.js`
  guarda el programa y regenera sus 4 plantillas (`t_<programa>_<día>`) cada vez que cambia; los
  ejercicios que agregues a una plantilla del programa se conservan. `src/lib/tm.js`: máximo, historial y
  `programLoad` (peso armable: con barra, el más cercano con tus discos, empate hacia arriba; en
  máquinas, prefiere los pesos que ya usaste).
- **Historial del máximo** en `user_settings.data.tm_log` (fecha, valor, motivo: a mano, al crear el
  programa, fin de ciclo), hasta 300 cambios. Así no hizo falta agregar columnas a `exercise_prefs`.
- Una plantilla sabe a qué programa pertenece por su id (está en `config.templates`); el entrenamiento,
  por su `template_id`. Solo avanza el programa activo y solo si es el día que tocaba. En el
  entrenamiento, los ejercicios del programa llevan `prog: {tier}` (T1/T2/T3 o principal) y sus series
  usan el peso indicado (no el de la vez anterior); el "objetivo para superar" (01) no aparece en ellos.
- Series en % en cualquier plantilla: `{pct, reps, amrap}`; al empezar, si el ejercicio no tiene máximo
  se pide en ese momento. "Reps al máximo" muestra "5+" y la etiqueta "+" en el número de serie.
- Días por semana: el asistente no lo pregunta. En ambos programas la rotación es la misma entrenes 3 o 4
  días por semana (5/3/1 avanza de semana cada 4 días de programa; GZCLP rota A1/B1/A2/B2).
- GZCLP: T1 y T2 suben +2,5 kg (superior) o +5 kg (inferior) al completar todas las series y reps; el
  peso pasa por `programLoad`. Fallar en 10 × 1 deja la "prueba de 5RM": una serie de 5 sin peso; el 5RM
  es la serie más pesada con 5 reps o más, y el T1 vuelve a 5 × 3 con el 85 %. T2 al fallar en 3 × 6:
  vuelve a 3 × 10 con el último peso logrado en 3 × 10 más 7,5 o 10 kg (opción del asistente).
- Pesos iniciales de GZCLP: 85 % y 65 % del 5RM estimado (1RM × 32/36, Brzycki) para T1 y T2; T3 al
  ~90 % del peso para 15 reps. Todos editables en el asistente.
- Saltar un día no cambia pesos (al cerrar un ciclo de 5/3/1 igual ofrece subir los máximos); repetir
  vuelve un día atrás; "Mover a otra semana" va al día 1 de esa semana.
- Corregir el último entrenamiento de un programa recalcula su progresión (`state.last.before`).

## Pruebas

- Unitarias (`test/programs.test.js`): generación de semanas 5/3/1, fin de ciclo, transiciones de etapas
  GZCLP (T1, T2, T3), TM sugerido, redondeo.
- e2e: crear un 5/3/1, completar un día y comprobar los pesos del siguiente.

## Preguntas abiertas

- ¿Entrenas con 5/3/1, GZCLP u otro programa de porcentajes? Si usas otro, ¿cuál?
- Incrementos: se usa el mínimo aumento de cada ejercicio (base común B).
