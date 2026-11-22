// Sincronización con tablas que aún no existen: el servidor responde 409 y la app guarda el cambio
// para más tarde (no lo descarta). Proceso propio: el store queda en modo Supabase con fetch simulado.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_PASSWORD = 'secreto';
process.env.SUPABASE_URL = 'https://abc.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_123';
delete process.env.VERCEL;
globalThis.localStorage = { getItem: () => 'secreto', setItem() {} };

const realFetch = globalThis.fetch;
const { handle } = await import('../lib/router.js');
const { api, isHeld } = await import('../src/lib/api.js');

const missingTable = () => new Response(JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.programs'" }), { status: 404 });
const call = (method, path, body) => handle(new Request(`http://x/api/${path}`, {
  method, headers: { 'x-app-key': 'secreto', 'content-type': 'application/json' }, body: body && JSON.stringify(body),
}));

test('tabla opcional sin crear: 409 al guardar y al borrar; bootstrap la da vacía', async () => {
  globalThis.fetch = async (url) => (String(url).includes('/programs') ? missingTable() : new Response('[]'));
  try {
    let r = await call('POST', 'programs', { id: 'p1', name: '5/3/1', kind: '531', config: {}, state: {}, active: true });
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /Falta crear la tabla programs/);
    r = await call('DELETE', 'programs?id=p1');
    assert.equal(r.status, 409);
    r = await call('GET', 'bootstrap');
    assert.deepEqual((await r.json()).programs, []);
  } finally { globalThis.fetch = realFetch; }
});

test('cliente: 409 y 404 sin JSON de la API se guardan para más tarde; los demás errores no', async () => {
  assert.equal(isHeld(409, { error: 'Falta crear la tabla' }), true);
  assert.equal(isHeld(404, {}), true); // la ruta no existe en el servidor (página 404)
  assert.equal(isHeld(404, { error: 'No encontrado' }), false); // 404 de la API: se descarta como antes
  assert.equal(isHeld(400, { error: 'x' }), false);
  globalThis.fetch = async () => new Response('<html>404</html>', { status: 404 });
  try {
    await assert.rejects(api('POST', 'programs', {}), (e) => e.held === true && e.status === 404);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Clave incorrecta' }), { status: 401 });
    await assert.rejects(api('GET', 'programs'), (e) => e.held === false && e.message === 'Clave incorrecta');
  } finally { globalThis.fetch = realFetch; }
});
