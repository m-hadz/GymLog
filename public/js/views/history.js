// Historial de entrenamientos, detalle y calendario.
import { h, mount, fmtDate, fmtTime, fmtDuration, fmtNum, fmtSet, dayKey } from '../ui.js';
import { state, remove, upsert, workoutById } from '../data.js';
import { exerciseName } from '../catalog.js';
import { computePRs, prCount, workoutVolume, workoutDuration, bestSet, isWorking, setVolume } from '../stats.js';
import { startWorkout, templateFromWorkout, editorView } from './editor.js';

function workoutCard(w, marks) {
  return h('div', { class: 'card click', onclick: () => { location.hash = `#/workout/${w.id}`; } },
    h('strong', {}, w.name),
    h('div', { class: 'muted small' }, fmtDate(w.started_at, { weekday: 'long', day: 'numeric', month: 'short' })),
    h('div', { class: 'row small', style: 'gap:16px;margin:6px 0' },
      h('span', {}, `⏱ ${fmtDuration(workoutDuration(w))}`),
      h('span', {}, `🏋 ${fmtNum(workoutVolume(w), 0)} kg`),
      h('span', {}, `🏆 ${prCount(marks)} RP`)),
    h('table', {},
      h('tr', {}, h('th', { class: 'left' }, 'Ejercicio'), h('th', { class: 'left' }, 'Mejor serie')),
      w.exercises.map((e) => h('tr', {},
        h('td', { class: 'left' }, `${e.sets.length} × ${exerciseName(e.exercise_id, e.name)}`),
        h('td', { class: 'left' }, fmtSet(bestSet(e.sets) || e.sets[0]))))));
}

export function historyView(root, query) {
  const day = query.get('day');
  const prs = computePRs(state.workouts);
  const list = day ? state.workouts.filter((w) => dayKey(w.started_at) === day) : state.workouts;
  const items = [];
  let month = '';
  for (const w of list) {
    const m = fmtDate(w.started_at, { month: 'long', year: 'numeric' }).toUpperCase();
    if (m !== month) { month = m; items.push(h('h3', { class: 'muted' }, m)); }
    items.push(workoutCard(w, prs.get(w.id)));
  }
  mount(root,
    h('div', { class: 'row between' }, h('h1', {}, 'Historial'), h('a', { href: '#/calendar' }, 'Calendario')),
    day ? h('p', {}, `Mostrando ${fmtDate(day + 'T12:00:00')} · `, h('a', { href: '#/history' }, 'ver todo')) : null,
    items.length ? items : h('p', { class: 'muted' }, 'Aún no hay entrenamientos. Ve a Entrenar o importa tu historial de Strong en Perfil.'));
}

// Entrenamiento anterior "equivalente": misma plantilla o, si no, mismo nombre.
function previousOf(w) {
  return state.workouts.find((x) => x.id !== w.id && x.started_at < w.started_at &&
    ((w.template_id && x.template_id === w.template_id) || x.name === w.name));
}

const exVolume = (w, exId) => (w.exercises || []).filter((e) => e.exercise_id === exId)
  .flatMap((e) => e.sets).filter(isWorking)
  .reduce((a, s) => a + (s.weight ? setVolume(s) : s.reps || 0), 0);

function summaryBlock(w, marks) {
  const prev = previousOf(w);
  const vol = workoutVolume(w);
  const sets = w.exercises.reduce((a, e) => a + e.sets.filter(isWorking).length, 0);
  let delta = null;
  if (prev && workoutVolume(prev)) delta = Math.round((vol / workoutVolume(prev) - 1) * 100);
  const prs = [];
  marks?.forEach((labels, key) => {
    const [ei, si] = key.split(':').map(Number);
    const e = w.exercises[ei];
    prs.push(h('li', {}, h('strong', {}, exerciseName(e.exercise_id, e.name)), ` · ${fmtSet(e.sets[si])} · ${labels.join(', ')}`));
  });
  const rows = prev ? [...new Set(w.exercises.map((e) => e.exercise_id))].map((exId) => {
    const a = exVolume(prev, exId), b = exVolume(w, exId);
    return a || b ? { exId, a, b, name: exerciseName(exId, w.exercises.find((e) => e.exercise_id === exId).name) } : null;
  }).filter(Boolean) : [];
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  return [
    h('div', { class: 'stats3' },
      h('div', {}, h('b', {}, fmtDuration(workoutDuration(w))), h('span', { class: 'muted small' }, 'Duración')),
      h('div', {}, h('b', {}, sets), h('span', { class: 'muted small' }, 'Series efectivas')),
      h('div', {}, h('b', {}, `${fmtNum(vol, 0)} kg`),
        h('span', { class: `small ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'muted'}` },
          delta == null ? 'Volumen' : `${delta > 0 ? '+' : ''}${delta} % vs anterior`))),
    prs.length ? h('div', { class: 'card', style: 'border-color:var(--ok)' },
      h('strong', {}, `🏆 ${prCount(marks)} récord${prCount(marks) > 1 ? 's' : ''}`), h('ul', { style: 'margin:6px 0 0;padding-left:18px' }, prs)) : null,
    rows.length ? h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('strong', {}, 'Contra la última vez'),
        h('span', { class: 'muted small' }, fmtDate(prev.started_at, { day: 'numeric', month: 'short' }))),
      rows.map((r) => {
        const d = r.a ? Math.round((r.b / r.a - 1) * 100) : null;
        return h('div', { style: 'margin-top:8px' },
          h('div', { class: 'row between small' }, h('span', {}, r.name),
            h('span', { class: d > 0 ? 'up' : d < 0 ? 'down' : 'muted' }, d == null ? 'nuevo' : d === 0 ? 'igual' : `${d > 0 ? '+' : ''}${d} %`)),
          h('div', { class: 'cmpbar', style: `width:${(r.a / max) * 100}%` }),
          h('div', { class: 'cmpbar now', style: `width:${(r.b / max) * 100}%` }));
      }),
      h('p', { class: 'muted small', style: 'margin:6px 0 0' }, 'Gris: la vez anterior · Azul: hoy. Volumen = kg × reps (o reps si es sin peso).')) : null,
  ];
}

