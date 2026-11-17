// Lista de ejercicios y ficha de ejercicio (descripción, historial, gráficas, registros).
import { h, mount, fmtDate, fmtNum, fmtSet, fmtTime } from '../ui.js';
import { state, remove } from '../data.js';
import { getExercise, loadCatalog } from '../catalog.js';
import { exerciseSessions, exerciseRecords, computePRs, e1rm } from '../stats.js';
import { lineChart, chartCard, deltaOf, rangeChips, kg, kgAxis, num } from '../charts.js';
import { exerciseList, openExerciseForm } from './picker.js';

const filters = { q: '', bodyPart: '', category: '' };

export function exercisesView(root) {
  const list = exerciseList({ filters, onPick: (e) => { location.hash = `#/exercise/${encodeURIComponent(e.id)}`; } });
  mount(root,
    h('div', { class: 'row between' }, h('h1', {}, 'Ejercicios'),
      h('button', { onclick: () => openExerciseForm(null, (ex) => { location.hash = `#/exercise/${ex.id}`; }) }, '+ Nuevo')),
    list.el);
}

export function exerciseDetailView(root, id) {
  const draw = () => mount(root,
    h('button', { onclick: () => history.back() }, '← Volver'),
    renderExerciseDetail(id, draw));
  draw();
  loadCatalog().then(draw);
}

let lastTab = 'about';
let chartRange = 'all';
const CHART_RANGES = [['1m', '1M', 31], ['3m', '3M', 92], ['6m', '6M', 183], ['1y', '1A', 366], ['all', 'Todo', null]];

