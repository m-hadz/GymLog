// Rendimiento de la sesión y qué lo explica (feature 23) y efecto del orden (feature 24).
// Módulo puro, sin DOM. Todo se mide contra la tendencia de cada ejercicio (trend.js), así que el
// progreso normal no se confunde con "rendí mejor".
import { mean } from './trend.js';

export const BEAT = 1.005;          // mismo umbral que "superar" en la comparación en vivo
export const MIN_GROUP = 6;         // sesiones mínimas por grupo para comparar
export const MIN_EFFECT = 0.005;    // diferencias menores a 0,5 % no se reportan
export const ORDER_MIN_SESSIONS = 10;
export const ORDER_MIN_RANGE = 3;   // el ejercicio tiene que haber cambiado de puesto al menos 3 lugares
const BOOT = 1000;
// Comparaciones múltiples (Bonferroni): con k grupos o k ejercicios evaluados, cada intervalo se
// calcula al 1 − 0,05/k. Sin esto, con 18 ejercicios al 95 % sale ~1 "efecto" que es solo azar.
const ALPHA = 0.05;
const interval = (sorted, k) => {
  const a = ALPHA / Math.max(1, k) / 2;
  return [sorted[Math.floor((sorted.length - 1) * a)], sorted[Math.ceil((sorted.length - 1) * (1 - a))]];
};

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}

/**
 * Puntaje de un entrenamiento: cuántos ejercicios superaron, igualaron o quedaron bajo su sesión
 * anterior (a menos de 21 días), y cuánto rindió contra lo esperado por su tendencia.
 * @param {{e:number, prev:number|null, expected:number|null}[]} items
 * @returns {{beaten:number, equal:number, below:number, total:number, vsExpected:number|null, n:number}}
 */
export function sessionScore(items) {
  let beaten = 0, equal = 0, below = 0;
  const logs = [];
  for (const it of items) {
    if (!(it.e > 0)) continue;
    if (it.prev > 0) {
      if (it.e > it.prev * BEAT) beaten++;
      else if (it.e >= it.prev / BEAT) equal++;
      else below++;
    }
    if (it.expected > 0) logs.push(Math.log(it.e / it.expected));
  }
  return { beaten, equal, below, total: beaten + equal + below, vsExpected: logs.length ? mean(logs) : null, n: logs.length };
}

/** Percentil (0–100) de `value` dentro de `history` (qué % de las sesiones quedó por debajo). */
export function percentileOf(value, history) {
  if (value == null || !history.length) return null;
  const below = history.filter((x) => x < value).length;
  const same = history.filter((x) => x === value).length;
  return Math.round(((below + same / 2) / history.length) * 100);
}

/**
 * Compara cada grupo contra el resto: efecto = media del grupo − media del resto (en ln, ≈ %), con
 * intervalo por bootstrap al 95 % corregido por la cantidad de grupos. "real" solo si el intervalo no
 * cruza 0 y el efecto supera 0,5 %.
 * @param {{d:number}[]} rows
 * @param {(row)=>string|null} keyOf
 * @returns {{key:string, n:number, effect:number|null, lo:number|null, hi:number|null, verdict:'mejor'|'peor'|'igual'|'pocos'}[]}
 */
export function compareGroups(rows, keyOf, { minN = MIN_GROUP, seed = 1 } = {}) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r.d);
  }
  const all = [...groups.values()].flat();
  const rand = rng(seed + all.length);
  const k = [...groups.values()].filter((v) => v.length >= minN).length;
  const out = [];
  for (const [key, xs] of groups) {
    const rest = [...groups].filter(([k]) => k !== key).flatMap(([, v]) => v);
    if (xs.length < minN || rest.length < minN) { out.push({ key, n: xs.length, effect: null, lo: null, hi: null, verdict: 'pocos' }); continue; }
    const effect = mean(xs) - mean(rest);
    const boots = [];
    for (let b = 0; b < BOOT; b++) {
      const a = xs.map(() => xs[Math.floor(rand() * xs.length)]);
      const c = rest.map(() => rest[Math.floor(rand() * rest.length)]);
      boots.push(mean(a) - mean(c));
    }
    boots.sort((a, b) => a - b);
    const [lo, hi] = interval(boots, k);
    const real = (lo > 0 || hi < 0) && Math.abs(effect) >= MIN_EFFECT;
    out.push({ key, n: xs.length, effect, lo, hi, verdict: real ? (effect > 0 ? 'mejor' : 'peor') : 'igual' });
  }
  return out;
}

