// Análisis del historial (features 17, 23, 24, 25, 26), lado de la app: arma los datos desde los
// entrenamientos con carga efectiva y los memoriza mientras no cambien. Los cálculos están en
// trend.js, factors.js, repmodel.js y goals.js (puros).
import { state, saveSyncedSettings, syncedSettings } from './data.js';
import { analysisWorkouts, kindOf, repModel } from './effective.js';
import { e1rm, isWorking } from './stats.js';
import {
  DAY, expectedAt, INDEX_MAX_GAP, localResiduals, median, progressRate, strengthIndex, trendLine,
} from './trend.js';
import { compareGroups, orderEffect, percentileOf, sessionScore } from './factors.js';
import { goalStatus } from './goals.js';
import { bodyweightLookup, localDate } from './body.js';
import { uid } from './format.js';

const asc = (a, b) => (a.started_at < b.started_at ? -1 : 1);

// Mejor serie efectiva (sin drop sets) por ejercicio en un entrenamiento, con su puesto en la sesión
function bestByExercise(w) {
  const out = new Map();
  let pos = 0;
  for (const e of w.exercises || []) {
    const sets = (e.sets || []).filter((s) => isWorking(s) && s.type !== 'D' && s.weight > 0 && s.reps > 0);
    if (!(e.sets || []).some(isWorking)) continue;
    const p = pos++;
    if (!sets.length || out.has(e.exercise_id)) continue;
    const best = sets.reduce((a, b) => (e1rm(b.weight, b.reps) > e1rm(a.weight, a.reps) ? b : a));
    out.set(e.exercise_id, { set: best, e: e1rm(best.weight, best.reps), pos: p, sets: e.sets });
  }
  return out;
}

// Descanso real antes de la primera serie efectiva de cada ejercicio (segundos), si las series
// guardan la hora (`at`, desde v0.2)
function restBefore(w) {
  const out = new Map();
  let lastAt = null;
  for (const e of w.exercises || []) {
    let first = true;
    for (const s of e.sets || []) {
      if (!s.at) continue;
      const t = Date.parse(s.at);
      if (first && isWorking(s) && s.type !== 'W' && lastAt != null && !out.has(e.exercise_id)) {
        out.set(e.exercise_id, (t - lastAt) / 1000);
        first = false;
      }
      lastAt = t;
    }
  }
  return out;
}

const hourBlock = (iso) => { const h = new Date(iso).getHours(); return h < 12 ? 'mañana' : h < 18 ? 'tarde' : 'noche'; };
const gapBlock = (g) => (g == null ? null : g <= 1.5 ? '1 día o menos' : g <= 2.5 ? '2 días' : '3 días o más');
const restBlock = (s) => (s == null || s > 900 ? null : s < 120 ? 'menos de 2 min' : s <= 180 ? '2 a 3 min' : 'más de 3 min');

let cache = {};
/**
 * Todo el análisis, memorizado por los entrenamientos con carga efectiva (que ya incluyen la
 * fórmula personal y los ajustes) y el peso corporal.
 */
