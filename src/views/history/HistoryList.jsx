// Lista del historial: agrupada por mes con encabezados fijos y tarjetas por entrenamiento.
import { useEffect, useMemo, useState } from 'react';
import { Anchor, Badge, Box, Button, Card, CloseButton, Group, Stack, Text } from '@mantine/core';
import { useIntersection } from '@mantine/hooks';
import { IconCalendarMonth, IconClock, IconHistory, IconTrophy, IconWeight } from '@tabler/icons-react';
import { useAnalysis, useCatalog } from '../../lib/hooks.js';
import { navigate } from '../../lib/router.js';
import { exerciseName } from '../../lib/catalog.js';
import { computePRs, prCount, workoutVolume, workoutDuration, bestSet } from '../../lib/stats.js';
import { dayKey, fmtDate, fmtDuration, fmtSet, fmtTime, fmtVolume, plural } from '../../lib/format.js';
import { Page, PageHeader } from '../../components/PageHeader.jsx';
import { EmptyState } from '../../components/ui.jsx';
import { ScoreBadge } from './SessionScore.jsx';
import classes from './history.module.css';

const PAGE = 30;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function WorkoutCard({ w, marks }) {
  const prs = prCount(marks);
  const shown = w.exercises.slice(0, 5);
  const more = w.exercises.length - shown.length;
  const open = () => navigate(`/workout/${w.id}`);
  return (
    <Card
      withBorder
      className={classes.workoutCard}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
      role="button"
      tabIndex={0}
      data-testid="workout-card"
    >
      <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
        <Box style={{ minWidth: 0 }}>
          <Text fw={650} truncate="end">{w.name}</Text>
          <Text size="xs" c="dimmed">
            {cap(fmtDate(w.started_at, { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', ''))} · {fmtTime(w.started_at)}
          </Text>
        </Box>
        <Group gap={6} wrap="nowrap" style={{ flex: 'none' }}>
          <ScoreBadge wid={w.id} />
          {prs ? (
            <Badge color="yellow" variant="light" size="md" leftSection={<IconTrophy size={13} />} className="tnum" style={{ flex: 'none' }}>
              {prs} {prs === 1 ? 'récord' : 'récords'}
            </Badge>
          ) : null}
        </Group>
      </Group>

      <Group gap="md" mt={10} mb={10} className={classes.metrics}>
        <Group gap={5} wrap="nowrap">
          <IconClock size={15} className={classes.metricIcon} />
          <Text size="sm" fw={550} className="tnum">{fmtDuration(workoutDuration(w))}</Text>
        </Group>
        <Group gap={5} wrap="nowrap">
          <IconWeight size={15} className={classes.metricIcon} />
          <Text size="sm" fw={550} className="tnum">{fmtVolume(workoutVolume(w))}</Text>
        </Group>
        <Text size="sm" c="dimmed">{plural(w.exercises.length, 'ejercicio')}</Text>
      </Group>

      <Stack gap={4} className={classes.exLines}>
        {shown.map((e, i) => (
          <Group key={i} justify="space-between" wrap="nowrap" gap="sm">
            <Text size="sm" truncate="end" style={{ minWidth: 0 }}>
              <Text span c="dimmed" className="tnum">{e.sets.length} ×</Text> {exerciseName(e.exercise_id, e.name)}
            </Text>
            <Text size="sm" c="dimmed" className="tnum" style={{ flex: 'none' }}>{fmtSet(bestSet(e.sets) || e.sets[0])}</Text>
          </Group>
        ))}
        {more > 0 ? <Text size="xs" c="dimmed">+ {plural(more, 'ejercicio')} más</Text> : null}
      </Stack>
    </Card>
  );
}

export function HistoryList({ query }) {
  const workouts = useAnalysis(); // carga efectiva de peso corporal (volumen y récords)
  useCatalog();
  const day = query.get('day');
  const prs = useMemo(() => computePRs(workouts), [workouts]);
  const list = useMemo(() => (day ? workouts.filter((w) => dayKey(w.started_at) === day) : workouts), [workouts, day]);

  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [day]);
  const { ref: sentinel, entry } = useIntersection({ rootMargin: '600px' });
  useEffect(() => {
    if (entry?.isIntersecting && limit < list.length) setLimit((l) => l + PAGE);
  }, [entry?.isIntersecting, limit, list.length]);

  // Totales por mes sobre la lista completa; tarjetas solo hasta `limit`
  const groups = useMemo(() => {
    const out = [];
    const byKey = new Map();
    list.forEach((w, i) => {
      const d = new Date(w.started_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = byKey.get(key);
      if (!g) {
        g = {
          key, label: cap(fmtDate(w.started_at, { month: 'long', year: 'numeric' })), count: 0, volume: 0, items: [],
          reportKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        };
        byKey.set(key, g);
        out.push(g);
      }
      g.count++;
      g.volume += workoutVolume(w);
      if (i < limit) g.items.push(w);
    });
    return out.filter((g) => g.items.length);
  }, [list, limit]);

  return (
    <>
      <PageHeader
        title="Historial"
        subtitle={workouts.length ? plural(workouts.length, 'entrenamiento') : null}
        right={(
          <Button
            variant="light"
            size="compact-md"
            radius="xl"
            leftSection={<IconCalendarMonth size={17} />}
            onClick={() => navigate('/calendar')}
            data-testid="calendar-link"
          >
            Calendario
          </Button>
        )}
      />
      <Page gap="sm">
        {day ? (
          <Group className={classes.dayFilter} justify="space-between" wrap="nowrap">
            <Group gap={8} wrap="nowrap">
              <IconCalendarMonth size={18} color="var(--mantine-primary-color-filled)" />
              <Text size="sm" fw={550}>{cap(fmtDate(`${day}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' }))}</Text>
            </Group>
            <CloseButton size="md" onClick={() => navigate('/history')} aria-label="Ver todo el historial" />
          </Group>
        ) : null}

        {!list.length ? (
          <EmptyState
            icon={IconHistory}
            title={day ? 'Sin entrenamientos ese día' : 'Aún no hay entrenamientos'}
            description={day ? null : 'Ve a Entrenar para registrar el primero, o importa tu historial de Strong en Perfil.'}
            action={day
              ? <Button variant="light" onClick={() => navigate('/history')}>Ver todo</Button>
              : <Button onClick={() => navigate('/train')}>Ir a Entrenar</Button>}
          />
        ) : null}

        {groups.map((g) => (
          <Box key={g.key} component="section">
            <Group className={classes.monthHeader} justify="space-between" wrap="nowrap">
              <Box>
                <Text fw={700} size="sm">{g.label}</Text>
                <Anchor size="xs" fw={600} onClick={() => navigate(`/report/${g.reportKey}`)} data-testid="month-report">Ver resumen del mes</Anchor>
              </Box>
              <Text size="xs" c="dimmed" className="tnum">
                {plural(g.count, 'entreno', 'entrenos')} · {fmtVolume(g.volume)}
              </Text>
            </Group>
            <Stack gap="sm">
              {g.items.map((w) => <WorkoutCard key={w.id} w={w} marks={prs.get(w.id)} />)}
            </Stack>
          </Box>
        ))}
        {limit < list.length ? <Box ref={sentinel} h={40} /> : null}
      </Page>
    </>
  );
}
