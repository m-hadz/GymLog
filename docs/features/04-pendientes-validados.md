# 04 · Pendientes validados: peso corporal/lastre/asistido, nota fija, ejercicios por tiempo

**Estado:** A, B y C implementadas en v0.0.9; las superseries (antes parte D) se descartaron: no se usarán.
**Esfuerzo:** M en total (tres partes S–M que se pueden entregar por separado)
· **Depende de:** base común A; la parte A necesita la feature 03 (peso corporal)

Estas cuatro ya estaban en "Pendiente (ideas)" del README. La investigación confirmó que los usuarios
las piden: Hevy llama a las notas en tres niveles "una de las funciones más pedidas", las reseñas de
Strong piden cuenta regresiva con aviso para ejercicios por tiempo y se quejan de lo difícil que es
editar superseries, y una reseña de Hevy reclama que las sentadillas sin peso no suman volumen.
https://www.hevyapp.com/community-updates/july-26/ · https://www.hevyapp.com/features/workout-settings/

Cada parte tiene sus propios criterios de aceptación y se puede entregar sola, en este orden: A, B, C.

---

## A. Ejercicios de peso corporal, con lastre y asistidos

### Problema
Hoy una dominada sin peso se registra solo con reps: no suma volumen, no tiene 1RM y una dominada con
10 kg de lastre se compara mal con una sin lastre. Una dominada asistida con 20 kg se ve como "20 kg",
cuando en realidad mueves tu peso menos 20.

### Reglas
- Tipo de ejercicio en `exercise_prefs.kind` (base común A):
  - `peso_reps` (por defecto): como hoy.
  - `peso_corporal`: solo reps. Carga efectiva = peso corporal.
  - `lastre`: se anota el peso **agregado**. Carga efectiva = peso corporal + agregado.
  - `asistido`: se anota la **asistencia**. Carga efectiva = peso corporal − asistencia (mínimo 0).
  - `tiempo`: ver parte C.
- Por defecto, los ejercicios del catálogo con categoría "Peso corporal" son `peso_corporal`. El usuario
  puede cambiar el tipo en la ficha del ejercicio.
- Peso corporal = `bodyweightAt(fecha del entrenamiento)` de la feature 03.
- **Volumen, 1RM estimado y récords** usan la carga efectiva. Ajuste "Contar el peso corporal en el
  volumen" (por defecto sí), porque algunos prefieren que el volumen sea solo lo cargado.
- **Sin peso corporal registrado:** se comporta como hoy (solo reps) y la ficha muestra
  "Registra tu peso para calcular volumen y 1RM".
- Los datos guardados no cambian (se sigue guardando lo que el usuario anotó); la carga efectiva se
  calcula al analizar, así que el historial se recalcula solo al registrar o corregir el peso corporal.

### Interfaz
- Encabezado de la columna de peso según el tipo: "kg" / "+kg" / "−kg"; para `peso_corporal` la columna
  desaparece.
- En las series hechas y en el historial: "PC + 10 kg × 8", "PC − 20 kg × 8".
- La ficha del ejercicio muestra los gráficos con la carga efectiva y una nota "incluye tu peso corporal".

### Criterios de aceptación
- [ ] Una dominada con lastre 10 kg × 8, con peso corporal 80 kg, suma 720 kg de volumen y su 1RM
      estimado usa 90 kg.
- [ ] Una dominada asistida 20 kg × 8, con 80 kg, usa 60 kg de carga efectiva.
- [ ] Sin peso corporal registrado, esos ejercicios se ven como hoy y aparece el aviso.
- [ ] Cambiar el tipo de un ejercicio recalcula su historial sin modificar los datos guardados.
- [ ] El ajuste "Contar el peso corporal en el volumen" desactivado deja el volumen como hoy.
- [ ] La exportación a CSV de Strong sigue escribiendo el peso tal como se anotó.

---

## B. Nota fija por ejercicio

### Problema
Hay datos que se repiten cada vez (altura del asiento, agarre, qué polea usar) y hoy la nota de un
ejercicio vive solo dentro de un entrenamiento.

### Reglas
- `exercise_prefs.note`: una nota por ejercicio, compartida por todas las plantillas y entrenamientos.
- Es distinta de la nota del ejercicio **en ese entrenamiento** (`exercises[].notes`, que ya existe).

