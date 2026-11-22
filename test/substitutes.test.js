// Pruebas de reemplazar un ejercicio (feature 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastSetIndex, replaceActive, replaceTemplate, substitutes, templateIndexOf } from '../src/lib/substitutes.js';

const cat = (id, name, primary, bodyPart, category, level = 'beginner') => ({ id, name, primary: [primary], bodyPart, category, level, custom: false });
const BENCH = cat('bench', 'Barbell Bench Press', 'chest', 'Pecho', 'Barra');
const CATALOG = [
  BENCH,
  cat('incline_bb', 'Incline Barbell Press', 'chest', 'Pecho', 'Barra', 'intermediate'),
  cat('decline_bb', 'Decline Barbell Press', 'chest', 'Pecho', 'Barra'),
  cat('db_press', 'Dumbbell Bench Press', 'chest', 'Pecho', 'Mancuerna'),
  cat('cable_fly', 'Cable Crossover', 'chest', 'Pecho', 'Polea', 'expert'),
  cat('pec_deck', 'Pec Deck', 'chest', 'Pecho', 'Máquina'),
  cat('squat', 'Barbell Squat', 'quadriceps', 'Cuádriceps', 'Barra'),
  { id: 'c_chest', name: 'Press pecho máquina', primary: [], bodyPart: 'Pecho', category: 'Máquina', custom: true },
  { id: 'c_link', name: 'Mi pec deck', primary: ['chest'], bodyPart: 'Pecho', category: 'Máquina', custom: true, catalogId: 'pec_deck' },
  { id: 'c_other', name: 'Algo raro', primary: [], bodyPart: 'Otro', category: 'Otro', custom: true },
];
const W = (date, exId, sets) => ({ id: date, started_at: date, exercises: [{ exercise_id: exId, sets }] });
const HISTORY = [ // de más nuevo a más viejo
  W('2026-11-20T18:00:00Z', 'db_press', [{ weight: 30, reps: 10, done: true }, { weight: 32, reps: 6, done: true }]),
  W('2026-11-18T18:00:00Z', 'decline_bb', [{ weight: 20, reps: 12, type: 'W', done: true }, { weight: 60, reps: 8, done: true }]),
  W('2026-11-10T18:00:00Z', 'db_press', [{ weight: 50, reps: 5, done: true }]),
];

test('lastSetIndex: la vez más reciente y su mejor serie efectiva', () => {
  const idx = lastSetIndex(HISTORY);
  assert.deepEqual(idx.get('db_press').set, { weight: 32, reps: 6, done: true });
  assert.equal(idx.get('db_press').date, '2026-11-20T18:00:00Z');
  assert.equal(idx.get('decline_bb').set.weight, 60); // no el calentamiento
});

test('substitutes: mismo músculo y equipo, luego otro equipo, ya hechos primero', () => {
  const s = substitutes(BENCH, CATALOG, lastSetIndex(HISTORY), new Set(), 20);
  const ids = s.map((x) => x.exercise.id);
  // grupo 1 (barra): el hecho primero, luego por nivel
  assert.deepEqual(ids.slice(0, 2), ['decline_bb', 'incline_bb']);
  assert.deepEqual(s.slice(0, 2).map((x) => x.group), [1, 1]);
  // grupo 2: el hecho (mancuerna) primero, luego principiantes por nombre, el avanzado al final
  assert.equal(ids[2], 'db_press');
  assert.equal(s[2].last.set.weight, 32);
  assert.ok(s.slice(2).every((x) => x.group === 2));
  assert.equal(ids.at(-1), 'cable_fly');
  assert.ok(!ids.includes('squat') && !ids.includes('bench') && !ids.includes('c_other'));
  // el pec deck del catálogo no se repite: lo tienes como propio vinculado
  assert.ok(ids.includes('c_link') && !ids.includes('pec_deck'));
  // propio sin músculos pero con grupo Pecho: cuenta como mismo músculo
  assert.equal(s.find((x) => x.exercise.id === 'c_chest').group, 2);
});

test('substitutes: equipo "Otro" no es el mismo equipo; estiramientos fuera', () => {
  const mine = { id: 'c_fly', name: 'Chest Fly', primary: [], bodyPart: 'Pecho', category: 'Otro', custom: true };
  const other = { id: 'c_fly1', name: 'Chest Fly Unilateral', primary: [], bodyPart: 'Pecho', category: 'Otro', custom: true };
  const stretch = { ...cat('st', 'Chest Stretch', 'chest', 'Pecho', 'Otro'), type: 'stretching' };
  const s = substitutes(mine, [mine, other, stretch, BENCH]);
  assert.deepEqual(s.map((x) => [x.exercise.id, x.group]), [['bench', 2], ['c_fly1', 2]]);
});

