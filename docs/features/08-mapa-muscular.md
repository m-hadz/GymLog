# 08 · Mapa muscular y rango semanal de series

**Estado:** primera versión en v0.0.7 (ver notas al final) · **Esfuerzo:** M · **Depende de:** — · **Relacionada con:** 07

## Problema y objetivo

El perfil ya muestra "series por grupo muscular", pero agrupado en 7 zonas grandes (Pecho, Espalda,
Piernas…) usando solo el músculo principal de cada ejercicio, y sin decir si esas series son pocas o
muchas. El objetivo:
1. un **mapa del cuerpo** (frente y espalda) con cada músculo coloreado según las series de la semana;
2. un **rango objetivo** de series semanales por músculo (por ejemplo 10–20), para ver de un vistazo qué
   está bajo, dentro o sobre el rango.

## Evidencia

- Hevy (gratis: gráfico de los últimos 7 días y distribución semanal), Strava (desde mayo de 2026,
  alimentado por Hevy, Fitbod y WHOOP), Garmin, WHOOP, Gravitus. Hevy Trainer dibuja una "zona verde de
  series recomendadas".
  https://www.hevyapp.com/features/muscle-group-workout-chart/ ·
  https://9to5mac.com/2026/05/21/strava-adds-dedicated-strength-training-support-for-sets-reps-weight-and-muscle-groups/ ·
  https://www.hevyapp.com/features/workout-plan-generator/
- Pedido en el tablero de Bevel: https://feedback.bevel.health/feature-requests/p/workout-physical-body-diagram-muscular-load
- Advertencia: un reseñista de TechRadar encontró inútil el mapa de Garmin cuando solo es decorativo;
  por eso aquí va unido al rango objetivo, que lo vuelve una guía.

## Qué hay hoy en el código

- `setsByBodyPart()` (`src/views/profile/summary.js`) cuenta series efectivas por `bodyPart`.
- El catálogo trae `primary` y `secondary` con los 17 músculos de free-exercise-db (`src/lib/catalog.js`).
  Los ejercicios propios vinculados al catálogo heredan esos músculos; los no vinculados no tienen.

## Alcance

### Músculos y conteo

- Se usan los 17 músculos de free-exercise-db: abdominales, abductores, aductores, bíceps, pantorrillas,
  pecho, antebrazos, glúteos, isquiotibiales, dorsales, zona lumbar, espalda media, cuello, cuádriceps,
  hombros, trapecios, tríceps.
- Cada serie efectiva (`isWorking`)
  suma **1** a cada músculo principal y **0,5** a cada secundario.
- Ejercicios propios sin músculos: se pueden asignar en el editor del ejercicio (principal y secundarios,
  selección múltiple). Mientras no tengan, cuentan en la zona `bodyPart` y aparecen en una lista "sin
  músculos asignados" para completarlos.

### Regiones dentro de cada músculo

Con 3–4 ejercicios por músculo, cada uno buscando una región distinta, contar solo "pecho" no alcanza.
free-exercise-db no trae regiones, así que se asignan por ejercicio (`exercise_prefs.regions`, 1–2 por
ejercicio):

| Músculo | Regiones |
|---|---|
| Pecho | superior (clavicular), medio, inferior |
| Hombros | deltoide anterior, lateral, posterior |
| Espalda | dorsal, trapecio superior, trapecio medio y romboides, lumbar |
| Bíceps y antebrazo | cabeza larga, cabeza corta, braquial, braquiorradial, flexores, extensores |
| Tríceps | cabeza larga, cabezas lateral y medial |
| Cuádriceps | recto femoral, vastos |
| Isquiotibiales | por flexión de rodilla, por extensión de cadera |
| Glúteos | glúteo mayor, glúteo medio |
| Pantorrillas | gastrocnemio, sóleo |

- La hoja de cada músculo muestra las series de la semana **por región** y marca "sin trabajar esta
  semana" las regiones que sí aparecen en tus ejercicios de las últimas 4 semanas.
- En el dibujo, las regiones que se pueden separar visualmente (las 3 cabezas del deltoide, pecho
  superior e inferior) se pintan por separado; el resto se ve en la hoja.
- La lista de regiones es fija en esta versión (no se pueden crear regiones nuevas).

### Rango objetivo

- Por defecto, para todos los músculos: **10–20 series por semana**. Referencia con FBEOD: 3–4 ejercicios de
  1 serie por músculo × ~3,5 sesiones por semana ≈ 10–14 series.
- Editable por músculo en Perfil → Ajustes → "Series por semana" (con "restablecer").
- Estado por músculo: **sin trabajar** (0), **bajo** (< mín.), **en rango**, **sobre** (> máx.).

### Interfaz

- **Perfil → "Músculos esta semana"**: mapa frente/espalda (interruptor) con los colores del estado:
  gris (0), color tenue (bajo), color principal (en rango), naranja (sobre). Leyenda debajo.
  - Selector: esta semana (lunes a hoy) / últimos 7 días / semana anterior.
  - Tocar un músculo abre una hoja con: series de la semana, rango, y los ejercicios que las aportaron.