### Interfaz
- Al tope del bloque del ejercicio, en el entrenamiento en curso: la nota fija en un recuadro destacado
  (fondo amarillo tenue), siempre visible, de 1–2 líneas con "ver más".
- Editable desde el menú del ejercicio ("Nota fija") y desde la ficha del ejercicio.
- Links dentro de la nota se pueden tocar (por ejemplo, a un video de técnica).

### Criterios de aceptación
- [ ] Escribir "Asiento en 4" como nota fija de la prensa y empezar otro entrenamiento con la prensa
      muestra la nota sin hacer nada más.
- [ ] La nota se sincroniza a otro dispositivo.
- [ ] Editarla desde la ficha o desde el entrenamiento cambia la misma nota.
- [ ] La nota del entrenamiento sigue funcionando aparte y no se mezcla con la fija.
- [ ] Un link en la nota se abre en una pestaña nueva; no se interpreta HTML.

---

## C. Ejercicios por tiempo (plancha, colgarse, cardio corto)

### Reglas
- `kind = 'tiempo'`. La serie guarda `duration` (segundos) y, opcionalmente, `weight` (plancha con disco).
- **Cronómetro en la fila:** botón ▶ en la serie. Si la serie tiene un objetivo de tiempo, cuenta hacia
  atrás y suena al llegar a 0 (igual que el descanso); si no, cuenta hacia adelante. ✓ guarda el tiempo
  transcurrido. También se puede escribir el tiempo a mano (mm:ss).
- Récords y gráfico del ejercicio: mejor tiempo y tiempo total por sesión.
- La serie por tiempo no suma volumen en kg.
- El cronómetro guarda la hora de inicio (no un contador), como el descanso, para sobrevivir a bloquear
  la pantalla o recargar.

### Criterios de aceptación
- [ ] Una plancha con objetivo 60 s cuenta hacia atrás, suena al terminar y ✓ guarda 60 s.
- [ ] Sin objetivo, cuenta hacia adelante y ✓ guarda lo transcurrido.
- [ ] Bloquear el teléfono 30 s durante el cronómetro no pierde tiempo.
- [ ] La ficha muestra mejor tiempo y un gráfico de tiempo por sesión.
- [ ] El tiempo se puede editar a mano en formato mm:ss.
- [ ] Exportar a CSV de Strong escribe la duración en su columna de segundos.

---

## Fuera de alcance

- Superseries: descartadas por el usuario (no las usa).

- Circuitos de 3+ ejercicios con descansos distintos por ejercicio (un grupo de 3+ sí se permite, con
  la regla de descanso de arriba).
- Ejercicios de distancia (cardio con km).
- Unir ejercicios duplicados y buscador en español (siguen en "Pendiente").

## Notas de implementación (v0.0.9)

- `src/lib/kinds.js`: tipos, `resolveKind`, `effectiveLoad`, `withEffectiveLoads`, `fmtSecs`/`parseSecs`.
  `src/lib/effective.js` cachea los entrenamientos con carga efectiva (`useAnalysis()` en hooks.js); se
  usan para mostrar y analizar (historial, perfil, ficha, resumen). Editar y guardar usa siempre lo anotado.
- Tipo por defecto: "Peso corporal" si la categoría lo es, o si el nombre es típico (pull up, chin up,
  push up, dips…) y no tiene categoría. Se cambia en Ajustes del ejercicio.
- Peso corporal de cada fecha: `bodyweightLookup` (body.js). Para entrenamientos hasta 60 días antes del
  primer registro se usa ese primer registro.
- Récords: "peso" es el lastre en ejercicios con lastre; en peso corporal no hay récord de peso (subir de
  peso corporal no lo es). Las series por tiempo tienen récord "TIEMPO" y no suman volumen.
- Las series por tiempo se guardan en `seconds` (mismo campo que la importación de Strong), así la
  exportación ya escribe la columna Seconds.
- Sin objetivo de sugerencia ni calentamiento en asistidos, tiempo y peso corporal.
- Nota fija: `exercise_prefs.note`, en un recuadro amarillo con "ver más"; menú "Nota fija" y ficha.

## Pruebas

- Unitarias: carga efectiva por tipo, volumen y 1RM con peso corporal, orden y descanso de superseries,
  formato mm:ss.
- e2e: un entrenamiento con una superserie, una plancha cronometrada y una dominada con lastre; revisar
  el resumen final.
