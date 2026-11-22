// Aviso de fin de descanso con la app cerrada (feature 11), lado del teléfono:
//  - activar/desactivar: permiso (solo tras el toque del usuario), suscripción push y registro en el servidor;
//  - alertas: al empezar un descanso se pide al servidor un push a la hora de término; sumar/restar 15 s
//    la mueve; saltar, terminar o descartar el entrenamiento la cancela.
// Sin conexión, el descanso funciona igual (solo en la app) y el temporizador muestra "aviso no disponible".
import { api } from './api.js';
import { getSettings, saveSettings } from './data.js';
import { uid } from './format.js';

/** ¿Se puede usar push aquí? En iPhone solo con la app instalada en la pantalla de inicio (iOS 16.4+). */
export function pushEnv() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return { ios, standalone, supported, permission: supported ? Notification.permission : 'unsupported' };
}

const bytes = (b64url) => {
  const s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const sameKey = (buf, b64url) => {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  const b = bytes(b64url);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw Object.assign(new Error('La app aún no terminó de instalarse. Vuelve a intentarlo en unos segundos.'), { code: 'no-sw' });
  return reg;
}

/**
 * Activa el aviso en este teléfono. Debe llamarse desde un toque (iOS solo pide el permiso así).
 * @returns {Promise<{ok:true}|{error:'install'|'unsupported'|'denied'}>} los errores del servidor se lanzan
 */
export async function enablePush() {
  const env = pushEnv();
  if (env.ios && !env.standalone) return { error: 'install' };
  if (!env.supported) return { error: 'unsupported' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { error: 'denied' };
  const { publicKey } = await api('GET', 'push-subscribe');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, publicKey)) { await sub.unsubscribe(); sub = null; }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(publicKey) });
  const { id } = await api('POST', 'push-subscribe', sub.toJSON());
  saveSettings({ restPush: true, pushSubId: id });
  return { ok: true };
}

/** Desactiva: borra la suscripción del servidor y la del navegador. */
export async function disablePush() {
  const id = getSettings().pushSubId;
  saveSettings({ restPush: false, pushSubId: null });
  await cancelAlert();
  if (id) await api('DELETE', `push-subscribe?id=${encodeURIComponent(id)}`).catch(() => {});
  try { await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription().then((s) => s?.unsubscribe()); } catch { /* */ }
}

/**
 * Al abrir la app: si el aviso está activo, vuelve a registrar la suscripción (el navegador puede
 * cambiarla, y el servidor la borra si el servicio de push dijo 410). Si quitaste el permiso, se apaga.
 */
export async function syncPush() {
  const s = getSettings();
  if (!s.restPush) return;
  const env = pushEnv();
  if (!env.supported) return;
  if (env.permission !== 'granted') { saveSettings({ restPush: false, pushSubId: null }); return; }
  try {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (!sub) { saveSettings({ restPush: false, pushSubId: null }); return; }
    const { id } = await api('POST', 'push-subscribe', sub.toJSON());
    if (id !== s.pushSubId) saveSettings({ pushSubId: id });
  } catch { /* sin conexión: se intenta la próxima vez */ }
}

// ---- Alerta del descanso en curso ----
// status: 'pending' (pidiéndola) | 'ok' | 'failed' (sin conexión u otro error: solo suena en la app)
const listeners = new Set();
export const alertChannel = { subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
const readAlert = () => { try { return JSON.parse(localStorage.getItem('restAlert')) || null; } catch { return null; } };
let alert = readAlert();
export const getAlert = () => alert;
function setAlert(next) {
  alert = next;
  try { if (next) localStorage.setItem('restAlert', JSON.stringify(next)); else localStorage.removeItem('restAlert'); } catch { /* */ }
  listeners.forEach((fn) => fn());
}

// Las llamadas van en fila: mover o cancelar espera a que la alerta exista en el servidor.
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn, fn); return queue; };

const active = () => { const s = getSettings(); return s.restPush && s.pushSubId ? s.pushSubId : null; };

/** Programa el aviso para `endMs`. Reemplaza al anterior (también en el servidor). */
export function scheduleAlert(endMs, id = uid('ra_')) {
  const sid = active();
  if (!sid) { if (alert) setAlert(null); return Promise.resolve(); }
  setAlert({ id, status: 'pending' });
  return enqueue(async () => {
    try {
      await api('POST', 'rest-alert', { id, subscription_id: sid, end_at: new Date(endMs).toISOString() });
      if (alert?.id === id) setAlert({ id, status: 'ok' });
    } catch (e) {
      if (alert?.id === id) setAlert({ id, status: 'failed' });
      if (e.status === 404) syncPush(); // el servidor ya no tiene la suscripción: registrarla de nuevo
    }
  });
}

/** Mueve el aviso (sumar o restar 15 s). */
export function moveAlert(endMs) {
  const cur = alert;
  if (!cur || !active()) return Promise.resolve();
  if (cur.status === 'failed') return scheduleAlert(endMs); // reintentar con una nueva
  return enqueue(async () => {
    try {
      await api('PUT', 'rest-alert', { id: cur.id, end_at: new Date(endMs).toISOString() });
    } catch {
      if (alert?.id === cur.id) setAlert({ id: cur.id, status: 'failed' });
    }
  });
}

/** Cancela el aviso pendiente (saltar el descanso, terminar o descartar el entrenamiento). */
export function cancelAlert() {
  const cur = alert;
  if (!cur) return Promise.resolve();
  setAlert(null);
  return enqueue(() => api('DELETE', `rest-alert?id=${encodeURIComponent(cur.id)}`).catch(() => {}));
}

/** El descanso terminó con la app en segundo plano: el aviso lo manda el servidor, no se toca. */
export const forgetAlert = () => { if (alert) setAlert(null); };

/** Cierra la notificación "Descanso terminado" si aparece en los próximos segundos (la app está a la vista). */
export function closeRestNotifications() {
  if (!('serviceWorker' in navigator)) return;
  const run = () => navigator.serviceWorker.getRegistration()
    .then((reg) => reg?.getNotifications({ tag: 'rest' }))
    .then((list) => list?.forEach((n) => n.close()))
    .catch(() => {});
  [0, 1500, 4000, 8000].forEach((ms) => setTimeout(run, ms));
}

/** Prueba: un aviso en 10 s (para bloquear el teléfono y ver que llega). */
export const testAlert = () => scheduleAlert(Date.now() + 10e3, uid('rt_'));
