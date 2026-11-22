// Reemplazar un ejercicio (feature 10): sugerencias de sustitutos y cómo se traspasan las series.
// Módulo puro, sin DOM ni estado global (se le pasa el catálogo y el historial).

const LEVEL_ORDER = { beginner: 0, intermediate: 1, expert: 2 };
export const SUGGEST_LIMIT = 6;
// Los propios no tienen nivel: van con los de principiante (son tuyos, es probable que te sirvan)
const levelOf = (e) => LEVEL_ORDER[e.level] ?? (e.custom ? 0 : 3);
const UNKNOWN_PARTS = new Set(['Otro', '', undefined, null]);
// Del catálogo no se sugieren estiramientos, pliometría, strongman ni cardio: no reemplazan una serie de fuerza
const NOT_SUBSTITUTES = new Set(['stretching', 'plyometrics', 'strongman', 'cardio']);
// "Otro" no es un equipo conocido: no cuenta como "mismo equipo"
const sameEquipment = (a, b) => a.category === b.category && a.category !== 'Otro';

// Músculo principal comparable. Si el ejercicio no trae músculos del catálogo (propio sin vincular)
// o el usuario le cambió el grupo (feature 08), manda el grupo (bodyPart).
const muscleOf = (e) => (e.primary?.[0] && !e.defaultBodyPart ? `m:${e.primary[0]}` : `p:${e.bodyPart}`);

function sameMuscle(a, b) {
  const ma = muscleOf(a);
  const mb = muscleOf(b);
  if (ma[0] === mb[0]) return ma === mb && (ma[0] === 'm' || !UNKNOWN_PARTS.has(a.bodyPart));
  // uno con músculo del catálogo y otro solo con grupo: se comparan los grupos
  return !UNKNOWN_PARTS.has(a.bodyPart) && a.bodyPart === b.bodyPart;
}

/**
 * Última vez que se hizo cada ejercicio: fecha y su mejor serie efectiva (más peso, luego más reps).
 * @param {object[]} workouts de más nuevo a más viejo (como state.workouts)
 * @returns {Map<string, {date:string, set:object}>}
 */
export function lastSetIndex(workouts) {
  const map = new Map();
  for (const w of workouts || []) {
    for (const e of w.exercises || []) {
      if (map.has(e.exercise_id)) continue;
      let best = null;
      for (const s of e.sets || []) {
        if (s.done === false || s.type === 'W' || !((s.reps || 0) > 0 || (s.seconds || 0) > 0)) continue;
        if (!best || (s.weight || 0) > (best.weight || 0)
          || ((s.weight || 0) === (best.weight || 0) && (s.reps || 0) > (best.reps || 0))) best = s;
      }
      if (best) map.set(e.exercise_id, { date: w.started_at, set: best });
    }
  }
  return map;
}

/**
 * Sustitutos para `exercise`, en tres grupos: 1) mismo músculo y equipo, 2) mismo músculo, otro
 * equipo (o equipo "Otro"), 3) mismo grupo del cuerpo. Sin estiramientos ni pliometría. En cada grupo, primero los que ya hiciste (más recientes
 * primero) y después por nivel (principiante primero) y nombre.
 * @param {object} exercise {id, primary, bodyPart, category, catalogId?}
 * @param {object[]} catalog todos los ejercicios (propios y del catálogo)
 * @param {Map<string, {date, set}>} history lastSetIndex(...)
 * @param {Set<string>} excluded ids con "No sugerir más"
 * @returns {{exercise:object, group:1|2|3, last:{date, set}|null}[]}
 */
