// Meta de constancia y pausas (feature 09). Se guardan en user_settings (sincronizado entre
// dispositivos). Antes de guardar muestra cómo quedaría la racha con la meta nueva.
import { useMemo, useState } from 'react';
import { ActionIcon, Box, Button, Card, Divider, Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { openSheet } from '../../components/Sheet.jsx';
import { notify } from '../../components/dialogs.jsx';
import { saveSyncedSettings, state, syncedSettings } from '../../lib/data.js';
import { useData } from '../../lib/hooks.js';
import { dayKey, fmtDate } from '../../lib/format.js';
import { GOAL_MODES, MAX_PAUSE_DAYS, normalizeGoal, pauseError, streakStats, streakText } from '../../lib/streak.js';
import classes from './streak.module.css';

const opts = (from, to, suffix = '') => Array.from({ length: to - from + 1 }, (_, i) => ({ value: String(from + i), label: `${from + i}${suffix}` }));
const shortDate = (key) => fmtDate(new Date(`${key}T12:00:00`), { day: 'numeric', month: 'short' }).replace('.', '');

export function goalLabel(goal) {
  const g = normalizeGoal(goal);
  if (g.mode === 'cadencia') return g.every_days === 2 ? `Día por medio (tolerancia ${g.tolerance})` : `Cada ${g.every_days} días (tolerancia ${g.tolerance})`;
  if (g.mode === 'semanal') return `${g.per_week} por semana`;
  return 'Sin meta: al menos uno por semana';
}

function GoalForm({ close }) {
  const [g, setG] = useState(() => normalizeGoal(syncedSettings().goal));
  const set = (k) => (v) => setG((x) => normalizeGoal({ ...x, [k]: k === 'mode' ? v : Number(v) }));
  const { pauses = [] } = syncedSettings();
  const preview = useMemo(() => streakStats(state.workouts, g, pauses), [g]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    saveSyncedSettings({ goal: g });
    notify.success('Meta guardada');
    close();
  };
  return (
    <Stack gap="md" data-testid="goal-form">
      <SegmentedControl fullWidth value={g.mode} onChange={set('mode')} data={GOAL_MODES.map(([value, label]) => ({ value, label }))} data-testid="goal-mode" />
      {g.mode === 'cadencia' ? (
        <>
          <Box>
            <Text size="sm" fw={500}>Entrenar cada</Text>
            <SegmentedControl fullWidth mt={6} value={String(g.every_days)} onChange={set('every_days')} data={opts(1, 4, ' d')} data-testid="goal-every" />
          </Box>
          <Box>
            <Text size="sm" fw={500}>Días de tolerancia</Text>
            <Text size="xs" c="dimmed">Con cada {g.every_days} y tolerancia {g.tolerance}, la racha se corta si pasan {g.every_days + g.tolerance + 1} o más días entre dos entrenamientos.</Text>
            <SegmentedControl fullWidth mt={6} value={String(g.tolerance)} onChange={set('tolerance')} data={opts(0, 3)} data-testid="goal-tolerance" />
          </Box>
        </>
      ) : g.mode === 'semanal' ? (
        <Box>
          <Text size="sm" fw={500}>Entrenamientos por semana (lunes a domingo)</Text>
          <SegmentedControl fullWidth mt={6} value={String(g.per_week)} onChange={set('per_week')} data={opts(1, 7)} data-testid="goal-per-week" />
        </Box>
      ) : (
        <Text size="sm" c="dimmed">La racha cuenta semanas seguidas con al menos un entrenamiento.</Text>
      )}
      <Card withBorder padding="sm" radius="md" data-testid="goal-preview">
        <Text size="sm">
          Con esta meta tu racha sería de <b>{streakText(preview)}</b>, la mejor de <b>{preview.best}</b>
          {preview.breaks ? `, con ${preview.breaks} ${preview.breaks === 1 ? 'corte' : 'cortes'} en tu historial` : ', sin cortes en tu historial'}.
        </Text>
      </Card>
      <Button onClick={save} data-testid="goal-save">Guardar</Button>
    </Stack>
  );
}

function Pauses() {
  useData();
  const { pauses = [] } = syncedSettings();
  const today = dayKey(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const err = pauseError(pauses, { from, to });
  const add = () => {
    if (err) { notify.warn(err); return; }
    saveSyncedSettings({ pauses: [...pauses, { from, to }].sort((a, b) => (a.from < b.from ? -1 : 1)) });
    notify.success('Pausa agregada');
  };
  const del = (p) => saveSyncedSettings({ pauses: pauses.filter((x) => x !== p) });
  return (
    <Stack gap="sm" data-testid="pauses">
      <Text size="sm" fw={600}>Pausas</Text>
      <Text size="xs" c="dimmed">
        Vacaciones o enfermedad: los días de pausa no suman ni cortan la racha. Hasta {MAX_PAUSE_DAYS} días, una cada 6 semanas.
      </Text>
      {pauses.length ? (
        <Box>
          {[...pauses].reverse().map((p) => (
            <Box key={`${p.from}-${p.to}`} className={classes.row} data-testid="pause-row">
              <Text size="sm" style={{ flex: 1 }}>{p.from === p.to ? shortDate(p.from) : `${shortDate(p.from)} – ${shortDate(p.to)}`}</Text>
              <ActionIcon variant="subtle" color="red" onClick={() => del(p)} aria-label="Quitar pausa"><IconTrash size={16} /></ActionIcon>
            </Box>
          ))}
        </Box>
      ) : null}
      <Group grow gap="xs">
        <TextInput type="date" label="Desde" value={from} onChange={(e) => setFrom(e.currentTarget.value)} data-testid="pause-from" />
        <TextInput type="date" label="Hasta" value={to} onChange={(e) => setTo(e.currentTarget.value)} data-testid="pause-to" />
      </Group>
      {err && from && to ? <Text size="xs" c="orange">{err}</Text> : null}
      <Button variant="light" onClick={add} disabled={!!err} data-testid="pause-add">Agregar pausa</Button>
    </Stack>
  );
}

export const openGoalSheet = () => openSheet({
  title: 'Meta de constancia',
  testId: 'goal-sheet',
  render: (close) => (
    <Stack gap="lg">
      <GoalForm close={close} />
      <Divider />
      <Pauses />
      <Text size="xs" c="dimmed">La meta y las pausas se sincronizan entre tus dispositivos.</Text>
    </Stack>
  ),
});
