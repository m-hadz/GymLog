import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveLoad, fmtSecs, parseSecs, resolveKind, resolveLoadMode, withEffectiveLoads } from '../src/lib/kinds.js';
import { computePRs, e1rm, exerciseRecords, exerciseSessions, prCount as prCountOf, workoutVolume } from '../src/lib/stats.js';
import { bodyweightLookup } from '../src/lib/body.js';
import { fmtSet } from '../src/lib/format.js';

const W = (id, day, exercise_id, sets) => ({
  id, started_at: `${day}T15:00:00.000Z`, exercises: [{ exercise_id, sets: sets.map(([weight, reps, extra]) => ({ type: 'N', weight, reps, done: true, ...extra })) }],
});
const KINDS = { dom: 'lastre', asis: 'asistido', fondos: 'peso_corporal', banca: 'peso_reps', plancha: 'tiempo' };
const opts = (bw, extra) => ({ kindFor: (id) => KINDS[id], bodyweightFor: () => bw, ...extra });

test('tipo por defecto: ajuste, categoría "Peso corporal" o nombre típico sin categoría', () => {
  assert.equal(resolveKind({ kind: 'lastre' }, { category: 'Peso corporal' }), 'lastre');
  assert.equal(resolveKind(null, { category: 'Peso corporal', name: 'Push-ups' }), 'peso_corporal');
  assert.equal(resolveKind(null, { category: 'Otro', name: 'Pull Up' }), 'peso_corporal');
  assert.equal(resolveKind(null, { category: 'Otro', name: 'Pull Up (Assisted)' }), 'peso_reps');
  assert.equal(resolveKind(null, { category: 'Máquina', name: 'Chest Dip Machine' }), 'peso_reps');
  assert.equal(resolveKind({ kind: 'raro' }, { category: 'Barra', name: 'Squat' }), 'peso_reps');
});

test('carga efectiva: lastre suma, asistido resta, sin peso corporal queda igual', () => {
  assert.equal(effectiveLoad('lastre', 10, 80), 90);
  assert.equal(effectiveLoad('asistido', 20, 80), 60);
  assert.equal(effectiveLoad('asistido', 100, 80), 0);
  assert.equal(effectiveLoad('peso_corporal', 0, 80), 80);
  assert.equal(effectiveLoad('lastre', 10, null), 10);
  assert.equal(effectiveLoad('peso_reps', 50, 80), 50);
});

test('dominada con lastre 10 kg × 8 con 80 kg: 720 kg de volumen y 1RM con 90 kg', () => {
  const [w] = withEffectiveLoads([W('a', '2026-11-01', 'dom', [[10, 8]])], opts(80));
  assert.equal(workoutVolume(w), 720);
  const [sess] = exerciseSessions([w], 'dom');
  assert.equal(sess.bestE1rm, e1rm(90, 8));
  assert.equal(fmtSet(w.exercises[0].sets[0]), 'PC + 10 kg × 8');
});

test('asistida 20 kg × 8 con 80 kg usa 60 kg; sin peso corporal se ve como hoy', () => {
  const [w] = withEffectiveLoads([W('a', '2026-11-01', 'asis', [[20, 8]])], opts(80));
  assert.equal(w.exercises[0].sets[0].weight, 60);
  assert.equal(fmtSet(w.exercises[0].sets[0]), 'PC − 20 kg × 8');
  const [raw] = withEffectiveLoads([W('a', '2026-11-01', 'dom', [[10, 8]])], opts(null));
  assert.equal(workoutVolume(raw), 80);
  assert.equal(raw.exercises[0].sets[0].weight, 10);
});

test('"contar el peso corporal en el volumen" apagado deja el volumen como hoy, pero el 1RM usa la carga real', () => {
  const [w] = withEffectiveLoads([W('a', '2026-11-01', 'dom', [[10, 8]])], opts(80, { countBodyweight: false }));
  assert.equal(workoutVolume(w), 80);
  assert.equal(exerciseSessions([w], 'dom')[0].bestE1rm, e1rm(90, 8));
  const [f] = withEffectiveLoads([W('b', '2026-11-01', 'fondos', [[null, 12]])], opts(80, { countBodyweight: false }));
  assert.equal(workoutVolume(f), 0);
});

test('no modifica lo guardado y deja igual los entrenamientos sin peso corporal', () => {
  const src = [W('a', '2026-11-01', 'dom', [[10, 8]]), W('b', '2026-11-02', 'banca', [[60, 8]])];
  const copy = structuredClone(src);
  const out = withEffectiveLoads(src, opts(80));
  assert.deepEqual(src, copy);
  assert.equal(out[1], src[1]);
});

test('récords de peso corporal: subir de peso corporal no es récord de peso; más reps sí', () => {
  const ws = withEffectiveLoads([
    W('a', '2026-11-01', 'fondos', [[null, 10]]),
    W('b', '2026-11-03', 'fondos', [[null, 10]]),
    W('c', '2026-11-05', 'fondos', [[null, 11]]),
  ], { kindFor: (id) => KINDS[id], bodyweightFor: (d) => (d < '2026-11-03' ? 80 : 82) });
  const prs = computePRs(ws);
  assert.deepEqual([...prs.get('b').values()].flat().filter((l) => l === 'PESO' || l === 'REPS'), []);
  assert.ok([...prs.get('c').values()].flat().includes('REPS'));
  const rec = exerciseRecords(exerciseSessions(ws, 'fondos'));
  assert.equal(rec.weight, null);
  assert.equal(rec.reps.value, 11);
});

