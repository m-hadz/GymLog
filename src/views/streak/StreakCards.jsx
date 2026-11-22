// Tarjetas de constancia (feature 09): "Hoy toca" en Entrenar, y mejor racha + franja de 30 días
// en el Perfil.
import { Box, Card, Group, RingProgress, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconFlame } from '@tabler/icons-react';
import { useStreak } from '../../lib/hooks.js';
import { dueText, streakText } from '../../lib/streak.js';
import { syncedSettings } from '../../lib/data.js';
import { goalLabel, openGoalSheet } from './GoalSheet.jsx';
import classes from './streak.module.css';

/** Valor y texto de la ficha "Racha" (Entrenar, Calendario, Perfil): el mismo número en todos. */
export function streakTile(s) {
  if (s.unit === 'entrenamientos') return { value: s.current, hint: s.current === 1 ? 'seguido' : 'seguidos' };
  return { value: s.current, hint: s.current === 1 ? 'semana seguida' : 'semanas seguidas' };
}

export function ConstancyCard() {
  const s = useStreak();
  if (s.mode === 'ninguna') return null;
  return (
    <Card withBorder padding="md" className={classes.card} data-testid="constancy-card">
      <Group wrap="nowrap" gap="md">
        {s.mode === 'semanal' ? (
          <RingProgress
            size={64} thickness={7} roundCaps
            sections={[{ value: Math.min(100, (s.thisWeek / s.perWeek) * 100), color: s.thisWeek >= s.perWeek ? 'teal' : 'brand' }]}
            label={<Text ta="center" size="sm" fw={750} className="tnum">{s.thisWeek}/{s.perWeek}</Text>}
          />
        ) : (
          <IconFlame size={34} color="var(--mantine-color-orange-filled)" style={{ flex: 'none' }} />
        )}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text className={classes.due} data-status={s.status} data-testid="constancy-due">{dueText(s)}</Text>
          <Text size="sm" c="dimmed" data-testid="constancy-streak">
            {s.current ? `Racha: ${streakText(s)}` : s.lastDay != null ? 'Empieza una racha nueva' : 'Sin entrenamientos aún'}
            {s.best > s.current ? ` · mejor: ${s.best}` : ''}
          </Text>
        </Box>
      </Group>
    </Card>
  );
}

const LEGEND = [['entreno', 'Entrenado'], ['descanso', 'Descanso esperado'], ['pausa', 'Pausa'], ['corte', 'Corte']];

export function StreakCard() {
  const s = useStreak();
  const { goal } = syncedSettings();
  const states = new Set(s.strip.map((x) => x.state));
  return (
    <Card withBorder padding="md" className={classes.card} data-testid="streak-card">
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
        <Box>
          <Text fw={650}>Constancia</Text>
          <Text size="xs" c="dimmed">{goalLabel(goal)}</Text>
        </Box>
        <Box ta="right">
          <Text fw={750} className="tnum" data-testid="streak-current">{streakText(s)}</Text>
          <Text size="xs" c="dimmed" className="tnum" data-testid="streak-best">mejor: {s.best}</Text>
        </Box>
      </Group>
      <Box className={classes.strip} aria-label="Últimos 30 días">
        {s.strip.map((x) => <span key={x.key} className={classes.cell} data-state={x.state} title={`${x.key}: ${x.state}`} />)}
      </Box>
      <Group justify="space-between" mt={4}>
        <Text size="xs" c="dimmed">hace 30 días</Text>
        <Text size="xs" c="dimmed">hoy</Text>
      </Group>
      <Group gap="sm" mt={6}>
        {LEGEND.filter(([k]) => states.has(k)).map(([k, label]) => (
          <Text key={k} size="xs" c="dimmed"><span className={`${classes.legend} ${classes.cell}`} data-state={k} />{label}</Text>
        ))}
      </Group>
      <Stack gap={0} mt="sm">
        <UnstyledButton onClick={openGoalSheet} data-testid="goal-open">
          <Text size="sm" fw={600} c="brand">Cambiar meta o agregar una pausa</Text>
        </UnstyledButton>
      </Stack>
    </Card>
  );
}
