// Detalle de un entrenamiento: celebración al terminar, resumen, récords,
// comparación con la vez anterior y series por ejercicio.
import { useMemo } from 'react';
import { ActionIcon, Anchor, Badge, Box, Button, Card, Group, Menu, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconCopy, IconDots, IconNote, IconPencil, IconPlayerPlay, IconTemplate, IconTrash, IconTrophy, IconConfetti,
  IconClock, IconStack2, IconWeight, IconMoodSad,
} from '@tabler/icons-react';
import { useCatalog, useData } from '../../lib/hooks.js';
import { navigate } from '../../lib/router.js';
import { remove, upsert, workoutById } from '../../lib/data.js';
import { exerciseName } from '../../lib/catalog.js';
import { computePRs, prCount, workoutVolume, workoutDuration, isWorking, setVolume } from '../../lib/stats.js';
import { previousOf, startWorkout, templateFromWorkout } from '../../lib/workout.js';
import { fmtDate, fmtDuration, fmtNum, fmtSet, fmtTime, fmtVolume } from '../../lib/format.js';
import { Page, PageHeader } from '../../components/PageHeader.jsx';
import { EmptyState, ExerciseThumb, SectionTitle, StatGrid, StatTile, DeltaBadge } from '../../components/ui.jsx';
import { confirmDialog, notify, promptDialog } from '../../components/dialogs.jsx';
import { getExercise } from '../../lib/catalog.js';
import classes from './history.module.css';

const TYPE_COLOR = { W: 'orange', D: 'grape', F: 'red' };
const TYPE_TITLE = { W: 'Calentamiento', D: 'Drop set', F: 'Al fallo' };

const exVolume = (w, exId) => (w.exercises || []).filter((e) => e.exercise_id === exId)
  .flatMap((e) => e.sets).filter(isWorking)
  .reduce((a, s) => a + (s.weight ? setVolume(s) : s.reps || 0), 0);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (a, b) => (a ? Math.round((b / a - 1) * 100) : null);

function SetLabel({ type, n }) {
  if (!type || type === 'N') return <span className={classes.setNum}>{n}</span>;
  return (
    <Badge size="md" variant="light" color={TYPE_COLOR[type]} className={classes.setType} title={TYPE_TITLE[type]}>{type}</Badge>
  );
}

function Celebration({ prs }) {
  return (
    <Card className={classes.celebrate} radius="lg" p="lg">
      <Group wrap="nowrap" gap="md">
        <ThemeIcon size={52} radius="xl" variant="white" color="brand" className={classes.celebrateIcon}>
          {prs ? <IconTrophy size={28} /> : <IconConfetti size={28} />}
        </ThemeIcon>
        <Box>
          <Text fw={750} size="lg" c="white" lh={1.2}>¡Entrenamiento guardado! 💪</Text>
          <Text size="sm" c="rgba(255,255,255,0.85)" mt={2}>
            {prs ? `Rompiste ${prs} récord${prs > 1 ? 's' : ''} personal${prs > 1 ? 'es' : ''}.` : 'Sin récords nuevos esta vez.'}
          </Text>
        </Box>
      </Group>
    </Card>
  );
}

