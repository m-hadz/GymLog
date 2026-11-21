// Series de calentamiento (feature 02): porcentajes del peso de trabajo, redondeados a cargas
// posibles (discos, pesos conocidos o mínimo aumento). Módulo puro, sin DOM.
// Ver docs/features/02-calentamiento.md.
import { roundLoad } from './loads.js';

// pct 0 = barra vacía (solo con barra)
export const DEFAULT_SCHEME = {
  bar: [{ pct: 0, reps: 10 }, { pct: 40, reps: 5 }, { pct: 60, reps: 5 }, { pct: 80, reps: 3 }],
  other: [{ pct: 50, reps: 8 }, { pct: 75, reps: 4 }],
};
export const DEFAULT_WARMUP_REST = 60;

/**
 * @param {number} work  peso de la primera serie efectiva
 * @param {{ inc: number, known?: number[], barbell?: {bar:number, plates:number[]}|null,
 *           scheme?: typeof DEFAULT_SCHEME }} o
 * @returns {{weight:number, reps:number}[]}
 */
export function warmupSets(work, { inc, known = [], barbell = null, scheme = DEFAULT_SCHEME }) {
  if (!(work > 0)) return [];
  const steps = (barbell ? scheme.bar : scheme.other) || [];
  if (barbell && work <= barbell.bar + 10 + 1e-6) {
    const first = steps.find((s) => !s.pct);
    return first && work > barbell.bar + 1e-6 ? [{ weight: barbell.bar, reps: first.reps }] : [];
  }
  // Los pesos conocidos mayores o iguales al de trabajo no sirven para calentar
  const below = known.filter((w) => w < work - 1e-6);
  const out = [];
  for (const st of steps) {
    let w;
    if (!st.pct) {
      if (!barbell) continue;
      w = barbell.bar;
    } else {
      w = roundLoad((work * st.pct) / 100, { inc, known: below, barbell });
      if (barbell && w <= barbell.bar + 1e-6) continue; // igual a la barra vacía
    }
    if (!(w > 0) || w >= work - 1e-6) continue;
    if (out.length && w <= out.at(-1).weight + 1e-6) continue; // igual (o menor) que el anterior
    out.push({ weight: w, reps: st.reps });
  }
  return out;
}

// "barra×10, 40×5, 60×5" ⇄ pasos. Devuelve null si el texto no se entiende.
export function parseScheme(text) {
  const steps = [];
  for (const tok of String(text).split(/[,;·]+/).map((t) => t.trim()).filter(Boolean)) {
    const m = tok.match(/^(barra|\d+(?:[.,]\d+)?)\s*%?\s*[x×*]\s*(\d+)$/i);
    if (!m) return null;
    const pct = /barra/i.test(m[1]) ? 0 : Number(m[1].replace(',', '.'));
    const reps = Number(m[2]);
    if (pct < 0 || pct >= 100 || reps < 1 || reps > 30) return null;
    steps.push({ pct, reps });
  }
  return steps;
}
export const schemeText = (steps) =>
  steps.map((s) => `${s.pct ? String(s.pct).replace('.', ',') : 'barra'}×${s.reps}`).join(', ');
