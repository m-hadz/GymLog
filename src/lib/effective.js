// Entrenamientos "para analizar": con la carga efectiva de los ejercicios de peso corporal,
// lastre y asistidos (ver kinds.js). Se calcula una vez y se reutiliza mientras no cambien los
// entrenamientos, los ajustes de ejercicios, el peso corporal, el catálogo o el ajuste de volumen.
// Para mostrar y analizar; para editar o guardar se usan siempre los entrenamientos de `state`.
import { state, getSettings, prefsOf, syncedSettings } from './data.js';
import { catalogChannel, getExercise } from './catalog.js';
import { bodyweightLookup } from './body.js';
import { resolveKind, resolveLoadMode, withEffectiveLoads } from './kinds.js';
import { brzycki, isWorking, setRepAdjust } from './stats.js';
import { adjustOf, fitRepModel, repResiduals } from './repmodel.js';

export const kindOf = (exId) => resolveKind(prefsOf(exId), getExercise(exId));
export const loadModeOf = (exId) => resolveLoadMode(prefsOf(exId), kindOf(exId), {
  category: getExercise(exId)?.category, dumbbellMode: getSettings().dumbbellMode,
});

// Mejor serie (por Brzycki puro) de cada sesión de cada ejercicio, para calibrar la fórmula personal
function bestSetsByExercise(workouts) {
  const map = new Map();
  for (const w of [...workouts].sort((a, b) => (a.started_at < b.started_at ? -1 : 1))) {
    const best = new Map();
    for (const e of w.exercises || []) {
      for (const s of e.sets || []) {
        if (!isWorking(s) || s.type === 'D' || !(s.weight > 0) || !(s.reps > 0)) continue;
        const cur = best.get(e.exercise_id);
        if (!cur || brzycki(s.weight, s.reps) > brzycki(cur.weight, cur.reps)) best.set(e.exercise_id, s);
      }
    }
    for (const [id, s] of best) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ t: Date.parse(w.started_at), weight: s.weight, reps: s.reps });
    }
  }
  return map;
}

// Fórmula personal (feature 25): se calibra con los entrenamientos (con carga efectiva) y, si hay
// confianza y no está apagada, ajusta e1rm() en toda la app.
export const formulaSetting = () => syncedSettings().formula || 'auto';

let cache = {};
export function analysisWorkouts() {
  const { countBodyweight, dumbbellMode } = getSettings();
  const count = countBodyweight !== false;
  const formula = formulaSetting();
  const key = [state.workouts, state.exercise_prefs, state.body_metrics, state.exercises, catalogChannel.version(), count, dumbbellMode, formula];
  if (cache.key?.every((v, i) => v === key[i])) return cache.value;
  computing = true;
  try {
    return compute(key, count, formula);
  } finally {
    computing = false;
  }
}

let computing = false;
function compute(key, count, formula) {
  const bodyweightFor = bodyweightLookup(state.body_metrics);
  const value = withEffectiveLoads(state.workouts, { kindFor: kindOf, modeFor: loadModeOf, bodyweightFor, countBodyweight: count });
  const model = fitRepModel(repResiduals(bestSetsByExercise(value)));
  const adjust = formula === 'off' ? () => 1 : adjustOf(model);
  cache = { key, value, model, adjust };
  return value;
}

/** ¿La fórmula personal está ajustando el 1RM? (calibrada con confianza y no apagada) */
export function formulaActive() {
  analysisWorkouts();
  return formulaSetting() !== 'off' && !!cache.model?.confident;
}

/** Modelo de la fórmula personal calibrado con tu historial (aunque esté apagado). */
export function repModel() {
  analysisWorkouts();
  return cache.model;
}

// e1rm() consulta el ajuste vigente (se recalcula solo cuando cambian los datos o el ajuste)
setRepAdjust((reps) => {
  if (computing) return 1; // mientras se calibra se usa Brzycki puro
  analysisWorkouts();
  return cache.adjust(reps);
});

// Peso corporal para una fecha 'YYYY-MM-DD' (null si no hay registros cerca)
let bwCache = {};
export function bodyweightOn(date) {
  if (bwCache.entries !== state.body_metrics) bwCache = { entries: state.body_metrics, fn: bodyweightLookup(state.body_metrics) };
  return bwCache.fn(date);
}
