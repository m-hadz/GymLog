// Asistente para crear un programa (feature 12) en 3 pasos: ejercicios → máximos (5/3/1) o pesos
// iniciales (GZCLP) → opciones. Se carga aparte (NumberInput pesa).
import { useMemo, useState } from 'react';
import {
  Box, Button, Group, NumberInput, SegmentedControl, Stack, Switch, Text, TextInput, UnstyledButton,
} from '@mantine/core';
import { openSheet } from '../../components/Sheet.jsx';
import { openPicker } from '../../components/ExercisePicker.jsx';
import { ExerciseThumb } from '../../components/ui.jsx';
import { notify } from '../../components/dialogs.jsx';
import { useCatalog } from '../../lib/hooks.js';
import { allExercises, exerciseName, getExercise } from '../../lib/catalog.js';
import { state } from '../../lib/data.js';
import { fmtNum } from '../../lib/format.js';
import { gzclpStart, KIND_LABEL, LIFT_KEYS, LIFT_LABEL, stageKey } from '../../lib/programs.js';
import { createProgram, positionText } from '../../lib/program-runtime.js';
import { programLoad, tmOf, tmSuggestion } from '../../lib/tm.js';
import classes from '../workout/workout.module.css';

const DEFAULT_IDS = {
  squat: ['Barbell_Squat'], bench: ['Barbell_Bench_Press_-_Medium_Grip'], deadlift: ['Barbell_Deadlift'],
  ohp: ['Standing_Military_Press', 'Barbell_Shoulder_Press'], A: ['Wide-Grip_Lat_Pulldown'], B: ['Bent_Over_Barbell_Row'],
};
// Prefiere tu ejercicio propio vinculado a ese del catálogo (ahí está tu historial)
function defaultExercise(key) {
  const ids = DEFAULT_IDS[key] || [];
  const counts = new Map();
  for (const w of state.workouts) for (const e of w.exercises || []) counts.set(e.exercise_id, (counts.get(e.exercise_id) || 0) + 1);
  const own = allExercises().filter((e) => e.custom && ids.includes(e.catalogId)).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
  if (own[0]) return own[0].id;
  return ids.find((id) => getExercise(id)) || null;
}

const SLOT_LABEL = { ...LIFT_LABEL, A: 'T3 de los días A', B: 'T3 de los días B' };

function ExerciseSlot({ k, value, onChange }) {
  const ex = value ? getExercise(value) : null;
  return (
    <UnstyledButton
      className={classes.programSlot}
      onClick={() => openPicker({ multi: false, title: SLOT_LABEL[k], onDone: ([id]) => onChange(id) })}
      data-testid={`slot-${k}`}
    >
      <ExerciseThumb exercise={ex} name={ex?.name} size={34} />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text size="xs" c="dimmed">{SLOT_LABEL[k]}</Text>
        <Text size="sm" fw={600} truncate="end">{ex ? ex.name : 'Elegir ejercicio'}</Text>
      </Box>
    </UnstyledButton>
  );
}

const kgInput = (label, value, onChange, testId, hint) => (
  <NumberInput
    label={label} description={hint} value={value ?? ''} onChange={(v) => onChange(v === '' ? null : Number(v))}
    min={0} max={1000} step={2.5} decimalScale={2} suffix=" kg" decimalSeparator="," inputMode="decimal" data-testid={testId}
  />
);

