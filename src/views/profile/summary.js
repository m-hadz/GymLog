// Cálculos del resumen del perfil (puros, sobre la lista de entrenamientos).
import { isWorking, workoutDuration, workoutVolume } from '../../lib/stats.js';


export function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/**
 * Totales para la cabecera del perfil.
 * - streak: semanas seguidas con al menos un entrenamiento. La semana en curso
 *   cuenta si ya tiene uno; si no, la racha sigue viva desde la semana anterior.
 */
export function profileSummary(workouts) {
  const now = new Date();
  const thisMonday = mondayOf(now).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const weeks = new Set();
  let thisWeek = 0, monthCount = 0, monthVolume = 0, monthMs = 0, first = null;

  for (const w of workouts) {
    const t = new Date(w.started_at).getTime();
    if (!Number.isFinite(t)) continue;
    const mon = mondayOf(t).getTime();
    weeks.add(mon);
    if (mon === thisMonday) thisWeek++;
    if (t >= monthStart) {
      monthCount++;
      monthVolume += workoutVolume(w);
      monthMs += workoutDuration(w);
    }
    if (first == null || t < first) first = t;
  }

  let streak = 0;
  // Se camina por fechas (no por ms) para no tropezar con cambios de horario
  const cursor = new Date(thisMonday);
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  while (weeks.has(mondayOf(cursor).getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }

  return {
    total: workouts.length, thisWeek, streak, monthCount, monthVolume,
    monthHours: monthMs / 3.6e6, first: first ? new Date(first) : null,
  };
}

/** Series efectivas por grupo muscular desde `since`, de mayor a menor. */
export function setsByBodyPart(workouts, since, getExercise) {
  const from = since.getTime();
  const counts = new Map();
  for (const w of workouts) {
    if (new Date(w.started_at).getTime() < from) continue;
    for (const ex of w.exercises || []) {
      const n = (ex.sets || []).filter(isWorking).length;
      if (!n) continue;
      const part = getExercise(ex.exercise_id)?.bodyPart || 'Otro';
      counts.set(part, (counts.get(part) || 0) + n);
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return {
    total,
    items: [...counts]
      .map(([label, value]) => ({ label, value, hint: `${Math.round((value / total) * 100)} %` }))
      .sort((a, b) => b.value - a.value),
  };
}

