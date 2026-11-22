// Pruebas del aviso de fin de descanso por push (feature 11): firma VAPID y ciclo de las alertas
// (crear, mover, cancelar, reemplazar, no enviar dos veces, 410, re-armar) con el almacenamiento en archivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify, webcrypto } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Par de claves SOLO para pruebas (vector fijo)
const PUB = 'BOWLMMux9ZgtzXCJuCOvWDafG5nVlParQFnayMexvfusqBb1OEE2g0PnLlxgXWSpWCdNuM7daOVNwRbNhbKX9dg';
const PRIV = 'ioLc8hP9ehp5yxsjhbrd4vq9iDWlvRKzPSaTDxn3dKE';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'gymlog-push-')), 'db.json');
process.env.APP_PASSWORD = 'secreto';
process.env.VAPID_PUBLIC_KEY = PUB;
process.env.VAPID_PRIVATE_KEY = PRIV;
process.env.VAPID_SUBJECT = 'https://gymlog.example';
delete process.env.SUPABASE_URL;
delete process.env.VERCEL;

const { handle } = await import('../lib/router.js');
const { drain, setMaxWait, waitAndSend, ALERTS, SUBS } = await import('../lib/push-api.js');
const { subscriptionId, validEndpoint, vapidJwt } = await import('../lib/webpush.js');
const { getStore } = await import('../lib/store.js');

const call = async (method, path, body) => {
  const r = await handle(new Request(`http://x/api/${path}`, {
    method,
    headers: { 'x-app-key': 'secreto', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: r.status, data: await r.json() };
};

// fetch simulado: los push quedan registrados; las llamadas a la propia API (re-armar) van al router
const pushes = [];
let pushStatus = 201;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('http://x/api/')) return handle(new Request(u, init));
  if (u.startsWith('https://fcm.googleapis.com/')) {
    pushes.push({ url: u, at: Date.now(), headers: init.headers });
    return new Response('', { status: pushStatus });
  }
  return realFetch(url, init);
};

const pub = Buffer.from(PUB, 'base64url');
const publicKey = createPublicKey({
  key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') },
  format: 'jwk',
});
const decode = (s) => JSON.parse(Buffer.from(s, 'base64url').toString());

test('JWT de VAPID: forma, claims y firma ES256 válida (node:crypto y Web Crypto)', async () => {
  const jwt = vapidJwt({ audience: 'https://fcm.googleapis.com', subject: 'mailto:yo@example.com', publicKey: PUB, privateKey: PRIV, exp: 1900000000 });
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(decode(h), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(decode(c), { aud: 'https://fcm.googleapis.com', exp: 1900000000, sub: 'mailto:yo@example.com' });
  assert.ok(!/[=+/]/.test(jwt), 'base64url sin relleno');
  const sig = Buffer.from(s, 'base64url');
  assert.equal(sig.length, 64); // r ‖ s (JOSE), no DER
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig));
  const wk = await webcrypto.subtle.importKey('raw', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, wk, sig, Buffer.from(`${h}.${c}`)));
  // una firma alterada no verifica
  sig[10] ^= 1;
  assert.ok(!verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig));
});