test('substitutes: excluidos fuera, máximo 6, sin zona conocida no sugiere', () => {
  const s = substitutes(BENCH, CATALOG, new Map(), new Set(['decline_bb']));
  assert.ok(s.length <= 6);
  assert.ok(!s.some((x) => x.exercise.id === 'decline_bb'));
  assert.deepEqual(substitutes(CATALOG.at(-1), CATALOG), []);
});

test('substitutes: propio vinculado no sugiere su ejercicio del catálogo; grupo cambiado manda', () => {
  const s = substitutes(CATALOG[8], CATALOG, new Map(), new Set(), 20);
  assert.ok(!s.some((x) => x.exercise.id === 'pec_deck'));
  assert.equal(s[0].exercise.id, 'c_chest'); // misma máquina
  // un ejercicio de pecho que el usuario pasó a Hombros: se compara por grupo
  const moved = { ...cat('x', 'X', 'chest', 'Hombros', 'Barra'), defaultBodyPart: 'Pecho' };
  const sh = cat('ohp', 'Overhead Press', 'shoulders', 'Hombros', 'Barra');
  assert.deepEqual(substitutes(moved, [moved, sh, BENCH]).map((x) => x.exercise.id), ['ohp']);
});

const ex = (sets, extra = {}) => ({ exercise_id: 'bench', name: 'Bench', rest: 120, notes: 'hoy', sets, ...extra });
const NEXT = { exercise_id: 'db_press', name: 'DB Press' };

test('replaceActive: sin hechas, en su lugar, mismas series vacías', () => {
  const list = [ex([{ type: 'N', weight: null, reps: null, done: false, target: { weight: 80, reps: 8 } }, { type: 'F', done: false }])];
  const r = replaceActive(list, 0, NEXT);
  assert.deepEqual(r, { index: 0, split: false, added: false });
  assert.equal(list.length, 1);
  assert.equal(list[0].exercise_id, 'db_press');
  assert.equal(list[0].rest, 120);
  assert.equal(list[0].notes, 'hoy');
  assert.deepEqual(list[0].sets, [
    { type: 'N', weight: null, reps: null, done: false, target: { weight: null, reps: 8 } },
    { type: 'F', weight: null, reps: null, done: false },
  ]);
});

test('replaceActive: 2 de 4 hechas → original con 2, nuevo debajo con 2 pendientes', () => {
  const done = { type: 'N', weight: 80, reps: 8, done: true };
  const list = [ex([done, done, { type: 'N', done: false }, { type: 'D', done: false }]), ex([], { exercise_id: 'other' })];
  const r = replaceActive(list, 0, NEXT);
  assert.deepEqual(r, { index: 1, split: true, added: false });
  assert.equal(list.length, 3);
  assert.equal(list[0].exercise_id, 'bench');
  assert.equal(list[0].sets.length, 2);
  assert.ok(list[0].sets.every((s) => s.done && s.weight === 80));
  assert.equal(list[1].exercise_id, 'db_press');
  assert.deepEqual(list[1].sets.map((s) => [s.type, s.done, s.weight]), [['N', false, null], ['D', false, null]]);
  assert.equal(list[2].exercise_id, 'other');
});

test('replaceActive: todas hechas → agrega después; calentamientos pendientes no pasan', () => {
  const list = [ex([{ type: 'N', weight: 80, reps: 8, done: true }])];
  assert.deepEqual(replaceActive(list, 0, NEXT), { index: 1, split: false, added: true });
  assert.equal(list[0].sets.length, 1);
  assert.equal(list[1].sets.length, 1);
  assert.equal(list[1].sets[0].done, false);
  const warm = [ex([{ type: 'W', weight: 40, reps: 10, done: false }, { type: 'N', done: false }])];
  replaceActive(warm, 0, NEXT);
  assert.deepEqual(warm[0].sets.map((s) => s.type), ['N']);
});

test('replaceTemplate: series, tipos y reps objetivo; sin peso', () => {
  const list = [{ exercise_id: 'bench', name: 'Bench', rest: 90, auto_warmup: true, sets: [{ type: 'N', weight: 80, reps: 8 }, { type: 'F', weight: 70, reps: 12 }] }];
  replaceTemplate(list, 0, NEXT);
  assert.equal(list[0].exercise_id, 'db_press');
  assert.equal(list[0].rest, 90);
  assert.equal(list[0].auto_warmup, true);
  assert.deepEqual(list[0].sets, [{ type: 'N', weight: null, reps: 8 }, { type: 'F', weight: null, reps: 12 }]);
});

test('templateIndexOf: misma aparición del ejercicio', () => {
  const w = [{ exercise_id: 'a' }, { exercise_id: 'x' }, { exercise_id: 'a' }];
  const t = [{ exercise_id: 'a' }, { exercise_id: 'b' }, { exercise_id: 'a' }];
  assert.equal(templateIndexOf(w, 0, t), 0);
  assert.equal(templateIndexOf(w, 2, t), 2);
  assert.equal(templateIndexOf(w, 1, t), -1);
});