// Pendiente (mínimos cuadrados) de d contra x, con intervalo por bootstrap (corregido por k pruebas)
function slopeCI(pts, seed, k = 1) {
  const fit = (ps) => {
    const mx = mean(ps.map((p) => p.x)), my = mean(ps.map((p) => p.d));
    let num = 0, den = 0;
    for (const p of ps) { num += (p.x - mx) * (p.d - my); den += (p.x - mx) ** 2; }
    return den > 0 ? num / den : 0;
  };
  const slope = fit(pts);
  const rand = rng(seed + pts.length);
  const boots = [];
  for (let b = 0; b < BOOT; b++) boots.push(fit(pts.map(() => pts[Math.floor(rand() * pts.length)])));
  boots.sort((a, b) => a - b);
  const [lo, hi] = interval(boots, k);
  return { slope, lo, hi };
}

/**
 * Efecto del orden (feature 24): cuánto cambia el rendimiento por cada puesto que un ejercicio va
 * más tarde que su puesto habitual (mediana). Global (todos los ejercicios juntos) y por ejercicio
 * (si cambió de puesto lo suficiente).
 * @param {{ex:string, pos:number, d:number}[]} rows residuos por sesión de ejercicio
 * @returns {{global:{slope:number, lo:number, hi:number, n:number, real:boolean}|null,
 *   byExercise: Map<string, {slope:number, lo:number, hi:number, n:number, range:number, usual:number, real:boolean}>}}
 */
export function orderEffect(rows) {
  const byEx = new Map();
  for (const r of rows) {
    if (!byEx.has(r.ex)) byEx.set(r.ex, []);
    byEx.get(r.ex).push(r);
  }
  const usual = new Map();
  for (const [ex, rs] of byEx) {
    const s = rs.map((r) => r.pos).sort((a, b) => a - b);
    usual.set(ex, s[s.length >> 1]);
  }
  const pts = rows.map((r) => ({ x: r.pos - usual.get(r.ex), d: r.d, ex: r.ex }));
  const moved = pts.filter((p) => p.x !== 0).length;
  const isReal = (c) => (c.lo > 0 || c.hi < 0) && Math.abs(c.slope) * 3 >= MIN_EFFECT;
  const global = pts.length >= 30 && moved >= 10 ? (() => { const c = slopeCI(pts, 3); return { ...c, n: pts.length, moved, real: isReal(c) }; })() : null;
  const byExercise = new Map();
  const eligible = [...byEx].filter(([, rs]) => rs.length >= ORDER_MIN_SESSIONS
    && Math.max(...rs.map((r) => r.pos)) - Math.min(...rs.map((r) => r.pos)) >= ORDER_MIN_RANGE);
  for (const [ex, rs] of eligible) {
    const ps = pts.filter((p) => p.ex === ex);
    const range = Math.max(...rs.map((r) => r.pos)) - Math.min(...rs.map((r) => r.pos));
    const c = slopeCI(ps, ex.length, eligible.length);
    byExercise.set(ex, { ...c, n: ps.length, range, usual: usual.get(ex), real: isReal(c) });
  }
  return { global, byExercise };
}

/**
 * Factor por el que multiplicar el objetivo de hoy si el ejercicio va `shift` puestos más tarde que
 * de costumbre. Solo con un efecto real (del ejercicio, o global si el ejercicio no tiene datos).
 */
export function orderAdjust(effect, ex, shift) {
  if (!effect || !shift) return 1;
  const own = effect.byExercise.get(ex);
  const src = own?.real ? own : !own && effect.global?.real ? effect.global : null;
  if (!src) return 1;
  return Math.exp(src.slope * shift);
}
