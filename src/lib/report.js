// Resumen mensual y anual (feature 07): totales contra el periodo anterior, días entrenados,
// constancia, récords, ejercicios más hechos, progreso por ejercicio, músculos, mejor semana o mes
// y estancados al cierre. Módulo puro, sin DOM. Ver docs/features/07-resumen-mensual-anual.md.
import { computePRs, e1rm, isWorking, prCount, sessionsIndex, workoutDuration, workoutVolume } from './stats.js';
import { stallStatus } from './progression.js';
import { dayNum, streakStats } from './streak.js';

export const PROGRESS_GAIN = 0.01; // "progresando" si el 1RM estimado sube más de 1 %
export const CAR_KG = 1500;        // un auto mediano, para el total del año
export const MIN_YEAR_WORKOUTS = 10;

const t = (w) => Date.parse(w.started_at);
const asc = (a, b) => (a.started_at < b.started_at ? -1 : 1);
const pct = (cur, prev) => (prev ? Math.round((cur / prev - 1) * 1000) / 10 : null);
const pad = (n) => String(n).padStart(2, '0');

/** Lunes (00:00 local) de la semana de `d`. */
export function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; };

/** Meses ('YYYY-MM') y años con entrenamientos: para el selector. */
export function reportPeriods(workouts) {
  const months = new Map();
  const years = new Map();
  for (const w of workouts) {
    const d = new Date(w.started_at);
    if (Number.isNaN(+d)) continue;
    months.set(monthKey(d), (months.get(monthKey(d)) || 0) + 1);
    years.set(d.getFullYear(), (years.get(d.getFullYear()) || 0) + 1);
  }
  return { months, years };
}

function totals(ws) {
  let ms = 0;
  let volume = 0;
  let sets = 0;
  for (const w of ws) {
    ms += workoutDuration(w);
    volume += workoutVolume(w);
    for (const e of w.exercises || []) sets += (e.sets || []).filter(isWorking).length;
  }
  return { workouts: ws.length, ms, volume, sets };
}

// Fuerza de una sesión: 1RM estimado si lleva peso; si no, reps máximas
const strength = (sets) => {
  let best = 0;
  let reps = 0;
  for (const s of sets) {
    if (!isWorking(s)) continue;
    if (s.weight > 0 && s.reps > 0) best = Math.max(best, e1rm(s.weight, s.reps));
    reps = Math.max(reps, s.reps || 0);
  }
  return best > 0 ? { value: best, metric: 'e1rm' } : reps > 0 ? { value: reps, metric: 'reps' } : null;
};

function setsByExercise(ws) {
  const m = new Map();
  for (const w of ws) for (const e of w.exercises || []) {
    const n = (e.sets || []).filter(isWorking).length;
    if (n) m.set(e.exercise_id, (m.get(e.exercise_id) || 0) + n);
  }
  return m;
}

// Mejor fuerza por ejercicio en una lista de entrenamientos (y cuántas sesiones)
function strengthByExercise(ws) {
  const m = new Map();
  for (const w of ws) {
    const byEx = new Map();
    for (const e of w.exercises || []) {
      if (!byEx.has(e.exercise_id)) byEx.set(e.exercise_id, []);
      byEx.get(e.exercise_id).push(...(e.sets || []));
    }
    for (const [id, sets] of byEx) {
      const s = strength(sets);
      if (!s) continue;
      const cur = m.get(id) || { sessions: 0, best: null };
      cur.sessions++;
      if (!cur.best || (s.metric === cur.best.metric ? s.value > cur.best.value : s.metric === 'e1rm')) cur.best = s;
      m.set(id, cur);
    }
  }
  return m;
}

