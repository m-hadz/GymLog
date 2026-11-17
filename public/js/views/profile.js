// Perfil: resumen, gráficos generales, importar/exportar y ajustes.
import { h, mount, toast, download, fmtNum, dayKey } from '../ui.js';
import { state, upsert, getSettings, saveSettings, pendingCount, flush, refresh } from '../data.js';
import { setKey, getKey, api } from '../api.js';
import { loadCatalog, catalogSize } from '../catalog.js';
import { weeklySummary, workoutVolume } from '../stats.js';
import { barChart } from '../charts.js';
import { analyzeStrongCSV, exportStrongCSV } from '../strong-csv.js';

export function profileView(root) {
  const settings = getSettings();
  const weeks = weeklySummary(state.workouts, 12);
  const label = (d) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  const totalVol = state.workouts.reduce((a, w) => a + workoutVolume(w), 0);
  const status = h('p', { class: 'muted small' }, 'Comprobando servidor…');
  api('GET', 'health').then((r) => { status.textContent = `Servidor OK · almacenamiento: ${r.storage} · catálogo: ${catalogSize()} ejercicios`; })
    .catch((e) => { status.textContent = `Servidor no disponible (${e.message}). Los cambios se guardan en el teléfono y se sincronizan después.`; });

  const fileInput = h('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none', onchange: (e) => importFile(e.target.files[0]) });

  mount(root,
    h('h1', {}, 'Perfil'),
    h('p', {}, h('strong', {}, `${state.workouts.length} entrenamientos`), ` · ${fmtNum(totalVol / 1000, 1)} t levantadas en total`),
    pendingCount() ? h('p', { class: 'muted' }, `${pendingCount()} cambio(s) sin sincronizar${state.syncError ? ` (${state.syncError})` : ''} `,
      h('button', { class: 'small', onclick: () => flush() }, 'Reintentar')) : null,
    h('h3', {}, 'Entrenamientos por semana'),
    barChart(weeks.map((w) => ({ label: label(w.date), y: w.count })), ''),
    h('h3', {}, 'Volumen por semana'),
    barChart(weeks.map((w) => ({ label: label(w.date), y: w.volume })), 'kg'),

    h('h2', {}, 'Datos'),
    fileInput,
    h('button', { class: 'block', onclick: () => fileInput.click() }, 'Importar CSV de Strong'),
    h('p', { class: 'muted small' }, 'En Strong: Ajustes → Exportar datos. Reimportar el mismo archivo no duplica entrenamientos.'),
    h('button', { class: 'block', onclick: () => download(`gymlog-${dayKey(new Date())}.csv`, exportStrongCSV(state.workouts), 'text/csv') }, 'Exportar CSV (formato Strong)'),
    h('button', {
      class: 'block',
      onclick: () => download(`gymlog-backup-${dayKey(new Date())}.json`,
        JSON.stringify({ workouts: state.workouts, templates: state.templates, exercises: state.exercises }, null, 1), 'application/json'),
    }, 'Respaldo completo (JSON)'),

    h('h2', {}, 'Ajustes'),
    h('label', {}, 'Descanso por defecto (segundos)'),
    h('input', {
      type: 'number', inputmode: 'numeric', value: settings.defaultRest,
      onchange: (e) => { saveSettings({ defaultRest: Number(e.target.value) || 0 }); toast('Guardado'); },
    }),
    h('label', {}, 'Clave de acceso de este dispositivo'),
    h('div', { class: 'row' },
      h('input', { class: 'grow', type: 'password', value: getKey(), id: 'key-input', style: 'flex:1' }),
      h('button', {
        onclick: () => { setKey(document.getElementById('key-input').value); refresh().then(() => toast('Conectado')).catch((e) => toast(e.message)); },
      }, 'Guardar')),
    h('button', { class: 'block', onclick: () => refresh().then(() => toast('Datos actualizados')).catch((e) => toast(e.message)) }, 'Recargar datos del servidor'),
    status);

  async function importFile(file) {
    if (!file) return;
    await loadCatalog(); // para vincular imágenes automáticamente
    try {
      const res = analyzeStrongCSV(await file.text());
      const msg = `Se encontraron ${res.workouts.length} entrenamientos (${res.setCount} series).\n` +
        `${res.alreadyImported ? `${res.alreadyImported} ya estaban importados y se actualizarán.\n` : ''}` +
        `${res.newExercises.length} ejercicios nuevos (${res.linked} con imagen del catálogo).\n\n¿Importar?`;
      if (!confirm(msg)) return;
      if (res.newExercises.length) upsert('exercises', res.newExercises);
      for (let i = 0; i < res.workouts.length; i += 100) upsert('workouts', res.workouts.slice(i, i + 100));
      toast(`Importados ${res.workouts.length} entrenamientos`);
      profileView(root);
    } catch (e) {
      alert(`No se pudo importar: ${e.message}`);
    }
  }
}
