// Pestaña Entrenar: inicio rápido (vacío o continuar), resumen de la semana y plantillas.
import { useMemo } from 'react';
import {
  ActionIcon, Avatar, Badge, Box, Button, Card, Group, Menu, Stack, Text, ThemeIcon,
} from '@mantine/core';
import {
  IconBolt, IconCalendarWeek, IconCopy, IconDots, IconFlame, IconPencil, IconPlayerPlayFilled, IconPlus,
  IconTemplate, IconTrash, IconWeight,
} from '@tabler/icons-react';
import { Page, PageHeader } from '../components/PageHeader.jsx';
import { EmptyState, ExerciseThumb, SectionTitle, StatGrid, StatTile } from '../components/ui.jsx';
import { confirmDialog, notify } from '../components/dialogs.jsx';
import { useActiveWorkout, useCatalog, useData, useNow } from '../lib/hooks.js';
import { remove, state, upsert } from '../lib/data.js';
import { exerciseName, getExercise } from '../lib/catalog.js';
import { workoutVolume } from '../lib/stats.js';
import { fmtClock, fmtDate, fmtVolume, plural, uid } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { startWorkout } from '../lib/workout.js';
import classes from './workout/workout.module.css';

const monday = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};

const templatesCount = () => state.templates.length;

// "Hoy", "Ayer", "Hace 3 días", o la fecha
export function relativeDay(iso) {
  if (!iso) return null;
  const a = new Date(iso); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  const days = Math.round((b - a) / 864e5);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 14) return `Hace ${days} días`;
  return fmtDate(iso, { day: 'numeric', month: 'short', year: a.getFullYear() === b.getFullYear() ? undefined : 'numeric' });
}

function weekStats(workouts) {
  const start = monday(Date.now());
  const thisWeek = workouts.filter((w) => new Date(w.started_at) >= start);
  // Racha: semanas consecutivas (hasta la actual o la anterior) con al menos un entrenamiento
  const weeks = new Set(workouts.map((w) => +monday(w.started_at)));
  let streak = 0;
  const cur = new Date(start);
  if (!weeks.has(+cur)) cur.setDate(cur.getDate() - 7);
  while (weeks.has(+cur)) { streak++; cur.setDate(cur.getDate() - 7); }
  return { count: thisWeek.length, volume: thisWeek.reduce((a, w) => a + workoutVolume(w), 0), streak };
}

function Hero() {
  const active = useActiveWorkout();
  const now = useNow(1000, !!active);
  if (active) {
    const done = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
    const total = active.exercises.reduce((a, e) => a + e.sets.length, 0);
    return (
      <Card className={classes.heroActive} padding="lg">
        <Group gap="xs" mb={6}>
          <span className={classes.pulseDot} />
          <Text size="xs" fw={700} tt="uppercase" c="teal.6" style={{ letterSpacing: '0.08em' }}>En curso</Text>
        </Group>
        <Text fw={700} size="lg" truncate="end">{active.name}</Text>
        <Text size="sm" c="dimmed" className="tnum">
          {fmtClock(now - new Date(active.started_at))} · {done}/{total} series
        </Text>
        <Button
          mt="md" size="lg" fullWidth color="teal" leftSection={<IconPlayerPlayFilled size={18} />}
          onClick={() => navigate('/workout')} data-testid="continue-workout"
        >
          Continuar entrenamiento
        </Button>
      </Card>
    );
  }
  return (
    <Card className={classes.hero} padding="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Text fw={750} fz={22} lh={1.2} c="white">¿Listo para entrenar?</Text>
          <Text size="sm" mt={4} className={classes.heroSub}>Empieza en blanco o elige una de tus plantillas.</Text>
        </Box>
        <ThemeIcon size={48} radius="xl" className={classes.heroIcon}><IconBolt size={26} /></ThemeIcon>
      </Group>
      <Button
        mt="lg" size="lg" fullWidth variant="white" color="dark" leftSection={<IconPlus size={20} />}
        onClick={() => startWorkout()} data-testid="start-empty"
      >
        Entrenamiento vacío
      </Button>
    </Card>
  );
}