// Semanas (lunes) entre start y el cierre: cuántas tuvieron un entrenamiento del periodo, y la racha
// de semanas con entrenamiento al cierre (solo con entrenamientos anteriores al cierre)
function constancy(sorted, periodWorkouts, start, close) {
  const weeks = [];
  for (let d = mondayOf(start); d < close; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));
  const inPeriod = new Set(periodWorkouts.map((w) => +mondayOf(w.started_at)));
  const trained = weeks.filter((d) => inPeriod.has(+d)).length;
  const allWeeks = new Set(sorted.filter((w) => t(w) < +close).map((w) => +mondayOf(w.started_at)));
  let streak = 0;
  const cur = mondayOf(new Date(close - 1));
  // La semana del cierre cuenta si ya tiene entrenamiento; si no, la racha sigue viva desde la anterior
  if (!allWeeks.has(+cur)) cur.setDate(cur.getDate() - 7);
  while (allWeeks.has(+mondayOf(cur))) { streak++; cur.setDate(cur.getDate() - 7); }
  return { weeks: weeks.length, trained, streak };
}

function longestStreak(allWeeks, start, end) {
  let best = 0;
  let run = 0;
  for (let d = mondayOf(start); d < end; d.setDate(d.getDate() + 7)) {
    if (allWeeks.has(+mondayOf(d))) { run++; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

/**
 * Récords del periodo: cantidad (todas las marcas de computePRs) y los más destacados por mejora
 * relativa del 1RM estimado frente al mejor anterior de ese ejercicio.
 */
function records(sorted, inPeriod, prs, nameOf) {
  const best = new Map();
  const gains = new Map();
  let count = 0;
  for (const w of sorted) {
    const inside = inPeriod(w);
    if (inside) count += prCount(prs.get(w.id));
    const byEx = new Map();
    for (const e of w.exercises || []) for (const s of e.sets || []) {
      if (!isWorking(s) || !(s.weight > 0) || !(s.reps > 0)) continue;
      const v = e1rm(s.weight, s.reps);
      const cur = byEx.get(e.exercise_id);
      if (!cur || v > cur.v) byEx.set(e.exercise_id, { v, s, name: e.name });
    }
    for (const [id, x] of byEx) {
      const prev = best.get(id);
      if (inside && prev && x.v > prev * (1 + 1e-9)) {
        const gain = x.v / prev - 1;
        if (!gains.has(id) || gain > gains.get(id).gain) {
          gains.set(id, { id, name: nameOf(id, x.name), set: x.s, e1rm: x.v, gain, date: w.started_at });
        }
      }
      if (!prev || x.v > prev) best.set(id, x.v);
    }
  }
  return { count, top: [...gains.values()].sort((a, b) => b.gain - a.gain).slice(0, 5) };
}

function muscles(cur, prev, partOf) {
  const add = (m, ws) => {
    for (const w of ws) for (const e of w.exercises || []) {
      const n = (e.sets || []).filter(isWorking).length;
      if (!n) continue;
      const part = partOf(e.exercise_id, e.name) || 'Otro';
      m.set(part, (m.get(part) || 0) + n);
    }
    return m;
  };
  const a = add(new Map(), cur);
  const b = add(new Map(), prev);
  return [...new Set([...a.keys(), ...b.keys()])]
    .map((part) => ({ part, sets: a.get(part) || 0, prev: b.get(part) || 0 }))
    .filter((x) => x.sets > 0)
    .sort((x, y) => y.sets - x.sets);
}

function progress(cur, prev, nameOf, names) {
  const a = strengthByExercise(cur);
  const b = strengthByExercise(prev);
  const out = [];
  for (const [id, x] of a) {
    if (x.sessions < 2) continue;
    const p = b.get(id)?.best;
    let status = 'nuevo';
    let change = null;
    if (p && p.metric === x.best.metric) {
      change = x.best.value / p.value - 1;
      status = change > PROGRESS_GAIN ? 'progresando' : change < -PROGRESS_GAIN ? 'bajando' : 'manteniendo';
    }
    out.push({ id, name: nameOf(id, names.get(id)), status, change, metric: x.best.metric, value: x.best.value, prev: p?.value ?? null });
  }
  const order = { progresando: 0, manteniendo: 1, bajando: 2, nuevo: 3 };
  return out.sort((x, y) => order[x.status] - order[y.status] || (y.change ?? 0) - (x.change ?? 0) || x.name.localeCompare(y.name));
}

// Estancados al cierre (feature 06) y cuántos salieron de la lista con un reinicio en el periodo
function stalls(sorted, start, close, cur, stallable, nameOf, names) {
  if (!stallable) return null;
  const idx = sessionsIndex(sorted.filter((w) => t(w) < +close));
  const at = (time) => {
    const set = new Set();
    for (const [id, all] of idx) {
      if (!stallable(id)) continue;
      const sessions = time >= +close ? all : all.filter((s) => t(s.workout) < time);
      if (stallStatus(sessions, { now: time })?.stalled) set.add(id);
    }
    return set;
  };
  const end = at(close);
  const before = at(+start);
  const reset = new Set();
  for (const w of cur) for (const e of w.exercises || []) if (e.sets?.some((s) => s.done !== false && s.target?.source === 'reinicio')) reset.add(e.exercise_id);
  const recovered = [...before].filter((id) => !end.has(id) && reset.has(id));
  return {
    list: [...end].map((id) => ({ id, name: nameOf(id, names.get(id)) })).sort((a, b) => a.name.localeCompare(b.name)),
    recovered: recovered.map((id) => ({ id, name: nameOf(id, names.get(id)) })),
  };
}

// Constancia por cadencia (feature 09): racha al cierre, cortes en el periodo y días promedio entre
// entrenamientos. Solo si la meta es 'cadencia'.
function cadenceOf(sorted, cur, start, close, goal, pauses) {
  if (goal?.mode !== 'cadencia') return null;
  const st = streakStats(sorted.filter((w) => t(w) < +close), goal, pauses || [], new Date(+close - 1));
  const a = dayNum(start);
  const b = dayNum(new Date(+close - 1));
  const days = [...new Set(cur.map((w) => dayNum(w.started_at)))].sort((x, y) => x - y);
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  return {
    streak: st.current,
    breaks: st.restarts.filter((d) => d >= a && d <= b).length,
    avgGap: gaps.length ? gaps.reduce((x, y) => x + y, 0) / gaps.length : null,
  };
}

function base(workouts, start, end, prevStart, opts) {
  const { now = Date.now(), nameOf = (id, n) => n || id, partOf = () => 'Otro', stallable = null } = opts;
  const sorted = [...workouts].filter((w) => Number.isFinite(t(w))).sort(asc);
  const inRange = (a, b) => (w) => t(w) >= +a && t(w) < +b;
  const cur = sorted.filter(inRange(start, end));
  const prev = sorted.filter(inRange(prevStart, start));
  const close = new Date(Math.min(+end, now + 1));
  const names = new Map();
  for (const w of sorted) for (const e of w.exercises || []) if (e.name) names.set(e.exercise_id, e.name);
  const T = totals(cur);
  const P = totals(prev);
  const first = !sorted.some((w) => t(w) < +start);
  const allWeeks = new Set(sorted.map((w) => +mondayOf(w.started_at)));
  const prs = computePRs(sorted.filter((w) => t(w) < +end));
  const top = [...setsByExercise(cur)].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, sets]) => ({ id, name: nameOf(id, names.get(id)), sets }));
  return {
    sorted, cur, prev, names, nameOf, allWeeks,
    report: {
      start, end, partial: now < +end, empty: !cur.length, first,
      totals: T,
      prevTotals: first ? null : P,
      delta: first ? null : {
        workouts: pct(T.workouts, P.workouts), ms: pct(T.ms, P.ms), volume: pct(T.volume, P.volume), sets: pct(T.sets, P.sets),
      },
      // En el primer periodo registrado, las semanas se cuentan desde el primer entrenamiento
      constancy: {
        ...constancy(sorted, cur, first && cur.length ? new Date(cur[0].started_at) : start, close),
        cadence: cadenceOf(sorted, cur, start, close, opts.goal, opts.pauses),
      },
      records: records(sorted, inRange(start, end), prs, nameOf),
      topExercises: top,
      progress: progress(cur, prev, nameOf, names),
      muscles: muscles(cur, prev, partOf),
      stalls: stalls(sorted, start, close, cur, stallable, nameOf, names),
    },
  };
}

