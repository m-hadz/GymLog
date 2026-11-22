// Aviso de fin de descanso por push (feature 11). Dos recursos:
//   /api/push-subscribe  GET → {publicKey} · POST {endpoint, keys} → {id} · DELETE ?id=
//   /api/rest-alert      POST {id, subscription_id, end_at} · PUT {id, end_at} · DELETE ?id=
// Cómo se envía a la hora (opción A del documento): la función que recibe la alerta queda esperando
// hasta end_at (waitUntil de Vercel) y entonces "reclama" la alerta en la base — pasa de pending a sent
// solo si sigue pendiente y ya venció — y recién ahí manda el push. Mover la alerta lanza otra espera;
// la vieja despierta, no puede reclamarla y termina. Así ninguna alerta se envía dos veces. Si el
// descanso es más largo que lo que puede esperar una función, la espera se re-arma con otra llamada.
import { HttpError } from './store.js';
import { sendPush, subscriptionId, validEndpoint, vapidFromEnv } from './webpush.js';

export const SUBS = 'push_subscriptions';
export const ALERTS = 'rest_alerts';
const ID_RE = /^[A-Za-z0-9_:.-]{1,100}$/;
const KEY_RE = /^[A-Za-z0-9_=-]{8,200}$/;
const MAX_AHEAD_MS = 3600e3; // un descanso de hasta 1 hora
const DAY_MS = 864e5;
const CLAIM_SLACK_MS = 250; // margen para el reloj del temporizador (mucho menor que los 15 s de un ajuste)
let maxWaitMs = 240e3; // Vercel corta la función a los 300 s (maxDuration en vercel.json)
export const setMaxWait = (ms) => { maxWaitMs = ms; }; // pruebas

const isMissingTable = (e) => /PGRST205|42P01|Could not find the table|does not exist/.test(e?.message || '');
const guard = (table) => (e) => {
  if (isMissingTable(e)) throw new HttpError(400, `Falta crear la tabla ${table} en Supabase (ver schema.sql)`);
  throw e;
};

