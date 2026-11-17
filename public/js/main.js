// Punto de entrada: arranque, enrutador por hash y banner de entrenamiento en curso.
import { h, mount, fmtClock, toast } from './ui.js';
import { state, loadCache, refresh, subscribe, getActive, flush } from './data.js';
import { setKey, ApiError } from './api.js';
import { loadCatalog } from './catalog.js';
import { ensureTicking } from './rest-timer.js';
import { trainView, templateEditView } from './views/train.js';
import { activeWorkoutView } from './views/editor.js';
import { historyView, workoutDetailView, workoutEditView, calendarView } from './views/history.js';
import { exercisesView, exerciseDetailView } from './views/exercises.js';
import { profileView } from './views/profile.js';

const app = document.getElementById('app');
let cleanup = null;
let currentRoute = '';

const ROUTES = [
  [/^train$/, 'train', () => trainView(app)],
  [/^template\/(.+)$/, 'train', (m) => templateEditView(app, m[1]), true],
  [/^workout$/, 'train', () => activeWorkoutView(app), true],
  [/^workout\/([^/]+)\/edit$/, 'history', (m) => workoutEditView(app, m[1]), true],
  [/^workout\/([^/]+)$/, 'history', (m, q) => workoutDetailView(app, m[1], q)],
  [/^history$/, 'history', (m, q) => historyView(app, q)],
  [/^calendar$/, 'history', () => calendarView(app)],
  [/^exercises$/, 'exercises', () => exercisesView(app)],
  [/^exercise\/(.+)$/, 'exercises', (m) => exerciseDetailView(app, decodeURIComponent(m[1]))],
  [/^profile$/, 'profile', () => profileView(app)],
  [/^login$/, '', () => loginView()],
];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'train';
  const [path, qs] = raw.split('?');
  return { path, query: new URLSearchParams(qs || '') };
}

function isEditorRoute() {
  const { path } = parseHash();
  return ROUTES.find(([re]) => re.test(path))?.[3] === true;
}

function render() {
  const { path, query } = parseHash();
  const route = ROUTES.find(([re]) => re.test(path)) || ROUTES[0];
  const changed = currentRoute !== location.hash;
  currentRoute = location.hash;
  cleanup?.();
  cleanup = null;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === route[1]));
  const result = route[2](path.match(route[0]) || [], query);
  if (typeof result === 'function') cleanup = result;
  if (changed && !path.startsWith('calendar')) window.scrollTo(0, 0);
  updateBanner();
}

function updateBanner() {
  const banner = document.getElementById('active-banner');
  const active = getActive();
  if (!active || parseHash().path === 'workout') { banner.hidden = true; return; }
  banner.hidden = false;
  banner.textContent = `▶ ${active.name} · ${fmtClock(Date.now() - new Date(active.started_at))} — tocar para volver`;
}
document.getElementById('active-banner').addEventListener('click', () => { location.hash = '#/workout'; });
setInterval(updateBanner, 1000);

function loginView() {
  const input = h('input', { type: 'password', placeholder: 'Clave (APP_PASSWORD)', autocomplete: 'current-password' });
  const go = async () => {
    setKey(input.value);
    try {
      await refresh();
      location.hash = '#/train';
    } catch (e) {
      toast(e.status === 401 ? 'Clave incorrecta' : e.message);
    }
  };
  mount(app,
    h('h1', {}, 'GymLog'),
    h('p', {}, 'Ingresa la clave que configuraste en Vercel (APP_PASSWORD).'),
    input,
    h('button', { class: 'block primary', onclick: go }, 'Entrar'));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

// Re-render cuando cambian los datos, salvo en editores (para no perder lo que escribes)
subscribe(() => { if (!isEditorRoute() && parseHash().path !== 'login') render(); });
window.addEventListener('hashchange', render);

async function boot() {
  loadCache();
  ensureTicking();
  loadCatalog().then(() => { if (!isEditorRoute()) render(); });
  if (state.loaded) render();
  try {
    await refresh();
    flush();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      location.hash = '#/login';
      render();
      return;
    }
    if (!state.loaded) mount(app, h('p', {}, `No se pudo conectar: ${e.message}`), h('button', { onclick: () => location.reload() }, 'Reintentar'));
    else toast('Sin conexión: usando datos guardados en el teléfono');
    return;
  }
  render();
}

boot();