function Wizard({ kind, close }) {
  useCatalog();
  const isGz = kind === 'gzclp';
  const slots = isGz ? [...LIFT_KEYS, 'A', 'B'] : LIFT_KEYS;
  const [step, setStep] = useState(1);
  const [lifts, setLifts] = useState(() => Object.fromEntries(slots.map((k) => [k, defaultExercise(k)])));
  const [tms, setTms] = useState({});
  const [weights, setWeights] = useState({});
  const [name, setName] = useState(KIND_LABEL[kind]);
  const [deload, setDeload] = useState(false);
  const [t2Reset, setT2Reset] = useState('7.5');
  const suggestions = useMemo(
    () => Object.fromEntries(Object.values(lifts).filter(Boolean).map((id) => [id, tmSuggestion(id)])),
    [lifts],
  );

  const toStep2 = () => {
    if (slots.some((k) => !lifts[k])) { notify.warn('Elige todos los ejercicios'); return; }
    if (new Set(LIFT_KEYS.map((k) => lifts[k])).size < 4) { notify.warn('Los cuatro principales deben ser distintos'); return; }
    // valores iniciales: tu máximo actual o el sugerido; en GZCLP, desde el 1RM estimado
    if (!isGz) setTms(Object.fromEntries(LIFT_KEYS.map((k) => [k, tms[k] ?? tmOf(lifts[k]) ?? suggestions[lifts[k]]?.tm ?? null])));
    else {
      const w = {};
      for (const k of LIFT_KEYS) {
        const s = gzclpStart(suggestions[lifts[k]]?.e1rm);
        w[`T1:${k}`] = weights[`T1:${k}`] ?? (s.t1 ? programLoad(lifts[k], s.t1) : null);
        w[`T2:${k}`] = weights[`T2:${k}`] ?? (s.t2 ? programLoad(lifts[k], s.t2) : null);
      }
      for (const k of ['A', 'B']) {
        const s = gzclpStart(suggestions[lifts[k]]?.e1rm);
        w[`T3:${k}`] = weights[`T3:${k}`] ?? (s.t3 ? programLoad(lifts[k], s.t3) : null);
      }
      setWeights(w);
    }
    setStep(2);
  };
  const toStep3 = () => {
    const vals = isGz ? Object.values(weights) : LIFT_KEYS.map((k) => tms[k]);
    if (vals.some((v) => !(v > 0))) { notify.warn(isGz ? 'Completa los pesos iniciales' : 'Completa los máximos'); return; }
    setStep(3);
  };
  const create = () => {
    if (!name.trim()) { notify.warn('Ponle un nombre'); return; }
    let p;
    if (!isGz) {
      p = createProgram({
        kind, name: name.trim(),
        config: { lifts: LIFT_KEYS.map((k) => lifts[k]), deload },
        tms: Object.fromEntries(LIFT_KEYS.map((k) => [lifts[k], tms[k]])),
      });
    } else {
      const stages = {};
      for (const k of LIFT_KEYS) {
        stages[stageKey('T1', lifts[k])] = { stage: 0, weight: weights[`T1:${k}`] };
        stages[stageKey('T2', lifts[k])] = { stage: 0, weight: weights[`T2:${k}`] };
      }
      for (const k of ['A', 'B']) stages[stageKey('T3', lifts[k])] = { stage: 0, weight: weights[`T3:${k}`] };
      p = createProgram({
        kind, name: name.trim(),
        config: { lifts: Object.fromEntries(LIFT_KEYS.map((k) => [k, lifts[k]])), t3: { A: lifts.A, B: lifts.B }, t2Reset: Number(t2Reset) },
        stages,
      });
    }
    close();
    notify.success(`${p.name} listo: ${positionText(p)}`);
  };

  return (
    <Stack gap="sm" data-testid="program-wizard">
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">Paso {step} de 3 · {['Ejercicios', isGz ? 'Pesos iniciales' : 'Máximos', 'Opciones'][step - 1]}</Text>
      {step === 1 ? (
        <>
          <Text size="sm" c="dimmed">
            {isGz
              ? 'Cuatro principales (T1 y T2) y dos accesorios (T3). Días A1, B1, A2, B2 en rotación.'
              : 'Un principal por día, cuatro días. Semanas de 5, 3 y 1 rep con el porcentaje de tu máximo.'}
          </Text>
          {slots.map((k) => <ExerciseSlot key={k} k={k} value={lifts[k]} onChange={(id) => setLifts((l) => ({ ...l, [k]: id }))} />)}
          <Button onClick={toStep2} data-testid="wizard-next">Siguiente</Button>
        </>
      ) : step === 2 ? (
        <>
          {!isGz ? (
            <>
              <Text size="sm" c="dimmed">El máximo de entrenamiento es un 90 % de tu 1RM. Los porcentajes se calculan sobre él.</Text>
              {LIFT_KEYS.map((k) => {
                const sug = suggestions[lifts[k]];
                return (
                  <Box key={k}>
                    {kgInput(exerciseName(lifts[k]), tms[k], (v) => setTms((t) => ({ ...t, [k]: v })), `wizard-tm-${k}`,
                      sug?.tm ? `Sugerido ${fmtNum(sug.tm)} kg (90 % de tu mejor 1RM estimado, ${fmtNum(sug.e1rm, 1)} kg)` : 'Sin historial reciente: escribe uno')}
                  </Box>
                );
              })}
            </>
          ) : (
            <>
              <Text size="sm" c="dimmed">Sugeridos desde tu 1RM estimado: T1 al 85 % de tu 5RM, T2 al 65 %.</Text>
              {LIFT_KEYS.map((k) => (
                <Group key={k} grow gap="xs" align="flex-end">
                  {kgInput(`${exerciseName(lifts[k])} · T1`, weights[`T1:${k}`], (v) => setWeights((w) => ({ ...w, [`T1:${k}`]: v })), `wizard-t1-${k}`)}
                  {kgInput('T2', weights[`T2:${k}`], (v) => setWeights((w) => ({ ...w, [`T2:${k}`]: v })), `wizard-t2-${k}`)}
                </Group>
              ))}
              {['A', 'B'].map((k) => (
                <Box key={k}>{kgInput(`${exerciseName(lifts[k])} · T3`, weights[`T3:${k}`], (v) => setWeights((w) => ({ ...w, [`T3:${k}`]: v })), `wizard-t3-${k}`)}</Box>
              ))}
            </>
          )}
          <Group grow>
            <Button variant="default" onClick={() => setStep(1)}>Atrás</Button>
            <Button onClick={toStep3} data-testid="wizard-next">Siguiente</Button>
          </Group>
        </>
      ) : (
        <>
          <TextInput label="Nombre" value={name} onChange={(e) => setName(e.currentTarget.value)} data-testid="wizard-name" />
          {!isGz ? (
            <Switch
              label="Semana de descarga (4.ª: 40, 50 y 60 %)" checked={deload} onChange={(e) => setDeload(e.currentTarget.checked)}
              data-testid="wizard-deload"
            />
          ) : (
            <Box>
              <Text size="sm" fw={500} mb={4}>T2: al fallar en 3 × 6, vuelve a 3 × 10 con lo último logrado más</Text>
              <SegmentedControl value={t2Reset} onChange={setT2Reset} data={[{ value: '7.5', label: '7,5 kg' }, { value: '10', label: '10 kg' }]} />
            </Box>
          )}
          <Text size="xs" c="dimmed">
            Se crean 4 plantillas en la carpeta «{name || KIND_LABEL[kind]}». Puedes agregarles accesorios; las series del programa se actualizan solas.
          </Text>
          <Group grow>
            <Button variant="default" onClick={() => setStep(2)}>Atrás</Button>
            <Button onClick={create} data-testid="wizard-create">Crear programa</Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

export const openProgramWizard = (kind) => openSheet({
  title: `Nuevo programa ${KIND_LABEL[kind]}`, size: 'full', testId: 'program-wizard-sheet',
  render: (close) => <Wizard kind={kind} close={close} />,
});

