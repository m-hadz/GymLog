// Programas por porcentaje del máximo de entrenamiento (feature 12): 5/3/1 y GZCLP.
// Módulo puro: recibe las funciones que dependen de la app (máximos, redondeo, tren inferior) y
// devuelve estados nuevos; no guarda nada. La app (program-runtime.js) persiste y genera las plantillas.
//
// Un programa: { id, name, kind: '531'|'gzclp', active, config, state }
//   config 5/3/1: { lifts: [exId × 4], deload: false, templates: [tplId × 4] }
//   config GZCLP: { lifts: {squat, bench, deadlift, ohp}, t3: {A, B}, t2Reset: 7.5, templates: [tplId × 4] }
//   state:        { week, day, cycle, stages: {'T1:exId': {stage, weight, best10?}}, pendingBump, last }

export const DAYS = 4;
export const LIFT_KEYS = ['squat', 'bench', 'deadlift', 'ohp'];
export const LIFT_LABEL = { squat: 'Sentadilla', bench: 'Press banca', deadlift: 'Peso muerto', ohp: 'Press militar' };
export const KIND_LABEL = { 531: '5/3/1', gzclp: 'GZCLP' };

// ---------------- 5/3/1 ----------------
// [pct, reps, amrap] por semana; la 4.ª es la descarga (opcional, desactivada por defecto)
export const WEEKS_531 = [
  [[65, 5], [75, 5], [85, 5, true]],
  [[70, 3], [80, 3], [90, 3, true]],
  [[75, 5], [85, 3], [95, 1, true]],
  [[40, 5], [50, 5], [60, 5]],
];
export const weeksOf = (p) => (p.config?.deload ? 4 : 3);

/** Series de plantilla de la semana `week` (1–4) de 5/3/1: en % del máximo. */
export const sets531 = (week) => WEEKS_531[week - 1].map(([pct, reps, amrap]) => ({ type: 'N', weight: null, reps, pct, ...(amrap ? { amrap: true } : {}) }));

// ---------------- GZCLP ----------------
// Días A1, B1, A2, B2: T1 y T2 de los principales, T3 de un accesorio (A o B)
export const GZCLP_DAYS = [
  { label: 'A1', t1: 'squat', t2: 'bench', t3: 'A' },
  { label: 'B1', t1: 'ohp', t2: 'deadlift', t3: 'B' },
  { label: 'A2', t1: 'bench', t2: 'squat', t3: 'A' },
  { label: 'B2', t1: 'deadlift', t2: 'ohp', t3: 'B' },
];
export const T1_STAGES = [[5, 3], [6, 2], [10, 1]]; // series × reps; la última serie, al máximo
export const T2_STAGES = [[3, 10], [3, 8], [3, 6]];
export const T3_SCHEME = [3, 15];
export const T3_GOAL = 25; // reps en la última serie para subir
export const TEST = 'test'; // etapa: prueba de 5RM

export const stageKey = (tier, exId) => `${tier}:${exId}`;

/** Series de plantilla de un nivel de GZCLP según su etapa (pesos fijos). */
export function gzclpSets(tier, st) {
  if (tier === 'T1' && st.stage === TEST) return [{ type: 'N', weight: null, reps: 5, amrap: true }];
  const [n, reps] = tier === 'T1' ? T1_STAGES[st.stage] : tier === 'T2' ? T2_STAGES[st.stage] : T3_SCHEME;
  return Array.from({ length: n }, (_, i) => ({
    type: 'N', weight: st.weight ?? null, reps, ...(tier !== 'T2' && i === n - 1 ? { amrap: true } : {}),
  }));
}

/** "5 × 3+ con 100 kg" / "Prueba de 5RM" */
export function schemeText(tier, st) {
  if (tier === 'T1' && st.stage === TEST) return 'prueba de 5RM';
  const [n, reps] = tier === 'T1' ? T1_STAGES[st.stage] : tier === 'T2' ? T2_STAGES[st.stage] : T3_SCHEME;
  return `${n} × ${reps}${tier === 'T2' ? '' : '+'}${st.weight ? ` con ${fmt(st.weight)} kg` : ''}`;
}
const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

// ---------------- Plan de un día ----------------
/**
 * Ejercicios del programa para el día `day` (1–4) en la posición actual. Los demás ejercicios de la
 * plantilla (accesorios que agregaste) no se tocan.
 * @returns {{exercise_id:string, prog:{tier:string, test?:boolean}, sets:object[]}[]}
 */
