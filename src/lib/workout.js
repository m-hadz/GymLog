// Operaciones de entrenamiento compartidas entre pantallas: empezar uno (vacío, desde
// plantilla o repitiendo otro), crear plantillas y comparar series con el historial.
import { state, getActive, setActive, getSettings, prefsOf } from './data.js';
import { exerciseName, getExercise } from './catalog.js';
import { exerciseSessions, e1rm, previousSets } from './stats.js';
import { analysisWorkouts, bodyweightOn, kindOf } from './effective.js';
import { BODYWEIGHT_KINDS, effectiveLoad, localDay } from './kinds.js';
import { defaultIncrement, knownWeights } from './loads.js';
import { suggest } from './progression.js';
import { DEFAULT_SCHEME, warmupSets } from './warmup.js';
import { stopRest } from './rest-timer.js';
import { uid } from './format.js';
import { navigate } from './router.js';
import { confirmDialog } from '../components/dialogs.jsx';

export function defaultWorkoutName(d = new Date()) {
  const hr = d.getHours();
  return `Entrenamiento por la ${hr < 12 ? 'mañana' : hr < 20 ? 'tarde' : 'noche'}`;
}

// Empieza un entrenamiento. Devuelve false si el usuario no quiso descartar el que está en curso.
export async function startWorkout({ template = null, from = null } = {}) {
  if (getActive()) {
    const ok = await confirmDialog({
      title: 'Ya tienes un entrenamiento en curso',
      message: '¿Descartarlo y empezar otro?',
      confirmLabel: 'Descartar y empezar',
      danger: true,
    });
    if (!ok) return false;
    stopRest();
  }
  const src = template || from;
  const w = {
    id: uid('w_'),
    name: src?.name || defaultWorkoutName(),
    started_at: new Date().toISOString(),
    ended_at: null,
    notes: '',
    template_id: template?.id || null,
    exercises: (src?.exercises || []).map((e) => {
      const sets = (e.sets || []).filter((s) => s.done !== false)
        .map((s) => ({ type: s.type || 'N', weight: null, reps: null, done: false, target: targetOf(s) }));
      const ex = {
        exercise_id: e.exercise_id,
        name: exerciseName(e.exercise_id, e.name),
        rest: e.rest ?? null,
        notes: '',
        sets,
      };
      if (template && e.auto_warmup && kindOf(e.exercise_id) === 'peso_reps') {
        ex.auto_warmup = true;
        if (!sets.some((s) => s.type === 'W')) {
          const work = startWeight(e.exercise_id, sets, template.id);
          ex.sets = [...warmupFor(ex, work).map((w) => ({ type: 'W', weight: w.weight, reps: w.reps, done: false })), ...sets];
        }
      }
      return ex;
    }),
  };
  setActive(w);
  navigate('/workout');
  return true;
}

export function isBarbell(ex) {
  const e = getExercise(ex.exercise_id);
  return e?.category === 'Barra' || /barbell|barra\b/i.test(exerciseName(ex.exercise_id, ex.name));
}

// Lo que hace falta para calcular cargas posibles de un ejercicio (ver loads.js).
export function loadContext(ex, workouts = state.workouts, settings = getSettings()) {
  const category = getExercise(ex.exercise_id)?.category;
  const prefs = prefsOf(ex.exercise_id);
  return {
    category,
    prefs,
    inc: prefs?.min_increment || defaultIncrement(category),
    known: knownWeights(workouts, ex.exercise_id),
    barbell: isBarbell(ex) ? { bar: settings.bar, plates: settings.plates } : null,
  };
}

// Series de calentamiento para un peso de trabajo, con el esquema de los ajustes.
export function warmupFor(ex, work, workouts = state.workouts, settings = getSettings()) {
  const { inc, known, barbell } = loadContext(ex, workouts, settings);
  return warmupSets(work, { inc, known, barbell, scheme: settings.warmupScheme || DEFAULT_SCHEME });
}

// Peso de trabajo al empezar: objetivo para superar → objetivo de la plantilla → vez anterior.
function startWeight(exId, sets, templateId) {
  const settings = getSettings();
  const first = sets.find((s) => s.type !== 'W' && s.type !== 'D');
  if (settings.suggest !== false) {
    const ctx = loadContext({ exercise_id: exId });
    const g = suggest({
      workouts: state.workouts, exId, templateId, prefs: ctx.prefs, increment: ctx.inc, barbell: ctx.barbell,
    });
    if (g?.main.weight) return g.main.weight;
  }
  if (first?.target?.weight) return first.target.weight;
  return previousSets(state.workouts, exId).find((s) => s.type !== 'W' && s.weight)?.weight || 0;
}

export function templateFromWorkout(w, name = w.name) {
  return {
    id: uid('t_'),
    name,
    folder: '',
    notes: '',
    position: state.templates.length,
    exercises: w.exercises.map((e) => ({
      exercise_id: e.exercise_id,
      name: e.name,
      rest: e.rest ?? null,
      sets: e.sets.filter((s) => s.done !== false).map((s) => ({ type: s.type || 'N', weight: s.weight, reps: s.reps, ...(s.seconds ? { seconds: s.seconds } : {}) })),
    })),
  };
}

const targetOf = (s) => ({ weight: s.weight, reps: s.reps, ...(s.seconds ? { seconds: s.seconds } : {}) });

// Compara una serie recién marcada con tu historial:
// 'pr' = mejor que nunca, 'up' / 'eq' / 'down' = frente a la misma serie de la vez anterior.
// Usa la carga efectiva en peso corporal/lastre/asistido y el tiempo en ejercicios por tiempo.
export function setFeedback(exId, set, prevSet, excludeId, date = new Date().toISOString()) {
  const kind = kindOf(exId);
  const timed = kind === 'tiempo';
  if (set.type === 'W' || (timed ? !set.seconds : !set.reps)) return null;
  const bw = BODYWEIGHT_KINDS.has(kind) ? bodyweightOn(localDay(date)) : null;
  const eff = (x) => (BODYWEIGHT_KINDS.has(kind) ? { ...x, weight: effectiveLoad(kind, x.weight || 0, bw) } : x);
  const score = timed ? (x) => (x.reps ? 0 : x.seconds || 0) : (x) => (x.weight ? e1rm(x.weight, x.reps) : x.reps || 0);
  const s = eff(set);
  const sessions = exerciseSessions(analysisWorkouts().filter((w) => w.id !== excludeId), exId);
  const cur = score(s);
  if (!cur) return null;
  const best = Math.max(0, ...sessions.flatMap((ss) => ss.working.filter((x) => timed || !!x.weight === !!s.weight).map(score)));
  if (best && cur > best * 1.001) return 'pr';
  if (!prevSet || prevSet.type === 'W') return null;
  const prev = score(eff(prevSet));
  if (!prev) return null;
  const d = cur / prev - 1;
  return d > 0.005 ? 'up' : d > -0.005 ? 'eq' : 'down';
}

export const FB_LABEL = { pr: 'Récord', up: 'Mejor que la vez anterior', eq: 'Igual que la vez anterior', down: 'Menos que la vez anterior' };
export const SET_TYPES = ['N', 'W', 'D', 'F'];
export const SET_TYPE_LABEL = { N: 'Normal', W: 'Calentamiento', D: 'Drop set', F: 'Al fallo' };
export const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

// Entrenamiento anterior "equivalente": misma plantilla o, si no, mismo nombre.
export function previousOf(w) {
  return state.workouts.find((x) => x.id !== w.id && x.started_at < w.started_at &&
    ((w.template_id && x.template_id === w.template_id) || x.name === w.name));
}
