// Constancia y racha (feature 09). Un único cálculo para Entrenar, Calendario, Perfil y el resumen.
// Tres modos de meta:
//   - 'ninguna'  (por defecto): semanas seguidas con al menos un entrenamiento (como antes).
//   - 'cadencia' (FBEOD): entrenar a más tardar el día `every_days + tolerance` desde el anterior;
//                la racha cuenta días entrenados seguidos sin pasarse de ese límite.
//   - 'semanal': al menos `per_week` días entrenados en la semana (lunes a domingo); semanas seguidas.
// Las pausas planificadas (vacaciones, enfermedad) no suman ni cortan. Se camina por número de día
// local (no por milisegundos), así los cambios de horario no afectan. Módulo puro, sin DOM.

export const DEFAULT_GOAL = { mode: 'ninguna', every_days: 2, tolerance: 1, per_week: 3 };
export const GOAL_MODES = [['ninguna', 'Sin meta'], ['cadencia', 'Cada N días'], ['semanal', 'N por semana']];
export const MAX_PAUSE_DAYS = 14;
export const PAUSE_COOLDOWN_DAYS = 42; // una pausa cada 6 semanas como máximo
export const STRIP_DAYS = 30;

/** Número de día de la fecha local de `d` (días desde 1970-01-01). */
export function dayNum(d) {
  const x = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
  return Math.round(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 864e5);
}
/** Fecha local (00:00) de un número de día. */
export function dateOfDay(n) {
  const u = new Date(n * 864e5);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
}
/** 'YYYY-MM-DD' de un número de día. */
export const keyOfDay = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
/** Lunes de la semana de un número de día (el día 0 fue jueves). */
export const mondayOfDay = (n) => n - ((n + 3) % 7);

export function normalizeGoal(g) {
  const x = { ...DEFAULT_GOAL, ...(g || {}) };
  if (!GOAL_MODES.some(([k]) => k === x.mode)) x.mode = 'ninguna';
  const int = (v, lo, hi, def) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : def);
  x.every_days = int(x.every_days, 1, 7, DEFAULT_GOAL.every_days);
  x.tolerance = int(x.tolerance, 0, 3, DEFAULT_GOAL.tolerance);
  x.per_week = int(x.per_week, 1, 7, DEFAULT_GOAL.per_week);
  return x;
}

/** Días (números) cubiertos por las pausas [{from, to}] ('YYYY-MM-DD'). */
export function pauseDays(pauses) {
  const set = new Set();
  for (const p of pauses || []) {
    if (!p?.from || !p?.to) continue;
    const a = dayNum(p.from);
    const b = dayNum(p.to);
    for (let d = a; d <= Math.min(b, a + MAX_PAUSE_DAYS - 1); d++) set.add(d);
  }
  return set;
}

/**
 * Motivo por el que no se puede agregar una pausa, o null si se puede.
 * Hasta 14 días; sin solaparse; y como máximo una cada 6 semanas.
 */
export function pauseError(pauses, { from, to }) {
  if (!from || !to) return 'Elige el primer y el último día';
  const a = dayNum(from);
  const b = dayNum(to);
  if (b < a) return 'El último día es antes del primero';
  if (b - a + 1 > MAX_PAUSE_DAYS) return `Una pausa dura como máximo ${MAX_PAUSE_DAYS} días`;
  for (const p of pauses || []) {
    const pa = dayNum(p.from);
    const pb = dayNum(p.to);
    if (a <= pb && pa <= b) return 'Se cruza con otra pausa';
    if (Math.abs(a - pa) < PAUSE_COOLDOWN_DAYS) return 'Solo se permite una pausa cada 6 semanas';
  }
  return null;
}

// Días entre a y b (a < b) sin contar los de pausa que hay entre medio
function gapOf(a, b, paused) {
  let g = b - a;
  for (let d = a + 1; d < b; d++) if (paused.has(d)) g--;
  return g;
}

function cadence(days, goal, paused, T) {
  const limit = goal.every_days + goal.tolerance;
  let run = 0;
  let best = 0;
  let breaks = 0;
  const restarts = []; // días que empezaron una racha nueva después de un corte
  for (let i = 0; i < days.length; i++) {
    if (i && gapOf(days[i - 1], days[i], paused) > limit) {
      breaks++;
      restarts.push(days[i]);
      run = 0;
    }
    run++;
    best = Math.max(best, run);
  }
  const last = days.at(-1);
  const since = last == null ? null : last === T ? 0 : gapOf(last, T, paused);
  const alive = since != null && since <= limit;
  let status;
  if (last == null) status = 'sin_datos';
  else if (paused.has(T)) status = 'pausa';
  else if (since === 0) status = 'hecho';
  else if (since > limit) status = 'cortada';
  else if (since === limit) status = 'ultimo';
  else if (since >= goal.every_days) status = 'hoy';
  else if (since === goal.every_days - 1) status = 'manana';
  else status = 'descanso';

  const strip = [];
  let p = null;
  let k = 0;
  for (let d = T - STRIP_DAYS + 1; d <= T; d++) {
    while (k < days.length && days[k] < d) p = days[k++];
    let s;
    if (days[k] === d) s = 'entreno';
    else if (paused.has(d)) s = 'pausa';
    else if (p == null) s = 'libre';
    else s = gapOf(p, d, paused) <= limit ? 'descanso' : 'corte';
    strip.push({ day: d, key: keyOfDay(d), state: s });
  }
  return {
    unit: 'entrenamientos', current: alive ? run : 0, best, breaks, restarts, since, limit, status,
    comeback: alive && run === 1 && breaks > 0, strip,
  };
}