export function substitutes(exercise, catalog, history = new Map(), excluded = new Set(), limit = SUGGEST_LIMIT) {
  if (!exercise) return [];
  const known = !UNKNOWN_PARTS.has(exercise.bodyPart) || (exercise.primary?.[0] && !exercise.defaultBodyPart);
  if (!known || exercise.bodyPart === 'Cardio') return [];
  // El mismo ejercicio con otro id (propio vinculado al del catálogo) no es un sustituto, y un
  // ejercicio del catálogo que ya tienes como propio vinculado no se repite.
  const same = new Set([exercise.id, exercise.catalogId].filter(Boolean));
  const linked = new Set();
  for (const e of catalog) {
    if (!e.custom || !e.catalogId) continue;
    if (e.catalogId === exercise.id) same.add(e.id);
    linked.add(e.catalogId);
  }
  const out = [];
  for (const e of catalog) {
    if (same.has(e.id) || excluded.has(e.id) || (!e.custom && linked.has(e.id)) || NOT_SUBSTITUTES.has(e.type)) continue;
    let group = 0;
    if (sameMuscle(exercise, e)) group = sameEquipment(e, exercise) ? 1 : 2;
    else if (!UNKNOWN_PARTS.has(exercise.bodyPart) && e.bodyPart === exercise.bodyPart) group = 3;
    if (group) out.push({ exercise: e, group, last: history.get(e.id) || null });
  }
  out.sort((a, b) => a.group - b.group
    || (!!b.last - !!a.last)
    || (a.last && b.last ? (a.last.date < b.last.date ? 1 : a.last.date > b.last.date ? -1 : 0) : 0)
    || (levelOf(a.exercise) - levelOf(b.exercise))
    || a.exercise.name.localeCompare(b.exercise.name, 'es'));
  return out.slice(0, limit);
}

// Serie vacía para el ejercicio nuevo: mismo tipo, sin peso ni reps (no se traspasa el peso entre
// ejercicios distintos). En la plantilla se conservan las reps objetivo.
const emptySet = (s, { done, keepReps }) => ({
  type: s.type || 'N', weight: null, reps: keepReps ? s.reps ?? null : null, ...(done == null ? {} : { done }),
});

// Lo que se conserva del ejercicio reemplazado: descanso, calentamiento automático y nota de hoy.
const carry = (old, { exercise_id, name }, sets) => ({
  exercise_id, name, rest: old.rest ?? null, notes: old.notes || '',
  ...(old.auto_warmup ? { auto_warmup: true } : {}),
  sets,
});

/**
 * Reemplaza el ejercicio `ei` de un entrenamiento en curso (muta `exercises`).
 * - Sin series hechas: en su lugar, con las pendientes vacías.
 * - Con hechas y pendientes: el original se queda con las hechas y el nuevo va debajo con las pendientes.
 * - Todas hechas: el nuevo se agrega debajo con la misma cantidad de series ("Agregar después").
 * Los calentamientos pendientes no pasan: dependen del peso del ejercicio anterior.
 * @returns {{index:number, split:boolean, added:boolean}} dónde quedó el ejercicio nuevo
 */
export function replaceActive(exercises, ei, next) {
  const old = exercises[ei];
  const done = old.sets.filter((s) => s.done);
  const pending = old.sets.filter((s) => !s.done);
  const allDone = done.length > 0 && !pending.length;
  const source = allDone ? done : pending;
  let sets = source.filter((s) => s.type !== 'W').map((s) => emptySet(s, { done: false }));
  if (!sets.length) sets = [{ type: 'N', weight: null, reps: null, done: false }];
  // Reps objetivo de la plantilla: siguen sirviendo de guía (el peso no)
  source.filter((s) => s.type !== 'W').forEach((s, i) => { if (s.target?.reps != null) sets[i].target = { weight: null, reps: s.target.reps }; });
  if (!done.length) {
    exercises[ei] = carry(old, next, sets);
    return { index: ei, split: false, added: false };
  }
  const nu = carry(old, next, sets);
  nu.notes = '';
  if (!allDone) old.sets = done;
  exercises.splice(ei + 1, 0, nu);
  return { index: ei + 1, split: !allDone, added: allDone };
}

/** Reemplaza el ejercicio `ei` de una plantilla (muta `exercises`): mismas series, tipos y reps objetivo, sin peso. */
export function replaceTemplate(exercises, ei, next) {
  const old = exercises[ei];
  let sets = (old.sets || []).map((s) => emptySet(s, { keepReps: true }));
  if (!sets.length) sets = [{ type: 'N', weight: null, reps: null }];
  exercises[ei] = carry(old, next, sets);
  return { index: ei };
}

/**
 * Posición en la plantilla del ejercicio `ei` del entrenamiento: la misma aparición (1.ª, 2.ª…) del
 * mismo ejercicio. -1 si la plantilla no lo tiene.
 */
export function templateIndexOf(workoutExercises, ei, templateExercises) {
  const id = workoutExercises[ei]?.exercise_id;
  const nth = workoutExercises.slice(0, ei).filter((e) => e.exercise_id === id).length;
  let seen = 0;
  for (let i = 0; i < (templateExercises || []).length; i++) {
    if (templateExercises[i].exercise_id !== id) continue;
    if (seen++ === nth) return i;
  }
  return -1;
}
