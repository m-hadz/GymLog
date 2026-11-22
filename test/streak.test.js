// Pruebas de constancia y racha (feature 09). Fechas en hora local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNum, dueText, keyOfDay, mondayOfDay, pauseError, streakStats } from '../src/lib/streak.js';
import { profileSummary } from '../src/views/profile/summary.js';

const at = (y, m, d, h = 18, min = 0) => ({ started_at: new Date(y, m - 1, d, h, min).toISOString() });
const days = (y, m, list) => list.map((d) => at(y, m, d));
const CAD = { mode: 'cadencia', every_days: 2, tolerance: 1 };
const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

test('números de día: lunes, claves y cambio de horario', () => {
  assert.equal(keyOfDay(dayNum(day(2026, 11, 21))), '2026-11-21');
  assert.equal(keyOfDay(mondayOfDay(dayNum(day(2026, 11, 21)))), '2026-11-16'); // sábado → lunes 16
  assert.equal(keyOfDay(mondayOfDay(dayNum(day(2026, 11, 16)))), '2026-11-16');
  // De un domingo a otro cruzando un cambio de horario: siempre 7 días
  assert.equal(dayNum(day(2026, 4, 12, 0)) - dayNum(day(2026, 4, 5, 23)), 7);
  assert.equal(dayNum(day(2026, 9, 13, 0)) - dayNum(day(2026, 9, 6, 23)), 7);
});

test('cadencia 2 + tolerancia 1: intervalos de 2 y 3 días mantienen la racha; uno de 4 la corta', () => {
  const ok = streakStats(days(2026, 11, [1, 3, 6, 8]), CAD, [], day(2026, 11, 8));
  assert.equal(ok.current, 4);
  assert.equal(ok.breaks, 0);
  const cut = streakStats(days(2026, 11, [1, 3, 7, 9]), CAD, [], day(2026, 11, 9));
  assert.equal(cut.current, 2);
  assert.equal(cut.best, 2);
  assert.equal(cut.breaks, 1);
});

test('cadencia: qué toca hoy según los días desde el último', () => {
  const ws = days(2026, 11, [1, 3]);
  const st = (d) => streakStats(ws, CAD, [], day(2026, 11, d));
  assert.equal(st(3).status, 'hecho');
  assert.equal(st(4).status, 'manana');
  assert.equal(dueText(st(4)), 'Mañana toca');
  assert.equal(st(5).status, 'hoy');
  assert.equal(st(6).status, 'ultimo');
  assert.equal(dueText(st(6)), 'Último día para no cortar la racha');
  assert.equal(st(6).current, 2);
  assert.equal(st(7).status, 'cortada');
  assert.equal(st(7).current, 0);
});

test('mismo día cuenta una vez; 23:50 y 00:10 son días distintos', () => {
  const same = streakStats([at(2026, 11, 3, 8), at(2026, 11, 3, 19)], CAD, [], day(2026, 11, 3));
  assert.equal(same.current, 1);
  const midnight = streakStats([at(2026, 11, 3, 23, 50), at(2026, 11, 4, 0, 10)], CAD, [], day(2026, 11, 4));
  assert.equal(midnight.current, 2);
});

test('primer entrenamiento: racha 1; sin datos: 0', () => {
  assert.equal(streakStats(days(2026, 11, [20]), CAD, [], day(2026, 11, 20)).current, 1);
  const none = streakStats([], CAD, [], day(2026, 11, 20));
  assert.equal(none.current, 0);
  assert.equal(none.status, 'sin_datos');
});

test('reparar: registrar el entrenamiento que faltaba llena el hueco', () => {
  const before = streakStats(days(2026, 11, [1, 3, 9, 11]), CAD, [], day(2026, 11, 11));
  assert.equal(before.current, 2);
  const after = streakStats(days(2026, 11, [1, 3, 6, 9, 11]), CAD, [], day(2026, 11, 11));
  assert.equal(after.current, 5);
  assert.equal(after.breaks, 0);
});

