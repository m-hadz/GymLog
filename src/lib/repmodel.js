// Fórmula personal de reps → 1RM (feature 25). Módulo puro, sin DOM.
// Brzycki supone que todos rinden igual a 3 que a 12 reps. Con tu historial (siempre al fallo) se
// puede medir: si el 1RM estimado de tus sesiones de muchas reps queda sistemáticamente por encima de
// tu tendencia y el de pocas reps por debajo, la fórmula te sobreestima con muchas reps.
// Modelo: e1rm = Brzycki × exp(−β · (reps − R0)), con R0 = tus reps habituales (los valores típicos
// casi no cambian) y β por rep, calibrado contra la tendencia local de cada ejercicio.
import { brzycki } from './stats.js';
import { localResiduals, median } from './trend.js';

export const MAX_REPS_FIT = 15;
export const MIN_POINTS = 60;        // residuos en total
export const MIN_SIDE = 15;          // con ≤5 reps y con ≥9 reps
export const MAX_BETA = 0.015;       // ±1,5 % por rep como máximo
export const MIN_BETA = 0.002;       // menos que esto no vale la pena cambiar la fórmula
const BOOT = 300;

// PRNG determinista (los mismos datos dan el mismo intervalo)
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}

// Pendiente ponderada (mínimos cuadrados) de d contra (r − R0), sin intercepto libre: se centra en
// las medias (la tendencia local ya absorbe el nivel).
function slopeOf(points, r0) {
  let sx = 0, sy = 0, n = 0;
  for (const p of points) { sx += p.r - r0; sy += p.d; n++; }
  const mx = sx / n, my = sy / n;
  let num = 0, den = 0;
  for (const p of points) { const x = p.r - r0 - mx; num += x * (p.d - my); den += x * x; }
  return den > 0 ? num / den : 0;
}

/**
 * Residuos (ln del 1RM de Brzycki menos su tendencia local) por sesión, con las reps de esa serie.
 * @param {Map<string, {t:number, weight:number, reps:number}[]>} byExercise mejor serie por sesión, ascendente
 */
export function repResiduals(byExercise) {
  const out = [];
  for (const sessions of byExercise.values()) {
    const pts = sessions.filter((s) => s.weight > 0 && s.reps > 0 && s.reps <= MAX_REPS_FIT)
      .map((s) => ({ t: s.t, value: brzycki(s.weight, s.reps), r: s.reps }));
    for (const { i, d } of localResiduals(pts)) out.push({ r: pts[i].r, d });
  }
  return out;
}

/**
 * Calibra β. Descarta residuos extremos (más de 4 MAD) y estima un rango con bootstrap.
 * @returns {{beta:number, lo:number, hi:number, r0:number, n:number, low:number, high:number,
 *   confident:boolean, buckets:{label:string, n:number, bias:number}[], reason:string|null}}
 */
export function fitRepModel(residuals) {
  const ds = residuals.map((p) => p.d);
  const med = median(ds) ?? 0;
  const mad = median(ds.map((d) => Math.abs(d - med))) || 0.01;
  const pts = residuals.filter((p) => Math.abs(p.d - med) <= 4 * 1.4826 * mad);
  const r0 = Math.round(median(pts.map((p) => p.r)) || 7);
  const low = pts.filter((p) => p.r <= 5).length;
  const high = pts.filter((p) => p.r >= 9).length;
  const buckets = [['1–5', (r) => r <= 5], ['6–8', (r) => r >= 6 && r <= 8], ['9–12', (r) => r >= 9 && r <= 12], ['13–15', (r) => r >= 13]]
    .map(([label, f]) => {
      const xs = pts.filter((p) => f(p.r)).map((p) => p.d);
      return { label, n: xs.length, bias: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null };
    });
  const base = { r0, n: pts.length, low, high, buckets };
  if (pts.length < MIN_POINTS || low < MIN_SIDE || high < MIN_SIDE) {
    return { ...base, beta: 0, lo: 0, hi: 0, confident: false, reason: 'pocos' };
  }
  const beta = slopeOf(pts, r0);
  const rand = rng(pts.length * 7919 + Math.round(beta * 1e6));
  const boots = [];
  for (let b = 0; b < BOOT; b++) {
    const sample = pts.map(() => pts[Math.floor(rand() * pts.length)]);
    boots.push(slopeOf(sample, r0));
  }
  boots.sort((a, b) => a - b);
  const lo = boots[Math.floor(BOOT * 0.05)];
  const hi = boots[Math.floor(BOOT * 0.95)];
  const significant = lo > 0 || hi < 0;
  const big = Math.abs(beta) >= MIN_BETA;
  return {
    ...base,
    beta: Math.max(-MAX_BETA, Math.min(MAX_BETA, beta)), lo, hi,
    confident: significant && big,
    reason: !significant ? 'ruido' : !big ? 'chico' : null,
  };
}

/** Factor por reps del modelo (1 si no hay confianza). */
export function adjustOf(model) {
  if (!model?.confident || !model.beta) return () => 1;
  const { beta, r0 } = model;
  return (reps) => Math.exp(-beta * (Math.min(reps, MAX_REPS_FIT) - r0));
}
