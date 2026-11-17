// Temporizador de descanso. Guarda la hora de término (no un contador), así
// sigue siendo exacto aunque el teléfono bloquee la pantalla o recargues la app.
import { h, mount, fmtClock } from './ui.js';

let audioCtx;
let tick;

const getEnd = () => Number(localStorage.getItem('restEnd') || 0);

function beep() {
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
  navigator.vibrate?.([200, 100, 200]);
}

function render() {
  const bar = document.getElementById('rest-bar');
  const left = getEnd() - Date.now();
  if (!getEnd()) { bar.hidden = true; return; }
  if (left <= 0) {
    stopRest();
    beep();
    return;
  }
  bar.hidden = false;
  mount(bar,
    h('span', {}, 'Descanso'),
    h('span', { class: 'time' }, fmtClock(left)),
    h('button', { class: 'small', onclick: () => addRest(-15) }, '−15'),
    h('button', { class: 'small', onclick: () => addRest(15) }, '+15'),
    h('button', { class: 'small', onclick: stopRest }, 'Saltar'));
}

export function startRest(seconds) {
  if (!seconds || seconds <= 0) return;
  // Crear el AudioContext durante el toque del usuario (requisito de iOS/Chrome)
  try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { /* */ }
  localStorage.setItem('restEnd', String(Date.now() + seconds * 1000));
  ensureTicking();
  render();
}

export function addRest(delta) {
  if (!getEnd()) return;
  localStorage.setItem('restEnd', String(getEnd() + delta * 1000));
  render();
}

export function stopRest() {
  localStorage.removeItem('restEnd');
  document.getElementById('rest-bar').hidden = true;
}

export function ensureTicking() {
  if (!tick) tick = setInterval(render, 500);
  render();
}
