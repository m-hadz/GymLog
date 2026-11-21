// Pruebas de peso corporal y medidas (feature 03). Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyCsv, bodyweightAt, navyBodyFat, trendRate, trendSeries, unusualValues } from '../src/lib/body.js';

const e = (date, weight, extra = {}) => ({ id: date, date, weight, measurements: {}, ...extra });
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('tendencia: 80,0 / 81,2 / 79,6 en días seguidos queda cerca de 80 y sigue la fórmula', () => {
  const s = trendSeries([e('2026-11-03', 79.6), e('2026-11-01', 80), e('2026-11-02', 81.2)]);
  assert.deepEqual(s.map((p) => p.date), ['2026-11-01', '2026-11-02', '2026-11-03']);
  const t1 = 80 + 0.1 * (81.2 - 80);
  const t2 = t1 + 0.1 * (79.6 - t1);
  close(s[1].trend, t1);
  close(s[2].trend, t2);
  assert.ok(Math.abs(s[2].trend - 80) < 0.2);
});

test('tendencia: un hueco de días pesa más que un día', () => {
  const s = trendSeries([e('2026-11-01', 80), e('2026-11-11', 82)]);
  close(s[1].trend, 80 + (1 - 0.9 ** 10) * 2);
  assert.equal(trendSeries([e('2026-11-01', null), e('2026-11-02', 0)]).length, 0);
});

test('bodyweightAt: sin registros, uno, varios y antes del primero', () => {
  assert.equal(bodyweightAt([], '2026-11-20'), null);
  assert.equal(bodyweightAt([e('2026-11-10', 80)], '2026-11-20'), 80);
  assert.equal(bodyweightAt([e('2026-11-10', 80)], '2026-11-09'), null);
  const list = [e('2026-11-10', 80), e('2026-11-11', 81), e('2026-11-12', 82), e('2026-11-20', 79)];
  assert.equal(bodyweightAt(list, '2026-11-11'), 81); // menos de 3: último registro
  const s = trendSeries(list);
  close(bodyweightAt(list, '2026-11-15'), s[2].trend);
  close(bodyweightAt(list, '2026-11-30'), s[3].trend);
});

test('ritmo: kg por semana de la tendencia; null con pocos registros', () => {
  assert.equal(trendRate(trendSeries([e('2026-11-01', 80), e('2026-11-02', 80)]), 7), null);
  const days = Array.from({ length: 40 }, (_, i) => e(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), 85 - i * 0.1));
  const r = trendRate(trendSeries(days), 7);
  assert.ok(r < -0.5 && r > -0.8, String(r)); // bajando ~0,7 kg/semana
  assert.ok(trendRate(trendSeries(days), 30) < 0);
});

test('grasa estimada (Marina de EE. UU.)', () => {
  const m = navyBodyFat({ sex: 'm', height: 178, neck: 38, waist: 85 });
  assert.ok(m > 15 && m < 19, String(m));
  const f = navyBodyFat({ sex: 'f', height: 165, neck: 32, waist: 72, hip: 98 });
  assert.ok(f > 24 && f < 30, String(f));
  assert.equal(navyBodyFat({ sex: 'f', height: 165, neck: 32, waist: 72 }), null);
  assert.equal(navyBodyFat({ height: 178, neck: 38, waist: 85 }), null);
  assert.equal(navyBodyFat({ sex: 'm', neck: 38, waist: 85 }), null);
});

test('valores fuera de rango y CSV', () => {
  assert.deepEqual(unusualValues({ weight: 80, body_fat: 15 }), []);
  assert.equal(unusualValues({ weight: 800, body_fat: 1 }).length, 2);
  const csv = bodyCsv([e('2026-11-02', 80.5, { measurements: { cintura: 82 }, notes: 'ayuno, mañana' }), e('2026-11-01', 81)]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Fecha,Peso (kg),Tendencia (kg),Grasa (%),Cintura (cm),Notas');
  assert.equal(lines[1], '2026-11-01,81,81,,,');
  assert.match(lines[2], /^2026-11-02,80\.5,80\.95,,82,"ayuno, mañana"$/);
});