- El gráfico existente de series por grupo pasa a mostrar los músculos, con la banda del rango dibujada
  como zona sombreada.
- **Resumen al terminar un entrenamiento:** mini mapa de los músculos trabajados hoy.
- Accesibilidad: además del color, cada músculo tiene su nombre y número al tocarlo, y la lista textual
  está disponible ("Ver como lista").

### Dibujo del cuerpo

- SVG propio o de una fuente con licencia que permita uso y modificación (MIT, CC0 o similar). **Revisar
  la licencia antes de usar cualquier SVG de terceros.**
- Cada músculo es un `<path>` con un id que corresponde al nombre de free-exercise-db; los colores salen de
  variables del tema (claro y oscuro).
- El componente se carga aparte (lazy) junto con el perfil.

### Datos

- Músculos y regiones por ejercicio en `exercise_prefs` (`primary_muscles`, `secondary_muscles`,
  `regions`): sirve tanto para ejercicios propios sin vínculo como para corregir los del catálogo.
- **Hoy 19 de tus 38 ejercicios propios no están vinculados al catálogo**, así que no tienen músculos: la
  lista "sin músculos asignados" los muestra primero para completarlos.
- Rangos por músculo: ajustes del dispositivo (`muscleTargets`), con valores por defecto.
- Cálculo en una función pura `setsByMuscle(workouts, from, to, getExercise)` con tests.

## Casos borde

- Músculos sin dibujo propio en el mapa (cuello, abductores): se muestran en la lista y en el gráfico.
- Lados izquierdo y derecho se pintan igual.
- Semanas que empiezan con la semana en curso vacía: el mapa queda gris, con el texto "Aún no entrenas
  esta semana".

## Fuera de alcance

- Mapa de recuperación (Fitbod): descartado por impreciso.
- Ponderar por intensidad o RPE.

## Criterios de aceptación

- [ ] Una semana con 4 series de press banca (pecho principal; hombros y tríceps secundarios) da pecho 4,
      hombros 2 y tríceps 2 (test unitario).
- [ ] El mapa colorea cada músculo según el estado, con leyenda, en frente y espalda.
- [ ] Tocar un músculo muestra las series, el rango y los ejercicios que aportaron.
- [ ] Cambiar el rango de un músculo en Ajustes cambia su color en el mapa.
- [ ] El gráfico de series por músculo muestra la banda del rango.
- [ ] El resumen al terminar un entrenamiento muestra el mini mapa de ese entrenamiento.
- [ ] Un ejercicio propio sin músculos aparece en la lista "sin músculos asignados" y se puede completar.
- [ ] Se ve bien en claro y oscuro a 375 px, y hay una vista en lista equivalente.
- [ ] La licencia del SVG está documentada en el README.
- [ ] Asignar "pecho superior" a Incline Bench Press y "pecho inferior" a Chest Fly hace que la hoja de
      Pecho muestre las series por región.
- [ ] Una región usada en las últimas 4 semanas y sin series esta semana aparece como "sin trabajar esta semana".
- [ ] Desde la lista "sin músculos asignados" se asignan músculo principal y región a un ejercicio en 3
      toques o menos.

## Notas de la primera versión (v0.0.7)

Por pedido del usuario se implementó antes del orden previsto, con estas decisiones:

- **Solo estímulo directo:** cada serie efectiva suma 1 al grupo del ejercicio (`bodyPart`); los
  músculos secundarios no cuentan. Los grupos son los de `BODY_PARTS` (Pecho, Dorsales, Espalda alta,
  Lumbar, Hombros, Bíceps, Tríceps, Antebrazo, Core, Cuádriceps, Isquiotibiales, Glúteos, Aductores,
  Abductores, Pantorrillas), no los 17 de free-exercise-db.
- **Estados:** rezagado (rojo, "Sube el volumen") bajo la mitad de la meta; mejorable (amarillo) hasta la
  meta; bien (verde) desde la meta. **No hay estado "sobre el rango":** mucho volumen sigue en verde.
  Meta única editable, 8 series directas por semana por defecto (`muscleTarget`).
- Periodo: últimas 4 semanas (por defecto) o 7 días, en series por semana; con menos historial no se
  diluye el promedio.
- Dibujo propio en `src/views/profile/BodyMap.jsx` (sin licencias de terceros), frente y espalda lado a lado.
- Pendiente de este documento: regiones dentro de cada músculo, músculos por ejercicio en
  `exercise_prefs` (hoy el grupo de un ejercicio del catálogo no se puede cambiar; el de uno propio, sí,
  en su ficha) y el mini mapa en el resumen al terminar.

## Pruebas

- Unitarias: `setsByMuscle` con principales/secundarios, ejercicios propios con y sin músculos, rangos y estados.
- e2e: abrir el perfil con datos importados y tocar un músculo.
