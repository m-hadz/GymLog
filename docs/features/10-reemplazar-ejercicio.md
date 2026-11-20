# 10 · Reemplazar un ejercicio

**Esfuerzo:** S–M · **Depende de:** — (usa `exercise_prefs` de la base común A para la lista de exclusión)

## Problema y objetivo

Cuando la máquina está ocupada o algo molesta, hoy hay que quitar el ejercicio, buscar otro y volver a
armar las series. El objetivo: "Reemplazar" en el menú del ejercicio, con sugerencias del **mismo
músculo y equipo** primero, que conserve la estructura de series y deje elegir si el cambio es solo por
hoy o también para la plantilla.

## Evidencia

- 1.600 votos en el tablero de Caliber ("Smart exercise substitutions", segundo más votado, *Planned*).
  https://feedback.caliberstrong.com
- Hevy: "Reemplazar ejercicio" gratis desde el menú; en Hevy Trainer (de pago) sugiere 4 alternativas,
  pregunta "solo hoy o siempre" y tiene "No recomendar de nuevo". JuggernautAI permite cambiar por un día
  o por todo el bloque. https://www.hevyapp.com/features/workout-plan-generator/ ·
  https://garagegymreviews.com/juggernautai-review
- Error a evitar (RP Hypertrophy): sugerencias que parecen al azar o repetidas.

## Qué hay hoy en el código

- Selector de ejercicios con búsqueda y filtros (`src/components/ExercisePicker.jsx`, `filterExercises`).
- El catálogo trae `primary`, `secondary`, `category` (equipo) y `bodyPart` (`src/lib/catalog.js`).
- Quitar ejercicio con deshacer.

## Alcance

### Sugerencias

Para el ejercicio X, los candidatos se ordenan por grupos (sin X ni los excluidos):
1. Mismo músculo principal **y** mismo equipo (categoría).
2. Mismo músculo principal, otro equipo.
3. Misma zona del cuerpo (`bodyPart`).

Dentro de cada grupo, primero los que **ya hiciste** (más recientes primero, mostrando tu última serie,
p. ej. "la última vez: 30 × 10"), y después el resto por nivel (principiante primero) y nombre.
Se muestran 6 sugerencias y, debajo, el buscador completo del selector existente.

Ejercicios propios sin músculos ni vínculo al catálogo: se usa `bodyPart` y la categoría.

### Al reemplazar

- **En un entrenamiento en curso:**
  - Las series **pendientes** pasan al ejercicio nuevo con el mismo número y tipo, sin peso ni reps
    (no se traspasa el peso entre ejercicios distintos). Si el ejercicio nuevo tiene historial, la
    columna "Anterior" y el ✓ usan ese historial, como siempre.
  - Si ya había series **hechas**: el ejercicio original se queda con las hechas y el nuevo se inserta
    justo debajo con las pendientes. Así el historial de cada ejercicio queda correcto.
  - Se conservan descanso, superserie (feature 04) y nota del entrenamiento.
  - Si el entrenamiento viene de una plantilla, se pregunta: **"Solo hoy"** (por defecto) o **"También en
    la plantilla"**.
- **En el editor de plantilla:** se reemplaza directo, conservando series, tipos y objetivos de reps, pero
  no el peso objetivo. Los ajustes del ejercicio (mínimo aumento, tope, nota fija) son de cada ejercicio y
  no se copian.
- Deshacer disponible por 5 segundos (como al quitar un ejercicio).

### Exclusiones

- En cada sugerencia, "No sugerir más" → `exercise_prefs.exclude_from_suggestions = true`. Se puede
  revertir desde la ficha del ejercicio.

### Interfaz

- Menú del ejercicio → "Reemplazar" (entrenamiento en curso y editor de plantilla).
- Hoja con: nombre del ejercicio actual, sugerencias en filas con miniatura, músculo y equipo
  ("Pecho · Mancuerna"), tu última serie si existe, y el buscador debajo.

## Casos borde

- Ejercicio sin músculo ni zona conocida: sin sugerencias, solo el buscador.
- Reemplazar por un ejercicio que ya está en el entrenamiento: se permite (se agrega otra aparición).
- Reemplazar cuando todas las series están hechas: se ofrece "Agregar después" en lugar de reemplazar.
- "También en la plantilla" en un entrenamiento que no viene de plantilla: la opción no aparece.

## Fuera de alcance

- Sustituciones por lesión o por equipo disponible en el gimnasio.
- Calcular el peso del ejercicio nuevo a partir del anterior.

## Criterios de aceptación

- [ ] Para "Press de banca con barra", las primeras sugerencias son ejercicios de pecho con barra, luego
      pecho con otro equipo, y los que ya hiciste aparecen primero en cada grupo con tu última serie.
- [ ] Reemplazar sin series hechas deja el mismo número y tipo de series, vacías, con "Anterior" del
      ejercicio nuevo.
- [ ] Con 2 de 4 series hechas, el original se queda con 2 y el nuevo aparece debajo con 2 pendientes.
- [ ] "Solo hoy" no cambia la plantilla; "También en la plantilla" la cambia y conserva series y reps objetivo.
- [ ] Deshacer restaura el ejercicio original con sus series.
- [ ] "No sugerir más" saca ese ejercicio de las sugerencias (también en otro dispositivo) y se puede revertir.
- [ ] El historial de ambos ejercicios queda correcto en sus fichas después de terminar.
- [ ] Funciona sin conexión.

## Pruebas

- Unitarias: `substitutes(exercise, catalog, history, excluded)` con los tres grupos y el orden.
- e2e: reemplazar un ejercicio a mitad de entrenamiento con series hechas y revisar el historial.
