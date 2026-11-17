// Pantalla Entrenar: inicio rápido y plantillas.
import { h, mount, uid, fmtDate } from '../ui.js';
import { state, upsert, templateById, getActive } from '../data.js';
import { exerciseName } from '../catalog.js';
import { startWorkout, editorView } from './editor.js';

export function trainView(root) {
  const lastDone = (t) => state.workouts.find((w) => w.template_id === t.id)?.started_at;
  const card = (t) => h('div', { class: 'card' },
    h('strong', {}, t.name),
    h('div', { class: 'muted small', style: 'margin:4px 0' },
      t.exercises.map((e) => `${e.sets.length} × ${exerciseName(e.exercise_id, e.name)}`).join(', ') || 'Sin ejercicios'),
    h('div', { class: 'muted small' }, lastDone(t) ? `Último: ${fmtDate(lastDone(t), { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Nunca realizada'),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'primary', onclick: () => startWorkout({ template: t }) }, 'Entrenar'),
      h('button', { onclick: () => { location.hash = `#/template/${t.id}`; } }, 'Editar'),
      h('button', {
        onclick: () => upsert('templates', { ...JSON.parse(JSON.stringify(t)), id: uid('t_'), name: `${t.name} (copia)`, position: state.templates.length }),
      }, 'Duplicar')));

  mount(root,
    h('h1', {}, 'Entrenar'),
    getActive()
      ? h('button', { class: 'block ok', onclick: () => { location.hash = '#/workout'; } }, 'Continuar entrenamiento en curso')
      : h('button', { class: 'block primary', onclick: () => startWorkout() }, 'Iniciar un entrenamiento vacío'),
    h('div', { class: 'row between' },
      h('h2', {}, `Plantillas (${state.templates.length})`),
      h('button', { onclick: () => { location.hash = '#/template/new'; } }, '+ Plantilla')),
    state.templates.length ? state.templates.map(card)
      : h('p', { class: 'muted' }, 'Crea una plantilla, o guarda un entrenamiento del historial como plantilla.'));
}

export function templateEditView(root, id) {
  const existing = id !== 'new' && templateById(id);
  const doc = existing ? JSON.parse(JSON.stringify(existing))
    : { id: uid('t_'), name: 'Nueva plantilla', folder: '', notes: '', position: state.templates.length, exercises: [] };
  return editorView(root, { mode: 'template', doc, onDone: () => { location.hash = '#/train'; } });
}
