// Sugerencia de progresión (feature 01): cómo superar el 1RM estimado de la vez anterior.
// Con una serie al fallo por ejercicio, cada sesión es un intento de superar la anterior:
// se proponen las reps necesarias con el mismo peso y con el siguiente peso posible.
// Módulo puro, sin DOM (ver docs/features/01-sugerencia-progresion.md).
import { e1rm, isWorking } from './stats.js';
import { knownWeights, lowerLoad, nextLoad } from './loads.js';

export const BEAT = 1.005;        // "superar" = mismo umbral con que setFeedback pinta verde
export const MAX_REPS = 15;       // Brzycki pierde precisión con muchas reps
export const DEFAULT_REP_MAX = 12; // sobre esto se propone subir peso
export const PAUSE_DAYS = 14;
export const PAUSE_DROP = 0.1;

// Menor número de reps con `weight` cuyo 1RM estimado supera `target` (o lo iguala con orEqual).
export function repsToBeat(weight, target, orEqual = false) {
  if (!(weight > 0) || !(target > 0)) return null;
  for (let r = 1; r <= 30; r++) {
    const v = e1rm(weight, r);
    if (orEqual ? v >= target * (1 - 1e-9) : v > target * (1 + 1e-9)) return r;
  }
  return null;
}

const score = (s) => (s.weight ? e1rm(s.weight, s.reps) : s.reps || 0);

// Mejor serie efectiva (sin calentamientos ni drop sets) de una lista de series.
export function referenceSet(sets) {
  let best = null;
  for (const s of sets || []) {
    if (!isWorking(s) || s.type === 'D') continue;
    if (!best || score(s) > score(best)) best = s;
  }
  return best;
}

// Última sesión del ejercicio (antes de `before`, sin `excludeId`, opcionalmente de la misma plantilla).
export function lastSession(workouts, exId, { excludeId, before, templateId } = {}) {
  const sorted = [...workouts].sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  for (const w of sorted) {
    if (w.id === excludeId) continue;
    if (before && w.started_at >= before) continue;
    if (templateId && w.template_id !== templateId) continue;
    const sets = (w.exercises || []).filter((e) => e.exercise_id === exId).flatMap((e) => e.sets || []);
    const set = referenceSet(sets);
    if (set) return { workout: w, set };
  }
  return null;
}

/**
 * @returns {null | {
 *   source: 'superar'|'pausa'|'reps', ref: object, days: number,
 *   main: {weight:number|null, reps:number}, alt: {weight:number, reps:number}|null, atMax: boolean
 * }}
 */
export function suggest({
  workouts, exId, excludeId, before, templateId, prefs = null, increment = 1, barbell = null, now = Date.now(),
}) {
  const p = prefs || {};
  const last = lastSession(workouts, exId, {
    excludeId, before, templateId: p.compare_same_template && templateId ? templateId : null,
  });
  if (!last) return null;
  const ref = { weight: last.set.weight || 0, reps: last.set.reps };
  const days = (now - Date.parse(last.workout.started_at)) / 864e5;
  const base = { ref, days, alt: null, atMax: false };

  if (!ref.weight) return { ...base, source: 'reps', main: { weight: null, reps: ref.reps + 1 } };

  const E = e1rm(ref.weight, ref.reps);
  const max = p.max_load ?? null;
  const opts = { inc: p.min_increment || increment, known: knownWeights(workouts, exId), max, barbell };

  if (days >= PAUSE_DAYS) {
    const w = lowerLoad(ref.weight, PAUSE_DROP, opts);
    const r = w && repsToBeat(w, E, true);
    const main = r && r <= MAX_REPS ? { weight: w, reps: r } : { ...ref };
    return { ...base, source: 'pausa', main };
  }

  const T = E * BEAT;
  const upW = nextLoad(ref.weight, opts);
  const upR = upW && repsToBeat(upW, T);
  const up = upR ? { weight: upW, reps: upR } : null;
  const sameR = repsToBeat(ref.weight, T);
  const same = sameR && (sameR <= MAX_REPS || !up) ? { weight: ref.weight, reps: sameR } : null;
  const repMax = p.rep_max || DEFAULT_REP_MAX;

  let main = same || up;
  let alt = same && up ? up : null;
  if (same && up && same.reps > repMax) { main = up; alt = same; }
  if (!main) return null;
  const atMax = max != null && ref.weight >= max - 1e-6 && main.reps > repMax;
  return { ...base, source: 'superar', main, alt, atMax };
}
