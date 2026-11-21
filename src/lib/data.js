// Estado de la app con estrategia "offline-first":
// cada cambio se aplica al estado local al instante, se guarda en localStorage y
// se encola en un "outbox" que se sincroniza con el backend cuando hay conexión.
//
// Hay tres "canales" a los que React se suscribe por separado (ver hooks.js):
//   data      entrenamientos, plantillas, ejercicios propios, preferencias por ejercicio,
//             peso corporal y medidas
//             y estado de sincronización
//   active    entrenamiento en curso (cambia con cada tecla, solo lo escucha el editor)
//   settings  ajustes del dispositivo
import { notifications } from '@mantine/notifications';
import { api } from './api.js';

export const state = {
  workouts: [], templates: [], exercises: [], exercise_prefs: [], body_metrics: [],
  loaded: false, syncError: null, syncing: false,
};

function channel() {
  const listeners = new Set();
  let version = 0;
  return {
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    emit: () => { version++; listeners.forEach((fn) => fn()); },
    version: () => version,
  };
}
export const dataChannel = channel();
export const activeChannel = channel();
export const settingsChannel = channel();

export const subscribe = dataChannel.subscribe;
const emit = dataChannel.emit;

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
  exercise_prefs: (a, b) => (a.id < b.id ? -1 : 1),
  body_metrics: (a, b) => (a.date < b.date ? 1 : -1), // más reciente primero
};

// Siempre crea una lista nueva: así React (useMemo) detecta el cambio por identidad.
function applyOp(op) {
  const list = [...state[op.table]];
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
  state[op.table] = list;
}

const persistCache = () =>
  writeJSON('cache', {
    workouts: state.workouts, templates: state.templates, exercises: state.exercises, exercise_prefs: state.exercise_prefs,
    body_metrics: state.body_metrics,
  });

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
  state.exercise_prefs = data.exercise_prefs || [];
  state.body_metrics = data.body_metrics || [];
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
  state.syncing = outbox.length > 0;
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
          notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message, autoClose: 5000 });
          continue;
        }
        state.syncError = e.message;
        break;
      }
    }
  } finally {
    flushing = false;
    state.syncing = false;
    emit();
  }
}

window.addEventListener('online', () => flush());

// ---- Entrenamiento en curso (solo local hasta que se termina) ----
let activeCache;
export const getActive = () => {
  if (activeCache === undefined) activeCache = readJSON('activeWorkout', null);
  return activeCache;
};
// Guarda una copia nueva (inmutable) para que React vea el cambio.
export function setActive(w) {
  activeCache = w;
  writeJSON('activeWorkout', w);
  activeChannel.emit();
}
export function clearActive() {
  activeCache = null;
  localStorage.removeItem('activeWorkout');
  activeChannel.emit();
}
window.addEventListener('storage', (e) => {
  if (e.key === 'activeWorkout') { activeCache = undefined; activeChannel.emit(); }
});

// ---- Ajustes del dispositivo ----
const DEFAULT_SETTINGS = {
  defaultRest: 120, rpe: false, wake: true, bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], sound: true,
  suggest: true, // feature 01: mostrar el objetivo para superar la vez anterior
  // feature 02: calentamiento sugerido (línea), solo en el primer ejercicio de cada músculo
  warmupShow: true, warmupFirstOnly: true, warmupRest: 60, warmupScheme: null, // null = DEFAULT_SCHEME
  // feature 03: sexo ('m' | 'f' | null) y estatura (cm) para la grasa estimada; medidas que se muestran
  sex: null, height: null, bodyMeasures: ['cintura'],
  resetPct: 10, // % que baja el reinicio de un ejercicio estancado (feature 06, 5–15)
  dumbbellMode: null, // modo de carga para mancuernas sin modo elegido ("para todas las mancuernas", feature 05)
  countBodyweight: true, // contar el peso corporal en el volumen (feature 04)
  muscleTarget: 8, // series directas por semana para que un músculo esté "Bien" (mapa del cuerpo)
};
let settingsCache;
export const getSettings = () => (settingsCache ||= { ...DEFAULT_SETTINGS, ...readJSON('settings', {}) });
export const saveSettings = (s) => {
  settingsCache = { ...getSettings(), ...s };
  writeJSON('settings', settingsCache);
  settingsChannel.emit();
};

export const workoutById = (id) => state.workouts.find((w) => w.id === id);
export const templateById = (id) => state.templates.find((t) => t.id === id);

// Preferencias de un ejercicio (fila de exercise_prefs) o null si no tiene.
export const prefsOf = (id) => state.exercise_prefs.find((p) => p.id === id) || null;
// Guarda preferencias de un ejercicio. Se manda la fila completa: el servidor rellena con
// valores por defecto lo que falte, así que un cambio parcial borraría lo demás.
export function savePrefs(id, patch) {
  upsert('exercise_prefs', { ...(prefsOf(id) || {}), ...patch, id });
}
