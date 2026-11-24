// Detalle de un entrenamiento: celebración al terminar, resumen, récords,
// comparación con la vez anterior y series por ejercicio.
import { useMemo } from 'react';
import { ActionIcon, Anchor, Badge, Box, Button, Card, Group, Menu, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconCopy, IconDots, IconNote, IconPencil, IconPlayerPlay, IconTemplate, IconTrash, IconTrophy, IconConfetti,
  IconClock, IconStack2, IconWeight, IconMoodSad,
} from '@tabler/icons-react';
import { useAnalysis, useCatalog, useStreak } from '../../lib/hooks.js';
import { navigate } from '../../lib/router.js';
import { remove, upsert, workoutById } from '../../lib/data.js';
import { exerciseName } from '../../lib/catalog.js';
import { bestSet, computePRs, e1rm, prCount, workoutVolume, workoutDuration, isWorking, setVolume } from '../../lib/stats.js';
import { previousOf, startWorkout, templateFromWorkout } from '../../lib/workout.js';
import { fmtDate, fmtDuration, fmtNum, fmtSet, fmtTime, fmtVolume } from '../../lib/format.js';
import { fmtSecs } from '../../lib/kinds.js';
import { Page, PageHeader } from '../../components/PageHeader.jsx';
import { EmptyState, ExerciseThumb, SectionTitle, StatGrid, StatTile, DeltaBadge } from '../../components/ui.jsx';
import { confirmDialog, notify, promptDialog } from '../../components/dialogs.jsx';
import { getExercise } from '../../lib/catalog.js';
import { WorkoutMuscles } from './WorkoutMuscles.jsx';
import { ProgramResult } from '../programs/ProgramViews.jsx';
import { SessionScore } from './SessionScore.jsx';
import classes from './history.module.css';

const TYPE_COLOR = { W: 'orange', D: 'grape', F: 'red' };
const TYPE_TITLE = { W: 'Calentamiento', D: 'Drop set', F: 'Al fallo' };

const exVolume = (w, exId) => (w.exercises || []).filter((e) => e.exercise_id === exId)
  .flatMap((e) => e.sets).filter(isWorking)
  .reduce((a, s) => a + (s.weight ? setVolume(s) : s.reps || s.seconds || 0), 0);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (a, b) => (a ? Math.round((b / a - 1) * 100) : null);

function SetLabel({ type, n }) {
  if (!type || type === 'N') return <span className={classes.setNum}>{n}</span>;
  return (
    <Badge size="md" variant="light" color={TYPE_COLOR[type]} className={classes.setType} title={TYPE_TITLE[type]}>{type}</Badge>
  );
}

// Racha tras guardar (feature 09). Al volver después de un corte, mensaje positivo: nunca se nombra
// la racha perdida.
function streakLine(s) {
  if (s.comeback) return 'Volviste. Primer entrenamiento de una nueva racha.';
  if (!s.current) return null;
  if (s.unit === 'entrenamientos') return `Racha: ${s.current} ${s.current === 1 ? 'seguido' : 'seguidos'}.`;
  if (s.mode === 'semanal' && s.status !== 'cumplida') return `${s.thisWeek} de ${s.perWeek} esta semana.`;
  return `Semana ${s.current} seguida.`;
}

