// Pruebas de la sugerencia de progresión (feature 01) y de las cargas posibles (base común B).
// Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownWeights, lowerLoad, nextLoad, defaultIncrement } from '../src/lib/loads.js';
import { repsToBeat, suggest, lastSession } from '../src/lib/progression.js';
import { e1rm } from '../src/lib/stats.js';

const NOW = Date.parse('2026-11-20T18:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 864e5).toISOString();
const BAR = { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] };

// Un entrenamiento por sesión, con una serie efectiva cada uno
const hist = (exId, sessions, extra = {}) => sessions.map(([weight, reps, d = 2, type = 'N'], i) => ({
  id: `w${i}`, started_at: daysAgo(d + (sessions.length - 1 - i) * 2), template_id: extra.template_id ?? null,
  exercises: [{ exercise_id: exId, sets: [{ type, weight, reps, done: true }] }],
}));
const sug = (workouts, o = {}) => suggest({ workouts, exId: 'x', now: NOW, ...o });
const pair = (s) => (s ? `${s.weight}×${s.reps}` : null);

test('nextLoad: pesos conocidos, mínimo aumento y tope', () => {
  const known = [14.7, 16.2, 18.7];
  assert.equal(nextLoad(14.7, { inc: 2.5, known }), 16.2);
  assert.equal(nextLoad(18.7, { inc: 2.5, known }), 21.2);
  assert.equal(nextLoad(86, { inc: 2, max: 86 }), null);
  assert.equal(nextLoad(85, { inc: 2, max: 86 }), 86);
  assert.equal(nextLoad(60, { inc: 2.5, barbell: BAR }), 62.5);
  assert.equal(nextLoad(60, { inc: 1, barbell: BAR }), 62.5); // con barra, a lo que se puede armar
});

test('lowerLoad: barra y máquina con pesos conocidos', () => {
  assert.equal(lowerLoad(100, 0.1, { inc: 2.5, barbell: BAR }), 90);
  assert.equal(lowerLoad(80, 0.1, { inc: 2.5, barbell: BAR }), 70); // 72 no se arma: hacia abajo
  assert.equal(lowerLoad(63, 0.1, { inc: 2, known: [57, 63] }), 57);
  assert.equal(lowerLoad(63, 0.1, { inc: 2, known: [63] }), 56);
  assert.equal(lowerLoad(20, 0.1, { inc: 1, barbell: BAR }), null); // no se puede bajar de la barra vacía
});

test('knownWeights: solo series efectivas, sin repetir', () => {
  const w = [{ exercises: [{ exercise_id: 'x', sets: [
    { type: 'W', weight: 10, reps: 10, done: true }, { type: 'N', weight: 16.2, reps: 8, done: true },
    { type: 'N', weight: 14.7, reps: 8, done: true }, { type: 'N', weight: 16.2, reps: 7, done: true },
    { type: 'N', weight: 30, reps: 5, done: false },
  ] }] }];
  assert.deepEqual(knownWeights(w, 'x'), [14.7, 16.2]);
  assert.equal(defaultIncrement('Barra'), 2.5);
  assert.equal(defaultIncrement('Mancuerna'), 2);
  assert.equal(defaultIncrement('Máquina'), 1);
});

test('repsToBeat: la propuesta supera el umbral de la comparación en vivo', () => {
  const E = e1rm(63, 7);
  const r = repsToBeat(63, E * 1.005);
  assert.equal(r, 8);
  assert.ok(e1rm(63, r) / E - 1 > 0.005); // setFeedback: 'up' si d > 0,005
  assert.ok(e1rm(63, r - 1) / E - 1 <= 0.005);
});

