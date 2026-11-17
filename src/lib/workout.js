// Operaciones de entrenamiento compartidas entre pantallas: empezar uno (vacío, desde
// plantilla o repitiendo otro), crear plantillas y comparar series con el historial.
import { state, getActive, setActive } from './data.js';
import { exerciseName } from './catalog.js';
import { exerciseSessions, e1rm } from './stats.js';
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
    exercises: (src?.exercises || []).map((e) => ({
      exercise_id: e.exercise_id,
      name: exerciseName(e.exercise_id, e.name),
      rest: e.rest ?? null,
      notes: '',
      sets: (e.sets || []).filter((s) => s.done !== false)
        .map((s) => ({ type: s.type || 'N', weight: null, reps: null, done: false, target: { weight: s.weight, reps: s.reps } })),
    })),
  };
  setActive(w);
  navigate('/workout');
  return true;
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
      sets: e.sets.filter((s) => s.done !== false).map((s) => ({ type: s.type || 'N', weight: s.weight, reps: s.reps })),
    })),
  };
}

// Compara una serie recién marcada con tu historial:
// 'pr' = mejor que nunca, 'up' / 'eq' / 'down' = frente a la misma serie de la vez anterior.
export function setFeedback(exId, s, prevSet, excludeId) {
  if (s.type === 'W' || !s.reps) return null;
  const sessions = exerciseSessions(state.workouts.filter((w) => w.id !== excludeId), exId);
  const score = (x) => (x.weight ? e1rm(x.weight, x.reps) : x.reps || 0);
  const cur = score(s);
  if (!cur) return null;
  const best = Math.max(0, ...sessions.flatMap((ss) => ss.working.filter((x) => !!x.weight === !!s.weight).map(score)));
  if (best && cur > best * 1.001) return 'pr';
  if (!prevSet || prevSet.type === 'W') return null;
  const prev = score(prevSet);
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