function Celebration({ prs }) {
  const line = streakLine(useStreak());
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
          {line ? <Text size="sm" fw={650} c="white" mt={4} data-testid="celebrate-streak">{line}</Text> : null}
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

// Mejor serie de un ejercicio en un entrenamiento y su "fuerza":
// 1RM estimado si lleva peso, o máximo de repeticiones si es sin peso.
function exerciseStats(w, exId) {
  const working = (w.exercises || []).filter((e) => e.exercise_id === exId).flatMap((e) => e.sets).filter(isWorking);
  const best = bestSet(working);
  const mode = !best ? null : best.weight && best.reps ? 'kg' : best.reps ? 'reps' : 'time';
  return {
    best,
    weighted: mode === 'kg',
    mode,
    strength: !best ? 0 : mode === 'kg' ? e1rm(best.weight, best.reps)
      : Math.max(...working.map((s) => (mode === 'reps' ? s.reps || 0 : s.seconds || 0))),
    volume: exVolume(w, exId),
  };
}

// Compara cada ejercicio con la vez anterior. La cifra principal es la fuerza
// (1RM estimado de la mejor serie, o reps si es sin peso); el volumen va aparte,
// porque subir de peso con menos series baja el volumen aunque estés más fuerte.
function CompareCard({ w, prev }) {
  const rows = useMemo(() => [...new Set(w.exercises.map((e) => e.exercise_id))].map((exId) => {
    const a = exerciseStats(prev, exId);
    const b = exerciseStats(w, exId);
    if (!b.best) return null;
    const comparable = a.best && a.mode === b.mode;
    return { exId, a: comparable ? a : null, b, name: exerciseName(exId, w.exercises.find((e) => e.exercise_id === exId).name) };
  }).filter(Boolean), [w, prev]);
  if (!rows.length) return null;
  const unit = (r, v) => (r.b.mode === 'kg' ? `${fmtNum(v)} kg` : r.b.mode === 'time' ? fmtSecs(v) : `${fmtNum(v, 0)} reps`);
  const vol = (r, v) => (r.b.mode === 'kg' ? fmtVolume(v) : r.b.mode === 'time' ? fmtSecs(v) : `${fmtNum(v, 0)} reps`);
  return (
    <Card withBorder className={classes.surfaceCard} padding="md">
      <Group justify="space-between" mb={2} wrap="nowrap">
        <Text fw={650}>Contra la última vez</Text>
        <Text size="xs" c="dimmed">{fmtDate(prev.started_at, { day: 'numeric', month: 'short' }).replace('.', '')}</Text>
      </Group>
      <Text size="xs" c="dimmed" mb="md">Fuerza: 1RM estimado de tu mejor serie (reps si es sin peso).</Text>
      <Stack gap="lg">
        {rows.map((r) => {
          const d = r.a ? Math.round((r.b.strength / r.a.strength - 1) * 1000) / 10 : null;
          const dv = r.a ? pct(r.a.volume, r.b.volume) : null;
          const max = Math.max(1, r.b.strength, r.a?.strength || 0);
          return (
            <Box key={r.exId} data-testid="compare-row">
              <Group justify="space-between" wrap="nowrap" gap="xs" mb={6}>
                <Text size="sm" fw={550} truncate="end">{r.name}</Text>
                {d == null ? <Badge size="sm" variant="light" color="brand">nuevo</Badge> : <DeltaBadge value={d} />}
              </Group>
              {r.a ? (
                <Box className={classes.cmpRow}>
                  <Box className={classes.cmpTrack}><Box className={classes.cmpPrev} style={{ '--w': `${(r.a.strength / max) * 100}%` }} /></Box>
                  <Text size="xs" c="dimmed" className={`${classes.cmpVal} tnum`}>{unit(r, r.a.strength)}</Text>
                </Box>
              ) : null}
              <Box className={classes.cmpRow}>
                <Box className={classes.cmpTrack}><Box className={classes.cmpNow} style={{ '--w': `${(r.b.strength / max) * 100}%` }} /></Box>
                <Text size="xs" fw={650} className={`${classes.cmpVal} tnum`}>{unit(r, r.b.strength)}</Text>
              </Box>
              <Text size="xs" c="dimmed" mt={6} className="tnum">
                Mejor serie {fmtSet(r.b.best)}{r.a ? ` (antes ${fmtSet(r.a.best)})` : ''}
                {' · '}{r.b.mode === 'time' ? 'Tiempo total' : 'Volumen'} {vol(r, r.b.volume)}
                {r.a ? ` (antes ${vol(r, r.a.volume)}${dv ? `, ${dv > 0 ? '+' : ''}${dv} %` : ''})` : ''}
              </Text>
            </Box>
          );
        })}
      </Stack>
      <Group gap="md" mt="md">
        <Group gap={6}><span className={classes.dotPrev} /><Text size="xs" c="dimmed">La vez anterior</Text></Group>
        <Group gap={6}><span className={classes.dotNow} /><Text size="xs" c="dimmed">Hoy</Text></Group>
      </Group>
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
  const workouts = useAnalysis(); // carga efectiva de peso corporal/lastre/asistidos, solo para mostrar
  useCatalog();
  const raw = workoutById(id); // para editar, repetir o crear plantilla: lo guardado
  const w = (raw && workouts.find((x) => x.id === id)) || raw;
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
  const prevRaw = previousOf(w);
  const prev = prevRaw && (workouts.find((x) => x.id === prevRaw.id) || prevRaw);
  const vol = workoutVolume(w);
  const sets = w.exercises.reduce((a, e) => a + e.sets.filter(isWorking).length, 0);
  const prevVol = prev ? workoutVolume(prev) : 0;
  const delta = prevVol ? Math.round((vol / prevVol - 1) * 100) : null;
  const done = query?.get('done');

  const edit = () => navigate(`/workout/${w.id}/edit`);
  const repeat = () => startWorkout({ from: raw });
  const saveTemplate = async () => {
    const name = await promptDialog({ title: 'Guardar como plantilla', label: 'Nombre de la plantilla', initial: w.name });
    if (!name) return;
    upsert('templates', templateFromWorkout(raw, name));
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
        {done ? <ProgramResult workoutId={w.id} /> : null}

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

        <SessionScore w={w} />
        <RecordsCard w={w} marks={marks} />
        <WorkoutMuscles w={w} />
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