function TemplateCard({ t, lastDone }) {
  const sets = t.exercises.reduce((a, e) => a + e.sets.length, 0);
  const shown = t.exercises.slice(0, 4);
  const duplicate = () => {
    upsert('templates', { ...structuredClone(t), id: uid('t_'), name: `${t.name} (copia)`, position: templatesCount() });
    notify.success(`Duplicaste "${t.name}"`);
  };
  const del = async () => {
    if (await confirmDialog({ title: `¿Eliminar "${t.name}"?`, message: 'Tu historial no se modifica.', confirmLabel: 'Eliminar', danger: true })) {
      remove('templates', t.id);
    }
  };
  return (
    <Card withBorder className={classes.templateCard} padding="md" data-testid="template-card">
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Box style={{ minWidth: 0 }}>
          <Text fw={700} size="md" truncate="end">{t.name}</Text>
          <Text size="xs" c="dimmed" mt={2}>
            {plural(t.exercises.length, 'ejercicio')} · {plural(sets, 'serie')}
          </Text>
        </Box>
        <Menu>
          <Menu.Target>
            <ActionIcon size={36} variant="subtle" color="gray" aria-label="Opciones de plantilla" data-testid="template-menu">
              <IconDots size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => navigate(`/template/${t.id}`)}>Editar</Menu.Item>
            <Menu.Item leftSection={<IconCopy size={16} />} onClick={duplicate}>Duplicar</Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={del}>Eliminar</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {t.exercises.length ? (
        <Stack gap={6} mt="sm">
          {shown.map((e, i) => (
            <Group key={i} gap="sm" wrap="nowrap">
              <ExerciseThumb exercise={getExercise(e.exercise_id)} name={e.name} size={28} />
              <Text size="sm" truncate="end" style={{ flex: 1 }}>{exerciseName(e.exercise_id, e.name)}</Text>
              <Text size="xs" c="dimmed" className="tnum">{e.sets.length} ×</Text>
            </Group>
          ))}
          {t.exercises.length > shown.length ? (
            <Text size="xs" c="dimmed" pl={40}>+{t.exercises.length - shown.length} más</Text>
          ) : null}
        </Stack>
      ) : <Text size="sm" c="dimmed" mt="sm">Sin ejercicios</Text>}

      <Group justify="space-between" mt="md" wrap="nowrap">
        <Badge variant="light" color={lastDone ? 'gray' : 'brand'} size="md" leftSection={<IconCalendarWeek size={12} />}>
          {lastDone ? relativeDay(lastDone) : 'Nunca realizada'}
        </Badge>
        <Button
          size="sm" radius="xl" leftSection={<IconPlayerPlayFilled size={14} />}
          onClick={() => startWorkout({ template: t })} data-testid="template-start"
        >
          Empezar
        </Button>
      </Group>
    </Card>
  );
}

export function TrainView() {
  const { workouts, templates } = useData();
  useCatalog();
  const stats = useMemo(() => weekStats(workouts), [workouts]);
  const lastDone = useMemo(() => {
    const m = new Map();
    for (const w of workouts) if (w.template_id && !m.has(w.template_id)) m.set(w.template_id, w.started_at);
    return m;
  }, [workouts]);

  return (
    <>
      <PageHeader
        title="Entrenar"
        right={(
          <Button
            variant="light" size="compact-md" radius="xl" leftSection={<IconPlus size={16} />}
            onClick={() => navigate('/template/new')} data-testid="new-template"
          >
            Plantilla
          </Button>
        )}
      />
      <Page>
        <Hero />
        <StatGrid cols={3}>
          <StatTile label="Esta semana" value={stats.count} hint={stats.count === 1 ? 'entrenamiento' : 'entrenamientos'} icon={IconCalendarWeek} />
          <StatTile label="Volumen" value={fmtVolume(stats.volume)} hint="esta semana" icon={IconWeight} color="grape" />
          <StatTile label="Racha" value={stats.streak} hint={stats.streak === 1 ? 'semana' : 'semanas'} icon={IconFlame} color="orange" />
        </StatGrid>

        <SectionTitle>Mis plantillas ({templates.length})</SectionTitle>
        {templates.length ? (
          <Stack gap="sm">
            {templates.map((t) => <TemplateCard key={t.id} t={t} lastDone={lastDone.get(t.id)} />)}
          </Stack>
        ) : (
          <Card withBorder className={classes.templateCard}>
            <EmptyState
              icon={IconTemplate}
              title="Sin plantillas todavía"
              description="Crea una rutina para empezar con un toque, o guarda un entrenamiento del historial como plantilla."
              action={<Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => navigate('/template/new')}>Crear plantilla</Button>}
            />
          </Card>
        )}
      </Page>
    </>
  );
}
