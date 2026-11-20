// Ajustes de un ejercicio (tabla exercise_prefs): mínimo aumento, tope de la máquina, cuándo
// proponer subir peso y con qué entrenamientos comparar. Se usa en la ficha del ejercicio y en
// una hoja desde el entrenamiento.
import { useState } from 'react';
import { Button, Chip, Group, Stack, Switch, Text, TextInput } from '@mantine/core';
import { openSheet } from '../../components/Sheet.jsx';
import { notify } from '../../components/dialogs.jsx';
import { prefsOf, savePrefs } from '../../lib/data.js';
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
  const incValue = positive(inc);

  const save = () => {
    const r = positive(repMax);
    savePrefs(id, {
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
      <TextInput
        label="Tope de la máquina (kg)"
        description="Con el peso en el tope, solo se proponen más reps."
        inputMode="decimal" value={max} placeholder="Sin tope"
        onChange={(e) => setMax(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()}
        data-testid="prefs-max"
      />
      <TextInput
        label="Subir peso cuando pases de (reps)"
        description="Si con el mismo peso necesitarías más reps que esto, se propone subir el peso."
        inputMode="numeric" value={repMax} placeholder={String(DEFAULT_REP_MAX)}
        onChange={(e) => setRepMax(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()}
        data-testid="prefs-repmax"
      />
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
