// Pruebas de programas por porcentaje (feature 12): 5/3/1, GZCLP, máximo sugerido y redondeo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  completeDay, dayPlan, gzclpStart, nextPosition, pctLoad, prevPosition, redoLastDay, sets531, suggestTM, TEST,
} from '../src/lib/programs.js';
import { roundLoad } from '../src/lib/loads.js';

const BAR = { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] };
const LOWER = new Set(['sq', 'dl']);
const TM = { sq: 100, bn: 80, dl: 140, ohp: 50 };
const h = {
  isLower: (ex) => LOWER.has(ex),
  round: (ex, kg) => roundLoad(kg, { inc: 2.5, barbell: BAR }),
  name: (ex) => ex,
  tmOf: (ex) => TM[ex],
};
const p531 = (state = {}, config = {}) => ({
  id: 'p', name: '5/3/1', kind: '531', active: true,
  config: { lifts: ['sq', 'bn', 'dl', 'ohp'], deload: false, templates: ['t1', 't2', 't3', 't4'], ...config },
  state: { week: 1, day: 1, cycle: 1, stages: {}, ...state },
});
const work = (id, exercises) => ({ id, exercises });
const S = (weight, reps, extra = {}) => ({ type: 'N', weight, reps, done: true, ...extra });

test('5/3/1: TM 100 kg, semana 1 → 65 × 5, 75 × 5, 85 × 5+ armables con barra de 20', () => {
  const plan = dayPlan(p531());
  assert.equal(plan[0].exercise_id, 'sq');
  const loads = plan[0].sets.map((s) => roundLoad(pctLoad(100, s.pct), { inc: 2.5, barbell: BAR }));
  assert.deepEqual(loads, [65, 75, 85]);
  assert.deepEqual(plan[0].sets.map((s) => [s.reps, !!s.amrap]), [[5, false], [5, false], [5, true]]);
});

test('5/3/1: semana 3 = 75 × 5, 85 × 3, 95 × 1+; la 4 solo con descarga', () => {
  assert.deepEqual(sets531(3).map((s) => [s.pct, s.reps, !!s.amrap]), [[75, 5, false], [85, 3, false], [95, 1, true]]);
  // sin descarga: después de la semana 3, día 4, empieza otro ciclo
  assert.deepEqual(nextPosition(p531({ week: 3, day: 4 })), { week: 1, day: 1, cycle: 2, cycleEnd: true });
  // con descarga: semana 4
  assert.deepEqual(nextPosition(p531({ week: 3, day: 4 }, { deload: true })), { week: 4, day: 1, cycle: 1, cycleEnd: false });
  assert.deepEqual(sets531(4).map((s) => s.pct), [40, 50, 60]);
  assert.ok(sets531(4).every((s) => !s.amrap));
});

test('5/3/1: fin de ciclo ofrece subir los máximos (+2,5 superior, +5 inferior)', () => {
  const next = completeDay(p531({ week: 3, day: 4 }), work('w1', [{ exercise_id: 'ohp', sets: [S(47.5, 3)] }]), h);
  assert.deepEqual(next.state.pendingBump, [
    { ex: 'sq', from: 100, to: 105 }, { ex: 'bn', from: 80, to: 82.5 }, { ex: 'dl', from: 140, to: 145 }, { ex: 'ohp', from: 50, to: 52.5 },
  ]);
  assert.equal(next.state.week, 1);
  assert.equal(next.state.cycle, 2);
  assert.equal(next.state.last.workout_id, 'w1');
});

test('5/3/1: avanzar, repetir y saltar', () => {
  const next = completeDay(p531(), work('w1', []), h);
  assert.deepEqual([next.state.week, next.state.day], [1, 2]);
  assert.deepEqual(prevPosition(next), { week: 1, day: 1, cycle: 1 });
  assert.deepEqual(prevPosition(p531({ week: 2, day: 1 })), { week: 1, day: 4, cycle: 1 });
  assert.deepEqual(prevPosition(p531({ week: 1, day: 1, cycle: 2 })), { week: 3, day: 4, cycle: 1 });
  assert.deepEqual(prevPosition(p531({ week: 1, day: 1, cycle: 1 })), { week: 1, day: 1, cycle: 1 });
});

const gz = (stages = {}, state = {}) => ({
  id: 'g', name: 'GZCLP', kind: 'gzclp', active: true,
  config: { lifts: { squat: 'sq', bench: 'bn', deadlift: 'dl', ohp: 'ohp' }, t3: { A: 'lat', B: 'row' }, t2Reset: 7.5, templates: [] },
  state: {
    week: 1, day: 1, cycle: 1,
    stages: { 'T1:sq': { stage: 0, weight: 100 }, 'T2:bn': { stage: 0, weight: 50 }, 'T3:lat': { stage: 0, weight: 40 }, ...stages },
    ...state,
  },
});

test('GZCLP: día A1 = T1 sentadilla 5 × 3+, T2 banca 3 × 10, T3 jalón 3 × 15+', () => {
  const plan = dayPlan(gz());
  assert.deepEqual(plan.map((x) => [x.prog.tier, x.exercise_id, x.sets.length, x.sets[0].reps, x.sets[0].weight, !!x.sets.at(-1).amrap]), [
    ['T1', 'sq', 5, 3, 100, true], ['T2', 'bn', 3, 10, 50, false], ['T3', 'lat', 3, 15, 40, true],
  ]);
});

