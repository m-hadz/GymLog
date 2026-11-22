// Cronómetro de una serie por tiempo (feature 04 C). Como el descanso, guarda la hora de inicio
// (no un contador), así no pierde tiempo si se bloquea la pantalla o se recarga la app.
// Con objetivo cuenta hacia atrás y suena al llegar a 0; sin objetivo cuenta hacia adelante.
import { beep, stopRest, unlockAudio } from './rest-timer.js';

const KEY = 'setTimer';
let tick;
const listeners = new Set();
export const setTimerChannel = {
  subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
};

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
};
let snapshot = read();
export const getSetTimer = () => snapshot;

const write = (t) => {
  try { if (t) localStorage.setItem(KEY, JSON.stringify(t)); else localStorage.removeItem(KEY); } catch { /* */ }
  snapshot = t;
  listeners.forEach((fn) => fn());
};

export const elapsedSecs = (t, now = Date.now()) => (t ? Math.max(0, Math.floor((now - t.start) / 1000)) : 0);

function check() {
  const t = snapshot;
  if (!t) { clearInterval(tick); tick = null; return; }
  if (t.target && !t.beeped && elapsedSecs(t) >= t.target) {
    write({ ...t, beeped: true });
    beep();
  }
}

function ensureTicking() {
  if (!tick) tick = setInterval(check, 250);
  check();
}

/**
 * @param {string} key    identifica la serie (entrenamiento:ejercicio:serie)
 * @param {number|null} target segundos objetivo (cuenta regresiva) o null (cuenta hacia adelante)
 */
export function startSetTimer(key, target = null) {
  unlockAudio();
  stopRest();
  write({ key, start: Date.now(), target: target > 0 ? target : null, beeped: false });
  ensureTicking();
}

// Detiene el cronómetro y devuelve los segundos a guardar (con objetivo, como máximo el objetivo).
export function stopSetTimer() {
  const t = snapshot;
  if (!t) return 0;
  write(null);
  const secs = elapsedSecs(t);
  return t.target ? Math.min(secs, t.target) : secs;
}

if (snapshot) ensureTicking();
