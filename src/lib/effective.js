// Entrenamientos "para analizar": con la carga efectiva de los ejercicios de peso corporal,
// lastre y asistidos (ver kinds.js). Se calcula una vez y se reutiliza mientras no cambien los
// entrenamientos, los ajustes de ejercicios, el peso corporal, el catálogo o el ajuste de volumen.
// Para mostrar y analizar; para editar o guardar se usan siempre los entrenamientos de `state`.
import { state, getSettings, prefsOf } from './data.js';
import { catalogChannel, getExercise } from './catalog.js';
import { bodyweightLookup } from './body.js';
import { resolveKind, resolveLoadMode, withEffectiveLoads } from './kinds.js';

export const kindOf = (exId) => resolveKind(prefsOf(exId), getExercise(exId));
export const loadModeOf = (exId) => resolveLoadMode(prefsOf(exId), kindOf(exId), {
  category: getExercise(exId)?.category, dumbbellMode: getSettings().dumbbellMode,
});

let cache = {};
export function analysisWorkouts() {
  const { countBodyweight, dumbbellMode } = getSettings();
  const count = countBodyweight !== false;
  const key = [state.workouts, state.exercise_prefs, state.body_metrics, state.exercises, catalogChannel.version(), count, dumbbellMode];
  if (cache.key?.every((v, i) => v === key[i])) return cache.value;
  const bodyweightFor = bodyweightLookup(state.body_metrics);
  const value = withEffectiveLoads(state.workouts, { kindFor: kindOf, modeFor: loadModeOf, bodyweightFor, countBodyweight: count });
  cache = { key, value };
  return value;
}

// Peso corporal para una fecha 'YYYY-MM-DD' (null si no hay registros cerca)
let bwCache = {};
export function bodyweightOn(date) {
  if (bwCache.entries !== state.body_metrics) bwCache = { entries: state.body_metrics, fn: bodyweightLookup(state.body_metrics) };
  return bwCache.fn(date);
}
