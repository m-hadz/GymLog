// Pruebas del backend: router + almacenamiento en archivo, y forma de las
// llamadas a Supabase (con fetch simulado). Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'gymlog-')), 'db.json');
process.env.APP_PASSWORD = 'secreto';
delete process.env.SUPABASE_URL;
delete process.env.VERCEL;

const { handle } = await import('../lib/router.js');

const call = (method, path, body, key = 'secreto') =>
  handle(new Request(`http://x/api/${path}`, {
    method,
    headers: { 'x-app-key': key, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));

test('health no requiere clave', async () => {
  const r = await call('GET', 'health', undefined, '');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).storage, 'file');
});

test('clave incorrecta da 401', async () => {
  const r = await call('GET', 'workouts', undefined, 'mala');
  assert.equal(r.status, 401);
});

test('CRUD de entrenamientos', async () => {
  const w = {
    id: 'w1', name: 'FBEOD', started_at: '2026-10-10T17:35:00Z', ended_at: '2026-10-10T18:35:00Z',
    exercises: [{ exercise_id: 'x', name: 'Curl', sets: [{ type: 'N', weight: 18, reps: 10, done: true }] }],
    junk: 'se ignora',
  };
  let r = await call('POST', 'workouts', w);
  assert.equal(r.status, 200);
  const saved = await r.json();
  assert.equal(saved.junk, undefined);
  assert.equal(saved.notes, '');

  await call('POST', 'workouts', [{ ...w, id: 'w2', started_at: '2026-11-01T10:00:00Z' }]);
  r = await call('GET', 'workouts');
  const list = await r.json();
  assert.deepEqual(list.map((x) => x.id), ['w2', 'w1']); // orden desc por fecha

  r = await call('GET', 'bootstrap');
  const boot = await r.json();
  assert.equal(boot.workouts.length, 2);
  assert.deepEqual(boot.templates, []);

  r = await call('DELETE', 'workouts?id=w1');
  assert.equal(r.status, 200);
  r = await call('GET', 'workouts?id=w1');
  assert.equal(r.status, 404);
});

test('validación', async () => {
  let r = await call('POST', 'workouts', { id: 'bad id!', started_at: 'x' });
  assert.equal(r.status, 400);
  r = await call('POST', 'templates', { id: 't1' });
  assert.equal(r.status, 400); // falta name
  r = await call('POST', 'nope', {});
  assert.equal(r.status, 404);
});

test('supabase: headers, upsert y paginación', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (opts?.method === 'POST') return new Response(opts.body, { status: 201 });
    const offset = Number(new URL(url).searchParams.get('offset'));
    const n = offset === 0 ? 1000 : 3;
    return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `r${offset + i}` }))));
  };
  try {
    process.env.SUPABASE_URL = 'https://abc.supabase.co/';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_123';
    const mod = await import('../lib/store.js?supabase');
    const store = mod.getStore();
    assert.equal(store.kind, 'supabase');
    const rows = await store.list('workouts', 'started_at.desc');
    assert.equal(rows.length, 1003);
    assert.match(calls[0].url, /^https:\/\/abc\.supabase\.co\/rest\/v1\/workouts\?select=\*&order=started_at\.desc&limit=1000&offset=0$/);
    assert.equal(calls[0].opts.headers.apikey, 'sb_secret_123');
    assert.equal(calls[0].opts.headers.Authorization, undefined);
    await store.upsert('workouts', [{ id: 'a' }]);
    const post = calls.at(-1);
    assert.match(post.url, /on_conflict=id/);
    assert.match(post.opts.headers.Prefer, /merge-duplicates/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});

test('preferencias por ejercicio: CRUD, bootstrap y validación', async () => {
  let r = await call('POST', 'exercise_prefs', { id: 'Leverage_Chest_Press', min_increment: 2, max_load: 86 });
  assert.equal(r.status, 200);
  const saved = await r.json();
  assert.equal(saved.rep_max, null);
  assert.equal(saved.compare_same_template, false);
  r = await call('GET', 'bootstrap');
  const boot = await r.json();
  assert.deepEqual(boot.exercise_prefs.map((p) => p.id), ['Leverage_Chest_Press']);
  r = await call('POST', 'exercise_prefs', { id: 'x', min_increment: -1 });
  assert.equal(r.status, 400);
  r = await call('POST', 'exercise_prefs', { id: 'x', rep_max: '12' });
  assert.equal(r.status, 400);
});

test('peso corporal: un registro por día, medidas y validación', async () => {
  let r = await call('POST', 'body_metrics', { id: '2026-11-20', date: '2026-11-20', weight: 80.4, measurements: { cintura: 82 } });
  assert.equal(r.status, 200);
  const saved = await r.json();
  assert.equal(saved.notes, '');
  assert.equal(saved.body_fat, null);
  await call('POST', 'body_metrics', { id: '2026-11-21', date: '2026-11-21', weight: 80.1 });
  await call('POST', 'body_metrics', { id: '2026-11-20', date: '2026-11-20', weight: 80.9 }); // reemplaza
  r = await call('GET', 'bootstrap');
  const rows = (await r.json()).body_metrics;
  assert.deepEqual(rows.map((x) => [x.id, x.weight]), [['2026-11-21', 80.1], ['2026-11-20', 80.9]]);
  assert.deepEqual(rows[0].measurements, {});
  for (const bad of [
    { id: '2026-11-22', date: '2026-11-23', weight: 80 },
    { id: 'hoy', date: 'hoy', weight: 80 },
    { id: '2026-11-22', date: '2026-11-22', weight: -1 },
    { id: '2026-11-22', date: '2026-11-22', measurements: { cintura: 'x' } },
    { id: '2026-11-22', date: '2026-11-22', measurements: [1] },
  ]) {
    r = await call('POST', 'body_metrics', bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
});

test('user_settings: una fila id = me con data objeto (feature 09)', async () => {
  let r = await call('POST', 'user_settings', { id: 'me', data: { goal: { mode: 'cadencia', every_days: 2, tolerance: 1 }, pauses: [] } });
  assert.equal(r.status, 200);
  r = await call('GET', 'bootstrap');
  const rows = (await r.json()).user_settings;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.goal.mode, 'cadencia');
  for (const bad of [{ id: 'otro', data: {} }, { id: 'me', data: [] }, { id: 'me', data: { x: 'a'.repeat(33 * 1024) } }]) {
    r = await call('POST', 'user_settings', bad);
    assert.ok(r.status === 400 || r.status === 413, `${JSON.stringify(bad).slice(0, 40)} → ${r.status}`);
  }
});
