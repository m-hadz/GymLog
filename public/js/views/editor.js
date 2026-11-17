// Editor de entrenamientos y plantillas. Tres modos:
//  - 'active'   entrenamiento en curso: reloj, ✓ por serie, descanso automático
//  - 'edit'     corregir un entrenamiento ya guardado
//  - 'template' crear o editar una plantilla
import { h, mount, num, toast, uid, fmtClock, fmtSet, fmtNum, toLocalInput, openModal } from '../ui.js';
import { state, upsert, remove, getActive, setActive, clearActive, getSettings, templateById } from '../data.js';
import { getExercise, exerciseName } from '../catalog.js';
import { previousSets } from '../stats.js';
import { startRest, stopRest } from '../rest-timer.js';
import { openPicker } from './picker.js';
import { renderExerciseDetail } from './exercises.js';

const TYPES = ['N', 'W', 'D', 'F'];
const TYPE_HELP = { N: 'Normal', W: 'Calentamiento', D: 'Drop set', F: 'Al fallo' };
const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

export function defaultWorkoutName(d = new Date()) {
  const hr = d.getHours();
  return `Entrenamiento por la ${hr < 12 ? 'mañana' : hr < 20 ? 'tarde' : 'noche'}`;
}

function setsFromHistory(exId) {
  const prev = previousSets(state.workouts, exId);
  if (!prev.length) return [{ type: 'N', weight: null, reps: null, done: false }];
  return prev.slice(0, 10).map((s) => ({ type: s.type || 'N', weight: null, reps: null, done: false }));
}

export function startWorkout({ template = null, from = null } = {}) {
  if (getActive()) {
    if (!confirm('Ya tienes un entrenamiento en curso. ¿Descartarlo y empezar otro?')) return false;
    stopRest();
  }
  const src = template || from;
  const w = {
    id: uid('w_'),
    name: src?.name || defaultWorkoutName(),
    started_at: new Date().toISOString(),
    ended_at: null,
    notes: '',
    template_id: template?.id || null,
    exercises: (src?.exercises || []).map((e) => ({
      exercise_id: e.exercise_id,
      name: exerciseName(e.exercise_id, e.name),
      rest: e.rest ?? null,
      notes: '',
      sets: (e.sets || []).filter((s) => s.done !== false)
        .map((s) => ({ type: s.type || 'N', weight: null, reps: null, done: false, target: { weight: s.weight, reps: s.reps } })),
    })),
  };
  setActive(w);
  location.hash = '#/workout';
  return true;
}

export function templateFromWorkout(w, name = w.name) {
  return {
    id: uid('t_'),
    name,
    folder: '',
    notes: '',
    position: state.templates.length,
    exercises: w.exercises.map((e) => ({
      exercise_id: e.exercise_id,
      name: e.name,
      rest: e.rest ?? null,
      sets: e.sets.filter((s) => s.done !== false).map((s) => ({ type: s.type || 'N', weight: s.weight, reps: s.reps })),
    })),
  };
}

const structure = (exs) => exs.map((e) => `${e.exercise_id}x${e.sets.length}`).join('|');

