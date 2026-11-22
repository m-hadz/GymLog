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
    if (!isWorking(s) || s.type === 'D' || !(s.reps > 0)) continue;
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
 *   main: {weight:number|null, reps:number}, alt: {weight:number, reps:number}|null, atMax: boolean,
 *   reset?: {weight:number, reps:number, pct:number}|null
 * }}
 * Con `stalled`, propone además el reinicio (feature 06): bajar `resetPct` y superar el 1RM con más reps.
 */
export function suggest({
  workouts, exId, excludeId, before, templateId, prefs = null, increment = 1, barbell = null, now = Date.now(),
  stalled = false, resetPct = RESET_PCT,
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
  const reset = stalled ? resetTarget(ref, opts, resetPct) : null;
  return { ...base, source: 'superar', main, alt, atMax, reset };
}

// ---- Estancamiento y reinicio (feature 06) ----
// Calibrado con el historial real (una serie al fallo por ejercicio): ver docs/features/06.
export const STALL_WINDOW = 6;          // sesiones por ventana
export const STALL_MIN_SESSIONS = 12;   // dos ventanas completas
export const STALL_GAIN = 0.01;         // las últimas 6 deben superar a las 6 anteriores en más de 1 %
export const STALL_RECENT_DAYS = 21;    // si la última sesión es más vieja, aplica la pausa de 01
export const STALL_SNOOZE_SESSIONS = 7; // "Ignorar por 7 sesiones"
export const RESET_PCT = 0.1;           // bajar 10 % por defecto (ajuste: 5–15 %)
export const RESET_MIN_PCT = 0.05;

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * ¿Está estancado el ejercicio? Usa el mejor 1RM estimado de cada sesión (o las reps máximas si la
 * última sesión fue sin peso).
 * @param {object[]} sessions exerciseSessions() (ascendente)
 * @param {{now?:number, snoozedAt?:string|null}} [o] snoozedAt: started_at de la última sesión al
 *   elegir "Ignorar por 7 sesiones"; mientras haya menos de 7 sesiones después, no se marca.
 * @returns {null | {stalled:boolean, metric:'e1rm'|'reps', recent:number, prior:number, since:string,
 *   scores:{date:string, value:number}[], snoozed:boolean}}
 */
export function stallStatus(sessions, { now = Date.now(), snoozedAt = null } = {}) {
  const last = sessions.at(-1);
  if (!last) return null;
  const metric = last.bestE1rm > 0 ? 'e1rm' : 'reps';
  const scored = sessions
    .map((s) => ({ date: s.workout.started_at, value: metric === 'e1rm' ? s.bestE1rm : Math.max(0, ...s.working.map((x) => x.reps || 0)) }))
    .filter((x) => x.value > 0);
  if (scored.length < STALL_MIN_SESSIONS) return null;
  if ((now - Date.parse(scored.at(-1).date)) / 864e5 > STALL_RECENT_DAYS) return null;
  const recentList = scored.slice(-STALL_WINDOW);
  const recent = avg(recentList.map((x) => x.value));
  const prior = avg(scored.slice(-2 * STALL_WINDOW, -STALL_WINDOW).map((x) => x.value));
  const snoozed = !!snoozedAt && scored.filter((x) => x.date > snoozedAt).length < STALL_SNOOZE_SESSIONS;
  return {
    stalled: recent <= prior * (1 + STALL_GAIN) && !snoozed,
    metric, recent, prior, snoozed,
    since: recentList[0].date,
    scores: scored.slice(-2 * STALL_WINDOW),
  };
}

/**
 * Reinicio: bajar el peso de la última sesión un X % y las reps para superar su 1RM estimado.
 * Si harían falta más de 15 reps, prueba porcentajes menores (hasta 5 %).
 * @param {{weight:number, reps:number}} ref serie de referencia (la de la última sesión)
 * @param {{inc:number, known?:number[], barbell?:object|null}} opts cargas posibles (loads.js)
 * @returns {null | {weight:number, reps:number, pct:number}}
 */
export function resetTarget(ref, opts, pct = RESET_PCT) {
  if (!(ref?.weight > 0) || !(ref.reps > 0)) return null;
  const T = e1rm(ref.weight, ref.reps) * BEAT;
  for (let p = Math.round(pct * 100); p >= Math.round(RESET_MIN_PCT * 100); p--) {
    const w = lowerLoad(ref.weight, p / 100, opts);
    const r = w && repsToBeat(w, T);
    if (r && r <= MAX_REPS) return { weight: w, reps: r, pct: p / 100 };
  }
  return null;
}
