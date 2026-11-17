// Estado de la app con estrategia "offline-first":
// cada cambio se aplica al estado local al instante, se guarda en localStorage y
// se encola en un "outbox" que se sincroniza con el backend cuando hay conexión.
import { api } from './api.js';
import { toast } from './ui.js';

export const state = { workouts: [], templates: [], exercises: [], loaded: false, syncError: null };

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

function readJSON(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('localStorage lleno', e); }
}

let outbox = readJSON('outbox', []);
export const pendingCount = () => outbox.length;

const SORTERS = {
  workouts: (a, b) => (a.started_at < b.started_at ? 1 : -1),
  templates: (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name),
  exercises: (a, b) => a.name.localeCompare(b.name),
};

function applyOp(op) {
  const list = state[op.table];
  if (op.op === 'upsert') {
    for (const row of op.rows) {
      const i = list.findIndex((x) => x.id === row.id);
      if (i >= 0) list[i] = row; else list.push(row);
    }
  } else {
    const i = list.findIndex((x) => x.id === op.id);
    if (i >= 0) list.splice(i, 1);
  }
  list.sort(SORTERS[op.table]);
}

const persistCache = () =>
  writeJSON('cache', { workouts: state.workouts, templates: state.templates, exercises: state.exercises });

export function loadCache() {
  const c = readJSON('cache', null);
  if (c) {
    Object.assign(state, c);
    state.loaded = true;
  }
}

export async function refresh() {
  const data = await api('GET', 'bootstrap');
  state.workouts = data.workouts;
  state.templates = data.templates;
  state.exercises = data.exercises;
  outbox.forEach(applyOp); // los cambios aún no sincronizados siguen ganando
  state.loaded = true;
  persistCache();
  emit();
}

export function upsert(table, rows) {
  rows = (Array.isArray(rows) ? rows : [rows]).map((r) => JSON.parse(JSON.stringify(r)));
  const op = { op: 'upsert', table, rows };
  applyOp(op);
  outbox.push(op);
  writeJSON('outbox', outbox);
  persistCache();
  emit();
  flush();
}

export function remove(table, id) {
  const op = { op: 'delete', table, id };
  applyOp(op);
  outbox.push(op);
  writeJSON('outbox', outbox);
  persistCache();
  emit();
  flush();
}

let flushing = false;
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (outbox.length) {
      const op = outbox[0];
      try {
        if (op.op === 'upsert') {
          for (let i = 0; i < op.rows.length; i += 200) await api('POST', op.table, op.rows.slice(i, i + 200));
        } else {
          await api('DELETE', `${op.table}?id=${encodeURIComponent(op.id)}`);
        }
        outbox.shift();
        writeJSON('outbox', outbox);
        state.syncError = null;
      } catch (e) {
        // Errores de datos (400, 404, 413) no se arreglan reintentando: se descartan.
        if ([400, 404, 413].includes(e.status)) {
          outbox.shift();
          writeJSON('outbox', outbox);
          toast(`No se pudo guardar: ${e.message}`, 5000);
          continue;
        }
        state.syncError = e.message;
        break;
      }
    }
  } finally {
    flushing = false;
    emit();
  }
}

window.addEventListener('online', () => flush());

// ---- Entrenamiento en curso (solo local hasta que se termina) ----
export const getActive = () => readJSON('activeWorkout', null);
export function setActive(w) { writeJSON('activeWorkout', w); }
export function clearActive() { localStorage.removeItem('activeWorkout'); emit(); }

// ---- Ajustes del dispositivo ----
export const getSettings = () => ({
  defaultRest: 120, rpe: false, wake: true, bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  ...readJSON('settings', {}),
});
export const saveSettings = (s) => writeJSON('settings', { ...getSettings(), ...s });

export const workoutById = (id) => state.workouts.find((w) => w.id === id);
export const templateById = (id) => state.templates.find((t) => t.id === id);
