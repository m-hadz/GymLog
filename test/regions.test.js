// Pruebas de regiones por músculo (feature 08).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRegions, regionGroup, regionStats, regionsFor, REGIONS } from '../src/lib/regions.js';
import { muscleStats } from '../src/lib/muscles.js';

const NOW = Date.parse('2026-11-21T20:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 864e5).toISOString();
const W = (d, ex) => ({
  started_at: daysAgo(d),
  exercises: Object.entries(ex).map(([exercise_id, n]) => ({
    exercise_id, name: exercise_id, sets: Array.from({ length: n }, () => ({ type: 'N', weight: 50, reps: 8, done: true })),
  })),
});
const PART = { incline: 'Pecho', fly: 'Pecho', press: 'Pecho', lateral: 'Hombros', mystery: undefined };
const REG = { incline: ['pecho.superior'], fly: ['pecho.inferior', 'pecho.medio'], lateral: ['hombros.lateral'] };
const o = (extra = {}) => ({ group: 'Pecho', days: 7, now: NOW, partOf: (id) => PART[id], regionsOf: (id) => REG[id], ...extra });

test('regiones: lista fija, grupo de cada región y limpieza', () => {
  assert.deepEqual(regionsFor('Pecho').map(([k]) => k), ['pecho.superior', 'pecho.medio', 'pecho.inferior']);
  assert.deepEqual(regionsFor('Dorsales'), []);
  assert.equal(regionGroup('hombros.posterior'), 'Hombros');
  for (const [g, list] of Object.entries(REGIONS)) for (const [k] of list) assert.equal(regionGroup(k), g);
  // de otro grupo, repetidas y más de 2 → fuera
  assert.deepEqual(cleanRegions(['pecho.superior', 'hombros.lateral', 'pecho.superior', 'pecho.medio', 'pecho.inferior'], 'Pecho'), ['pecho.superior', 'pecho.medio']);
  assert.deepEqual(cleanRegions(null, 'Pecho'), []);
});

test('series por región: Incline → superior, Chest Fly → inferior y medio; cada serie suma 1 a cada región', () => {
  const ws = [W(1, { incline: 2, fly: 3, lateral: 4 })];
  const r = regionStats(ws, o());
  const by = Object.fromEntries(r.regions.map((x) => [x.key, x.sets]));
  assert.deepEqual(by, { 'pecho.superior': 2, 'pecho.medio': 3, 'pecho.inferior': 3 });
  assert.equal(r.regions[0].perWeek, 2);
});

test('sin trabajar esta semana: series en las últimas 4 semanas y ninguna en los últimos 7 días', () => {
  const ws = [W(2, { fly: 1 }), W(15, { incline: 1 }), W(40, { press: 1 })];
  const r = regionStats(ws, o());
  const st = Object.fromEntries(r.regions.map((x) => [x.key, x.unworked]));
  assert.equal(st['pecho.superior'], true);   // hace 15 días, nada esta semana
  assert.equal(st['pecho.inferior'], false);  // trabajada esta semana
  assert.equal(st['pecho.medio'], false);
});

test('ejercicios del grupo sin región asignada se listan para completarlos', () => {
  const ws = [W(1, { press: 2, incline: 1 }), W(3, { press: 1 })];
  const r = regionStats(ws, o());
  assert.deepEqual(r.unassigned.map((x) => [x.id, x.sets]), [['press', 3]]);
});

test('promedio por semana con un periodo de 4 semanas', () => {
  const ws = [W(1, { incline: 2 }), W(10, { incline: 2 }), W(20, { incline: 4 })];
  const r = regionStats(ws, o({ days: 28 }));
  assert.equal(r.regions.find((x) => x.key === 'pecho.superior').perWeek, 2);
});

test('muscleStats lista los ejercicios sin grupo', () => {
  const r = muscleStats([W(1, { mystery: 3, press: 1 })], { now: NOW, days: 7, partOf: (id) => PART[id] });
  assert.equal(r.unassigned, 3);
  assert.deepEqual(r.unassignedExercises.map((x) => [x.id, x.sets]), [['mystery', 3]]);
});