function weekly(days, perWeek, paused, T) {
  const counts = new Map();
  for (const d of days) counts.set(mondayOfDay(d), (counts.get(mondayOfDay(d)) || 0) + 1);
  const cur = mondayOfDay(T);
  let run = 0;
  let best = 0;
  let breaks = 0;
  const restarts = [];
  let lastOk = null;
  if (days.length) {
    for (let w = mondayOfDay(days[0]); w <= cur; w += 7) {
      const n = counts.get(w) || 0;
      if (n >= perWeek) {
        if (run === 0 && lastOk != null) restarts.push(w);
        run++;
        best = Math.max(best, run);
        lastOk = w;
        continue;
      }
      if (w === cur) break; // la semana en curso no corta: aún puede cumplirse
      let pausedWeek = false;
      for (let d = w; d < w + 7; d++) if (paused.has(d)) { pausedWeek = true; break; }
      if (pausedWeek) continue; // con pausa: no suma ni corta
      if (run > 0) breaks++;
      run = 0;
    }
  }
  const thisWeek = counts.get(cur) || 0;
  const strip = [];
  const set = new Set(days);
  for (let d = T - STRIP_DAYS + 1; d <= T; d++) {
    strip.push({ day: d, key: keyOfDay(d), state: set.has(d) ? 'entreno' : paused.has(d) ? 'pausa' : 'libre' });
  }
  return {
    unit: 'semanas', current: run, best, breaks, restarts, thisWeek, perWeek,
    status: !days.length ? 'sin_datos' : paused.has(T) ? 'pausa' : thisWeek >= perWeek ? 'cumplida' : 'en_curso',
    comeback: run === 1 && breaks > 0 && thisWeek === perWeek,
    strip,
  };
}

/**
 * @param {object[]} workouts
 * @param {object} [goal]   {mode, every_days, tolerance, per_week}
 * @param {{from:string, to:string}[]} [pauses]
 * @param {Date|number|string} [today]
 * @returns {{ mode, unit:'entrenamientos'|'semanas', current:number, best:number, breaks:number,
 *   status:string, comeback:boolean, strip:{day, key, state}[], since?:number|null, limit?:number,
 *   thisWeek?:number, perWeek?:number, restarts:number[], lastDay:number|null }}
 */
export function streakStats(workouts, goal, pauses = [], today = new Date()) {
  const g = normalizeGoal(goal);
  const T = dayNum(today);
  const days = [...new Set((workouts || []).map((w) => w.started_at).filter(Boolean).map(dayNum))]
    .filter((d) => Number.isFinite(d) && d <= T).sort((a, b) => a - b);
  const paused = pauseDays(pauses);
  const base = g.mode === 'cadencia' ? cadence(days, g, paused, T) : weekly(days, g.mode === 'semanal' ? g.per_week : 1, paused, T);
  return { mode: g.mode, goal: g, lastDay: days.at(-1) ?? null, ...base };
}

/** Texto corto de la racha: "29 seguidos" / "4 semanas". */
export function streakText(s) {
  if (s.unit === 'entrenamientos') return `${s.current} ${s.current === 1 ? 'seguido' : 'seguidos'}`;
  return `${s.current} ${s.current === 1 ? 'semana' : 'semanas'}`;
}

/** Qué toca hoy, en una frase (modo cadencia o semanal). */
export function dueText(s) {
  switch (s.status) {
    case 'hecho': return 'Entrenaste hoy';
    case 'descanso': return 'Descanso';
    case 'manana': return 'Mañana toca';
    case 'hoy': return 'Hoy toca';
    case 'ultimo': return 'Último día para no cortar la racha';
    case 'cortada': return 'Hoy es buen día para volver';
    case 'pausa': return 'En pausa';
    case 'cumplida': return 'Semana cumplida';
    case 'en_curso': return `${s.thisWeek} de ${s.perWeek} esta semana`;
    default: return 'Empieza tu primera racha';
  }
}