// ---- Tareas que siguen después de responder ----
// En Vercel se registran con waitUntil (el mismo mecanismo que @vercel/functions, sin la dependencia);
// en el servidor local el proceso sigue vivo y basta con no esperarlas.
const REQ_CTX = Symbol.for('@vercel/request-context');
const tasks = new Set();
function background(promise) {
  const p = promise.catch((e) => console.error('[rest-alert]', e)).finally(() => tasks.delete(p));
  tasks.add(p);
  const ctx = globalThis[REQ_CTX]?.get?.();
  if (ctx?.waitUntil) { ctx.waitUntil(p); return null; }
  return process.env.VERCEL ? p : null; // en Vercel sin waitUntil: responder recién al terminar
}
/** Espera a que terminen las tareas en curso (pruebas). */
export const drain = async () => { while (tasks.size) await Promise.all([...tasks]); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rearm(origin, id) {
  await fetch(`${origin}/api/rest-alert?rearm=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-key': process.env.APP_PASSWORD || '' },
    body: JSON.stringify({ id }),
  });
}

/** Espera hasta end_at y envía si la alerta sigue vigente. Devuelve qué pasó (para registro y pruebas). */
export async function waitAndSend(store, id, origin, env = process.env) {
  const row = await store.get(ALERTS, id);
  if (!row || row.status !== 'pending') return 'vigente-no';
  const wait = Date.parse(row.end_at) - Date.now();
  if (wait > maxWaitMs) {
    await sleep(maxWaitMs);
    await rearm(origin, id);
    return 'rearmada';
  }
  if (wait > 0) await sleep(wait);
  // Reclamar: solo una espera puede pasar la alerta a 'sent', y solo si ya venció (si la movieron
  // más tarde, otra espera la enviará).
  const now = new Date();
  const [claimed] = await store.update(ALERTS, { id: `eq.${id}`, status: 'eq.pending', end_at: `lte.${new Date(now.getTime() + CLAIM_SLACK_MS).toISOString()}` },
    { status: 'sent', sent_at: now.toISOString(), updated_at: now.toISOString() });
  if (!claimed) return 'no-reclamada';
  const sub = await store.get(SUBS, claimed.subscription_id);
  const vapid = vapidFromEnv(env, origin);
  if (!sub || !vapid) return 'sin-suscripcion';
  const r = await sendPush(sub, vapid);
  if (r.gone) {
    await store.remove(SUBS, sub.id);
    await store.removeWhere(ALERTS, { subscription_id: `eq.${sub.id}` });
  }
  console.log('[rest-alert]', id, r.status, `${Date.now() - Date.parse(claimed.end_at)} ms tarde`);
  return r.gone ? 'borrada' : r.ok ? 'enviada' : `error-${r.status}`;
}

function endAtOf(v) {
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new HttpError(400, 'end_at inválido');
  if (t < Date.now() - 5000 || t > Date.now() + MAX_AHEAD_MS) throw new HttpError(400, 'end_at fuera de rango');
  return new Date(t).toISOString();
}

/** /api/push-subscribe */
export async function pushSubscribe(store, request, url, method, body) {
  const vapid = vapidFromEnv(process.env, url.origin);
  if (method === 'GET') {
    if (!vapid) throw new HttpError(503, 'Falta configurar VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (ver README)');
    return { publicKey: vapid.publicKey };
  }
  if (method === 'POST') {
    if (!vapid) throw new HttpError(503, 'Falta configurar VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (ver README)');
    const { endpoint, keys } = body || {};
    if (typeof endpoint !== 'string' || endpoint.length > 1000 || !validEndpoint(endpoint)) throw new HttpError(400, 'endpoint inválido');
    if (!KEY_RE.test(keys?.p256dh || '') || !KEY_RE.test(keys?.auth || '')) throw new HttpError(400, 'keys inválidas');
    const id = subscriptionId(endpoint);
    await store.upsert(SUBS, [{
      id, endpoint, p256dh: keys.p256dh, auth: keys.auth,
      user_agent: (request.headers.get('user-agent') || '').slice(0, 200), updated_at: new Date().toISOString(),
    }]).catch(guard(SUBS));
    return { id };
  }
  if (method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id || !ID_RE.test(id)) throw new HttpError(400, 'Falta id');
    await store.remove(SUBS, id).catch(guard(SUBS));
    await store.removeWhere(ALERTS, { subscription_id: `eq.${id}` }).catch(guard(ALERTS));
    return { ok: true };
  }
  throw new HttpError(405, 'Método no permitido');
}

/** /api/rest-alert. Devuelve [respuesta, tarea en segundo plano que hay que esperar o null]. */
export async function restAlert(store, request, url, method, body) {
  const origin = url.origin;
  if (method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id || !ID_RE.test(id)) throw new HttpError(400, 'Falta id');
    await store.remove(ALERTS, id).catch(guard(ALERTS));
    return [{ ok: true }, null];
  }
  if (method !== 'POST' && method !== 'PUT') throw new HttpError(405, 'Método no permitido');
  const id = body?.id;
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, 'id inválido');
  if (method === 'POST' && url.searchParams.get('rearm')) return [{ ok: true }, background(waitAndSend(store, id, origin))];

  const now = new Date().toISOString();
  const end_at = endAtOf(body.end_at);
  if (method === 'PUT') {
    const [row] = await store.update(ALERTS, { id: `eq.${id}`, status: 'eq.pending' }, { end_at, updated_at: now }).catch(guard(ALERTS));
    if (!row) throw new HttpError(404, 'Alerta no encontrada');
    return [{ ok: true }, background(waitAndSend(store, id, origin))];
  }
  const sid = body.subscription_id;
  if (typeof sid !== 'string' || !ID_RE.test(sid)) throw new HttpError(400, 'subscription_id inválido');
  if (!await store.get(SUBS, sid).catch(guard(SUBS))) throw new HttpError(404, 'Suscripción no encontrada');
  // Se avisa solo al dispositivo que empezó el descanso; una alerta nueva reemplaza a la anterior.
  await store.removeWhere(ALERTS, { subscription_id: `eq.${sid}`, status: 'eq.pending', id: `neq.${id}` }).catch(guard(ALERTS));
  await store.removeWhere(ALERTS, { created_at: `lt.${new Date(Date.now() - DAY_MS).toISOString()}` });
  await store.upsert(ALERTS, [{ id, subscription_id: sid, end_at, status: 'pending', sent_at: null, updated_at: now }]);
  return [{ ok: true }, background(waitAndSend(store, id, origin))];
}