export function renderExerciseDetail(id, redraw) {
  const ex = getExercise(id);
  const wrap = h('div');
  const sessions = exerciseSessions(state.workouts, id);
  const nameFallback = sessions.at(-1)?.workout.exercises.find((e) => e.exercise_id === id)?.name;
  let tab = lastTab;

  const tabs = [['about', 'Descripción'], ['history', 'Historial'], ['charts', 'Gráficas'], ['records', 'Registros']];
  const body = h('div');
  const bar = h('div', { class: 'tabsbar' });
  const show = (t) => {
    tab = lastTab = t;
    mount(bar, tabs.map(([k, label]) => h('button', { class: k === tab ? 'on' : '', onclick: () => show(k) }, label)));
    mount(body, { about, history: historyTab, charts, records }[tab]());
  };

  function about() {
    if (!ex) return h('p', { class: 'muted' }, 'Este ejercicio ya no existe en el catálogo (se conserva tu historial).');
    const out = [];
    if (ex.images.length) {
      const imgs = ex.images.slice(0, 2).map((src) => h('img', { src, alt: ex.name, loading: 'lazy', crossorigin: 'anonymous' }));
      out.push(h('div', { class: 'ex-images' }, imgs));
    }
    out.push(h('p', { class: 'muted' }, `${ex.bodyPart} · ${ex.category}${ex.level ? ` · ${ex.level}` : ''}`));
    if (ex.primary.length) out.push(h('p', {}, h('strong', {}, 'Músculos: '), ex.primary.join(', '),
      ex.secondary.length ? h('span', { class: 'muted' }, ` (secundarios: ${ex.secondary.join(', ')})`) : ''));
    if (ex.custom && ex.linkedName) out.push(h('p', { class: 'muted small' }, `Imagen e instrucciones de: ${ex.linkedName}`));
    if (ex.instructions.length) out.push(h('h3', {}, 'Instrucciones'), h('ol', {}, ex.instructions.map((i) => h('li', {}, i))));
    if (ex.custom) {
      out.push(h('div', { class: 'row' },
        h('button', { onclick: () => openExerciseForm(ex.row, () => redraw?.()) }, 'Editar'),
        h('button', {
          class: 'danger',
          onclick: () => {
            if (confirm(`¿Eliminar "${ex.name}"? Tu historial se conserva con el nombre guardado.`)) {
              remove('exercises', ex.id);
              history.back();
            }
          },
        }, 'Eliminar')));
    }
    return out;
  }

  function historyTab() {
    if (!sessions.length) return h('p', { class: 'muted' }, 'Todavía no has hecho este ejercicio.');
    const prs = computePRs(state.workouts);
    return [...sessions].reverse().map((sess) => {
      const w = sess.workout;
      const marks = prs.get(w.id);
      const rows = [];
      w.exercises.forEach((e, ei) => {
        if (e.exercise_id !== id) return;
        let n = 0;
        e.sets.forEach((s, si) => {
          if (s.done === false) return;
          const label = !s.type || s.type === 'N' ? ++n : s.type;
          const badges = (marks?.get(`${ei}:${si}`) || []).map((b) => h('span', { class: 'badge' }, `🏆 ${b}`));
          rows.push(h('tr', {}, h('td', { class: 'left' }, label), h('td', { class: 'left' }, fmtSet(s), badges),
            h('td', {}, s.type !== 'W' && s.weight ? fmtNum(e1rm(s.weight, s.reps), 0) : '')));
        });
        if (e.notes) rows.push(h('tr', {}, h('td', { colspan: 3, class: 'left muted small' }, e.notes)));
      });
      return h('div', { class: 'card click', onclick: () => { location.hash = `#/workout/${w.id}`; } },
        h('strong', {}, w.name),
        h('div', { class: 'muted small' }, `${fmtTime(w.started_at)}, ${fmtDate(w.started_at)}`),
        h('table', {}, h('tr', {}, h('th', { class: 'left' }, 'Serie'), h('th', { class: 'left' }, ''), h('th', {}, '1RM est.')), rows));
    });
  }

  function charts() {
    if (!sessions.length) return h('p', { class: 'muted' }, 'Sin datos todavía.');
    const range = CHART_RANGES.find((r) => r[0] === chartRange) || CHART_RANGES.at(-1);
    const since = range[2] ? Date.now() - range[2] * 864e5 : 0;
    const sess = sessions.filter((s) => new Date(s.workout.started_at).getTime() >= since);
    const chips = rangeChips(CHART_RANGES.map(([k, l]) => [k, l]), chartRange, (v) => { chartRange = v; show('charts'); });
    if (!sess.length) return [chips, h('p', { class: 'muted' }, 'No hay sesiones en este periodo.')];
    const pt = (s, value, label) => ({ date: new Date(s.workout.started_at), value, label });
    const series = (n) => `${n} ${n === 1 ? 'serie' : 'series'}`;
    const card = (title, points, format, axisFormat) => chartCard({
      title, sub: `${points.length} ${points.length === 1 ? 'sesión' : 'sesiones'}`,
      value: format(points.at(-1).value), delta: deltaOf(points, format),
      chart: lineChart({ points, format, axisFormat, title }),
    });
    const weighted = sessions.some((s) => s.maxWeight > 0);
    if (!weighted) {
      const reps = (v) => `${num(v, ',~f')} reps`;
      return [chips, card('Máx. repeticiones en una serie',
        sess.filter((s) => s.working.length).map((s) => pt(s, Math.max(...s.working.map((x) => x.reps || 0)), series(s.working.length))),
        reps, (v) => num(v, ',~f'))];
    }
    const ws = sess.filter((s) => s.best);
    const repsAtMax = (s) => Math.max(...s.working.filter((x) => (x.weight || 0) === s.maxWeight).map((x) => x.reps || 0));
    return [chips,
      card('Mejor serie (1RM estimado)', ws.map((s) => pt(s, Math.round(s.bestE1rm * 10) / 10, `Mejor serie: ${fmtSet(s.best)}`)), kg, kgAxis),
      card('Peso máximo', ws.map((s) => pt(s, s.maxWeight, `${fmtNum(s.maxWeight)} kg × ${repsAtMax(s)}`)), kg, kgAxis),
      card('Volumen por sesión', ws.map((s) => pt(s, s.volume, s.working.length === 1 ? '1 serie efectiva' : `${s.working.length} series efectivas`)), kg, kgAxis),
    ];
  }

  function records() {
    if (!sessions.length) return h('p', { class: 'muted' }, 'Sin récords todavía.');
    const r = exerciseRecords(sessions);
    const line = (label, value, extra) => h('tr', {}, h('td', { class: 'left' }, h('strong', {}, label)),
      h('td', { style: 'text-align:right' }, value ?? '—', extra ? h('div', { class: 'muted small' }, extra) : ''));
    const when = (rec) => (rec?.workout ? fmtDate(rec.workout.started_at, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    return [
      h('h3', {}, 'Récords personales'),
      h('table', {},
        line('1RM estimado', r.e1rm && `${fmtNum(r.e1rm.value, 0)} kg`, r.e1rm && `${fmtSet(r.e1rm.set)} · ${when(r.e1rm)}`),
        line('Peso máximo', r.weight && `${fmtNum(r.weight.value)} kg (×${r.weight.set.reps})`, when(r.weight)),
        line('Máx. volumen en una serie', r.setVolume && `${fmtNum(r.setVolume.value)} kg`, r.setVolume && `${fmtSet(r.setVolume.set)} · ${when(r.setVolume)}`),
        line('Máx. volumen en una sesión', r.sessionVolume && `${fmtNum(r.sessionVolume.value)} kg`, when(r.sessionVolume)),
        line('Máx. repeticiones', r.reps && `${r.reps.value}`, when(r.reps)),
        line('Sesiones', String(sessions.length))),
      h('h3', {}, 'Por repeticiones'),
      h('table', {},
        h('tr', {}, h('th', {}, 'Reps'), h('th', {}, 'Mejor rendimiento'), h('th', {}, 'Previsto')),
        r.repTable.map((row) => h('tr', {},
          h('td', {}, row.reps),
          h('td', {}, row.best ? fmtSet(row.best) : '—'),
          h('td', {}, row.predicted ? `${fmtNum(row.predicted, 0)} kg` : '—')))),
      h('p', { class: 'muted small' }, '1RM estimado con la fórmula de Brzycki. "Mejor rendimiento" = mayor peso logrado con al menos esas reps.'),
    ];
  }

  mount(wrap,
    h('h2', {}, ex?.name || nameFallback || 'Ejercicio'),
    bar, body);
  show(tab);
  return wrap;
}