export function dayPlan(p, day = p.state.day, week = p.state.week) {
  if (p.kind === '531') {
    const lift = p.config.lifts[day - 1];
    return lift ? [{ exercise_id: lift, prog: { tier: 'main' }, sets: sets531(week) }] : [];
  }
  const d = GZCLP_DAYS[day - 1];
  const out = [];
  for (const [tier, exId] of [['T1', p.config.lifts[d.t1]], ['T2', p.config.lifts[d.t2]], ['T3', p.config.t3?.[d.t3]]]) {
    if (!exId) continue;
    const st = p.state.stages?.[stageKey(tier, exId)] || { stage: 0, weight: null };
    out.push({ exercise_id: exId, prog: { tier, ...(tier === 'T1' && st.stage === TEST ? { test: true } : {}) }, sets: gzclpSets(tier, st) });
  }
  return out;
}

/** Nombre del día: "Semana 2 · Día 3" (5/3/1) o "A2" (GZCLP). */
export const dayLabel = (p, day = p.state.day) => (p.kind === '531' ? `Día ${day}` : GZCLP_DAYS[day - 1].label);

// ---------------- Avanzar ----------------
/** Siguiente posición. En 5/3/1, al pasar la última semana empieza otro ciclo (y se ofrece subir los máximos). */
export function nextPosition(p) {
  let { week = 1, day = 1, cycle = 1 } = p.state;
  day += 1;
  let cycleEnd = false;
  if (day > DAYS) {
    day = 1;
    week += 1;
    if (p.kind === '531' && week > weeksOf(p)) { week = 1; cycle += 1; cycleEnd = true; }
  }
  return { week, day, cycle, cycleEnd };
}

/** Volver un día (repetir el anterior). */
export function prevPosition(p) {
  let { week = 1, day = 1, cycle = 1 } = p.state;
  day -= 1;
  if (day < 1) {
    day = DAYS;
    week -= 1;
    if (week < 1) {
      if (p.kind === '531' && cycle > 1) { cycle -= 1; week = weeksOf(p); } else { week = 1; day = 1; }
    }
  }
  return { week, day, cycle };
}

// Series hechas de un ejercicio del programa en un entrenamiento (sin calentamientos)
function doneSets(workout, exId, tier) {
  const e = (workout.exercises || []).find((x) => x.exercise_id === exId && (!x.prog || x.prog.tier === tier))
    || (workout.exercises || []).find((x) => x.exercise_id === exId);
  if (!e) return null;
  return e.sets.filter((s) => s.done !== false && s.type !== 'W');
}

const completes = (sets, n, reps) => sets.length >= n && sets.slice(0, n).every((s) => (s.reps || 0) >= reps);

/**
 * Resultado de un día de GZCLP: etapas nuevas y qué cambia para la próxima vez.
 * @param {object} h { isLower(exId), round(exId, kg), name(exId) }
 */
function evaluateGzclp(p, workout, day, h) {
  const stages = structuredClone(p.state.stages || {});
  const changes = [];
  for (const item of dayPlan(p, day)) {
    const { exercise_id: exId, prog: { tier } } = item;
    const key = stageKey(tier, exId);
    const st = stages[key] || { stage: 0, weight: null };
    const sets = doneSets(workout, exId, tier);
    if (!sets || !sets.length) continue; // no lo hiciste: queda igual
    const inc = h.isLower(exId) ? 5 : 2.5;
    let next;
    if (tier === 'T1' && st.stage === TEST) {
      const five = Math.max(0, ...sets.filter((s) => (s.reps || 0) >= 5).map((s) => s.weight || 0));
      next = five > 0 ? { stage: 0, weight: h.round(exId, five * 0.85) } : st;
      if (five > 0) changes.push(`T1 ${h.name(exId)}: 5RM de ${fmt(five)} kg → ${schemeText('T1', next)}`);
      else changes.push(`T1 ${h.name(exId)}: falta la prueba de 5RM (5 reps)`);
    } else if (tier === 'T3') {
      const last = sets[sets.length - 1];
      next = (last.reps || 0) >= T3_GOAL && sets.length >= T3_SCHEME[0]
        ? { ...st, weight: h.round(exId, (st.weight || last.weight || 0) + 2.5) } : st;
      changes.push(`T3 ${h.name(exId)}: ${schemeText('T3', next)}`);
    } else {
      const table = tier === 'T1' ? T1_STAGES : T2_STAGES;
      const [n, reps] = table[st.stage];
      const weight = st.weight ?? sets[0].weight ?? 0;
      if (completes(sets, n, reps)) {
        next = { ...st, weight: h.round(exId, weight + inc), ...(tier === 'T2' && st.stage === 0 ? { best10: weight } : {}) };
      } else if (st.stage < table.length - 1) {
        next = { ...st, stage: st.stage + 1, weight };
      } else if (tier === 'T1') {
        next = { ...st, stage: TEST };
      } else {
        next = { ...st, stage: 0, weight: h.round(exId, (st.best10 ?? weight) + (p.config.t2Reset ?? 7.5)) };
      }
      changes.push(`${tier} ${h.name(exId)}: ${schemeText(tier, next)}`);
    }
    stages[key] = next;
  }
  return { stages, changes };
}