export function insights() {
  const ws = analysisWorkouts();
  if (cache.ws === ws && cache.bm === state.body_metrics) return cache.value;
  const sorted = [...ws].filter((w) => w.ended_at || (w.exercises || []).length).sort(asc);

  // Por ejercicio: puntos {t, value, wid, pos}
  const byEx = new Map();
  const days = [];
  const perWorkout = new Map(); // wid → Map(ex → {e, pos, set})
  for (const w of sorted) {
    const best = bestByExercise(w);
    perWorkout.set(w.id, best);
    const values = new Map();
    const t = Date.parse(w.started_at);
    for (const [ex, b] of best) {
      if (kindOf(ex) === 'tiempo') continue;
      if (!byEx.has(ex)) byEx.set(ex, []);
      byEx.get(ex).push({ t, value: b.e, wid: w.id, pos: b.pos, reps: b.set.reps });
      values.set(ex, b.e);
    }
    days.push({ id: w.id, t, values });
  }

  // Tendencia y ritmo por ejercicio
  const exercises = new Map();
  for (const [ex, pts] of byEx) exercises.set(ex, { pts: trendLine(pts), rate: progressRate(pts) });

  // Índice de fuerza
  const index = strengthIndex(days);

  // Residuos locales (para "qué explica" y el orden)
  const rows = [];
  const resByWorkout = new Map();
  for (const [ex, pts] of byEx) {
    for (const { i, d } of localResiduals(pts)) {
      const p = pts[i];
      rows.push({ ex, wid: p.wid, pos: p.pos, d, t: p.t });
      if (!resByWorkout.has(p.wid)) resByWorkout.set(p.wid, []);
      resByWorkout.get(p.wid).push(d);
    }
  }

  // Puntaje de cada sesión (contra la sesión anterior y contra lo esperado, sin mirar el futuro)
  const scores = new Map();
  const seen = new Map(); // ex → puntos anteriores
  for (const w of sorted) {
    const t = Date.parse(w.started_at);
    const items = [];
    for (const [ex, b] of perWorkout.get(w.id)) {
      if (kindOf(ex) === 'tiempo') continue;
      const prev = seen.get(ex) || [];
      const last = prev.at(-1);
      items.push({
        ex, e: b.e,
        prev: last && (t - last.t) / DAY <= INDEX_MAX_GAP ? last.value : null,
        expected: last && (t - last.t) / DAY <= INDEX_MAX_GAP ? expectedAt(prev, t) : null,
      });
    }
    scores.set(w.id, { ...sessionScore(items), items });
    for (const it of items) { if (!seen.has(it.ex)) seen.set(it.ex, []); seen.get(it.ex).push({ t, value: it.e }); }
  }
  const scoreHistory = [...scores.values()].filter((s) => s.n >= 3).map((s) => s.vsExpected);

  // Qué explica tu rendimiento: residuo medio de cada entrenamiento contra factores. El contexto de
  // cada entrenamiento (días de descanso, hora) se guarda aunque no tenga residuo, para el resumen.
  // Con pocos registros de peso la tendencia es plana por construcción: no se analiza
  const bw = state.body_metrics.filter((m) => m.weight > 0).length >= 4 ? bodyweightLookup(state.body_metrics) : () => null;
  const wRows = [];
  sorted.forEach((w, i) => {
    const ds = resByWorkout.get(w.id) || [];
    const prevW = sorted[i - 1];
    const gap = prevW ? (Date.parse(w.started_at) - Date.parse(prevW.started_at)) / DAY : null;
    const day = localDate(new Date(w.started_at));
    const b0 = bw(day);
    const b1 = bw(localDate(new Date(Date.parse(w.started_at) - 14 * DAY)));
    const bwTrend = b0 && b1 ? (b0 - b1 > 0.3 ? 'subiendo' : b1 - b0 > 0.3 ? 'bajando' : 'estable') : null;
    wRows.push({ wid: w.id, d: ds.length >= 3 ? ds.reduce((a, b) => a + b, 0) / ds.length : null, gap: gapBlock(gap), hour: hourBlock(w.started_at), bw: bwTrend });
  });
  const fRows = wRows.filter((r) => r.d != null);
  const rowsByWid = new Map();
  for (const r of rows) {
    if (!rowsByWid.has(r.wid)) rowsByWid.set(r.wid, []);
    rowsByWid.get(r.wid).push(r);
  }
  const restRows = [];
  for (const w of sorted) {
    if (!(w.exercises || []).some((e) => (e.sets || []).some((s) => s.at))) continue;
    const rest = restBefore(w);
    for (const r of rowsByWid.get(w.id) || []) {
      const block = restBlock(rest.get(r.ex));
      if (block) restRows.push({ d: r.d, rest: block });
    }
  }
  const factors = [
    { key: 'gap', title: 'Días desde el entrenamiento anterior', groups: compareGroups(fRows, (r) => r.gap, { seed: 11 }), n: fRows.length },
    { key: 'hour', title: 'Hora del día', groups: compareGroups(fRows, (r) => r.hour, { seed: 13 }), n: fRows.length },
    { key: 'bw', title: 'Peso corporal (últimas 2 semanas)', groups: compareGroups(fRows, (r) => r.bw, { seed: 17 }), n: fRows.filter((r) => r.bw).length },
    { key: 'rest', title: 'Descanso antes del ejercicio', groups: compareGroups(restRows, (r) => r.rest, { minN: 15, seed: 19 }), n: restRows.length },
  ];

  const order = orderEffect(rows);
  const context = new Map(wRows.map((r) => [r.wid, r]));
  const value = { exercises, index, scores, scoreHistory, factors, context, order, rows, model: repModel(), workouts: sorted.length };
  cache = { ws, bm: state.body_metrics, value };
  return value;
}

/** Datos de análisis de un ejercicio: puntos con tendencia, ritmo (o null si no hay). */
export const exerciseInsight = (ex) => insights().exercises.get(ex) || null;

/** Tendencia actual (último valor de la línea) de un ejercicio. */
export const trendNow = (ex) => exerciseInsight(ex)?.pts.at(-1)?.trend ?? null;

/** Puntaje de un entrenamiento guardado y su percentil entre tus sesiones. */
export function scoreOf(wid) {
  const ins = insights();
  const s = ins.scores.get(wid);
  if (!s) return null;
  return { ...s, percentile: s.n >= 3 ? percentileOf(s.vsExpected, ins.scoreHistory) : null };
}

