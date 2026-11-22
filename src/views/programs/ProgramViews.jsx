// Programas (feature 12): tarjeta del programa activo en Entrenar, lista de programas, asistente para
// crear uno (5/3/1 o GZCLP), subir los máximos al cerrar un ciclo y el resultado de cada día.
import { useState } from 'react';
import {
  ActionIcon, Badge, Box, Button, Card, Checkbox, Group, Menu, Stack, Text,
} from '@mantine/core';
import {
  IconArrowBackUp, IconCalendarWeek, IconDots, IconPencil, IconPlayerPause, IconPlayerPlayFilled,
  IconPlayerSkipForward, IconPlus, IconRoute, IconTrash, IconTrendingUp,
} from '@tabler/icons-react';
import { openSheet } from '../../components/Sheet.jsx';
import { ExerciseThumb } from '../../components/ui.jsx';
import { confirmDialog, notify } from '../../components/dialogs.jsx';
import { useCatalog, useData } from '../../lib/hooks.js';
import { exerciseName, getExercise } from '../../lib/catalog.js';
import { state } from '../../lib/data.js';
import { fmtNum } from '../../lib/format.js';
import { navigate } from '../../lib/router.js';
import { dayPlan, KIND_LABEL, weeksOf } from '../../lib/programs.js';
import {
  activeProgram, applyBump, deleteProgram, dismissBump, pauseProgram, positionText, repeatDay, resumeProgram,
  setWeek, skipDay, startProgramDay,
} from '../../lib/program-runtime.js';
import { programLoad, tmOf } from '../../lib/tm.js';
import classes from '../workout/workout.module.css';

// "65 × 5 · 75 × 5 · 85 × 5+"
function setsText(exId, sets, tm) {
  return sets.map((s) => {
    const kg = s.pct > 0 ? (tm ? programLoad(exId, (tm * s.pct) / 100) : null) : s.weight;
    return `${kg ? `${fmtNum(kg)} × ` : ''}${s.reps}${s.amrap ? '+' : ''}`;
  }).join(' · ');
}

/** Lo que toca en el día actual: una fila por ejercicio del programa. */
function DayPreview({ p }) {
  const plan = dayPlan(p);
  return (
    <Stack gap={6} mt="sm">
      {plan.map((x) => (
        <Group key={`${x.prog.tier}-${x.exercise_id}`} gap="sm" wrap="nowrap">
          <ExerciseThumb exercise={getExercise(x.exercise_id)} name={exerciseName(x.exercise_id)} size={28} />
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" truncate="end">
              {x.prog.tier !== 'main' ? <b>{x.prog.tier} </b> : null}{exerciseName(x.exercise_id)}
            </Text>
            <Text size="xs" c="dimmed" className="tnum" data-testid="program-day-sets">
              {x.prog.test ? 'Prueba de 5RM' : setsText(x.exercise_id, x.sets, tmOf(x.exercise_id))}
            </Text>
          </Box>
        </Group>
      ))}
    </Stack>
  );
}

// ---------- Subir los máximos al cerrar un ciclo (5/3/1) ----------
export function BumpBox({ p }) {
  const [excluded, setExcluded] = useState(() => new Set());
  const list = p.state.pendingBump || [];
  if (!list.length) return null;
  const toggle = (ex) => setExcluded((s) => { const n = new Set(s); if (n.has(ex)) n.delete(ex); else n.add(ex); return n; });
  return (
    <Box className={classes.goal} style={{ display: 'block' }} data-testid="tm-bump">
      <Text size="sm" fw={650}>¿Subir tus máximos para el próximo ciclo?</Text>
      <Stack gap={4} mt={6}>
        {list.map((b) => (
          <Checkbox
            key={b.ex} size="sm" checked={!excluded.has(b.ex)} onChange={() => toggle(b.ex)} data-testid="tm-bump-row"
            label={`${exerciseName(b.ex)}: ${fmtNum(b.from)} → ${fmtNum(b.to)} kg`}
          />
        ))}
      </Stack>
      <Group gap="xs" mt="sm">
        <Button size="compact-sm" onClick={() => { applyBump(p, excluded); notify.success('Máximos actualizados'); }} data-testid="tm-bump-apply">
          Subir
        </Button>
        <Button size="compact-sm" variant="default" onClick={() => dismissBump(p)} data-testid="tm-bump-skip">No subir</Button>
      </Group>
    </Box>
  );
}