function RecordsCard({ w, marks }) {
  const n = prCount(marks);
  if (!n) return null;
  const items = [];
  marks.forEach((labels, key) => {
    const [ei, si] = key.split(':').map(Number);
    const e = w.exercises[ei];
    items.push({ key, name: exerciseName(e.exercise_id, e.name), set: e.sets[si], labels });
  });
  return (
    <Card withBorder className={classes.prCard} padding="md">
      <Text fw={700} mb="xs">{`🏆 ${n} récord${n > 1 ? 's' : ''}`}</Text>
      <Stack gap={10}>
        {items.map((it) => (
          <Group key={it.key} justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
            <Box style={{ minWidth: 0 }}>
              <Text size="sm" fw={600} truncate="end">{it.name}</Text>
              <Text size="xs" c="dimmed" className="tnum">{fmtSet(it.set)}</Text>
            </Box>
            <Group gap={4} wrap="wrap" justify="flex-end" style={{ flex: 'none', maxWidth: '50%' }}>
              {it.labels.map((l) => <Badge key={l} size="sm" color="yellow" variant="filled">{l}</Badge>)}
            </Group>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function CompareCard({ w, prev }) {
  const rows = useMemo(() => [...new Set(w.exercises.map((e) => e.exercise_id))].map((exId) => {
    const a = exVolume(prev, exId), b = exVolume(w, exId);
    return a || b ? { exId, a, b, name: exerciseName(exId, w.exercises.find((e) => e.exercise_id === exId).name) } : null;
  }).filter(Boolean), [w, prev]);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  return (
    <Card withBorder className={classes.surfaceCard} padding="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={650}>Contra la última vez</Text>
        <Text size="xs" c="dimmed">{fmtDate(prev.started_at, { day: 'numeric', month: 'short' }).replace('.', '')}</Text>
      </Group>
      <Stack gap="md">
        {rows.map((r) => {
          const d = pct(r.a, r.b);
          return (
            <Box key={r.exId}>
              <Group justify="space-between" wrap="nowrap" gap="xs" mb={6}>
                <Text size="sm" fw={550} truncate="end">{r.name}</Text>
                {d == null ? <Badge size="sm" variant="light" color="brand">nuevo</Badge> : <DeltaBadge value={d} />}
              </Group>
              <Box className={classes.cmpRow}>
                <Box className={classes.cmpTrack}><Box className={classes.cmpPrev} style={{ '--w': `${(r.a / max) * 100}%` }} /></Box>
                <Text size="xs" c="dimmed" className={`${classes.cmpVal} tnum`}>{r.a ? fmtNum(r.a, 0) : '—'}</Text>
              </Box>
              <Box className={classes.cmpRow}>
                <Box className={classes.cmpTrack}><Box className={classes.cmpNow} style={{ '--w': `${(r.b / max) * 100}%` }} /></Box>
                <Text size="xs" fw={650} className={`${classes.cmpVal} tnum`}>{fmtNum(r.b, 0)}</Text>
              </Box>
            </Box>
          );
        })}
      </Stack>
      <Group gap="md" mt="md">
        <Group gap={6}><span className={classes.dotPrev} /><Text size="xs" c="dimmed">La vez anterior</Text></Group>
        <Group gap={6}><span className={classes.dotNow} /><Text size="xs" c="dimmed">Hoy</Text></Group>
      </Group>
      <Text size="xs" c="dimmed" mt={6}>Volumen = kg × reps (o reps si es sin peso).</Text>
    </Card>
  );
}

function ExerciseBlock({ e, ei, marks }) {
  let n = 0;
  const ex = getExercise(e.exercise_id);
  return (
    <Card withBorder className={classes.surfaceCard} padding="md">
      <Group wrap="nowrap" gap="sm" mb="xs">
        <ExerciseThumb exercise={ex} name={e.name} size={40} />
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Anchor href={`#/exercise/${encodeURIComponent(e.exercise_id)}`} fw={650} size="sm" c="var(--mantine-color-text)" className={classes.exLink} lineClamp={1}>
            {exerciseName(e.exercise_id, e.name)}
          </Anchor>
          <Text size="xs" c="dimmed">{e.sets.length} {e.sets.length === 1 ? 'serie' : 'series'}</Text>
        </Box>
      </Group>
      {e.notes ? <Text size="sm" c="dimmed" mb="xs" fs="italic">{e.notes}</Text> : null}
      <Stack gap={0}>
        {e.sets.map((s, si) => {
          const label = !s.type || s.type === 'N' ? ++n : null;
          const badges = marks?.get(`${ei}:${si}`) || [];
          return (
            <Group key={si} className={classes.setRow} wrap="nowrap" gap="sm" data-pr={badges.length ? true : undefined}>
              <SetLabel type={s.type} n={label} />
              <Text size="sm" fw={550} className="tnum" style={{ flex: 1 }}>
                {fmtSet(s)}
                {s.rpe ? <Text span size="xs" c="dimmed" fw={400}> @{fmtNum(s.rpe)}</Text> : null}
              </Text>
              <Group gap={4} wrap="wrap" justify="flex-end">
                {badges.map((b) => (
                  <Badge key={b} size="sm" color="yellow" variant="light" data-testid="pr-badge">🏆 {b}</Badge>
                ))}
              </Group>
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}

export function WorkoutDetail({ id, query }) {
  const { workouts } = useData();
  useCatalog();
  const w = workoutById(id);
  const prsAll = useMemo(() => computePRs(workouts), [workouts]);

  if (!w) {
    return (
      <>
        <PageHeader title="Entrenamiento" back backFallback="/history" />
        <Page>
          <EmptyState icon={IconMoodSad} title="Entrenamiento no encontrado" action={<Button onClick={() => navigate('/history')}>Volver al historial</Button>} />
        </Page>
      </>
    );
  }

  const marks = prsAll.get(w.id);
  const prs = prCount(marks);
  const prev = previousOf(w);
  const vol = workoutVolume(w);
  const sets = w.exercises.reduce((a, e) => a + e.sets.filter(isWorking).length, 0);
  const prevVol = prev ? workoutVolume(prev) : 0;
  const delta = prevVol ? Math.round((vol / prevVol - 1) * 100) : null;
  const done = query?.get('done');

  const edit = () => navigate(`/workout/${w.id}/edit`);
  const repeat = () => startWorkout({ from: w });
  const saveTemplate = async () => {
    const name = await promptDialog({ title: 'Guardar como plantilla', label: 'Nombre de la plantilla', initial: w.name });
    if (!name) return;
    upsert('templates', templateFromWorkout(w, name));
    notify.success(`Plantilla "${name}" creada`);
    navigate('/train');
  };
  const del = async () => {
    if (await confirmDialog({ title: '¿Eliminar este entrenamiento?', message: 'No se puede deshacer.', confirmLabel: 'Eliminar', danger: true })) {
      remove('workouts', w.id);
      notify.success('Entrenamiento eliminado');
      navigate('/history', { replace: true });
    }
  };

  return (
    <>
      <PageHeader
        title="Entrenamiento"
        back={done ? '/history' : true}
        backFallback="/history"
        right={(
          <Menu>
            <Menu.Target>
              <ActionIcon size={40} aria-label="Más opciones"><IconDots size={22} /></ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={16} />} onClick={edit}>Editar entrenamiento</Menu.Item>
              <Menu.Item leftSection={<IconCopy size={16} />} onClick={repeat}>Repetir entrenamiento</Menu.Item>
              <Menu.Item leftSection={<IconTemplate size={16} />} onClick={saveTemplate}>Crear plantilla</Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={del}>Eliminar entrenamiento</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      />
      <Page gap="md">
        {done ? <Celebration prs={prs} /> : null}

        <Box>
          <Title order={2} className={classes.detailTitle}>{w.name}</Title>
          <Text size="sm" c="dimmed" mt={2}>
            {cap(fmtDate(w.started_at))} · {fmtTime(w.started_at)}
          </Text>
        </Box>

        <Box data-testid="summary-stats">
          <StatGrid cols={3}>
            <StatTile label="Duración" icon={IconClock} value={fmtDuration(workoutDuration(w))} />
            <StatTile label="Series" icon={IconStack2} value={sets} hint="efectivas" />
            <StatTile
              label="Volumen"
              icon={IconWeight}
              value={fmtVolume(vol)}
              hint={delta == null ? 'kg × reps' : `${delta > 0 ? '+' : ''}${delta} % vs anterior`}
              tone={delta > 0 ? 'up' : delta < 0 ? 'down' : undefined}
            />
          </StatGrid>
        </Box>

        <RecordsCard w={w} marks={marks} />
        {prev ? <CompareCard w={w} prev={prev} /> : null}

        {w.notes ? (
          <Card withBorder className={classes.surfaceCard} padding="md">
            <Group gap={8} wrap="nowrap" align="flex-start">
              <IconNote size={18} color="var(--mantine-color-dimmed)" style={{ flex: 'none', marginTop: 2 }} />
              <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{w.notes}</Text>
            </Group>
          </Card>
        ) : null}

        <SectionTitle>Ejercicios</SectionTitle>
        {w.exercises.map((e, ei) => <ExerciseBlock key={ei} e={e} ei={ei} marks={marks} />)}

        <Stack gap="xs" mt="sm">
          <Button size="lg" leftSection={<IconPlayerPlay size={18} />} onClick={repeat}>Repetir este entrenamiento</Button>
          <Group gap="xs" wrap="nowrap">
            <Button variant="default" leftSection={<IconPencil size={16} />} onClick={edit} style={{ flex: '0 0 auto' }}>Editar</Button>
            <Button variant="default" leftSection={<IconTemplate size={16} />} onClick={saveTemplate} style={{ flex: 1 }}>Guardar como plantilla</Button>
          </Group>
          <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={del}>Eliminar</Button>
        </Stack>
      </Page>
    </>
  );
}