/**
 * Procesa el entrenamiento de un día del programa: progresión (GZCLP), siguiente posición y, al
 * terminar un ciclo de 5/3/1, los máximos por subir (+2,5 kg superior, +5 kg inferior; se confirman).
 * @param {object} h { isLower(exId), round(exId, kg), name(exId), tmOf(exId) }
 * @returns {object} programa nuevo (state.last guarda el resultado y el estado anterior)
 */
export function completeDay(p, workout, h) {
  const day = p.state.day;
  const before = structuredClone(p.state);
  let stages = p.state.stages || {};
  let changes = [];
  if (p.kind === 'gzclp') ({ stages, changes } = evaluateGzclp(p, workout, day, h));
  const pos = nextPosition(p);
  let pendingBump = p.state.pendingBump || null;
  if (p.kind === '531' && pos.cycleEnd) {
    pendingBump = p.config.lifts.filter(Boolean).map((ex) => {
      const from = h.tmOf(ex);
      return { ex, from, to: from ? Math.round((from + (h.isLower(ex) ? 5 : 2.5)) * 100) / 100 : null };
    }).filter((b) => b.from);
    changes = [`Fin del ciclo ${p.state.cycle || 1}: puedes subir tus máximos`];
  }
  const next = { ...p, state: { ...p.state, week: pos.week, day: pos.day, cycle: pos.cycle, stages, pendingBump } };
  if (p.kind === '531') {
    const nd = dayPlan(next)[0];
    if (nd && !pos.cycleEnd) changes.push(`Próximo: semana ${pos.week}, ${h.name(nd.exercise_id)}`);
  }
  next.state.last = { workout_id: workout.id, day, week: p.state.week, changes, before };
  return next;
}

/** Recalcula el último día (entrenamiento corregido después): vuelve al estado anterior y lo procesa de nuevo. */
export function redoLastDay(p, workout, h) {
  if (p.state.last?.workout_id !== workout.id || !p.state.last.before) return null;
  return completeDay({ ...p, state: p.state.last.before }, workout, h);
}

// ---------------- Máximos ----------------
const DAY_MS = 864e5;

/**
 * Máximo de entrenamiento sugerido: 90 % del mejor 1RM estimado de los últimos 3 meses, hacia abajo
 * (a 2,5 kg o al mínimo aumento). null sin historial.
 * @param {{date:string, e1rm:number}[]} sessions
 */
export function suggestTM(sessions, { now = Date.now(), inc = 2.5 } = {}) {
  const recent = sessions.filter((s) => s.e1rm > 0 && now - Date.parse(s.date) <= 92 * DAY_MS);
  if (!recent.length) return null;
  const best = Math.max(...recent.map((s) => s.e1rm));
  const tm = Math.floor((best * 0.9) / inc + 1e-9) * inc;
  return tm > 0 ? Math.round(tm * 100) / 100 : null;
}

/**
 * Pesos iniciales de GZCLP desde el 1RM estimado: T1 = 85 % del 5RM, T2 = 65 % del 5RM, T3 ≈ 90 % del
 * peso para 15 reps. (5RM ≈ 1RM × 32/36, la misma fórmula de Brzycki que usa la app.)
 */
export function gzclpStart(e1rm) {
  if (!(e1rm > 0)) return { t1: null, t2: null, t3: null };
  const rm5 = (e1rm * 32) / 36;
  return { t1: rm5 * 0.85, t2: rm5 * 0.65, t3: ((e1rm * 22) / 36) * 0.9 };
}

/** Peso de una serie en % del máximo. */
export const pctLoad = (tm, pct) => (tm > 0 && pct > 0 ? (tm * pct) / 100 : null);