test('ejemplos del documento', () => {
  const s1 = sug(hist('x', [[77, 11]]), { prefs: { min_increment: 5 } });
  assert.equal(pair(s1.main), '77×12'); assert.equal(pair(s1.alt), '82×10');
  const s2 = sug(hist('x', [[63, 7]]), { prefs: { min_increment: 2 } });
  assert.equal(pair(s2.main), '63×8'); assert.equal(pair(s2.alt), '65×7');
  const s3 = sug(hist('x', [[18, 12]]), { increment: 2 });
  assert.equal(pair(s3.main), '20×10'); assert.equal(pair(s3.alt), '18×13'); // 13 > 12 → subir
  const s4 = sug(hist('x', [[86, 6]]), { prefs: { max_load: 86 }, increment: 2 });
  assert.equal(pair(s4.main), '86×7'); assert.equal(s4.alt, null); assert.equal(s4.atMax, false);
  const s5 = sug(hist('x', [[60, 10]]), { increment: 2.5, barbell: BAR });
  assert.equal(pair(s5.main), '60×11'); assert.equal(pair(s5.alt), '62.5×10');
  assert.equal(s5.source, 'superar');
});

test('pesos conocidos: la opción de subir usa 16,2 y no 14,7 + mínimo aumento', () => {
  const s = sug(hist('x', [[16.2, 8], [14.7, 12]]), { increment: 2.5 });
  assert.equal(s.ref.weight, 14.7);
  assert.equal(s.main.weight, 16.2); // 14,7 × 13 pasa de 12 reps
});

test('tope de la máquina: avisa cuando las reps pasan de rep_max', () => {
  const s = sug(hist('x', [[86, 12]]), { prefs: { max_load: 86 } });
  assert.equal(pair(s.main), '86×13');
  assert.equal(s.atMax, true);
});

test('nunca más de 15 reps con el mismo peso si se puede subir', () => {
  const s = sug(hist('x', [[20, 15]]), { increment: 2 });
  assert.equal(s.main.weight, 22);
  assert.equal(s.alt, null);
  assert.ok(s.main.reps <= 15);
  const capped = sug(hist('x', [[40, 8]]), { prefs: { rep_max: 15 }, increment: 2 });
  assert.equal(pair(capped.main), '40×9');
});

test('pausa de 14 días o más: igualar con 10 % menos', () => {
  const w = hist('x', [[57, 10, 30], [63, 7, 20]]);
  const s = sug(w, { prefs: { min_increment: 2 } });
  assert.equal(s.source, 'pausa');
  assert.equal(pair(s.main), '57×10');
  assert.ok(e1rm(57, 10) >= e1rm(63, 7));
});

test('sin peso: reps de la vez anterior + 1; sin historial: nada', () => {
  const s = sug(hist('x', [[0, 12]]));
  assert.equal(s.source, 'reps');
  assert.equal(s.main.reps, 13);
  assert.equal(sug([]), null);
  assert.equal(sug(hist('y', [[50, 8]])), null);
});

test('referencia: mejor serie efectiva, sin calentamientos ni drop sets', () => {
  const w = [{ id: 'a', started_at: daysAgo(2), exercises: [{ exercise_id: 'x', sets: [
    { type: 'W', weight: 100, reps: 10, done: true }, { type: 'N', weight: 60, reps: 8, done: true },
    { type: 'D', weight: 70, reps: 8, done: true }, { type: 'F', weight: 62, reps: 7, done: true },
  ] }] }];
  assert.deepEqual(lastSession(w, 'x').set, { type: 'N', weight: 60, reps: 8, done: true });
});

test('comparar solo con la misma plantilla, excluir el entrenamiento actual y fechas posteriores', () => {
  const w = [
    ...hist('x', [[50, 8, 4]], { template_id: 't1' }).map((x) => ({ ...x, id: 'a' })),
    ...hist('x', [[70, 8, 2]], { template_id: 't2' }).map((x) => ({ ...x, id: 'b' })),
  ];
  assert.equal(sug(w).ref.weight, 70);
  assert.equal(sug(w, { templateId: 't1' }).ref.weight, 70); // sin la preferencia, cualquier entrenamiento
  assert.equal(sug(w, { templateId: 't1', prefs: { compare_same_template: true } }).ref.weight, 50);
  assert.equal(sug(w, { excludeId: 'b' }).ref.weight, 50);
  assert.equal(sug(w, { before: daysAgo(3) }).ref.weight, 50);
});
