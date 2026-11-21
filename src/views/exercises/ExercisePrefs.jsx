// Ajustes de un ejercicio (tabla exercise_prefs): tipo (peso y reps, peso corporal, lastre,
// asistido, por tiempo), mínimo aumento, tope de la máquina, cuándo
// proponer subir peso y con qué entrenamientos comparar. Se usa en la ficha del ejercicio y en
// una hoja desde el entrenamiento.
import { useState } from 'react';
import { Button, Chip, Group, Stack, Switch, Text, TextInput } from '@mantine/core';
import { openSheet } from '../../components/Sheet.jsx';
import { confirmDialog, notify } from '../../components/dialogs.jsx';
import { getSettings, prefsOf, savePrefs, state } from '../../lib/data.js';
import { getExercise } from '../../lib/catalog.js';
import { KINDS, LOAD_MODES, modeAllowed, modeFactor, resolveKind, resolveLoadMode } from '../../lib/kinds.js';
import { defaultIncrement } from '../../lib/loads.js';
import { DEFAULT_REP_MAX } from '../../lib/progression.js';
import { fmtNum, num } from '../../lib/format.js';

const QUICK = [1, 1.25, 2, 2.5, 5];
const toText = (v) => (v == null ? '' : String(v).replace('.', ','));
const positive = (text) => { const v = num(text); return v > 0 ? v : null; };

/**
 * @param {object} p
 * @param {string} p.id         exercise_id (del catálogo o propio)
 * @param {string} [p.category] categoría del equipo, para el mínimo aumento por defecto
 * @param {() => void} [p.onDone]
 */
export function ExercisePrefsForm({ id, category, onDone }) {
  const prefs = prefsOf(id) || {};
  const [inc, setInc] = useState(toText(prefs.min_increment));
  const [max, setMax] = useState(toText(prefs.max_load));
  const [repMax, setRepMax] = useState(toText(prefs.rep_max));
  const [sameTpl, setSameTpl] = useState(!!prefs.compare_same_template);
  const [kind, setKind] = useState(resolveKind(prefs, getExercise(id)));
  const modeNow = (k) => resolveLoadMode(prefs, k, { category, dumbbellMode: getSettings().dumbbellMode });
  const [mode, setMode] = useState(modeAllowed(kind) ? modeNow(kind) : 'total');
  const modeInfo = LOAD_MODES.find(([k]) => k === mode);
  const incValue = positive(inc);
  const loaded = kind === 'peso_reps' || kind === 'lastre';

  const save = async () => {
    const r = positive(repMax);
    const before = modeFactor(modeNow(resolveKind(prefs, getExercise(id))));
    const after = modeFactor(modeAllowed(kind) ? mode : 'total');
    if (before !== after) {
      const n = state.workouts.filter((w) => w.exercises?.some((e) => e.exercise_id === id && e.sets?.some((s) => s.done !== false))).length;
      if (n && !await confirmDialog({
        title: 'Cambiar cómo se anota la carga',
        message: `Esto cambia el volumen de tus ${n} ${n === 1 ? 'sesión anterior' : 'sesiones anteriores'} (${after > before ? 'se duplica' : 'se reduce a la mitad'}). Lo guardado no cambia.`,
        confirmLabel: 'Cambiar',
      })) return;
    }
    savePrefs(id, {
      kind,
      load_mode: modeAllowed(kind) ? mode : prefs.load_mode ?? null,
      min_increment: incValue,
      max_load: positive(max),
      rep_max: r ? Math.min(30, Math.max(3, Math.round(r))) : null,
      compare_same_template: sameTpl,
    });
    notify.success('Guardado');
    onDone?.();
  };

  return (
    <Stack gap="md" data-testid="exercise-prefs">
      <div>
        <Text size="sm" fw={500}>Tipo de ejercicio</Text>
        <Text size="xs" c="dimmed" mb={8}>
          {{
            peso_reps: 'Anotas el peso que mueves.',
            peso_corporal: 'Solo reps; la carga es tu peso corporal.',
            lastre: 'Anotas el peso agregado; la carga es tu peso corporal + el lastre.',
            asistido: 'Anotas la asistencia; la carga es tu peso corporal − la asistencia.',
            tiempo: 'Anotas el tiempo (y un peso opcional), con cronómetro en la serie.',
          }[kind]}
        </Text>
        <Chip.Group value={kind} onChange={setKind}>
          <Group gap={6}>
            {KINDS.map(([k, label]) => <Chip key={k} value={k} size="sm" wrapperProps={{ 'data-testid': `prefs-kind-${k}` }}>{label}</Chip>)}
          </Group>
        </Chip.Group>
      </div>
      {modeAllowed(kind) ? (
        <div>
          <Text size="sm" fw={500}>Cómo anotas la carga</Text>
          <Text size="xs" c="dimmed" mb={8}>{modeInfo[2]} Ej.: {modeInfo[3]}.{mode !== 'total' ? ' El volumen cuenta el doble; el 1RM queda sobre lo anotado.' : ''}</Text>
          <Chip.Group value={mode} onChange={setMode}>
            <Group gap={6}>
              {LOAD_MODES.map(([k, label]) => <Chip key={k} value={k} size="sm" wrapperProps={{ 'data-testid': `prefs-mode-${k}` }}>{label}</Chip>)}
            </Group>
          </Chip.Group>
        </div>
      ) : null}
      {loaded ? (
      <div>
        <TextInput
          label="Mínimo aumento (kg)"
          description={`Lo mínimo que puedes subirle. Sin definir se usa ${fmtNum(defaultIncrement(category), 2)} kg.`}
          inputMode="decimal" value={inc} placeholder={fmtNum(defaultIncrement(category), 2)}
          onChange={(e) => setInc(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()}
          data-testid="prefs-increment"
        />
        <Group gap={6} mt={8}>
          {QUICK.map((v) => (
            <Chip key={v} size="sm" checked={incValue === v} onChange={() => setInc(toText(v))}>
              {fmtNum(v, 2)}
            </Chip>
          ))}
        </Group>
      </div>
      ) : null}
      {loaded ? (
      <TextInput
        label="Tope de la máquina (kg)"
        description="Con el peso en el tope, solo se proponen más reps."
        inputMode="decimal" value={max} placeholder="Sin tope"
        onChange={(e) => setMax(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()}
        data-testid="prefs-max"
      />
      ) : null}
      {kind !== 'tiempo' ? (
      <TextInput
        label="Subir peso cuando pases de (reps)"
        description="Si con el mismo peso necesitarías más reps que esto, se propone subir el peso."
        inputMode="numeric" value={repMax} placeholder={String(DEFAULT_REP_MAX)}
        onChange={(e) => setRepMax(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()}
        data-testid="prefs-repmax"
      />
      ) : null}
      <Switch
        size="md" checked={sameTpl} onChange={(e) => setSameTpl(e.currentTarget.checked)}
        label="Comparar solo con la misma plantilla"
        description="Si no, se compara con la última vez que lo hiciste en cualquier entrenamiento."
      />
      <Button onClick={save} data-testid="prefs-save">Guardar</Button>
      <Text size="xs" c="dimmed">Los ajustes se sincronizan entre tus dispositivos.</Text>
    </Stack>
  );
}

export const openExercisePrefs = ({ id, name, category }) => openSheet({
  title: `Ajustes · ${name}`,
  render: (close) => <ExercisePrefsForm id={id} category={category} onDone={close} />,
});
