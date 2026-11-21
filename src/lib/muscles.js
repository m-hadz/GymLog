// Estímulo directo por grupo muscular: series efectivas por semana de los ejercicios cuyo grupo
// (bodyPart) es ese músculo. No se cuentan secundarios: solo trabajo directo.
// Estados: 'low' (rezagado: sube el volumen), 'fair' (mejorable) y 'good' (bien). Mucho volumen
// sigue siendo 'good': no hay estado de "demasiado". Módulo puro, sin DOM.
import { isWorking } from './stats.js';

export const DEFAULT_MUSCLE_TARGET = 8; // series directas por semana para "bien"

// Grupos que se muestran en el mapa (sin Cardio ni Otro)
export const MUSCLE_GROUPS = ['Pecho', 'Hombros', 'Bíceps', 'Tríceps', 'Antebrazo', 'Core', 'Dorsales',
  'Espalda alta', 'Lumbar', 'Glúteos', 'Abductores', 'Aductores', 'Cuádriceps', 'Isquiotibiales', 'Pantorrillas'];

/** Rezagado bajo la mitad de la meta; mejorable hasta la meta; bien desde la meta. */
export function muscleStatus(perWeek, target = DEFAULT_MUSCLE_TARGET) {
  if (perWeek >= target - 1e-9) return 'good';
  if (perWeek >= target / 2 - 1e-9) return 'fair';
  return 'low';
}

/**
 * @param {object[]} workouts
 * @param {{ days?: number, now?: number, target?: number,
 *           partOf: (exerciseId: string) => string|undefined,
 *           nameOf?: (exerciseId: string, fallback?: string) => string }} o
 */
export function muscleStats(workouts, { days = 28, now = Date.now(), target = DEFAULT_MUSCLE_TARGET, partOf, nameOf = (id, n) => n || id }) {
  const from = now - days * 864e5;
  // No diluir el promedio con días anteriores al primer entrenamiento registrado
  const first = workouts.reduce((m, w) => Math.min(m, Date.parse(w.started_at)), Infinity);
  const spanDays = Math.min(days, Math.max(7, (now - Math.max(from, first)) / 864e5));
  const weeks = spanDays / 7;

  const by = new Map(MUSCLE_GROUPS.map((g) => [g, { sets: 0, exercises: new Map() }]));
  let unassigned = 0;
  const unassignedEx = new Map();
  for (const w of workouts) {
    const t = Date.parse(w.started_at);
    if (t < from || t > now) continue;
    for (const ex of w.exercises || []) {
      const n = (ex.sets || []).filter(isWorking).length;
      if (!n) continue;
      const g = by.get(partOf(ex.exercise_id));
      if (!g) {
        unassigned += n;
        const u = unassignedEx.get(ex.exercise_id) || { id: ex.exercise_id, name: nameOf(ex.exercise_id, ex.name), sets: 0 };
        u.sets += n;
        unassignedEx.set(ex.exercise_id, u);
        continue;
      }
      g.sets += n;
      const e = g.exercises.get(ex.exercise_id) || { id: ex.exercise_id, name: nameOf(ex.exercise_id, ex.name), sets: 0 };
      e.sets += n;
      g.exercises.set(ex.exercise_id, e);
    }
  }
  const groups = MUSCLE_GROUPS.map((part) => {
    const g = by.get(part);
    const perWeek = g.sets / weeks;
    return {
      part, sets: g.sets, perWeek, status: muscleStatus(perWeek, target),
      exercises: [...g.exercises.values()].sort((a, b) => b.sets - a.sets),
    };
  });
  return { weeks, groups, unassigned, unassignedExercises: [...unassignedEx.values()].sort((a, b) => b.sets - a.sets) };
}
