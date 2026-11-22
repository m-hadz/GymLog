// Temporizador de descanso. Guarda la hora de término (no un contador), así
// sigue siendo exacto aunque el teléfono bloquee la pantalla o recargues la app.
// La interfaz (components/RestTimer.jsx) se suscribe con restChannel.
import { getSettings } from './data.js';
import { cancelAlert, closeRestNotifications, forgetAlert, moveAlert, scheduleAlert } from './push.js';

let audioCtx;
let tick;
const listeners = new Set();
export const restChannel = {
  subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
};
const emit = () => listeners.forEach((fn) => fn());

const read = () => {
  const end = Number(localStorage.getItem('restEnd') || 0);
  const total = Number(localStorage.getItem('restTotal') || 0);
  return { end, total };
};
let snapshot = read();
export const getRest = () => snapshot;
const write = (end, total) => {
  if (end) {
    localStorage.setItem('restEnd', String(end));
    localStorage.setItem('restTotal', String(total));
  } else {
    localStorage.removeItem('restEnd');
    localStorage.removeItem('restTotal');
  }
  snapshot = { end, total };
  emit();
};

export function beep() {
  if (getSettings().sound !== false) {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.frequency.value = 880;
        g.gain.value = 0.2;
        o.connect(g).connect(audioCtx.destination);
        o.start(audioCtx.currentTime + t);
        o.stop(audioCtx.currentTime + t + 0.15);
      });
    } catch { /* sin audio */ }
  }
  navigator.vibrate?.([200, 100, 200]);
}

function check() {
  const { end } = snapshot;
  if (end && end - Date.now() <= 0) {
    write(0, 0);
    // Con la app a la vista suena aquí y el aviso push sobra: se cancela y, si igual llega, se cierra.
    // En segundo plano no se toca: el servidor lo envía (feature 11).
    if (document.visibilityState === 'visible') {
      cancelAlert();
      closeRestNotifications();
    } else forgetAlert();
    beep();
  }
}

// Crear el AudioContext durante el toque del usuario (requisito de iOS/Chrome)
export function unlockAudio() {
  try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { /* */ }
}

export function startRest(seconds) {
  if (!seconds || seconds <= 0) return;
  unlockAudio();
  const end = Date.now() + seconds * 1000;
  write(end, seconds * 1000);
  scheduleAlert(end);
  ensureTicking();
}

export function addRest(delta) {
  const { end, total } = snapshot;
  if (!end) return;
  const next = end + delta * 1000;
  if (next <= Date.now()) { stopRest(); return; }
  write(next, Math.max(total + delta * 1000, next - Date.now()));
  moveAlert(next);
}

/** Saltar el descanso, o terminar/descartar el entrenamiento: también cancela el aviso push. */
export function stopRest() {
  write(0, 0);
  cancelAlert();
}

export function ensureTicking() {
  if (!tick) tick = setInterval(check, 500);
  check();
}