export function workoutDetailView(root, id, query) {
  const w = workoutById(id);
  if (!w) { mount(root, h('p', {}, 'Entrenamiento no encontrado. '), h('a', { href: '#/history' }, 'Volver')); return; }
  const marks = computePRs(state.workouts).get(w.id);
  const prs = prCount(marks);
  mount(root,
    h('button', { onclick: () => { location.hash = '#/history'; } }, '← Historial'),
    query.get('done') ? h('div', { class: 'card', style: 'border-color:var(--ok)' },
      h('h2', { style: 'margin:0' }, '¡Entrenamiento guardado! 💪'),
      h('p', { style: 'margin:4px 0 0' }, prs ? `Rompiste ${prs} récord${prs > 1 ? 's' : ''} personal${prs > 1 ? 'es' : ''}.` : 'Sin récords nuevos esta vez.')) : null,
    h('h1', {}, w.name),
    h('p', { class: 'muted' }, `${fmtTime(w.started_at)}, ${fmtDate(w.started_at)}`),
    summaryBlock(w, marks),
    w.notes ? h('p', {}, w.notes) : null,
    w.exercises.map((e, ei) => {
      let n = 0;
      return h('div', { class: 'card' },
        h('a', { href: `#/exercise/${encodeURIComponent(e.exercise_id)}`, style: 'font-weight:700' }, exerciseName(e.exercise_id, e.name)),
        e.notes ? h('div', { class: 'muted small' }, e.notes) : null,
        h('table', {}, e.sets.map((s, si) => h('tr', {},
          h('td', { class: 'left', style: 'width:40px' }, !s.type || s.type === 'N' ? ++n : s.type),
          h('td', { class: 'left' }, fmtSet(s), s.rpe ? h('span', { class: 'muted small' }, ` @${s.rpe}`) : '',
            (marks?.get(`${ei}:${si}`) || []).map((b) => h('span', { class: 'badge' }, `🏆 ${b}`)))))));
    }),
    h('button', { class: 'block', onclick: () => { location.hash = `#/workout/${w.id}/edit`; } }, 'Editar'),
    h('button', { class: 'block', onclick: () => startWorkout({ from: w }) }, 'Repetir este entrenamiento'),
    h('button', {
      class: 'block',
      onclick: () => {
        const name = prompt('Nombre de la plantilla', w.name);
        if (!name) return;
        upsert('templates', templateFromWorkout(w, name));
        location.hash = '#/train';
      },
    }, 'Guardar como plantilla'),
    h('button', {
      class: 'block danger',
      onclick: () => { if (confirm('¿Eliminar este entrenamiento?')) { remove('workouts', w.id); location.hash = '#/history'; } },
    }, 'Eliminar'));
}

export function workoutEditView(root, id) {
  const w = workoutById(id);
  if (!w) { location.hash = '#/history'; return; }
  return editorView(root, {
    mode: 'edit',
    doc: JSON.parse(JSON.stringify(w)),
    onDone: () => { location.hash = `#/workout/${id}`; },
  });
}

export function calendarView(root) {
  const days = new Set(state.workouts.map((w) => dayKey(w.started_at)));
  const today = dayKey(new Date());
  const now = new Date();
  const first = state.workouts.length ? new Date(state.workouts.at(-1).started_at) : now;
  const months = [];
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push(new Date(d));
  }
  const monthBlock = (m) => {
    const cells = ['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((x) => h('div', { class: 'muted' }, x));
    for (let i = 0; i < m.getDay(); i++) cells.push(h('div'));
    const count = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    let trained = 0;
    for (let d = 1; d <= count; d++) {
      const key = dayKey(new Date(m.getFullYear(), m.getMonth(), d));
      const has = days.has(key);
      if (has) trained++;
      cells.push(h('div', {
        class: has ? 'has' : key === today ? 'today' : '',
        onclick: has ? () => { location.hash = `#/history?day=${key}`; } : null,
      }, d));
    }
    return h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('strong', {}, fmtDate(m, { month: 'long', year: 'numeric' })), h('span', { class: 'muted small' }, `${trained} día${trained === 1 ? "" : "s"}`)),
      h('div', { class: 'cal' }, cells));
  };
  mount(root,
    h('button', { onclick: () => { location.hash = '#/history'; } }, '← Historial'),
    h('h1', {}, 'Calendario'),
    months.map(monthBlock));
  window.scrollTo(0, document.body.scrollHeight);
}