/**
 * @param {object[]} workouts  (con carga efectiva si se quiere: ver effective.js)
 * @param {number} year
 * @param {number} month 1–12
 * @param {{now?:number, nameOf?:Function, partOf?:Function, stallable?:(id:string)=>boolean}} [opts]
 */
export function monthReport(workouts, year, month, opts = {}) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const prevStart = new Date(year, month - 2, 1);
  const { cur, report } = base(workouts, start, end, prevStart, opts);
  const days = [...new Set(cur.map((w) => new Date(w.started_at).getDate()))].sort((a, b) => a - b);
  const weeks = new Map();
  for (const w of cur) {
    const k = +mondayOf(w.started_at);
    const x = weeks.get(k) || { monday: new Date(k), volume: 0, workouts: 0 };
    x.volume += workoutVolume(w);
    x.workouts++;
    weeks.set(k, x);
  }
  const bestWeek = [...weeks.values()].sort((a, b) => b.volume - a.volume || b.workouts - a.workouts)[0] || null;
  return { ...report, kind: 'month', year, month, days, daysInMonth: new Date(year, month, 0).getDate(), bestWeek };
}

/** Resumen del año. `available` es false con menos de MIN_YEAR_WORKOUTS entrenamientos. */
export function yearReport(workouts, year, opts = {}) {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const { cur, allWeeks, nameOf, names, report } = base(workouts, start, end, new Date(year - 1, 0, 1), opts);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, workouts: 0, volume: 0 }));
  for (const w of cur) {
    const m = months[new Date(w.started_at).getMonth()];
    m.workouts++;
    m.volume += workoutVolume(w);
  }
  const bestMonth = months.reduce((a, m) => (m.volume > (a?.volume || 0) ? m : a), null);

  // Mayor mejora en los 5 ejercicios más hechos: primer mes vs. último mes con datos
  const firstLast = report.topExercises.map(({ id, name }) => {
    const byMonth = new Map();
    for (const w of cur) {
      const sets = (w.exercises || []).filter((e) => e.exercise_id === id).flatMap((e) => e.sets || []);
      const s = strength(sets);
      if (!s) continue;
      const k = new Date(w.started_at).getMonth();
      const x = byMonth.get(k);
      if (!x || (s.metric === x.metric ? s.value > x.value : s.metric === 'e1rm')) byMonth.set(k, s);
    }
    const ks = [...byMonth.keys()].sort((a, b) => a - b);
    if (ks.length < 2) return null;
    const a = byMonth.get(ks[0]);
    const b = byMonth.get(ks.at(-1));
    if (a.metric !== b.metric) return null;
    return { id, name, metric: a.metric, from: a.value, to: b.value, gain: b.value / a.value - 1, fromMonth: ks[0] + 1, toMonth: ks.at(-1) + 1 };
  }).filter(Boolean).sort((a, b) => b.gain - a.gain);

  // Ejercicios probados por primera vez en el año
  const firstSeen = new Map();
  for (const w of report.first ? cur : []) for (const e of w.exercises || []) if (!firstSeen.has(e.exercise_id)) firstSeen.set(e.exercise_id, w.started_at);
  const seenBefore = new Set();
  if (!report.first) {
    for (const w of workouts) if (t(w) < +start) for (const e of w.exercises || []) seenBefore.add(e.exercise_id);
    for (const w of cur) for (const e of w.exercises || []) if (!seenBefore.has(e.exercise_id) && !firstSeen.has(e.exercise_id)) firstSeen.set(e.exercise_id, w.started_at);
  }
  const newExercises = [...firstSeen].map(([id, date]) => ({ id, name: nameOf(id, names.get(id)), date }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    ...report, kind: 'year', year,
    available: cur.length >= MIN_YEAR_WORKOUTS,
    months, bestMonth: bestMonth?.volume ? bestMonth : null,
    longestStreak: longestStreak(allWeeks, start, new Date(Math.min(+end, (opts.now ?? Date.now()) + 1))),
    firstLast,
    newExercises,
    cars: report.totals.volume / CAR_KG,
  };
}
