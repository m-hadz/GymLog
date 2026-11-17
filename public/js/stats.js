// Cálculos: 1RM estimado, volumen, récords personales e historial por ejercicio.

// Fórmula de Brzycki: peso × 36 / (37 − reps). Para 1 rep devuelve el peso.
export function e1rm(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return (weight * 36) / (37 - Math.min(reps, 30));
}

// Peso estimado para N reps a partir de un 1RM (inverso de Brzycki)
export const weightForReps = (oneRm, reps) => (reps === 1 ? oneRm : (oneRm * (37 - reps)) / 36);

export const isWorking = (s) => s && s.done !== false && s.type !== 'W' && (s.reps || 0) > 0;
export const setVolume = (s) => (s.weight || 0) * (s.reps || 0);

const asc = (a, b) => (a.started_at < b.started_at ? -1 : 1);

export function workoutVolume(w) {
  let v = 0;
  for (const ex of w.exercises || []) for (const s of ex.sets || []) if (isWorking(s)) v += setVolume(s);
  return v;
}

export const workoutDuration = (w) => (w.ended_at ? new Date(w.ended_at) - new Date(w.started_at) : 0);

function better(a, b) {
  // ¿es el set a mejor que b? Primero por 1RM estimado, luego por reps.
  if (!b) return true;
  const ea = e1rm(a.weight, a.reps);
  const eb = e1rm(b.weight, b.reps);
  return ea > eb || (ea === eb && (a.reps || 0) > (b.reps || 0));
}

export function bestSet(sets) {
  let best = null;
  for (const s of sets) if (isWorking(s) && better(s, best)) best = s;
  return best;
}

// Sesiones de un ejercicio, en orden cronológico ascendente.
export function exerciseSessions(workouts, exId) {
  const out = [];
  for (const w of [...workouts].sort(asc)) {
    const sets = (w.exercises || [])
      .filter((e) => e.exercise_id === exId)
      .flatMap((e) => (e.sets || []).filter((s) => s.done !== false));
    if (!sets.length) continue;
    const working = sets.filter(isWorking);
    const best = bestSet(working);
    out.push({
      workout: w,
      sets,
      working,
      best,
      bestE1rm: best ? e1rm(best.weight, best.reps) : 0,
      maxWeight: Math.max(0, ...working.map((s) => s.weight || 0)),
      volume: working.reduce((a, s) => a + setVolume(s), 0),
      totalReps: working.reduce((a, s) => a + (s.reps || 0), 0),
    });
  }
  return out;
}

export function exerciseRecords(sessions) {
  const rec = { e1rm: null, weight: null, setVolume: null, sessionVolume: null, reps: null };
  const bump = (key, value, set, workout) => {
    if (value > 0 && (!rec[key] || value > rec[key].value)) rec[key] = { value, set, workout };
  };
  const all = [];
  for (const sess of sessions) {
    bump('sessionVolume', sess.volume, null, sess.workout);
    for (const s of sess.working) {
      all.push(s);
      bump('e1rm', e1rm(s.weight, s.reps), s, sess.workout);
      bump('weight', s.weight || 0, s, sess.workout);
      bump('setVolume', setVolume(s), s, sess.workout);
      bump('reps', s.reps || 0, s, sess.workout);
    }
  }
  // Mejor peso logrado con al menos N reps, y lo "previsto" según el mejor 1RM
  const repTable = [];
  for (let r = 1; r <= 12; r++) {
    let best = null;
    for (const s of all) {
      if ((s.reps || 0) >= r && (s.weight || 0) > 0 &&
        (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps))) best = s;
    }
    repTable.push({ reps: r, best, predicted: rec.e1rm ? weightForReps(rec.e1rm.value, r) : null });
  }
  rec.repTable = repTable;
  return rec;
}

// Marca los récords personales de cada set en todo el historial.
// Devuelve Map(workoutId -> Map("iEjercicio:iSerie" -> ['1RM','PESO','VOL.','REPS']))
// La primera sesión de cada ejercicio no cuenta como récord (no hay con qué comparar).
export function computePRs(workouts) {
  const best = new Map();
  const result = new Map();
  const metrics = [
    ['1RM', 'e1rm', (s) => e1rm(s.weight, s.reps)],
    ['PESO', 'weight', (s) => s.weight || 0],
    ['VOL.', 'vol', setVolume],
    ['REPS', 'reps', (s) => (s.weight ? 0 : s.reps || 0)], // solo ejercicios sin peso
  ];
  for (const w of [...workouts].sort(asc)) {
    const marks = new Map();
    const perEx = new Map();
    (w.exercises || []).forEach((ex, ei) => (ex.sets || []).forEach((s, si) => {
      if (!isWorking(s)) return;
      if (!perEx.has(ex.exercise_id)) perEx.set(ex.exercise_id, []);
      perEx.get(ex.exercise_id).push({ s, key: `${ei}:${si}` });
    }));
    for (const [exId, items] of perEx) {
      const prev = best.get(exId);
      const cur = { ...(prev || { e1rm: 0, weight: 0, vol: 0, reps: 0 }) };
      for (const [label, k, fn] of metrics) {
        const top = items.reduce((a, b) => (fn(b.s) > fn(a.s) ? b : a));
        const v = fn(top.s);
        if (prev && v > 0 && v > prev[k] + 1e-9) {
          if (!marks.has(top.key)) marks.set(top.key, []);
          marks.get(top.key).push(label);
        }
        cur[k] = Math.max(cur[k], v);
      }
      best.set(exId, cur);
    }
    result.set(w.id, marks);
  }
  return result;
}

export const prCount = (marks) => [...(marks?.values() || [])].reduce((a, l) => a + l.length, 0);

// Series de la última vez que se hizo un ejercicio (antes de `before`)
export function previousSets(workouts, exId, { excludeId, before } = {}) {
  for (const w of workouts) { // state.workouts ya viene ordenado de más nuevo a más viejo
    if (w.id === excludeId) continue;
    if (before && w.started_at >= before) continue;
    const entry = (w.exercises || []).find((e) => e.exercise_id === exId && e.sets?.some((s) => s.done !== false));
    if (entry) return entry.sets.filter((s) => s.done !== false);
  }
  return [];
}

// Agrupa por semana (lunes) las últimas N semanas
export function weeklySummary(workouts, weeks = 12) {
  const monday = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const start = monday(Date.now());
  start.setDate(start.getDate() - 7 * (weeks - 1));
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + 7 * i);
    return { date: d, count: 0, volume: 0 };
  });
  for (const w of workouts) {
    const i = Math.floor((monday(w.started_at) - start) / (7 * 864e5) + 0.5);
    if (i >= 0 && i < weeks) {
      buckets[i].count++;
      buckets[i].volume += workoutVolume(w);
    }
  }
  return buckets;
}
