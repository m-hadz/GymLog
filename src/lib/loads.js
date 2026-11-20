// Cargas posibles de un ejercicio: mínimo aumento, pesos conocidos (los que ya usaste) y
// tope de la máquina. Las máquinas no tienen pasos parejos (14,7 → 16,2 → 17 kg), así que
// las propuestas prefieren pesos reales del historial. Módulo puro, sin DOM.
import { platesFor } from './plates.js';
import { isWorking } from './stats.js';

const EPS = 1e-6;
const r2 = (x) => Math.round(x * 100) / 100;

// Mínimo aumento cuando el ejercicio no tiene uno definido
const DEFAULT_INCREMENT = { Barra: 2.5, 'Barra Z': 2.5, Mancuerna: 2 };
export const defaultIncrement = (category) => DEFAULT_INCREMENT[category] ?? 1;

// Pesos distintos (> 0) de las series efectivas de un ejercicio, de menor a mayor.
export function knownWeights(workouts, exId) {
  const set = new Set();
  for (const w of workouts) {
    for (const e of w.exercises || []) {
      if (e.exercise_id !== exId) continue;
      for (const s of e.sets || []) if (isWorking(s) && s.weight > 0) set.add(r2(s.weight));
    }
  }
  return [...set].sort((a, b) => a - b);
}

// Con barra: el peso tiene que poder armarse con la barra y los discos configurados.
const buildable = (kg, barbell) =>
  kg >= barbell.bar - EPS && Math.abs(platesFor(kg, barbell.bar, barbell.plates).rest) < EPS;
const barUnit = (barbell) => 2 * Math.min(...barbell.plates);

function snap(kg, barbell, dir) {
  const unit = barUnit(barbell);
  let x = r2(barbell.bar + (dir > 0 ? Math.ceil((kg - barbell.bar) / unit - EPS) : Math.floor((kg - barbell.bar) / unit + EPS)) * unit);
  for (let i = 0; i < 50 && x >= barbell.bar && !buildable(x, barbell); i++) x = r2(x + dir * unit);
  return Math.max(x, barbell.bar);
}

/**
 * Siguiente carga hacia arriba: la menor entre el siguiente peso conocido y kg + mínimo aumento.
 * Nunca pasa del tope (si el tope queda en medio, propone el tope). null si no se puede subir.
 * @param {number} kg
 * @param {{ inc: number, known?: number[], max?: number|null, barbell?: {bar:number, plates:number[]}|null }} o
 */
export function nextLoad(kg, { inc, known = [], max = null, barbell = null }) {
  if (max != null && kg >= max - EPS) return null;
  let c = r2(kg + inc);
  if (barbell) c = snap(c, barbell, 1);
  const k = known.find((w) => w > kg + EPS);
  if (k != null && k < c) c = k;
  if (max != null && c > max + EPS) return max > kg + EPS ? max : null;
  return c;
}

/**
 * Bajar un porcentaje: el peso conocido (menor que kg) más cercano a kg × (1 − pct) si está a menos
 * de un mínimo aumento; si no, kg × (1 − pct) redondeado hacia abajo al mínimo aumento (o a los
 * discos, con barra). null si no queda un peso válido.
 */
export function lowerLoad(kg, pct, { inc, known = [], barbell = null }) {
  const target = kg * (1 - pct);
  const near = known.filter((w) => w < kg - EPS && Math.abs(w - target) <= inc + EPS);
  if (near.length) {
    return near.reduce((a, b) => {
      const da = Math.abs(a - target);
      const db = Math.abs(b - target);
      return db < da - EPS || (Math.abs(db - da) <= EPS && b > a) ? b : a;
    });
  }
  if (barbell) {
    const x = snap(target, barbell, -1);
    return x < kg - EPS ? x : null;
  }
  const x = r2(Math.floor(target / inc + EPS) * inc);
  return x > 0 ? x : null;
}