test('GZCLP T1: éxito sube 5 kg (inferior); fallar 5 × 3 → 6 × 2 con el mismo peso', () => {
  const ok = completeDay(gz(), work('w', [{ exercise_id: 'sq', sets: [S(100, 3), S(100, 3), S(100, 3), S(100, 3), S(100, 5)] }]), h);
  assert.deepEqual(ok.state.stages['T1:sq'], { stage: 0, weight: 105 });
  const fail = completeDay(gz(), work('w', [{ exercise_id: 'sq', sets: [S(100, 3), S(100, 3), S(100, 3), S(100, 2), S(100, 2)] }]), h);
  assert.deepEqual(fail.state.stages['T1:sq'], { stage: 1, weight: 100 });
  assert.ok(fail.state.last.changes.includes('T1 sq: 6 × 2+ con 100 kg'));
  // series de menos también es fallar
  const short = completeDay(gz(), work('w', [{ exercise_id: 'sq', sets: [S(100, 3), S(100, 3)] }]), h);
  assert.equal(short.state.stages['T1:sq'].stage, 1);
  // no hacerlo deja todo igual
  const none = completeDay(gz(), work('w', []), h);
  assert.deepEqual(none.state.stages['T1:sq'], { stage: 0, weight: 100 });
});

test('GZCLP T1: fallar en 10 × 1 pide prueba de 5RM y reinicia en 5 × 3 al 85 %', () => {
  const p = gz({ 'T1:sq': { stage: 2, weight: 100 } });
  const fail = completeDay(p, work('w', [{ exercise_id: 'sq', sets: Array.from({ length: 10 }, (_, i) => S(100, i < 8 ? 1 : 0)) }]), h);
  assert.equal(fail.state.stages['T1:sq'].stage, TEST);
  // el siguiente A1 trae la prueba
  const test5 = dayPlan({ ...fail, state: { ...fail.state, day: 1 } })[0];
  assert.deepEqual([test5.prog, test5.sets.length, test5.sets[0].reps], [{ tier: 'T1', test: true }, 1, 5]);
  const after = completeDay({ ...fail, state: { ...fail.state, day: 1 } }, work('w2', [{ exercise_id: 'sq', sets: [S(80, 8), S(110, 5), S(115, 3)] }]), h);
  // 5RM = 110 (la serie más pesada de 5 reps); 110 × 0,85 = 93,5 → 92,5 (con discos de 1,25 el paso es 2,5)
  assert.deepEqual(after.state.stages['T1:sq'], { stage: 0, weight: 92.5 });
});

test('GZCLP T2: 3 × 10 → 3 × 8 → 3 × 6 → vuelve a 3 × 10 con el último logrado + 7,5', () => {
  let p = gz({ 'T2:bn': { stage: 0, weight: 50 } });
  const ok = completeDay(p, work('w', [{ exercise_id: 'bn', sets: [S(50, 10), S(50, 10), S(50, 10)] }]), h);
  assert.deepEqual(ok.state.stages['T2:bn'], { stage: 0, weight: 52.5, best10: 50 });
  p = gz({ 'T2:bn': { stage: 0, weight: 52.5, best10: 50 } });
  const f1 = completeDay(p, work('w', [{ exercise_id: 'bn', sets: [S(52.5, 10), S(52.5, 9), S(52.5, 8)] }]), h);
  assert.equal(f1.state.stages['T2:bn'].stage, 1);
  p = gz({ 'T2:bn': { stage: 2, weight: 52.5, best10: 50 } });
  const f3 = completeDay(p, work('w', [{ exercise_id: 'bn', sets: [S(52.5, 6), S(52.5, 5), S(52.5, 4)] }]), h);
  assert.deepEqual(f3.state.stages['T2:bn'], { stage: 0, weight: 57.5, best10: 50 });
});

test('GZCLP T3: 25 reps en la última serie sube 2,5 kg', () => {
  const up = completeDay(gz(), work('w', [{ exercise_id: 'lat', sets: [S(40, 15), S(40, 15), S(40, 25)] }]), h);
  assert.equal(up.state.stages['T3:lat'].weight, 42.5);
  const same = completeDay(gz(), work('w', [{ exercise_id: 'lat', sets: [S(40, 15), S(40, 15), S(40, 24)] }]), h);
  assert.equal(same.state.stages['T3:lat'].weight, 40);
});

test('recalcular el último día si se corrige el entrenamiento', () => {
  const p = gz();
  const bad = completeDay(p, work('w', [{ exercise_id: 'sq', sets: [S(100, 3), S(100, 3), S(100, 3), S(100, 3), S(100, 2)] }]), h);
  assert.equal(bad.state.stages['T1:sq'].stage, 1);
  const fixed = redoLastDay(bad, work('w', [{ exercise_id: 'sq', sets: [S(100, 3), S(100, 3), S(100, 3), S(100, 3), S(100, 4)] }]), h);
  assert.deepEqual(fixed.state.stages['T1:sq'], { stage: 0, weight: 105 });
  assert.deepEqual([fixed.state.day, fixed.state.week], [2, 1]); // no avanza dos veces
  assert.equal(redoLastDay(bad, work('otro', []), h), null);
});

test('máximo sugerido: 90 % del mejor 1RM de 3 meses, hacia abajo', () => {
  const now = Date.parse('2026-11-22T12:00:00Z');
  const sessions = [
    { date: '2026-11-20T18:00:00Z', e1rm: 117 },
    { date: '2026-10-01T18:00:00Z', e1rm: 121 },
    { date: '2026-06-01T18:00:00Z', e1rm: 150 }, // más de 3 meses: no cuenta
  ];
  assert.equal(suggestTM(sessions, { now }), 107.5); // 121 × 0,9 = 108,9 → 107,5
  assert.equal(suggestTM(sessions, { now, inc: 1 }), 108);
  assert.equal(suggestTM([], { now }), null);
  const g = gzclpStart(120);
  assert.ok(Math.abs(g.t1 - 90.67) < 0.01 && Math.abs(g.t2 - 69.33) < 0.01);
});