test('volver después de un corte: comeback (mensaje positivo)', () => {
  const s = streakStats(days(2026, 11, [1, 3, 10]), CAD, [], day(2026, 11, 10));
  assert.equal(s.current, 1);
  assert.equal(s.comeback, true);
  assert.equal(streakStats(days(2026, 11, [1, 3, 5]), CAD, [], day(2026, 11, 5)).comeback, false);
});

test('pausa: no suma ni corta; validación de duración, cruce y una cada 6 semanas', () => {
  const ws = days(2026, 11, [1, 3, 14, 16]);
  const pause = [{ from: '2026-11-04', to: '2026-11-12' }];
  const s = streakStats(ws, CAD, pause, day(2026, 11, 16));
  assert.equal(s.current, 4);
  assert.equal(s.breaks, 0);
  assert.equal(streakStats(ws, CAD, [], day(2026, 11, 16)).current, 2);
  // hoy en pausa
  assert.equal(streakStats(days(2026, 11, [1]), CAD, [{ from: '2026-11-02', to: '2026-11-10' }], day(2026, 11, 8)).status, 'pausa');
  assert.equal(pauseError([], { from: '2026-11-01', to: '2026-11-14' }), null);
  assert.match(pauseError([], { from: '2026-11-01', to: '2026-11-15' }), /14 días/);
  assert.match(pauseError([], { from: '2026-11-05', to: '2026-11-01' }), /antes/);
  assert.match(pauseError(pause, { from: '2026-11-10', to: '2026-11-11' }), /cruza/);
  assert.match(pauseError(pause, { from: '2026-12-01', to: '2026-12-03' }), /6 semanas/);
  assert.equal(pauseError(pause, { from: '2026-12-20', to: '2026-12-25' }), null);
});

test('semanal 3: una semana con 2 corta; con 3 cumple; la semana en curso no corta', () => {
  const W = { mode: 'semanal', per_week: 3 };
  // semanas del lunes 2, 9 y 16 de noviembre
  const ok = streakStats(days(2026, 11, [2, 4, 6, 9, 11, 13, 16]), W, [], day(2026, 11, 17));
  assert.equal(ok.current, 2);
  assert.equal(ok.thisWeek, 1);
  assert.equal(ok.status, 'en_curso');
  assert.equal(dueText(ok), '1 de 3 esta semana');
  const cut = streakStats(days(2026, 11, [2, 4, 6, 9, 11, 16, 18, 20]), W, [], day(2026, 11, 21));
  assert.equal(cut.current, 1);
  assert.equal(cut.breaks, 1);
  assert.equal(cut.status, 'cumplida');
});

test('sin meta: igual que la racha semanal de antes (regresión)', () => {
  const now = new Date();
  const ws = [0, 2, 9, 16, 30, 37].map((d) => ({ started_at: new Date(now.getTime() - d * 864e5).toISOString() }));
  // Cálculo anterior: semanas seguidas con al menos uno; la semana en curso no corta
  const old = (() => {
    const monday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const weeks = new Set(ws.map((w) => +monday(w.started_at)));
    const cur = monday(now);
    if (!weeks.has(+cur)) cur.setDate(cur.getDate() - 7);
    let n = 0;
    while (weeks.has(+monday(cur))) { n++; cur.setDate(cur.getDate() - 7); }
    return n;
  })();
  assert.equal(streakStats(ws, { mode: 'ninguna' }).current, old);
  assert.equal(profileSummary(ws).streak, old);
});

test('franja de 30 días: entrenado, descanso esperado, pausa y corte', () => {
  const s = streakStats(days(2026, 11, [1, 3, 10]), CAD, [{ from: '2026-11-15', to: '2026-11-16' }], day(2026, 11, 20));
  const by = Object.fromEntries(s.strip.map((x) => [x.key, x.state]));
  assert.equal(s.strip.length, 30);
  assert.equal(by['2026-11-03'], 'entreno');
  assert.equal(by['2026-11-05'], 'descanso');
  assert.equal(by['2026-11-06'], 'descanso'); // día 3: aún dentro del límite
  assert.equal(by['2026-11-07'], 'corte');
  assert.equal(by['2026-11-15'], 'pausa');
  assert.equal(by['2026-11-20'], 'corte');
});
