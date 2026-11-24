// Pruebas de los análisis (features 17, 23, 24, 25, 26): tendencia, ritmo, índice, fórmula
// personal, factores, orden y metas. Datos sintéticos con efectos conocidos.
// Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, expectedAt, indexChange, localResiduals, progressRate, strengthIndex, theilSen, toMonthly, trendLine,
} from '../src/lib/trend.js';
import { adjustOf, fitRepModel, repResiduals } from '../src/lib/repmodel.js';
import { compareGroups, orderAdjust, orderEffect, percentileOf, sessionScore } from '../src/lib/factors.js';
import { goalStatus, suggestedTarget } from '../src/lib/goals.js';
import { brzycki, e1rm, setRepAdjust, weightForReps } from '../src/lib/stats.js';

const T0 = Date.UTC(2026, 0, 1);
// Ruido determinista
function rng(seed) {
  let x = seed;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
// Serie: crece `monthly` %/mes, una sesión cada `every` días, ruido `sd` (log)
function series({ n = 30, every = 3, monthly = 5, sd = 0.02, start = 100, seed = 7 } = {}) {
  const r = rng(seed);
  const k = Math.log(1 + monthly / 100) / 30;
  return Array.from({ length: n }, (_, i) => ({ t: T0 + i * every * DAY, value: start * Math.exp(k * i * every + sd * gauss(r)) }));
}
const NOW = (pts) => pts.at(-1).t + DAY;

test('Theil–Sen: aguanta un valor raro', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 2 * i + 1 }));
  pts[5].y = 100;
  const fit = theilSen(pts);
  assert.equal(fit.slope, 2);
  assert.equal(fit.intercept, 1);
});

test('ritmo: recupera el %/mes con ruido y lo marca como seguro', () => {
  const pts = series({ monthly: 6, sd: 0.02 });
  const r = progressRate(pts, { now: NOW(pts) });
  assert.ok(r.enough);
  assert.ok(Math.abs(r.rate - 6) < 2.5, `rate ${r.rate}`);
  assert.ok(r.lo < r.rate && r.rate < r.hi);
  assert.equal(r.status, 'sube');
  assert.ok(r.sure);
});

test('ritmo: plano y bajando; pocos datos o poco tiempo no dan ritmo', () => {
  const flat = series({ monthly: 0, sd: 0.01 });
  assert.equal(progressRate(flat, { now: NOW(flat) }).status, 'plano');
  const down = series({ monthly: -4, sd: 0.01 });
  assert.equal(progressRate(down, { now: NOW(down) }).status, 'baja');
  const few = series({ n: 5 });
  assert.equal(progressRate(few, { now: NOW(few) }).enough, false);
  const short = series({ n: 8, every: 2 }); // 14 días
  assert.equal(progressRate(short, { now: NOW(short) }).enough, false);
  // sesiones de hace más de 4 meses no cuentan
  const old = series({ n: 12 });
  assert.equal(progressRate(old, { now: NOW(old) + 200 * DAY }).enough, false);
});

test('tendencia: filtra el ruido (menos variable que los datos)', () => {
  const pts = trendLine(series({ monthly: 0, sd: 0.04, n: 60 }));
  const sd = (xs) => Math.sqrt(xs.reduce((a, x) => a + (x - 100) ** 2, 0) / xs.length);
  assert.ok(sd(pts.slice(10).map((p) => p.trend)) < sd(pts.slice(10).map((p) => p.value)) / 2);
});

test('toMonthly y lo esperado sin mirar el futuro', () => {
  assert.ok(Math.abs(toMonthly(Math.log(1.06) / 30) - 6) < 1e-9);
  const pts = series({ monthly: 6, sd: 0 });
  const exp = expectedAt(pts.slice(0, 10), pts[10].t);
  assert.ok(Math.abs(exp / pts[10].value - 1) < 0.001);
  assert.equal(expectedAt([], T0), null);
});

test('residuos locales: sin ruido son 0 aunque haya progreso', () => {
  const pts = series({ monthly: 8, sd: 0 });
  const res = localResiduals(pts);
  assert.ok(res.length > 20);
  for (const r of res) assert.ok(Math.abs(r.d) < 1e-9);
});