test('endpoints permitidos e id de suscripción', () => {
  assert.ok(validEndpoint('https://web.push.apple.com/QGx…'));
  assert.ok(validEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(!validEndpoint('http://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(!validEndpoint('https://evil.example.com/x'));
  assert.ok(!validEndpoint('https://localhost/x'));
  assert.match(subscriptionId('https://fcm.googleapis.com/a'), /^s_[A-Za-z0-9_-]{32}$/);
  assert.equal(subscriptionId('https://fcm.googleapis.com/a'), subscriptionId('https://fcm.googleapis.com/a'));
});

const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
let sid;

test('suscribirse: clave pública, guardar y validar', async () => {
  let r = await call('GET', 'push-subscribe');
  assert.equal(r.data.publicKey, PUB);
  r = await call('POST', 'push-subscribe', { endpoint: 'https://evil.example.com/x', keys: KEYS });
  assert.equal(r.status, 400);
  r = await call('POST', 'push-subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/dev1', keys: KEYS });
  assert.equal(r.status, 200);
  sid = r.data.id;
  assert.equal((await getStore().get(SUBS, sid)).p256dh, KEYS.p256dh);
  r = await call('GET', 'bootstrap');
  assert.equal(r.data.push_subscriptions, undefined, 'las suscripciones no viajan al cliente');
});

const at = (ms) => new Date(Date.now() + ms).toISOString();

test('alerta: se envía una vez a la hora, con VAPID', async () => {
  pushes.length = 0;
  const t0 = Date.now();
  const r = await call('POST', 'rest-alert', { id: 'a1', subscription_id: sid, end_at: at(300) });
  assert.equal(r.status, 200);
  assert.ok(Date.now() - t0 < 200, 'responde sin esperar');
  await drain();
  assert.equal(pushes.length, 1);
  assert.ok(pushes[0].at - t0 >= 280, 'no antes de la hora');
  assert.match(pushes[0].headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
  assert.equal(pushes[0].headers.Urgency, 'high');
  assert.equal((await getStore().get(ALERTS, 'a1')).status, 'sent');
  // otra espera de la misma alerta no la reenvía
  assert.equal(await waitAndSend(getStore(), 'a1', 'http://x'), 'vigente-no');
  assert.equal(pushes.length, 1);
});

test('mover (+15 s) y cancelar', async () => {
  pushes.length = 0;
  const t0 = Date.now();
  await call('POST', 'rest-alert', { id: 'a2', subscription_id: sid, end_at: at(200) });
  await call('PUT', 'rest-alert', { id: 'a2', end_at: at(600) });
  await drain();
  assert.equal(pushes.length, 1, 'la espera vieja no envía');
  assert.ok(pushes[0].at - t0 >= 580, 'llega a la hora nueva');
  // mover antes
  pushes.length = 0;
  const t1 = Date.now();
  await call('POST', 'rest-alert', { id: 'a3', subscription_id: sid, end_at: at(600) });
  await call('PUT', 'rest-alert', { id: 'a3', end_at: at(200) });
  await drain();
  assert.equal(pushes.length, 1);
  assert.ok(pushes[0].at - t1 < 500, 'llega a la hora nueva (antes)');
  // cancelar (saltar el descanso, terminar el entrenamiento)
  pushes.length = 0;
  await call('POST', 'rest-alert', { id: 'a4', subscription_id: sid, end_at: at(200) });
  await call('DELETE', 'rest-alert?id=a4');
  await drain();
  assert.equal(pushes.length, 0);
  assert.equal((await call('PUT', 'rest-alert', { id: 'a4', end_at: at(500) })).status, 404);
});

test('una alerta nueva reemplaza a la anterior del mismo teléfono', async () => {
  pushes.length = 0;
  await call('POST', 'rest-alert', { id: 'b1', subscription_id: sid, end_at: at(300) });
  await call('POST', 'rest-alert', { id: 'b2', subscription_id: sid, end_at: at(400) });
  await drain();
  assert.equal(pushes.length, 1);
  assert.equal(await getStore().get(ALERTS, 'b1'), null);
});

test('ninguna alerta se envía dos veces aunque haya dos esperas a la vez', async () => {
  pushes.length = 0;
  await getStore().upsert(ALERTS, [{ id: 'c1', subscription_id: sid, end_at: at(100), status: 'pending', sent_at: null }]);
  const results = await Promise.all([1, 2, 3].map(() => waitAndSend(getStore(), 'c1', 'http://x')));
  assert.equal(pushes.length, 1);
  assert.deepEqual(results.sort(), ['enviada', 'no-reclamada', 'no-reclamada']);
});

test('descanso largo: la espera se re-arma con otra llamada', async () => {
  pushes.length = 0;
  setMaxWait(150);
  const t0 = Date.now();
  await call('POST', 'rest-alert', { id: 'd1', subscription_id: sid, end_at: at(400) });
  await drain();
  setMaxWait(240e3);
  assert.equal(pushes.length, 1);
  assert.ok(pushes[0].at - t0 >= 380);
});

test('validaciones: fecha fuera de rango y suscripción desconocida', async () => {
  assert.equal((await call('POST', 'rest-alert', { id: 'e1', subscription_id: sid, end_at: at(2 * 3600e3) })).status, 400);
  assert.equal((await call('POST', 'rest-alert', { id: 'e1', subscription_id: sid, end_at: 'mañana' })).status, 400);
  assert.equal((await call('POST', 'rest-alert', { id: 'e1', subscription_id: 's_nope', end_at: at(100) })).status, 404);
});

test('410: la suscripción vencida se borra sola; desactivar la borra', async () => {
  pushes.length = 0;
  pushStatus = 410;
  await call('POST', 'rest-alert', { id: 'f1', subscription_id: sid, end_at: at(100) });
  await drain();
  pushStatus = 201;
  assert.equal(pushes.length, 1);
  assert.equal(await getStore().get(SUBS, sid), null);
  const r = await call('POST', 'push-subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/dev2', keys: KEYS });
  assert.equal((await call('DELETE', `push-subscribe?id=${r.data.id}`)).status, 200);
  assert.equal(await getStore().get(SUBS, r.data.id), null);
});

test('sin claves VAPID: 503 con un mensaje claro', async () => {
  const keep = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  const r = await call('GET', 'push-subscribe');
  process.env.VAPID_PRIVATE_KEY = keep;
  assert.equal(r.status, 503);
  assert.match(r.data.error, /VAPID/);
});
