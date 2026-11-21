// Pruebas del calentamiento (feature 02) y del redondeo de cargas. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundLoad } from '../src/lib/loads.js';
import { parseScheme, schemeText, warmupSets, DEFAULT_SCHEME } from '../src/lib/warmup.js';

const BAR = { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] };
const txt = (sets) => sets.map((s) => `${s.weight}×${s.reps}`).join(', ');

test('roundLoad: más cercano, empates hacia arriba', () => {
  assert.equal(roundLoad(11, { inc: 2 }), 12);
  assert.equal(roundLoad(16.5, { inc: 2 }), 16);
  assert.equal(roundLoad(44, { inc: 2.5, barbell: BAR }), 45);
  assert.equal(roundLoad(66, { inc: 2.5, barbell: BAR }), 65);
  assert.equal(roundLoad(58, { inc: 2, known: [57, 63, 70] }), 57);
  assert.equal(roundLoad(60, { inc: 2, known: [57, 63, 70] }), 60); // a 3 kg de ambos: múltiplo
});

test('sentadilla 100 kg con barra de 20: 20×10, 40×5, 60×5, 80×3', () => {
  assert.equal(txt(warmupSets(100, { inc: 2.5, barbell: BAR })), '20×10, 40×5, 60×5, 80×3');
});

test('press con 30 kg: solo la barra vacía', () => {
  assert.equal(txt(warmupSets(30, { inc: 2.5, barbell: BAR })), '20×10');
  assert.equal(txt(warmupSets(20, { inc: 2.5, barbell: BAR })), '');
});

test('curl con mancuerna, paso 2, 22 kg: 12×8, 16×4', () => {
  assert.equal(txt(warmupSets(22, { inc: 2 })), '12×8, 16×4');
});

test('máquina: usa pesos conocidos a menos de un mínimo aumento', () => {
  assert.equal(txt(warmupSets(116, { inc: 2, known: [57, 63, 70, 116] })), '57×8, 88×4');
  assert.equal(txt(warmupSets(84, { inc: 2, known: [57, 63, 70] })), '42×8, 63×4');
});

test('omite pasos repetidos o iguales al peso de trabajo; sin peso no hay calentamiento', () => {
  assert.equal(txt(warmupSets(4, { inc: 2 })), '2×8'); // 75 % de 4 = 3 → 4 = trabajo, se omite
  assert.deepEqual(warmupSets(0, { inc: 2 }), []);
  assert.deepEqual(warmupSets(null, { inc: 2 }), []);
});

test('ningún peso con barra es imposible de armar', () => {
  for (let w = 22.5; w <= 200; w += 2.5) {
    for (const s of warmupSets(w, { inc: 2.5, barbell: BAR })) {
      assert.equal(((s.weight - 20) / 2) % 1.25, 0, `${s.weight} con ${w}`);
    }
  }
});

test('esquema editable: texto ⇄ pasos', () => {
  assert.equal(schemeText(DEFAULT_SCHEME.bar), 'barra×10, 40×5, 60×5, 80×3');
  assert.deepEqual(parseScheme('barra x 8; 50 % × 5, 70x3'), [{ pct: 0, reps: 8 }, { pct: 50, reps: 5 }, { pct: 70, reps: 3 }]);
  assert.equal(parseScheme('hola'), null);
  assert.equal(parseScheme('120×5'), null);
  assert.equal(txt(warmupSets(100, { inc: 2.5, barbell: BAR, scheme: { bar: parseScheme('50×5, 75×2') } })), '50×5, 75×2');
});