export function editorView(root, { mode, doc, onDone }) {
  const settings = getSettings();
  const isActive = mode === 'active';
  const isTemplate = mode === 'template';
  let clockTimer;

  const persist = () => { if (isActive) setActive(doc); };
  const restFor = (ex) => ex.rest ?? getExercise(ex.exercise_id)?.rest ?? settings.defaultRest;

  function addExercises(ids) {
    for (const id of ids) {
      doc.exercises.push({
        exercise_id: id, name: exerciseName(id), rest: null, notes: '',
        sets: isTemplate ? [{ type: 'N', weight: null, reps: null }] : setsFromHistory(id).map((s) => ({ ...s, done: !isActive })),
      });
    }
    persist();
    render();
  }

  function finish() {
    let pending = 0;
    doc.exercises.forEach((e) => e.sets.forEach((s) => { if (!s.done) pending++; }));
    if (pending && !confirm(`Hay ${pending} serie(s) sin completar. Se descartarán. ¿Terminar?`)) return;
    const final = JSON.parse(JSON.stringify(doc));
    final.exercises = final.exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done).map(({ target, ...s }) => s) }))
      .filter((e) => e.sets.length);
    if (!final.exercises.length) {
      if (confirm('No completaste ninguna serie. ¿Descartar el entrenamiento?')) {
        clearActive(); stopRest(); location.hash = '#/train';
      }
      return;
    }
    final.ended_at = new Date().toISOString();
    upsert('workouts', final);
    const tpl = final.template_id && templateById(final.template_id);
    if (tpl && structure(tpl.exercises) !== structure(final.exercises) &&
      confirm(`¿Actualizar la plantilla "${tpl.name}" con los ejercicios y series de hoy?`)) {
      upsert('templates', { ...templateFromWorkout(final, tpl.name), id: tpl.id, position: tpl.position, folder: tpl.folder, notes: tpl.notes });
    }
    clearActive();
    stopRest();
    location.hash = `#/workout/${final.id}?done=1`;
  }

  function header() {
    if (isActive) {
      const clock = h('span', { class: 'grow', style: 'font-size:20px' });
      const tickClock = () => { clock.textContent = fmtClock(Date.now() - new Date(doc.started_at)); };
      tickClock();
      clearInterval(clockTimer);
      clockTimer = setInterval(tickClock, 1000);
      return h('div', { class: 'row between' },
        h('button', { onclick: () => openManualRest() }, '⏱'),
        clock,
        h('button', { class: 'ok', onclick: finish }, 'Terminar'));
    }
    return h('div', { class: 'row between' },
      h('button', { onclick: () => onDone(null) }, 'Cancelar'),
      h('strong', {}, isTemplate ? 'Plantilla' : 'Editar entrenamiento'),
      h('button', { class: 'primary', onclick: save }, 'Guardar'));
  }

  function save() {
    if (!doc.name?.trim()) { toast('Ponle un nombre'); return; }
    if (isTemplate) {
      doc.exercises.forEach((e) => { e.sets = e.sets.map(({ type, weight, reps }) => ({ type, weight, reps })); });
      upsert('templates', doc);
    } else {
      if (doc.ended_at && doc.ended_at < doc.started_at) { toast('El término es antes del inicio'); return; }
      doc.exercises.forEach((e) => { e.sets = e.sets.filter((s) => s.reps != null || s.weight != null).map((s) => ({ ...s, done: true, weight: s.weight ?? 0 })); });
      doc.exercises = doc.exercises.filter((e) => e.sets.length);
      upsert('workouts', doc);
    }
    onDone(doc);
  }

  function openManualRest() {
    openModal((close) => [
      h('h3', {}, 'Temporizador de descanso'),
      h('div', { class: 'row' }, [60, 90, 120, 180, 240, 300].map((s) =>
        h('button', { onclick: () => { startRest(s); close(); } }, fmtClock(s * 1000)))),
      h('button', { class: 'block', onclick: () => { stopRest(); close(); } }, 'Detener'),
    ]);
  }

  function infoFields() {
    const fields = [
      h('input', { value: doc.name, style: 'font-size:20px;font-weight:700;margin-top:10px', oninput: (e) => { doc.name = e.target.value; persist(); } }),
    ];
    if (mode === 'edit') {
      fields.push(
        h('label', {}, 'Inicio'),
        h('input', { type: 'datetime-local', value: toLocalInput(doc.started_at), onchange: (e) => { doc.started_at = new Date(e.target.value).toISOString(); } }),
        h('label', {}, 'Término'),
        h('input', { type: 'datetime-local', value: toLocalInput(doc.ended_at || doc.started_at), onchange: (e) => { doc.ended_at = new Date(e.target.value).toISOString(); } }),
      );
    }
    if (isActive) fields.push(h('p', { class: 'muted small' }, new Date(doc.started_at).toLocaleString('es-CL')));
    fields.push(h('textarea', { placeholder: 'Notas', style: 'min-height:40px;margin-top:6px', oninput: (e) => { doc.notes = e.target.value; persist(); } }, doc.notes || ''));
    return fields;
  }

  function exerciseBlock(ex, ei) {
    const prev = previousSets(state.workouts, ex.exercise_id, { excludeId: doc.id, before: mode === 'edit' ? doc.started_at : undefined });
    const move = (d) => {
      const j = ei + d;
      if (j < 0 || j >= doc.exercises.length) return;
      [doc.exercises[ei], doc.exercises[j]] = [doc.exercises[j], doc.exercises[ei]];
      persist(); render();
    };
    let n = 0;
    const rows = ex.sets.map((s, si) => {
      const label = s.type === 'N' || !s.type ? String(++n) : s.type;
      const p = prev[si];
      const ph = p || s.target || {};
      const cells = [
        h('td', {}, h('button', {
          class: 'settype small', title: TYPE_HELP[s.type || 'N'],
          onclick: () => { s.type = TYPES[(TYPES.indexOf(s.type || 'N') + 1) % TYPES.length]; persist(); render(); },
        }, label)),
        h('td', {}, h('button', {
          class: 'prev',
          onclick: () => { if (p) { s.weight = p.weight; s.reps = p.reps; persist(); render(); } },
        }, p ? fmtSet(p) : '—')),
        h('td', {}, h('input', {
          inputmode: 'decimal', placeholder: ph.weight != null ? fmtNum(ph.weight) : 'kg', value: s.weight ?? '',
          oninput: (e) => { s.weight = num(e.target.value); persist(); },
        })),
        h('td', {}, h('input', {
          inputmode: 'numeric', placeholder: ph.reps != null ? String(ph.reps) : 'reps', value: s.reps ?? '',
          oninput: (e) => { s.reps = num(e.target.value); persist(); },
        })),
      ];
      if (isActive) {
        cells.push(h('td', {}, h('button', {
          class: `chk${s.done ? ' on' : ''}`,
          onclick: () => {
            if (!s.done) {
              if (s.weight == null && ph.weight != null) s.weight = ph.weight;
              if (s.reps == null && ph.reps != null) s.reps = ph.reps;
              if (s.reps == null) { toast('Ingresa las repeticiones'); return; }
              s.weight ??= 0;
              s.done = true;
              startRest(restFor(ex));
            } else {
              s.done = false;
            }
            persist(); render();
          },
        }, '✓')));
      }
      cells.push(h('td', {}, h('button', {
        class: 'small danger', title: 'Eliminar serie',
        onclick: () => { ex.sets.splice(si, 1); persist(); render(); },
      }, '✕')));
      return h('tr', { class: s.done && isActive ? 'done' : '' }, cells);
    });

    return h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('a', { href: '#', class: 'grow', style: 'font-weight:700', onclick: (e) => { e.preventDefault(); openModal((close) => [h('button', { onclick: close }, '✕ Cerrar'), renderExerciseDetail(ex.exercise_id)]); } },
          exerciseName(ex.exercise_id, ex.name)),
        h('button', { class: 'small', onclick: () => move(-1) }, '↑'),
        h('button', { class: 'small', onclick: () => move(1) }, '↓'),
        h('button', {
          class: 'small danger',
          onclick: () => {
            if (ex.sets.some((s) => s.done && isActive) && !confirm('¿Quitar este ejercicio y sus series?')) return;
            doc.exercises.splice(ei, 1); persist(); render();
          },
        }, '✕')),
      isTemplate || isActive ? h('div', { class: 'row small muted', style: 'margin-top:4px' }, 'Descanso:',
        h('select', {
          style: 'width:auto;min-height:32px;padding:2px',
          onchange: (e) => { ex.rest = e.target.value === '' ? null : Number(e.target.value); persist(); },
        }, h('option', { value: '', selected: ex.rest == null }, `auto (${fmtClock(restFor({ ...ex, rest: null }) * 1000)})`),
        REST_OPTIONS.map((r) => h('option', { value: r, selected: ex.rest === r }, r ? fmtClock(r * 1000) : 'sin descanso')))) : null,
      !isTemplate ? h('input', {
        placeholder: 'Notas del ejercicio', value: ex.notes || '', style: 'min-height:32px;margin-top:4px;font-size:14px',
        oninput: (e) => { ex.notes = e.target.value; persist(); },
      }) : null,
      h('table', { class: 'sets' },
        h('tr', {}, h('th', {}, 'Serie'), h('th', {}, 'Anterior'), h('th', {}, 'kg'), h('th', {}, 'Reps'), isActive ? h('th', {}, '✓') : null, h('th', {})),
        rows),
      h('button', {
        class: 'block small',
        onclick: () => {
          const last = ex.sets.at(-1);
          ex.sets.push({ type: 'N', weight: last?.weight ?? null, reps: last?.reps ?? null, done: !isActive && !isTemplate });
          persist(); render();
        },
      }, '+ Añadir serie'));
  }

  function render() {
    const y = window.scrollY;
    mount(root,
      header(),
      infoFields(),
      doc.exercises.map(exerciseBlock),
      h('button', { class: 'block primary', onclick: () => openPicker({ onDone: addExercises }) }, 'Añadir ejercicios'),
      isActive ? h('button', {
        class: 'block danger',
        onclick: () => { if (confirm('¿Cancelar y descartar este entrenamiento?')) { clearActive(); stopRest(); location.hash = '#/train'; } },
      }, 'Cancelar entrenamiento') : null,
      mode === 'edit' ? h('button', {
        class: 'block danger',
        onclick: () => { if (confirm('¿Eliminar este entrenamiento?')) { remove('workouts', doc.id); location.hash = '#/history'; } },
      }, 'Eliminar entrenamiento') : null,
      isTemplate && templateById(doc.id) ? h('button', {
        class: 'block danger',
        onclick: () => { if (confirm('¿Eliminar esta plantilla?')) { remove('templates', doc.id); onDone(null); } },
      }, 'Eliminar plantilla') : null);
    window.scrollTo(0, y);
  }

  render();
  return () => clearInterval(clockTimer);
}

export function activeWorkoutView(root) {
  const doc = getActive();
  if (!doc) { location.hash = '#/train'; return; }
  return editorView(root, { mode: 'active', doc });
}
