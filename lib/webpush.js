// Web Push sin contenido (feature 11): solo la autenticación VAPID (RFC 8292), un JWT ES256 firmado
// con node:crypto. Sin contenido no hace falta el cifrado de RFC 8291: el texto de la notificación es
// fijo en el service worker (public/push-sw.js). Sin dependencias.
import { createHash, createPrivateKey, sign } from 'node:crypto';

export const b64url = (buf) => Buffer.from(buf).toString('base64url');
export const fromB64url = (s) => Buffer.from(String(s), 'base64url');

// Servicios de push conocidos: el servidor solo hace POST a estos (evita usarlo para llamar a otras URLs).
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/,
];
export function validEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Id estable de una suscripción: hash del endpoint (cabe en el ID_RE del router). */
export const subscriptionId = (endpoint) => `s_${createHash('sha256').update(endpoint).digest('base64url').slice(0, 32)}`;

/** Clave privada (d, 32 bytes en base64url) + pública sin comprimir (65 bytes: 0x04 ‖ x ‖ y). */
function privateKeyObject(publicKey, privateKey) {
  const pub = fromB64url(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY inválida (se esperan 65 bytes sin comprimir)');
  return createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33)) },
    format: 'jwk',
  });
}

/**
 * JWT de VAPID: {typ:'JWT', alg:'ES256'} · {aud, exp, sub}. La firma va en formato JOSE (r ‖ s, 64 bytes).
 * @param {{audience:string, subject:string, publicKey:string, privateKey:string, exp?:number}} p
 */
export function vapidJwt({ audience, subject, publicKey, privateKey, exp }) {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud: audience, exp: exp ?? Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const data = `${header}.${claims}`;
  const sig = sign('sha256', Buffer.from(data), { key: privateKeyObject(publicKey, privateKey), dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64url(sig)}`;
}

/** Claves VAPID del entorno, o null si faltan. El subject por defecto es la URL de la app. */
export function vapidFromEnv(env, origin) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || origin };
}

/**
 * Envía un push sin contenido. 404/410 = la suscripción ya no existe (hay que borrarla).
 * @returns {Promise<{status:number, ok:boolean, gone:boolean}>}
 */
export async function sendPush(sub, vapid, { ttl = 120, urgency = 'high', fetchImpl = fetch } = {}) {
  const jwt = vapidJwt({ audience: new URL(sub.endpoint).origin, subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey });
  const res = await fetchImpl(sub.endpoint, {
    method: 'POST',
    headers: { TTL: String(ttl), Urgency: urgency, Authorization: `vapid t=${jwt}, k=${vapid.publicKey}` },
    body: '',
  });
  if (!res.ok) console.warn('[push]', res.status, (await res.text().catch(() => '')).slice(0, 200));
  return { status: res.status, ok: res.ok, gone: res.status === 404 || res.status === 410 };
}