test('lastre: el récord de peso es el lastre agregado', () => {
  const ws = withEffectiveLoads([W('a', '2026-11-01', 'dom', [[10, 8]]), W('b', '2026-11-03', 'dom', [[12.5, 6]])], opts(80));
  const rec = exerciseRecords(exerciseSessions(ws, 'dom'));
  assert.equal(rec.weight.value, 12.5);
  assert.ok([...computePRs(ws).get('b').values()].flat().includes('PESO'));
});

test('ejercicios por tiempo: no suman volumen, récord de tiempo y mejor/total por sesión', () => {
  const ws = [
    W('a', '2026-11-01', 'plancha', [[null, null, { seconds: 45 }], [null, null, { seconds: 40 }]]),
    W('b', '2026-11-03', 'plancha', [[10, null, { seconds: 60 }]]),
  ];
  assert.equal(workoutVolume(ws[1]), 0);
  const sessions = exerciseSessions(ws, 'plancha');
  assert.equal(sessions[0].bestSeconds, 45);
  assert.equal(sessions[0].totalSeconds, 85);
  assert.equal(exerciseRecords(sessions).seconds.value, 60);
  assert.deepEqual([...computePRs(ws).get('b').values()].flat(), ['TIEMPO']);
  assert.equal(fmtSet(ws[1].exercises[0].sets[0]), '10 kg · 1:00');
  assert.equal(fmtSet(ws[0].exercises[0].sets[0]), '0:45');
});

test('tiempo en mm:ss', () => {
  assert.equal(fmtSecs(75), '1:15');
  assert.equal(fmtSecs(5), '0:05');
  assert.equal(fmtSecs(3725), '1:02:05');
  assert.equal(parseSecs('1:30'), 90);
  assert.equal(parseSecs('90'), 90);
  assert.equal(parseSecs('0:05'), 5);
  assert.equal(parseSecs('1:02:05'), 3725);
  assert.equal(parseSecs(''), null);
  assert.equal(parseSecs('abc'), null);
  assert.equal(parseSecs('0'), null);
});

test('peso corporal por fecha: tendencia, y el primer registro para entrenamientos poco anteriores', () => {
  const at = bodyweightLookup([{ date: '2026-11-10', weight: 80 }, { date: '2026-11-11', weight: 81 }]);
  assert.equal(at('2026-11-10'), 80);
  assert.equal(at('2026-11-12'), 81); // menos de 3 registros: el último
  assert.equal(at('2026-10-01'), 80); // 40 días antes del primero
  assert.equal(at('2026-08-01'), null);
  assert.equal(bodyweightLookup([])('2026-11-10'), null);
});

test('por mano: curl 3 × 10 con 12 kg suma 720 kg y el 1RM sigue sobre 12 kg', () => {
  const sets = [[12, 10], [12, 10], [12, 10]];
  const mode = { curl: 'por_mano', remo: 'unilateral', banca: 'total' };
  const o = { kindFor: () => 'peso_reps', modeFor: (id) => mode[id], bodyweightFor: () => 80 };
  const [w] = withEffectiveLoads([W('a', '2026-11-01', 'curl', sets)], o);
  assert.equal(workoutVolume(w), 720);
  const [sess] = exerciseSessions([w], 'curl');
  assert.equal(sess.bestE1rm, e1rm(12, 10));
  assert.equal(sess.maxWeight, 12);
  assert.equal(fmtSet(w.exercises[0].sets[0]), '12 kg × 10');
  const [r] = withEffectiveLoads([W('b', '2026-11-01', 'remo', [[30, 10], [30, 10], [30, 10]])], o);
  assert.equal(workoutVolume(r), 1800);
  const src = [W('c', '2026-11-01', 'banca', [[60, 5]])];
  assert.equal(withEffectiveLoads(src, o)[0], src[0]);
});

test('cambiar a por mano recalcula todo el historial: sin récords nuevos por el cambio', () => {
  const ws = [W('a', '2026-11-01', 'curl', [[12, 10]]), W('b', '2026-11-03', 'curl', [[12, 10]])];
  const doubled = withEffectiveLoads(ws, { kindFor: () => 'peso_reps', modeFor: () => 'por_mano', bodyweightFor: () => null });
  assert.equal(prCountOf(computePRs(doubled).get('b')), 0);
  assert.equal(exerciseRecords(exerciseSessions(doubled, 'curl')).weight.value, 12);
  assert.equal(exerciseRecords(exerciseSessions(doubled, 'curl')).setVolume.value, 240);
});

test('modo de carga: solo con peso y reps o lastre; "todas las mancuernas" como respaldo', () => {
  assert.equal(resolveLoadMode({ load_mode: 'por_mano' }, 'peso_reps'), 'por_mano');
  assert.equal(resolveLoadMode({ load_mode: 'unilateral' }, 'asistido'), 'total');
  assert.equal(resolveLoadMode({ load_mode: 'unilateral' }, 'lastre'), 'unilateral');
  assert.equal(resolveLoadMode(null, 'peso_reps', { category: 'Mancuerna', dumbbellMode: 'por_mano' }), 'por_mano');
  assert.equal(resolveLoadMode({ load_mode: 'total' }, 'peso_reps', { category: 'Mancuerna', dumbbellMode: 'por_mano' }), 'total');
  assert.equal(resolveLoadMode(null, 'peso_reps', { category: 'Máquina', dumbbellMode: 'por_mano' }), 'total');
  // lastre unilateral: el volumen dobla la carga efectiva
  const [w] = withEffectiveLoads([W('a', '2026-11-01', 'dom', [[10, 8]])],
    { kindFor: () => 'lastre', modeFor: () => 'unilateral', bodyweightFor: () => 80 });
  assert.equal(workoutVolume(w), 1440);
});
