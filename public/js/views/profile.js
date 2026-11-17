// Perfil: resumen, gráficos generales, importar/exportar y ajustes.
import { h, mount, toast, download, fmtNum, dayKey, num } from '../ui.js';
import { state, upsert, getSettings, saveSettings, pendingCount, flush, refresh } from '../data.js';
import { setKey, getKey, api } from '../api.js';
import { loadCatalog, catalogSize } from '../catalog.js';
import { weeklySummary } from '../stats.js';
import { barChart, chartCard, rangeChips, vol, volAxis, num as fnum, dateShort } from '../charts.js';
import { analyzeStrongCSV, exportStrongCSV, splitExisting } from '../strong-csv.js';

let profileRange = 12;
const PROFILE_RANGES = [[12, '12 semanas'], [26, '6 meses'], [52, '1 año']];

function weeklyCharts(weeks, rerender) {
  const label = (d) => `Semana del ${dateShort(d)}`;
  const bars = (key) => weeks.map((w, i) => ({ date: w.date, value: w[key], label: label(w.date), partial: i === weeks.length - 1 }));
  const done = weeks.slice(0, -1); // semanas completas
  const avg = (key) => (done.length ? done.reduce((a, w) => a + w[key], 0) / done.length : 0);
  const now = weeks.at(-1);
  const times = (v) => `${fnum(v, ',~f')} ${v === 1 ? 'entrenamiento' : 'entrenamientos'}`;
  return [
    rangeChips(PROFILE_RANGES, profileRange, (v) => { profileRange = v; rerender(); }),
    chartCard({
      title: 'Entrenamientos por semana',
      sub: `Promedio: ${fnum(avg('count'))} por semana`,
      value: `${now.count}`, delta: { dir: 'flat', text: 'esta semana' },
      chart: barChart({ bars: bars('count'), format: times, axisFormat: (v) => fnum(v, ',~f'), integer: true, title: 'Entrenamientos por semana' }),
    }),
    chartCard({
      title: 'Volumen por semana',
      sub: `Promedio: ${vol(avg('volume'))} por semana · kg × reps`,
      value: vol(now.volume), delta: { dir: 'flat', text: 'esta semana' },
      chart: barChart({ bars: bars('volume'), format: vol, axisFormat: volAxis, title: 'Volumen por semana' }),
    }),
  ];
}

export function profileView(root) {
  const settings = getSettings();
  const weeks = weeklySummary(state.workouts, profileRange);
  const status = h('p', { class: 'muted small' }, 'Comprobando servidor…');
  api('GET', 'health').then((r) => { status.textContent = `Servidor OK · almacenamiento: ${r.storage} · catálogo: ${catalogSize()} ejercicios`; })
    .catch((e) => { status.textContent = `Servidor no disponible (${e.message}). Los cambios se guardan en el teléfono y se sincronizan después.`; });

  const fileInput = h('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none', onchange: (e) => importFile(e.target.files[0]) });
  const backupInput = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: (e) => restoreBackup(e.target.files[0]) });
  const toggle = (key, label) => h('label', { class: 'row between', style: 'color:inherit;font-size:16px' }, label,
    h('input', { type: 'checkbox', checked: settings[key], style: 'width:auto;min-height:0', onchange: (e) => { saveSettings({ [key]: e.target.checked }); toast('Guardado'); } }));

  mount(root,
    h('h1', {}, 'Perfil'),
    h('p', {}, h('strong', {}, `${state.workouts.length} entrenamientos`)),
    pendingCount() ? h('p', { class: 'muted' }, `${pendingCount()} cambio(s) sin sincronizar${state.syncError ? ` (${state.syncError})` : ''} `,
      h('button', { class: 'small', onclick: () => flush() }, 'Reintentar')) : null,
    weeklyCharts(weeks, () => profileView(root)),

    h('h2', {}, 'Datos'),
    fileInput,
    h('button', { class: 'block', onclick: () => fileInput.click() }, 'Importar CSV de Strong'),
    h('p', { class: 'muted small' }, 'En Strong: Ajustes → Exportar datos. Reimportar el mismo archivo no duplica entrenamientos.'),
    h('button', { class: 'block', onclick: () => download(`gymlog-${dayKey(new Date())}.csv`, exportStrongCSV(state.workouts), 'text/csv') }, 'Exportar CSV (formato Strong)'),
    h('button', {
      class: 'block',
      onclick: () => download(`gymlog-backup-${dayKey(new Date())}.json`,
        JSON.stringify({ workouts: state.workouts, templates: state.templates, exercises: state.exercises }, null, 1), 'application/json'),
    }, 'Descargar respaldo completo (JSON)'),
    backupInput,
    h('button', { class: 'block', onclick: () => backupInput.click() }, 'Restaurar respaldo (JSON)'),
    h('p', { class: 'muted small' }, 'Restaurar combina el respaldo con lo que ya tienes: no borra nada.'),

    h('h2', {}, 'Ajustes'),
    h('label', {}, 'Descanso por defecto (segundos)'),
    h('input', {
      type: 'number', inputmode: 'numeric', value: settings.defaultRest,
      onchange: (e) => { saveSettings({ defaultRest: Number(e.target.value) || 0 }); toast('Guardado'); },
    }),
    toggle('rpe', 'Registrar RPE por serie'),
    toggle('wake', 'Pantalla encendida durante el entrenamiento'),
    h('div', { class: 'row' },
      h('div', { style: 'width:110px' }, h('label', {}, 'Barra (kg)'),
        h('input', { inputmode: 'decimal', value: fmtNum(settings.bar, 2), onchange: (e) => { saveSettings({ bar: num(e.target.value) || 20 }); toast('Guardado'); } })),
      h('div', { class: 'grow' }, h('label', {}, 'Discos disponibles (kg)'),
        h('input', {
          value: settings.plates.map((p) => fmtNum(p, 2)).join('; '),
          onchange: (e) => {
            const plates = e.target.value.split(/[;\s]+/).map(num).filter((v) => v > 0);
            if (plates.length) { saveSettings({ plates }); toast('Guardado'); }
          },
        }))),
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
        `${res.duplicates ? `${res.duplicates} se omiten porque ya tienes un entrenamiento a esa misma hora.\n` : ''}` +
        `${res.lbs ? 'Los pesos venían en libras y se convertirán a kg.\n' : ''}` +
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

  async function restoreBackup(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.workouts) || !Array.isArray(data.templates) || !Array.isArray(data.exercises)) {
        throw new Error('No es un respaldo de GymLog');
      }
      const { fresh, duplicates } = splitExisting(data.workouts.filter((w) => w?.id && w.started_at));
      if (!confirm(`El respaldo tiene ${data.workouts.length} entrenamientos, ${data.templates.length} plantillas y ${data.exercises.length} ejercicios propios.` +
        `${duplicates ? `\n${duplicates} se omiten porque ya tienes uno a esa misma hora.` : ''}\n\n¿Restaurar?`)) return;
      if (data.exercises.length) upsert('exercises', data.exercises);
      if (data.templates.length) upsert('templates', data.templates);
      for (let i = 0; i < fresh.length; i += 100) upsert('workouts', fresh.slice(i, i + 100));
      toast('Respaldo restaurado');
      profileView(root);
    } catch (e) {
      alert(`No se pudo restaurar: ${e.message}`);
    }
  }
}