test('índice: encadena la media recortada; entra y sale ejercicio sin saltos; necesita 3', () => {
  const days = [];
  for (let i = 0; i < 10; i++) {
    const values = new Map([['a', 100 * 1.01 ** i], ['b', 50 * 1.01 ** i], ['c', 80 * 1.01 ** i]]);
    if (i >= 5) values.set('nuevo', 500 * 1.01 ** i); // entra un ejercicio mucho más pesado: no hay salto
    days.push({ id: `w${i}`, t: T0 + i * 3 * DAY, values });
  }
  const idx = strengthIndex(days);
  assert.equal(idx[0].value, 100);
  // las 3 primeras sesiones de cada ejercicio son de aprendizaje: cuentan los pasos de la 4.ª a la 10.ª
  assert.equal(idx[0].t, days[2].t);
  assert.ok(Math.abs(idx.at(-1).value - 100 * 1.01 ** 7) < 0.01);
  assert.ok(Math.abs(indexChange(idx, T0) - (1.01 ** 7 - 1) * 100) < 0.01);
  // con solo 2 ejercicios comparables no hay índice
  const two = days.map((d) => ({ ...d, values: new Map([...d.values].slice(0, 2)) }));
  assert.equal(strengthIndex(two).length, 0);
  // una sesión anterior de hace más de 21 días no se compara
  const gap = [...days.slice(0, 4), ...days.slice(4).map((d) => ({ ...d, t: d.t + 30 * DAY }))];
  assert.ok(Math.abs(strengthIndex(gap).at(-1).value - 100 * 1.01 ** 6) < 0.01);
});

// Historial sintético con sesgo de reps conocido: el 1RM "real" crece; el estimado por Brzycki sale
// `bias` por rep más alto con muchas reps
function repHistory({ bias = 0.007, n = 40, exercises = 6, seed = 3 } = {}) {
  const r = rng(seed);
  const map = new Map();
  for (let e = 0; e < exercises; e++) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const reps = [3, 4, 5, 6, 7, 8, 9, 10, 12][Math.floor(r() * 9)];
      const true1rm = 100 * Math.exp(0.002 * i * 3 + 0.015 * gauss(r));
      // peso que da ese 1RM con Brzycki, inflado por el sesgo
      const weight = weightForReps(true1rm, reps) * Math.exp(bias * (reps - 7));
      arr.push({ t: T0 + i * 3 * DAY, weight, reps });
    }
    map.set(`e${e}`, arr);
  }
  return map;
}

test('fórmula personal: detecta el sesgo conocido con confianza', () => {
  const m = fitRepModel(repResiduals(repHistory({ bias: 0.007 })));
  assert.ok(m.confident, JSON.stringify({ beta: m.beta, lo: m.lo, hi: m.hi, reason: m.reason }));
  assert.ok(Math.abs(m.beta - 0.007) < 0.003, `beta ${m.beta}`);
  assert.ok(m.lo < m.beta && m.beta < m.hi);
  const adj = adjustOf(m);
  assert.ok(adj(12) < 1 && adj(3) > 1);
  assert.equal(Math.round(adj(m.r0) * 1e9), 1e9);
});

test('fórmula personal: sin sesgo o con pocos datos se queda con Brzycki', () => {
  const none = fitRepModel(repResiduals(repHistory({ bias: 0 })));
  assert.equal(none.confident, false);
  assert.equal(adjustOf(none)(12), 1);
  const few = fitRepModel(repResiduals(repHistory({ n: 8, exercises: 2 })));
  assert.equal(few.reason, 'pocos');
});

test('e1rm con ajuste: weightForReps sigue siendo su inverso; nunca menos que el peso', () => {
  setRepAdjust((r) => Math.exp(-0.007 * (r - 7)));
  try {
    const one = e1rm(80, 10);
    assert.ok(one < brzycki(80, 10));
    assert.ok(Math.abs(weightForReps(one, 10) - 80) < 1e-9);
    assert.equal(e1rm(80, 1), 80);
    assert.ok(e1rm(80, 2) >= 80);
  } finally {
    setRepAdjust(null);
  }
  assert.equal(e1rm(80, 10), brzycki(80, 10));
});

test('puntaje de la sesión: superados, iguales y bajo; contra lo esperado', () => {
  const s = sessionScore([
    { e: 102, prev: 100, expected: 101 },
    { e: 100, prev: 100, expected: 100 },
    { e: 95, prev: 100, expected: 100 },
    { e: 50, prev: null, expected: null },
  ]);
  assert.deepEqual([s.beaten, s.equal, s.below, s.total, s.n], [1, 1, 1, 3, 3]);
  assert.ok(s.vsExpected < 0);
  assert.equal(percentileOf(0.05, [-0.02, 0, 0.01, 0.03]), 100);
  assert.equal(percentileOf(null, [1]), null);
});