// ---------- Tarjeta del programa activo (Entrenar) ----------
export function ProgramCard() {
  useData();
  useCatalog();
  const p = activeProgram();
  if (!p) return null;
  const tplId = p.config.templates[p.state.day - 1];
  const askWeek = () => openSheet({
    title: 'Mover a otra semana',
    render: (close) => (
      <Stack gap="xs">
        {Array.from({ length: weeksOf(p) }, (_, i) => i + 1).map((w) => (
          <Button key={w} variant={w === p.state.week ? 'filled' : 'default'} onClick={() => { setWeek(p, w); close(); }} data-testid={`program-week-${w}`}>
            Semana {w}{w === 4 ? ' (descarga)' : ''}
          </Button>
        ))}
      </Stack>
    ),
  });
  return (
    <Card withBorder className={classes.templateCard} padding="md" data-testid="program-card">
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Box style={{ minWidth: 0 }}>
          <Group gap={6}>
            <Text fw={700} size="md" truncate="end">{p.name}</Text>
            {p.name !== KIND_LABEL[p.kind] ? <Badge size="sm" variant="light">{KIND_LABEL[p.kind]}</Badge> : null}
          </Group>
          <Text size="sm" c="dimmed" mt={2} data-testid="program-position">{positionText(p)}</Text>
        </Box>
        <Menu position="bottom-end" width={230}>
          <Menu.Target>
            <ActionIcon size={36} variant="subtle" color="gray" aria-label="Opciones del programa" data-testid="program-menu">
              <IconDots size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => navigate(`/template/${tplId}`)}>Editar este día (accesorios)</Menu.Item>
            <Menu.Item leftSection={<IconPlayerSkipForward size={16} />} onClick={() => skipDay(p)} data-testid="program-skip">Saltar este día</Menu.Item>
            <Menu.Item leftSection={<IconArrowBackUp size={16} />} onClick={() => repeatDay(p)} data-testid="program-repeat">Repetir el día anterior</Menu.Item>
            {p.kind === '531' ? (
              <Menu.Item leftSection={<IconCalendarWeek size={16} />} onClick={askWeek} data-testid="program-week">Mover a otra semana</Menu.Item>
            ) : null}
            <Menu.Divider />
            <Menu.Item leftSection={<IconPlayerPause size={16} />} onClick={() => pauseProgram(p)} data-testid="program-pause">Pausar programa</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <DayPreview p={p} />
      <BumpBox key={JSON.stringify(p.state.pendingBump)} p={p} />
      <Button
        mt="md" fullWidth radius="xl" leftSection={<IconPlayerPlayFilled size={14} />}
        onClick={() => startProgramDay(p)} data-testid="program-start"
      >
        Empezar
      </Button>
    </Card>
  );
}

// ---------- Resultado del día (resumen del entrenamiento) ----------
export function ProgramResult({ workoutId }) {
  useData();
  const p = state.programs.find((x) => x.state?.last?.workout_id === workoutId);
  if (!p) return null;
  return (
    <Card withBorder padding="md" data-testid="program-result">
      <Group gap={6}>
        <IconTrendingUp size={18} />
        <Text fw={700}>{p.name}: la próxima vez</Text>
      </Group>
      <Stack gap={2} mt={6}>
        {p.state.last.changes.map((c) => <Text key={c} size="sm" data-testid="program-change">{c}</Text>)}
      </Stack>
      <BumpBox key={JSON.stringify(p.state.pendingBump)} p={p} />
    </Card>
  );
}

// El asistente (con NumberInput) se carga recién al abrirlo
export const openProgramWizard = (kind) => import('./ProgramWizard.jsx').then((m) => m.openProgramWizard(kind));

// ---------- Lista de programas ----------
function ProgramsBody({ close }) {
  const { programs } = useData();
  const del = async (p) => {
    if (await confirmDialog({ title: `¿Eliminar "${p.name}"?`, message: 'Se borran sus plantillas. Tu historial no se modifica.', confirmLabel: 'Eliminar', danger: true })) {
      deleteProgram(p);
    }
  };
  return (
    <Stack gap="sm">
      <Group grow>
        <Button leftSection={<IconPlus size={16} />} variant="light" onClick={() => { close(); openProgramWizard('531'); }} data-testid="new-531">5/3/1</Button>
        <Button leftSection={<IconPlus size={16} />} variant="light" onClick={() => { close(); openProgramWizard('gzclp'); }} data-testid="new-gzclp">GZCLP</Button>
      </Group>
      <Text size="xs" c="dimmed">
        5/3/1: cuatro días, un principal por día, ciclos de 3 semanas con porcentajes de tu máximo. GZCLP: tres niveles (T1, T2, T3)
        que cambian de series y reps al fallar. Un programa activo a la vez.
      </Text>
      {programs.map((p) => (
        <Card key={p.id} withBorder padding="sm" data-testid="program-row">
          <Group justify="space-between" wrap="nowrap">
            <Box style={{ minWidth: 0 }}>
              <Text fw={650} truncate="end">{p.name}</Text>
              <Text size="xs" c="dimmed">{KIND_LABEL[p.kind]} · {positionText(p)} · {p.active ? 'activo' : 'en pausa'}</Text>
            </Box>
            <Group gap={4} wrap="nowrap">
              {p.active ? (
                <Button size="compact-sm" variant="default" onClick={() => pauseProgram(p)}>Pausar</Button>
              ) : (
                <Button size="compact-sm" variant="light" onClick={() => resumeProgram(p)} data-testid="program-resume">Retomar</Button>
              )}
              <ActionIcon variant="subtle" color="red" onClick={() => del(p)} aria-label={`Eliminar ${p.name}`}><IconTrash size={16} /></ActionIcon>
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

export const openPrograms = () => openSheet({ title: 'Programas', testId: 'programs-sheet', render: (close) => <ProgramsBody close={close} /> });

export const ProgramIcon = IconRoute;
