// Pruebas del resumen mensual y anual (feature 07). Fechas en hora local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthReport, reportPeriods, yearReport, MIN_YEAR_WORKOUTS } from '../src/lib/report.js';
import { computePRs, e1rm, prCount } from '../src/lib/stats.js';

const at = (y, m, d, h = 18, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
let n = 0;
const W = (date, exercises, mins = 60) => ({
  id: `w${++n}`, name: 'FB', started_at: date, ended_at: new Date(Date.parse(date) + mins * 6e4).toISOString(),
  exercises: Object.entries(exercises).map(([exercise_id, sets]) => ({
    exercise_id, name: exercise_id, sets: sets.map(([weight, reps]) => ({ type: 'N', weight, reps, done: true })),
  })),
});
const PART = { bench: 'Pecho', squat: 'Cuádriceps', curl: 'Bíceps' };
const opts = { now: Date.parse(at(2026, 11, 21)), partOf: (id) => PART[id] || 'Otro' };

const DATA = [
  W(at(2026, 9, 10), { bench: [[100, 5]] }),
  W(at(2026, 9, 20), { bench: [[100, 5]] }),
  W(at(2026, 10, 1), { bench: [[100, 6]], squat: [[120, 5]] }),
  W(at(2026, 10, 3), { bench: [[100, 6]] }),
  W(at(2026, 10, 15), { bench: [[102.5, 6]], curl: [[15, 10]] }),
  W(at(2026, 10, 31, 23, 30), { bench: [[100, 5]] }, 90), // cruza la medianoche: cuenta en octubre
];

test('totales y variación contra el mes anterior', () => {
  const r = monthReport(DATA, 2026, 10, opts);
  assert.deepEqual(r.totals, { workouts: 4, ms: (60 * 3 + 90) * 6e4, volume: 3065, sets: 6 });
  assert.equal(r.delta.workouts, 100);
  assert.equal(r.delta.volume, 206.5);
  assert.equal(r.first, false);
  assert.equal(r.partial, false);
});

test('días entrenados (el que cruza la medianoche cuenta el día en que empezó) y mejor semana', () => {
  const r = monthReport(DATA, 2026, 10, opts);
  assert.deepEqual(r.days, [1, 3, 15, 31]);
  assert.equal(r.daysInMonth, 31);
  assert.equal(r.bestWeek.volume, 1800);
  assert.equal(r.bestWeek.workouts, 2);
  assert.equal(r.bestWeek.monday.getDate(), 28); // lunes 28 sep
});

test('constancia: semanas con entrenamiento y racha al cierre', () => {
  assert.deepEqual(monthReport(DATA, 2026, 10, opts).constancy, { weeks: 5, trained: 3, streak: 1 });
});

test('récords: cantidad y los más destacados por mejora del 1RM', () => {
  const r = monthReport(DATA, 2026, 10, opts);
  const prs = computePRs(DATA);
  assert.equal(r.records.count, DATA.slice(2).reduce((a, w) => a + prCount(prs.get(w.id)), 0));
  assert.equal(r.records.top.length, 1); // squat y curl son la primera vez: no hay con qué comparar
  assert.equal(r.records.top[0].id, 'bench');
  assert.ok(Math.abs(r.records.top[0].gain - (e1rm(100, 6) / e1rm(100, 5) - 1)) < 1e-9);
});

test('más hechos, progreso por ejercicio y músculos', () => {
  const r = monthReport(DATA, 2026, 10, opts);
  assert.deepEqual(r.topExercises.map((x) => [x.id, x.sets]), [['bench', 4], ['squat', 1], ['curl', 1]]);
  assert.equal(r.progress.length, 1); // squat y curl, una sola sesión
  assert.equal(r.progress[0].status, 'progresando');
  assert.ok(Math.abs(r.progress[0].change - (e1rm(102.5, 6) / e1rm(100, 5) - 1)) < 1e-9);
  assert.deepEqual(r.muscles, [{ part: 'Pecho', sets: 4, prev: 2 }, { part: 'Cuádriceps', sets: 1, prev: 0 }, { part: 'Bíceps', sets: 1, prev: 0 }]);
});

test('primer mes registrado, mes vacío y mes en curso', () => {
  const sep = monthReport(DATA, 2026, 9, opts);
  assert.equal(sep.first, true);
  assert.equal(sep.delta, null);
  assert.deepEqual(sep.constancy, { weeks: 4, trained: 2, streak: 0 }); // desde el lunes 7 sep (primer entreno el 10), no desde el 31 ago
  assert.equal(monthReport(DATA, 2026, 8, opts).empty, true);
  assert.equal(monthReport(DATA, 2026, 11, opts).partial, true);
  const { months, years } = reportPeriods(DATA);
  assert.deepEqual([...months.keys()].sort(), ['2026-09', '2026-10']);
  assert.equal(years.get(2026), 6);
});

test('año: disponible desde 10 entrenamientos, meses, mejor mes, autos y ejercicios nuevos', () => {
  assert.equal(yearReport(DATA, 2026, opts).available, false);
  const more = [...DATA, ...Array.from({ length: MIN_YEAR_WORKOUTS }, (_, i) => W(at(2026, 11, 1 + 2 * i), { bench: [[105, 5]] }))];
  const y = yearReport(more, 2026, opts);
  assert.equal(y.available, true);
  assert.equal(y.months[9].workouts, 4);
  assert.equal(y.months[10].workouts, 10);
  assert.equal(y.bestMonth.month, 11); // 10 × 525 = 5.250 kg
  assert.ok(Math.abs(y.cars - y.totals.volume / 1500) < 1e-9);
  assert.deepEqual(y.newExercises.map((x) => x.id).sort(), ['bench', 'curl', 'squat']);
  assert.equal(y.firstLast[0].id, 'bench');
  assert.equal(y.firstLast[0].fromMonth, 9);
  assert.equal(y.firstLast[0].toMonth, 11);
});

test('estancados al cierre del mes', () => {
  const ws = Array.from({ length: 15 }, (_, i) => W(at(2026, 10, 3 + 2 * i), { cp: [[63, 7]] }));
  const r = monthReport(ws, 2026, 10, { ...opts, stallable: () => true });
  assert.deepEqual(r.stalls.list.map((x) => x.id), ['cp']);
  assert.equal(monthReport(ws, 2026, 10, opts).stalls, null);
});

test('rendimiento: 2.000 entrenamientos en menos de 100 ms', () => {
  const ids = Array.from({ length: 30 }, (_, i) => `e${i}`);
  const many = Array.from({ length: 2000 }, (_, i) => {
    const d = new Date(2021, 0, 1 + i, 18);
    const ex = {};
    for (let k = 0; k < 12; k++) ex[ids[(i + k) % 30]] = [[40 + (i % 20), 8]];
    return W(d.toISOString(), ex);
  });
  const o = { ...opts, now: Date.parse('2026-06-30T12:00:00Z'), stallable: () => true };
  monthReport(many.slice(0, 50), 2021, 1, o); // calentamiento del motor de JS (como al abrir la pantalla)
  // Mejor de 3: node --test corre archivos en paralelo y la carga de la máquina mete ruido
  const best = (f) => Math.min(...[0, 1, 2].map(() => { const t = performance.now(); f(); return performance.now() - t; }));
  const month = best(() => monthReport(many, 2026, 5, o));
  const year = best(() => yearReport(many, 2025, o));
  assert.ok(month < 100, `mes: ${month.toFixed(1)} ms`);
  assert.ok(year < 100, `año: ${year.toFixed(1)} ms`);
});
