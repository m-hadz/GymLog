# 05 · Mancuernas por mano y ejercicios unilaterales

**Esfuerzo:** S · **Depende de:** base común A · **Relacionada con:** 01, 02, 04

## Problema y objetivo

Con mancuernas, lo natural es anotar el peso de **una** mancuerna (2 × 20 kg → "20"). Hoy GymLog lo
toma como 20 kg en total, así que el volumen de esos ejercicios sale a la mitad y no se puede comparar
con la versión con barra. Con ejercicios unilaterales (remo a una mano, zancada búlgara) pasa lo mismo:
se hace el doble de trabajo del que se anota. El objetivo: marcar por ejercicio cómo se anota la carga y
que todos los cálculos lo respeten, sin cambiar lo que se guardó.

**En tu historial aplica a:** Bicep Curl (Dumbbell) y Reverse Curl (Dumbbell) (por mano); Unilateral Leg
Extension y Unilateral Lying Leg Curl (unilateral); Incline Bench Press (Dumbbell) (por mano); y, según
cómo anotes el peso, las máquinas Iso-Lateral (Row y Chest Press).

## Evidencia

- Hevy reconoce que es uno de los pedidos más repetidos ("raised by users a lot") y lo postergó a 2027
  porque altera el historial, los análisis y las tablas de posiciones.
  https://www.hevyapp.com/community-updates/july-26/ · https://www.hevyapp.com/community-updates/october-26/
- Reseñas: "¿por qué tengo que hacer el cálculo yo?", "el registro de peso es un poco confuso".
  https://www.producthunt.com/products/hevy/reviews
- GymLog no tiene tablas de posiciones ni otros usuarios, así que el problema de Hevy no aplica.

## Qué hay hoy en el código

- `setVolume = weight × reps` y `e1rm(weight, reps)` en `src/lib/stats.js`; se usan en volumen por
  sesión, resumen final, perfil, récords y gráficos.
- La categoría del ejercicio ("Mancuerna", etc.) existe en el catálogo y en los ejercicios propios.

## Alcance

### Reglas

`exercise_prefs.load_mode`:

| Modo | Se anota | Volumen | 1RM estimado y récords de peso |
|---|---|---|---|
| `total` (por defecto) | La carga total | `peso × reps` | Sobre el peso anotado |
| `por_mano` | El peso de **una** mancuerna (se usan dos) | `2 × peso × reps` | Sobre el peso anotado (por mano) |
| `unilateral` | El peso y las reps **de un lado** (se hacen los dos) | `2 × peso × reps` | Sobre el peso anotado (por lado) |

- El 1RM y los récords se quedan "por mano / por lado" a propósito: así 22 kg por mano se lee como 22,
  igual que en la mancuerna, y no aparece de golpe un récord por el cambio de modo.
- El factor se aplica **al analizar**; lo guardado no cambia. Cambiar el modo recalcula todo el historial
  de ese ejercicio.
- Por defecto todo es `total` (nada cambia para el historial existente hasta que el usuario lo elija).
  La primera vez que se usa un ejercicio de categoría "Mancuerna" con modo sin definir, aparece una
  pregunta única: "¿Anotas el peso de una mancuerna o el total?" → guarda la respuesta para ese ejercicio,
  con opción "Usar esto para todas las mancuernas".

### Interfaz

- Encabezado de la columna de peso: "kg c/u" (por mano) o "kg por lado" (unilateral).
- Ficha del ejercicio → ajustes: selector de modo con una explicación de una línea y un ejemplo.
- Resumen final y perfil: sin cambios visibles más allá de los números correctos.

### Interacción con otras features

- 01 (progresión) y 02 (calentamiento): trabajan sobre el peso anotado (por mano), con el paso de mancuernas.
- 04 (lastre): un ejercicio no puede ser `unilateral` y `asistido` a la vez; los modos se combinan solo con
  `peso_reps` y `lastre`.
- Exportar a CSV de Strong: se exporta el peso tal como se anotó (Strong no tiene este concepto).
- Importar desde Strong: los ejercicios importados quedan en `total`.

## Casos borde

- **Máquinas iso-laterales** (Iso-Lateral Row, Iso-Lateral Chest Press): si anotas el peso de un solo lado
  y empujas con los dos brazos a la vez, corresponde `por_mano`; si las haces de a un brazo, `unilateral`.
- La sugerencia de 01, el reinicio de 06 y el calentamiento de 02 trabajan sobre el peso anotado (por mano
  o por lado), así que no cambian al elegir el modo.

- Ejercicio propio sin categoría: se puede elegir cualquier modo.
- Cambiar de `total` a `por_mano` cuando el historial se anotó como total: el volumen del pasado se
  duplica. Por eso el selector avisa: "Esto cambia el volumen de tus 34 sesiones anteriores".
- Volumen semanal del perfil y series por músculo: el volumen cambia, el número de series no.

## Fuera de alcance

- Anotar pesos distintos para cada mano en la misma serie.
- Anotar reps distintas por lado (izquierda 10, derecha 8).

## Criterios de aceptación

- [ ] Curl con mancuerna en `por_mano`, 3 × 10 con 12 kg: el volumen de la sesión es 720 kg (antes 360).
- [ ] El 1RM estimado de ese curl sigue calculándose sobre 12 kg.
- [ ] Remo a una mano en `unilateral`, 3 × 10 con 30 kg: volumen 1.800 kg.
- [ ] Cambiar el modo muestra cuántas sesiones se recalculan, y al confirmar se actualizan volumen,
      gráficos y resumen del perfil sin modificar los datos guardados.
- [ ] La pregunta de "una mancuerna o total" aparece una sola vez por ejercicio, y "para todas" la
      aplica a todos los ejercicios de categoría Mancuerna sin modo definido.
- [ ] El encabezado de la columna dice "kg c/u" o "kg por lado" según el modo.
- [ ] Exportar a CSV de Strong produce el mismo archivo que antes para esos ejercicios.
- [ ] El modo se sincroniza entre dispositivos.

## Pruebas

- Unitarias: volumen por modo en `workoutVolume`, `exerciseSessions` y el resumen; récords no duplicados.
- e2e: cambiar un ejercicio a por mano y comprobar el volumen en la ficha y en el perfil.