/**
 * Factores que pudieron influir en un entrenamiento: para cada factor, el grupo de esta sesión y si
 * ese grupo tiene un efecto real en tu historial.
 * @returns {{key:string, title:string, group:string, effect:number|null, verdict:string}[]}
 */
export function contextOf(wid) {
  const ins = insights();
  const c = ins.context.get(wid);
  if (!c) return [];
  return ins.factors.filter((f) => f.key !== 'rest').map((f) => {
    const group = c[f.key];
    if (!group) return null;
    const g = f.groups.find((x) => x.key === group);
    return { key: f.key, title: f.title, group, effect: g?.effect ?? null, verdict: g?.verdict || 'pocos' };
  }).filter(Boolean);
}

// ---------- Metas (feature 26) ----------
export const goals = () => syncedSettings().goals || [];
export const goalOf = (ex) => goals().find((g) => g.ex === ex && !g.done_at) || null;
export const doneGoalsOf = (ex) => goals().filter((g) => g.ex === ex && g.done_at);

export function addGoal(ex, weight, reps) {
  const target = e1rm(weight, reps);
  const start = trendNow(ex) || target;
  const g = { id: uid('g_'), ex, weight, reps, target, start, created: new Date().toISOString(), done_at: null };
  saveSyncedSettings({ goals: [...goals().filter((x) => !(x.ex === ex && !x.done_at)), g] });
  return g;
}
export function removeGoal(id) {
  saveSyncedSettings({ goals: goals().filter((g) => g.id !== id) });
}

/** Mejor 1RM estimado de un ejercicio desde una fecha (para saber si la meta se logró). */
function bestSince(ex, iso) {
  const pts = exerciseInsight(ex)?.pts || [];
  return pts.reduce((a, p) => (p.t >= Date.parse(iso) ? Math.max(a, p.value) : a), 0);
}

/** Estado de una meta (la meta guarda peso × reps; su 1RM se recalcula con la fórmula vigente). */
export function statusOf(g) {
  const ins = exerciseInsight(g.ex);
  const target = e1rm(g.weight, g.reps);
  return goalStatus({ ...g, target }, { trend: trendNow(g.ex), rate: ins?.rate, best: bestSince(g.ex, g.created) });
}

/**
 * Al guardar un entrenamiento: marca como logradas las metas que ya se alcanzaron (con la carga
 * efectiva y la fórmula vigente). Devuelve las que se lograron ahora.
 * @param {string} wid entrenamiento recién guardado (queda como el que la logró)
 */
export function checkGoals(wid) {
  const open = goals().filter((g) => !g.done_at);
  if (!open.length) return [];
  const reached = [];
  const next = goals().map((g) => {
    if (g.done_at) return g;
    const target = e1rm(g.weight, g.reps);
    const hit = (exerciseInsight(g.ex)?.pts || []).find((p) => p.t >= Date.parse(g.created) && p.value >= target * 0.9995);
    if (!hit) return g;
    reached.push(g);
    return { ...g, done_at: new Date(hit.t).toISOString(), done_wid: hit.wid === wid ? wid : hit.wid };
  });
  if (reached.length) saveSyncedSettings({ goals: next });
  return reached;
}

/** Metas logradas en un entrenamiento. */
export const goalsDoneIn = (wid) => goals().filter((g) => g.done_wid === wid);

/**
 * Progreso por grupo muscular (mapa del cuerpo, modo "Progreso"): mediana del ritmo de los
 * ejercicios del grupo con ritmo medido (activos en los últimos 4 meses).
 * @param {(id:string)=>string|null} partOf
 * @returns {Map<string, {rate:number, n:number, exercises:{id:string, rate:number, status:string}[]}>}
 */
export function progressByPart(partOf) {
  const out = new Map();
  for (const [id, x] of insights().exercises) {
    if (!x.rate.enough) continue;
    const part = partOf(id);
    if (!part) continue;
    if (!out.has(part)) out.set(part, { exercises: [] });
    out.get(part).exercises.push({ id, rate: x.rate.rate, status: x.rate.status });
  }
  for (const v of out.values()) {
    v.exercises.sort((a, b) => b.rate - a.rate);
    v.rate = median(v.exercises.map((e) => e.rate));
    v.n = v.exercises.length;
  }
  return out;
}

/** Ranking de ejercicios por ritmo (con ritmo medido), del que más progresa al que menos. */
export function rateRanking() {
  return [...insights().exercises].filter(([, x]) => x.rate.enough)
    .map(([id, x]) => ({ id, ...x.rate, trend: x.pts.at(-1)?.trend }))
    .sort((a, b) => b.rate - a.rate);
}
