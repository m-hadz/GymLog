// Datos: importar CSV de Strong, exportar, respaldo y restauración.
import { useRef } from 'react';
import { IconDatabaseExport, IconFileImport, IconFileSpreadsheet, IconRestore } from '@tabler/icons-react';
import { alertDialog, confirmDialog, notify } from '../../components/dialogs.jsx';
import { loadCatalog } from '../../lib/catalog.js';
import { state, upsert } from '../../lib/data.js';
import { dayKey, download } from '../../lib/format.js';
import { analyzeStrongCSV, exportStrongCSV, splitExisting } from '../../lib/strong-csv.js';
import { SettingsGroup, SettingsRow } from './SettingsList.jsx';

const chunks = (list, n = 100) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

async function importFile(file) {
  if (!file) return;
  try {
    await loadCatalog(); // para vincular imágenes automáticamente
    const res = analyzeStrongCSV(await file.text());
    const lines = [
      `Se encontraron ${plural(res.workouts.length, 'entrenamiento', 'entrenamientos')} (${plural(res.setCount, 'serie', 'series')}).`,
      res.alreadyImported ? `${res.alreadyImported} ya estaban importados y se actualizarán.` : null,
      res.duplicates ? `${res.duplicates} se omiten porque ya tienes un entrenamiento a esa misma hora.` : null,
      res.lbs ? 'Los pesos venían en libras y se convertirán a kg.' : null,
      `${plural(res.newExercises.length, 'ejercicio nuevo', 'ejercicios nuevos')} (${res.linked} con imagen del catálogo).`,
    ].filter(Boolean);
    const ok = await confirmDialog({ title: 'Importar de Strong', message: lines.join('\n'), confirmLabel: 'Importar' });
    if (!ok) return;
    if (res.newExercises.length) upsert('exercises', res.newExercises);
    for (const part of chunks(res.workouts)) upsert('workouts', part);
    notify.success(`Importados ${res.workouts.length} entrenamientos`);
  } catch (e) {
    await alertDialog({ title: 'No se pudo importar', message: e.message });
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
    const message = `El respaldo tiene ${plural(data.workouts.length, 'entrenamiento', 'entrenamientos')}, `
      + `${plural(data.templates.length, 'plantilla', 'plantillas')} y ${plural(data.exercises.length, 'ejercicio propio', 'ejercicios propios')}.`
      + `${duplicates ? `\n${duplicates} se omiten porque ya tienes uno a esa misma hora.` : ''}`
      + '\n\nSe combina con lo que ya tienes: no se borra nada.';
    if (!await confirmDialog({ title: 'Restaurar respaldo', message, confirmLabel: 'Restaurar' })) return;
    if (data.exercises.length) upsert('exercises', data.exercises);
    const prefs = Array.isArray(data.exercise_prefs) ? data.exercise_prefs.filter((p) => p?.id) : [];
    if (prefs.length) upsert('exercise_prefs', prefs);
    const body = Array.isArray(data.body_metrics) ? data.body_metrics.filter((b) => b?.id && b.date) : [];
    if (body.length) upsert('body_metrics', body);
    // Meta de constancia y pausas (feature 09): solo si aquí aún no hay
    const us = Array.isArray(data.user_settings) ? data.user_settings.find((r) => r?.id === 'me' && r.data && typeof r.data === 'object') : null;
    if (us && !state.user_settings.length) upsert('user_settings', { id: 'me', data: us.data });
    // Programas (feature 12): los que aún no existen aquí
    const progs = Array.isArray(data.programs) ? data.programs.filter((p) => p?.id && !state.programs.some((x) => x.id === p.id)) : [];
    if (progs.length) upsert('programs', progs);
    if (data.templates.length) upsert('templates', data.templates);
    for (const part of chunks(fresh)) upsert('workouts', part);
    notify.success('Respaldo restaurado');
  } catch (e) {
    await alertDialog({ title: 'No se pudo restaurar', message: e.message });
  }
}

// El input se vacía tras elegir para poder volver a elegir el mismo archivo.
const onPick = (fn) => (e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; fn(f); };

export function DataSection() {
  const csvRef = useRef(null);
  const jsonRef = useRef(null);
  const today = () => dayKey(new Date());

  return (
    <>
      <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={onPick(importFile)} />
      <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={onPick(restoreBackup)} />

      <SettingsGroup footer="En Strong: Ajustes → Exportar datos. Reimportar el mismo archivo no duplica entrenamientos.">
        <SettingsRow
          icon={IconFileImport}
          label="Importar CSV de Strong"
          description="Trae tu historial completo"
          onClick={() => csvRef.current?.click()}
          data-testid="import-csv"
        />
        <SettingsRow
          icon={IconFileSpreadsheet}
          color="teal"
          label="Exportar CSV"
          description="Formato Strong, compatible con hojas de cálculo"
          onClick={() => download(`gymlog-${today()}.csv`, exportStrongCSV(state.workouts), 'text/csv')}
        />
      </SettingsGroup>

      <SettingsGroup footer="Restaurar combina el respaldo con lo que ya tienes: no borra nada.">
        <SettingsRow
          icon={IconDatabaseExport}
          color="grape"
          label="Descargar respaldo completo (JSON)"
          description="Entrenamientos, plantillas, ejercicios, ajustes y peso corporal"
          onClick={() => download(
            `gymlog-backup-${today()}.json`,
            JSON.stringify({
              workouts: state.workouts, templates: state.templates, exercises: state.exercises,
              exercise_prefs: state.exercise_prefs, body_metrics: state.body_metrics, user_settings: state.user_settings,
              programs: state.programs,
            }, null, 1),
            'application/json',
          )}
        />
        <SettingsRow
          icon={IconRestore}
          color="orange"
          label="Restaurar respaldo (JSON)"
          description="Desde un archivo descargado antes"
          onClick={() => jsonRef.current?.click()}
        />
      </SettingsGroup>
    </>
  );
}
