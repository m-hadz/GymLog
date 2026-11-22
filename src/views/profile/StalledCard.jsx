// Perfil → Progreso: ejercicios estancados (feature 06). Cada fila abre la ficha del ejercicio.
import { Box, Card, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useCatalog, useStalls } from '../../lib/hooks.js';
import { exerciseName } from '../../lib/catalog.js';
import { fmtNum } from '../../lib/format.js';
import { navigate } from '../../lib/router.js';
import { stallSince } from '../workout/StallSheet.jsx';
import classes from './StalledCard.module.css';

export function StalledCard({ workouts }) {
  const stalls = useStalls();
  useCatalog();
  const nameOf = (id) => {
    for (const w of workouts) { const e = w.exercises?.find((x) => x.exercise_id === id); if (e) return exerciseName(id, e.name); }
    return exerciseName(id);
  };
  const list = [...stalls].filter(([, st]) => st.stalled).map(([id, st]) => ({ id, st, name: nameOf(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Card withBorder padding={0} className={classes.card} data-testid="stalled-card">
      <Box px="md" pt="sm" pb={list.length ? 4 : 'sm'}>
        <Text fw={650}>Estancados ({list.length})</Text>
        <Text size="xs" c="dimmed">
          {list.length
            ? 'El 1RM estimado de las últimas 6 sesiones no supera en más de 1 % al de las 6 anteriores.'
            : 'Ningún ejercicio estancado: todos los que haces seguido siguen subiendo.'}
        </Text>
      </Box>
      {list.map(({ id, st, name }) => (
        <UnstyledButton key={id} className={classes.row} onClick={() => navigate(`/exercise/${encodeURIComponent(id)}`)} data-testid="stalled-row">
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={600} truncate="end">{name}</Text>
            <Text size="xs" c="dimmed">
              {st.metric === 'e1rm' ? `1RM ~${fmtNum(st.recent, 0)} kg` : `~${fmtNum(st.recent, 0)} reps`} · desde el {stallSince(st)}
            </Text>
          </Box>
          <IconChevronRight size={18} color="var(--mantine-color-dimmed)" />
        </UnstyledButton>
      ))}
    </Card>
  );
}