test('factores: efecto real se detecta; ruido da "igual"; pocos datos "pocos"', () => {
  const r = rng(11);
  const rows = [];
  for (let i = 0; i < 120; i++) {
    const g = i % 3 === 0 ? 'noche' : i % 3 === 1 ? 'mañana' : 'tarde';
    rows.push({ d: (g === 'noche' ? -0.03 : 0) + 0.015 * gauss(r), g, h: i % 2 ? 'x' : 'y', few: i < 4 ? 'raro' : 'común' });
  }
  const hour = compareGroups(rows, (x) => x.g);
  assert.equal(hour.find((x) => x.key === 'noche').verdict, 'peor');
  const noise = compareGroups(rows, (x) => x.h);
  assert.ok(noise.every((x) => x.verdict === 'igual'), JSON.stringify(noise));
  assert.equal(compareGroups(rows, (x) => x.few).find((x) => x.key === 'raro').verdict, 'pocos');
});

test('orden: detecta la caída por puesto de un ejercicio y la aplica solo si es real', () => {
  const r = rng(5);
  const rows = [];
  for (let i = 0; i < 60; i++) {
    for (const ex of ['a', 'b', 'c']) {
      const usual = { a: 0, b: 2, c: 4 }[ex];
      const pos = usual + (i % 4 === 0 ? 3 : 0);
      const effect = ex === 'a' ? -0.01 * (pos - usual) : 0;
      rows.push({ ex, pos, d: effect + 0.008 * gauss(r) });
    }
  }
  const o = orderEffect(rows);
  assert.ok(o.byExercise.get('a').real);
  assert.ok(Math.abs(o.byExercise.get('a').slope + 0.01) < 0.004);
  assert.equal(o.byExercise.get('b').real, false);
  assert.ok(orderAdjust(o, 'a', 3) < 0.99);
  assert.equal(orderAdjust(o, 'b', 3), 1);
  assert.equal(orderAdjust(o, 'a', 0), 1);
});

test('metas: fecha con rango; plana no da fecha; lograda; sugerida', () => {
  const now = T0;
  const rate = { rate: 4, lo: 2, hi: 8, enough: true };
  const g = { target: 110, start: 100 };
  const st = goalStatus(g, { trend: 100, rate, best: 100, now });
  assert.equal(st.status, 'en_camino');
  const months = Math.log(1.1) / Math.log(1.04);
  assert.ok(Math.abs(st.months - months) < 1e-9);
  assert.ok(st.etaEarly < st.eta && st.eta < st.etaLate);
  assert.equal(goalStatus(g, { trend: 100, rate: { ...rate, rate: 0.1 }, best: 100, now }).status, 'plana');
  assert.equal(goalStatus(g, { trend: 100, rate, best: 111, now }).status, 'lograda');
  assert.equal(goalStatus(g, { trend: 100, rate: { enough: false }, best: 100, now }).status, 'pocos');
  assert.ok(Math.abs(goalStatus(g, { trend: 105, rate, best: 105, now }).progress - 0.5) < 1e-9);
  assert.ok(Math.abs(suggestedTarget(100, rate) - 100 * 1.04 ** 2) < 1e-9);
  assert.ok(Math.abs(suggestedTarget(100, { enough: false }) - 100 * 1.01 ** 2) < 1e-9);
});

test('rendimiento: 2.000 entrenamientos se analizan rápido', () => {
  const r = rng(9);
  const exIds = Array.from({ length: 25 }, (_, i) => `e${i}`);
  const byEx = new Map(exIds.map((id) => [id, []]));
  const days = [];
  for (let i = 0; i < 2000; i++) {
    const t = T0 + i * 2 * DAY;
    const values = new Map();
    for (const id of exIds.filter(() => r() < 0.3)) {
      const v = 100 * Math.exp(0.0005 * i + 0.02 * gauss(r));
      values.set(id, v);
      byEx.get(id).push({ t, value: v, weight: weightForReps(v, 8), reps: 8 });
    }
    days.push({ id: `w${i}`, t, values });
  }
  const t0 = performance.now();
  strengthIndex(days);
  for (const pts of byEx.values()) { trendLine(pts); progressRate(pts, { now: T0 + 4000 * DAY }); localResiduals(pts); }
  fitRepModel(repResiduals(byEx));
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `${ms} ms`);
});
