// Máximo de entrenamiento (TM) por ejercicio (feature 12): exercise_prefs.training_max, con su
// historial de cambios en los ajustes sincronizados (user_settings.data.tm_log: fecha y motivo).
import { getSettings, prefsOf, savePrefs, saveSyncedSettings, state, syncedSettings } from './data.js';
import { exerciseName, getExercise } from './catalog.js';
import { defaultIncrement, knownWeights, roundLoad } from './loads.js';
import { exerciseSessions } from './stats.js';
import { analysisWorkouts } from './effective.js';
import { suggestTM } from './programs.js';

const MAX_LOG = 300;
export const TM_WHY = { manual: 'a mano', programa: 'fin de ciclo', inicio: 'al crear el programa' };

export const tmOf = (exId) => prefsOf(exId)?.training_max || null;

/** Guarda el máximo y anota el cambio (why: 'manual' | 'programa' | 'inicio'). */
export function setTrainingMax(exId, tm, why = 'manual') {
  const value = tm > 0 ? Math.round(tm * 100) / 100 : null;
  if (value === tmOf(exId)) return;
  savePrefs(exId, { training_max: value });
  const log = [...(syncedSettings().tm_log || []), { ex: exId, tm: value, at: new Date().toISOString(), why }].slice(-MAX_LOG);
  saveSyncedSettings({ tm_log: log });
}

/** Cambios del máximo de un ejercicio, del más reciente al más antiguo. */
export const tmHistory = (exId) => (syncedSettings().tm_log || []).filter((x) => x.ex === exId).reverse();

// Tren inferior: sube +5 kg por ciclo o por éxito (superior +2,5)
const LOWER = new Set(['Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Lumbar', 'Aductores', 'Abductores', 'Pantorrillas']);
export const isLower = (exId) => LOWER.has(getExercise(exId)?.bodyPart) || /squat|deadlift|sentadilla|peso muerto/i.test(exerciseName(exId, ''));

const barbellOf = (exId) => {
  const s = getSettings();
  return getExercise(exId)?.category === 'Barra' || /barbell|barra\b/i.test(exerciseName(exId, '')) ? { bar: s.bar, plates: s.plates } : null;
};
export const loadStep = (exId) => prefsOf(exId)?.min_increment || defaultIncrement(getExercise(exId)?.category);

/**
 * Peso de programa armable: con barra, el más cercano con los discos configurados (empate hacia
 * arriba); en máquinas, prefiere los pesos que ya usaste (base común B).
 */
export function programLoad(exId, kg) {
  if (!(kg > 0)) return null;
  const barbell = barbellOf(exId);
  return roundLoad(kg, { inc: loadStep(exId), known: barbell ? [] : knownWeights(state.workouts, exId), barbell });
}

/** Mejor 1RM estimado de los últimos 3 meses y el máximo sugerido (90 %, hacia abajo). */
export function tmSuggestion(exId) {
  const sessions = exerciseSessions(analysisWorkouts(), exId).map((s) => ({ date: s.workout.started_at, e1rm: s.bestE1rm }));
  const best = Math.max(0, ...sessions.filter((s) => Date.now() - Date.parse(s.date) <= 92 * 864e5).map((s) => s.e1rm));
  return { e1rm: best || null, tm: suggestTM(sessions, { inc: barbellOf(exId) ? 2.5 : loadStep(exId) }) };
}
