// Estado de estancamiento de cada ejercicio (feature 06), sobre los entrenamientos con carga efectiva.
// Se recalcula solo cuando cambian los entrenamientos, los ajustes de ejercicios o el día.
import { state, prefsOf } from './data.js';
import { analysisWorkouts, kindOf } from './effective.js';
import { exerciseSessions } from './stats.js';
import { stallStatus } from './progression.js';

let cache = {};
/** @returns {Map<string, ReturnType<typeof stallStatus>>} solo ejercicios evaluables */
export function stallMap(now = Date.now()) {
  const ws = analysisWorkouts();
  const day = new Date(now).toDateString();
  if (cache.ws === ws && cache.prefs === state.exercise_prefs && cache.day === day) return cache.map;
  const ids = new Set();
  for (const w of ws) for (const e of w.exercises || []) ids.add(e.exercise_id);
  const map = new Map();
  for (const id of ids) {
    if (kindOf(id) === 'tiempo') continue;
    const st = stallStatus(exerciseSessions(ws, id), { now, snoozedAt: prefsOf(id)?.stall_snooze_until || null });
    if (st) map.set(id, st);
  }
  cache = { ws, prefs: state.exercise_prefs, day, map };
  return map;
}

export const stallOf = (id) => {
  const st = stallMap().get(id);
  return st?.stalled ? st : null;
};
