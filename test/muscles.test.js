// Pruebas del estímulo directo por músculo (mapa del cuerpo). Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { muscleStats, muscleStatus } from '../src/lib/muscles.js';

const NOW = Date.parse('2026-11-21T20:00:00Z');
const day = (d) => new Date(NOW - d * 864e5).toISOString();
const PART = { pd: 'Pecho', ks: 'Espalda alta', lp: 'Dorsales', x: 'Otro' };
const set = (n = 1, type = 'N') => Array.from({ length: n }, () => ({ type, weight: 50, reps: 8, done: true }));
// FBEOD: un entrenamiento cada 2 días durante 4 semanas
// (más uno antiguo fuera de la ventana, para que el historial cubra las 4 semanas completas)
const fbeod = (exs) => [...Array.from({ length: 14 }, (_, i) => ({
  id: `w${i}`, started_at: day(1 + i * 2), exercises: exs.map(([id, n]) => ({ exercise_id: id, sets: set(n) })),
})), { id: 'old', started_at: day(60), exercises: [] }];
const stats = (w, o = {}) => muscleStats(w, { now: NOW, partOf: (id) => PART[id], ...o });
const g = (r, part) => r.groups.find((x) => x.part === part);

test('estados: rezagado bajo la mitad de la meta, nunca "demasiado"', () => {
  assert.equal(muscleStatus(0), 'low');
  assert.equal(muscleStatus(3.9), 'low');
  assert.equal(muscleStatus(4), 'fair');
  assert.equal(muscleStatus(7.9), 'fair');
  assert.equal(muscleStatus(8), 'good');
  assert.equal(muscleStatus(40), 'good');
  assert.equal(muscleStatus(5, 10), 'fair');
});

test('series directas por semana con FBEOD de 4 semanas', () => {
  const r = stats(fbeod([['pd', 2], ['ks', 1], ['lp', 3]]));
  assert.equal(r.weeks, 4);
  assert.equal(g(r, 'Pecho').perWeek, 7); // 2 × 14 / 4
  assert.equal(g(r, 'Pecho').status, 'fair');
  assert.equal(g(r, 'Espalda alta').perWeek, 3.5);
  assert.equal(g(r, 'Espalda alta').status, 'low');
  assert.equal(g(r, 'Dorsales').status, 'good');
  assert.equal(g(r, 'Glúteos').sets, 0);
  assert.equal(g(r, 'Glúteos').status, 'low');
});

test('solo trabajo directo: calentamientos, series sin hacer y "Otro" no cuentan', () => {
  const w = [{ id: 'a', started_at: day(1), exercises: [
    { exercise_id: 'pd', sets: [...set(2, 'W'), ...set(1), { type: 'N', weight: 50, reps: 8, done: false }] },
    { exercise_id: 'x', sets: set(3) },
  ] }];
  const r = stats(w, { days: 7 });
  assert.equal(g(r, 'Pecho').sets, 1);
  assert.equal(r.unassigned, 3);
  assert.deepEqual(g(r, 'Pecho').exercises.map((e) => [e.id, e.sets]), [['pd', 1]]);
});

test('ventana: fuera del periodo no cuenta; historial corto no diluye el promedio', () => {
  const w = [
    { id: 'a', started_at: day(3), exercises: [{ exercise_id: 'pd', sets: set(2) }] },
    { id: 'b', started_at: day(10), exercises: [{ exercise_id: 'pd', sets: set(2) }] },
  ];
  const r7 = stats(w, { days: 7 });
  assert.equal(g(r7, 'Pecho').sets, 2);
  assert.equal(r7.weeks, 1);
  const r28 = stats(w, { days: 28 }); // el primer entrenamiento fue hace 10 días
  assert.ok(Math.abs(r28.weeks - 10 / 7) < 1e-9);
  assert.equal(g(r28, 'Pecho').sets, 4);
});

test('meta configurable', () => {
  const r = stats(fbeod([['pd', 2]]), { target: 6 });
  assert.equal(g(r, 'Pecho').status, 'good');
});
