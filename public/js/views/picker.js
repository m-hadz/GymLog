// Selector de ejercicios (modal) y lista reutilizable de ejercicios.
import { h, mount, openModal, select, uid, toast } from '../ui.js';
import { state, upsert } from '../data.js';
import { allExercises, filterExercises, BODY_PARTS, CATEGORIES, loadCatalog, catalogSize, getExercise } from '../catalog.js';

export function thumb(ex) {
  if (ex?.images?.length) return h('img', { class: 'thumb', src: ex.images[0], loading: 'lazy', alt: '', crossorigin: 'anonymous' });
  return h('div', { class: 'thumb' }, (ex?.name || '?')[0].toUpperCase());
}

export function recentExerciseIds(limit = 15) {
  const seen = new Set();
  for (const w of state.workouts) {
    for (const e of w.exercises || []) {
      seen.add(e.exercise_id);
      if (seen.size >= limit) return [...seen];
    }
  }
  return [...seen];
}

// Lista filtrable. onPick(ex) al tocar; selected: Set de ids marcados.
export function exerciseList({ filters, onPick, selected, catalogOnly = false }) {
  const listEl = h('div');
  const MAX = 150;
  const draw = () => {
    let list = allExercises();
    if (catalogOnly) list = list.filter((e) => !e.custom);
    const res = filterExercises(list, filters);
    const items = [];
    if (!filters.q && !filters.bodyPart && !filters.category && !catalogOnly) {
      const rec = recentExerciseIds().map(getExercise).filter(Boolean);
      if (rec.length) {
        items.push(h('h3', {}, 'Recientes'), rec.map((e) => row(e)), h('h3', {}, 'Todos'));
      }
    }
    items.push(res.slice(0, MAX).map((e) => row(e)));
    if (res.length > MAX) items.push(h('p', { class: 'muted small' }, `…y ${res.length - MAX} más. Escribe para filtrar.`));
    if (!res.length) items.push(h('p', { class: 'muted' }, 'Sin resultados.'));
    if (!catalogSize()) items.push(h('p', { class: 'muted small' }, 'Cargando catálogo de ejercicios…'));
    mount(listEl, items);
  };
  const row = (e) => h('div', {
    class: `list-item${selected?.has(e.id) ? ' sel' : ''}`,
    onclick: () => { onPick(e); draw(); },
  }, thumb(e), h('div', { class: 'grow' }, h('div', {}, e.name, e.custom ? h('span', { class: 'badge' }, 'propio') : ''),
    h('div', { class: 'muted small' }, `${e.bodyPart} · ${e.category}`)));

  const controls = h('div', {},
    h('input', {
      type: 'search', placeholder: 'Buscar', value: filters.q,
      oninput: (ev) => { filters.q = ev.target.value; draw(); },
    }),
    h('div', { class: 'row', style: 'margin-top:6px' },
      h('div', { class: 'grow' }, select([['', 'Cualquier parte del cuerpo'], ...BODY_PARTS], filters.bodyPart,
        (v) => { filters.bodyPart = v; draw(); })),
      h('div', { class: 'grow' }, select([['', 'Cualquier categoría'], ...CATEGORIES], filters.category,
        (v) => { filters.category = v; draw(); }))));
  draw();
  if (!catalogSize()) loadCatalog().then(draw);
  return { el: h('div', {}, controls, listEl), redraw: draw };
}

// Modal para elegir uno o varios ejercicios
export function openPicker({ multi = true, catalogOnly = false, title = 'Añadir ejercicios', initialQuery = '', onDone }) {
  const selected = new Set();
  const filters = { q: initialQuery, bodyPart: '', category: '' };
  let list;
  openModal((close) => {
    const addBtn = h('button', { class: 'primary', disabled: selected.size === 0 }, multi ? `Añadir (${selected.size})` : 'Elegir');
    addBtn.onclick = () => { close(); onDone([...selected]); };
    list = exerciseList({
      filters, selected, catalogOnly,
      onPick: (e) => {
        if (!multi) { close(); onDone([e.id]); return; }
        if (selected.has(e.id)) selected.delete(e.id); else selected.add(e.id);
        addBtn.disabled = selected.size === 0;
        addBtn.textContent = `Añadir (${selected.size})`;
      },
    });
    return [
      h('div', { class: 'row between' },
        h('button', { onclick: close }, '✕'),
        h('strong', {}, title),
        multi ? addBtn : h('span')),
      catalogOnly ? null : h('button', {
        class: 'small', style: 'margin:8px 0',
        onclick: () => {
          close();
          openExerciseForm(null, (ex) => onDone([ex.id]), filters.q);
        },
      }, '+ Crear ejercicio propio'),
      list.el,
    ];
  });
}

// Crear / editar un ejercicio propio
export function openExerciseForm(row, onSaved, presetName = '') {
  const draft = row ? { ...row } : {
    id: uid('c_'), name: presetName, body_part: 'Otro', category: 'Otro', catalog_id: null,
    instructions: '', rest_seconds: null,
  };
  openModal((close, rerender) => {
    const linked = draft.catalog_id ? getExercise(draft.catalog_id) : null;
    return [
      h('div', { class: 'row between' }, h('button', { onclick: close }, 'Cancelar'),
        h('strong', {}, row ? 'Editar ejercicio' : 'Nuevo ejercicio'),
        h('button', {
          class: 'primary',
          onclick: () => {
            if (!draft.name.trim()) { toast('Ponle un nombre'); return; }
            draft.name = draft.name.trim();
            upsert('exercises', draft);
            close();
            onSaved?.(draft);
          },
        }, 'Guardar')),
      h('label', {}, 'Nombre'),
      h('input', { value: draft.name, oninput: (e) => { draft.name = e.target.value; } }),
      h('label', {}, 'Parte del cuerpo'),
      select(BODY_PARTS, draft.body_part, (v) => { draft.body_part = v; }),
      h('label', {}, 'Categoría'),
      select(CATEGORIES, draft.category, (v) => { draft.category = v; }),
      h('label', {}, 'Descanso por defecto (segundos, vacío = el general)'),
      h('input', {
        type: 'number', inputmode: 'numeric', value: draft.rest_seconds ?? '',
        oninput: (e) => { draft.rest_seconds = e.target.value ? Number(e.target.value) : null; },
      }),
      h('label', {}, 'Imagen e instrucciones del catálogo'),
      h('div', { class: 'row' },
        linked ? h('span', { class: 'grow' }, linked.name) : h('span', { class: 'grow muted' }, 'Sin vincular'),
        h('button', {
          class: 'small',
          onclick: () => openPicker({
            multi: false, catalogOnly: true, title: 'Vincular con…', initialQuery: draft.name.replace(/\(.*?\)/g, ''),
            onDone: ([id]) => {
              draft.catalog_id = id;
              const ex = getExercise(id);
              if (ex && draft.body_part === 'Otro') draft.body_part = ex.bodyPart;
              rerender();
            },
          }),
        }, linked ? 'Cambiar' : 'Vincular'),
        linked ? h('button', { class: 'small', onclick: () => { draft.catalog_id = null; rerender(); } }, 'Quitar') : null),
      h('label', {}, 'Notas / instrucciones propias (una por línea)'),
      h('textarea', { oninput: (e) => { draft.instructions = e.target.value; } }, draft.instructions || ''),
    ];
  });
}
