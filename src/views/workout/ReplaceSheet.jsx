// Hoja "Reemplazar ejercicio" (feature 10): sugerencias del mismo músculo y equipo primero, con tu
// última serie, "No sugerir más" en cada una y, debajo, el buscador completo.
import { useMemo, useState } from 'react';
import {
  ActionIcon, Box, Group, SegmentedControl, Stack, Text, UnstyledButton,
} from '@mantine/core';
import { IconEyeOff } from '@tabler/icons-react';
import { openSheet } from '../../components/Sheet.jsx';
import { ExerciseBrowser } from '../../components/ExercisePicker.jsx';
import { ExerciseThumb } from '../../components/ui.jsx';
import { notify } from '../../components/dialogs.jsx';
import { useCatalog, useData } from '../../lib/hooks.js';
import { allExercises, getExercise } from '../../lib/catalog.js';
import { savePrefs } from '../../lib/data.js';
import { lastSetIndex, substitutes } from '../../lib/substitutes.js';
import { fmtSecs } from '../../lib/kinds.js';
import { fmtNum } from '../../lib/format.js';
import picker from '../../components/ExercisePicker.module.css';

// "30 × 10" / "12 reps" / "1:00"
const lastText = (s) => {
  if (!s.reps && s.seconds) return `${s.weight ? `${fmtNum(s.weight)} · ` : ''}${fmtSecs(s.seconds)}`;
  return s.weight ? `${fmtNum(s.weight)} × ${s.reps}` : `${s.reps} reps`;
};

function SuggestionRow({ item, onPick }) {
  const e = item.exercise;
  const hide = (ev) => {
    ev.stopPropagation();
    savePrefs(e.id, { exclude_from_suggestions: true });
    notify.undo(`No se sugerirá ${e.name}`, () => savePrefs(e.id, { exclude_from_suggestions: false }));
  };
  return (
    <Group gap={4} wrap="nowrap" data-testid="replace-suggestion" data-group={item.group}>
      <UnstyledButton className={picker.row} style={{ flex: 1, minWidth: 0 }} onClick={() => onPick(e)} data-testid="replace-pick">
        <ExerciseThumb exercise={e} size={46} />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fw={550} size="sm" truncate="end">{e.name}</Text>
          <Text size="xs" c="dimmed" truncate="end">{e.bodyPart} · {e.category}</Text>
          {item.last ? (
            <Text size="xs" c="brand" fw={600} className="tnum" data-testid="replace-last">
              La última vez: {lastText(item.last.set)}
            </Text>
          ) : null}
        </Box>
      </UnstyledButton>
      <ActionIcon variant="subtle" color="gray" size={40} onClick={hide} aria-label={`No sugerir más ${e.name}`} title="No sugerir más" data-testid="replace-exclude">
        <IconEyeOff size={18} />
      </ActionIcon>
    </Group>
  );
}

function ReplaceBody({ id, name, fromTemplate, allDone, onPick, close }) {
  const { workouts, exercises, exercise_prefs: prefs } = useData();
  const catalogVersion = useCatalog();
  const [scope, setScope] = useState('today');
  const current = getExercise(id);
  const history = useMemo(() => lastSetIndex(workouts), [workouts]);
  const list = useMemo(() => {
    const excluded = new Set(prefs.filter((p) => p.exclude_from_suggestions).map((p) => p.id));
    return substitutes(current, allExercises(), history, excluded);
  }, [id, history, prefs, exercises, catalogVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (e) => { close(); onPick(e.id, scope); };

  return (
    <Box>
      <Group gap="sm" wrap="nowrap" mb="sm">
        <ExerciseThumb exercise={current} name={name} size={40} />
        <Box style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed">{allDone ? 'Después de' : 'En lugar de'}</Text>
          <Text fw={650} truncate="end" data-testid="replace-current">{name}</Text>
        </Box>
      </Group>
      {allDone ? (
        <Text size="sm" c="dimmed" mb="sm">Ya hiciste todas las series: el que elijas se agrega debajo, con las mismas series vacías.</Text>
      ) : null}
      {fromTemplate ? (
        <SegmentedControl
          fullWidth mb="sm" value={scope} onChange={setScope} data-testid="replace-scope"
          data={[{ value: 'today', label: 'Solo hoy' }, { value: 'template', label: 'También en la plantilla' }]}
        />
      ) : null}
      {list.length ? (
        <>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4} className={picker.sectionLabel}>Sugerencias</Text>
          <Stack gap={0} data-testid="replace-suggestions">
            {list.map((item) => <SuggestionRow key={item.exercise.id} item={item} onPick={pick} />)}
          </Stack>
        </>
      ) : null}
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="md" mb={4} className={picker.sectionLabel}>
        {list.length ? 'Buscar otro' : 'Buscar ejercicio'}
      </Text>
      <ExerciseBrowser onPick={pick} />
    </Box>
  );
}

/**
 * @param {{id:string, name:string, fromTemplate?:boolean, allDone?:boolean,
 *   onPick:(newId:string, scope:'today'|'template') => void}} p
 */
export function openReplaceSheet({ id, name, fromTemplate = false, allDone = false, onPick }) {
  return openSheet({
    title: allDone ? 'Agregar después' : 'Reemplazar ejercicio',
    size: 'full',
    testId: 'replace-sheet',
    render: (close) => <ReplaceBody id={id} name={name} fromTemplate={fromTemplate} allDone={allDone} onPick={onPick} close={close} />,
  });
}
