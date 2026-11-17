// El service worker debe precachear todos los archivos JS de la app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('SHELL del service worker incluye todos los módulos', () => {
  const sw = readFileSync('public/sw.js', 'utf8');
  const files = [
    ...readdirSync('public/js').filter((f) => f.endsWith('.js')).map((f) => `/js/${f}`),
    ...readdirSync('public/js/views').map((f) => `/js/views/${f}`),
  ];
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `falta ${f} en SHELL de sw.js`);
});
