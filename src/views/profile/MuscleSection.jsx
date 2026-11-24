// Estímulo directo por músculo: mapa del cuerpo (frente y espalda) coloreado por estado y lista
// de músculos, con los rezagados primero. Solo avisa de poco volumen; mucho volumen es "Bien".
import { useMemo, useState } from 'react';
import { Badge, Box, Group, SegmentedControl, Stack, Text, UnstyledButton } from '@mantine/core';
import { ChartCard, fnum } from '../../charts/charts.jsx';
import { openSheet } from '../../components/Sheet.jsx';
import { promptDialog, notify } from '../../components/dialogs.jsx';
import { exerciseName, getExercise } from '../../lib/catalog.js';
import { prefsOf, saveSettings, state } from '../../lib/data.js';
import { useAnalysis, useCatalog, useData, useInsights, useSettings } from '../../lib/hooks.js';
import { progressByPart } from '../../lib/insights.js';
import { RATE_DOWN, RATE_UP } from '../../lib/trend.js';
import { regionStats, regionsFor } from '../../lib/regions.js';
import { openMuscleAssign } from '../exercises/MuscleAssign.jsx';
import { DEFAULT_MUSCLE_TARGET, muscleStats } from '../../lib/muscles.js';
import { navigate } from '../../lib/router.js';
import { BodyMap } from './BodyMap.jsx';
import classes from './MuscleSection.module.css';

export const STATUS_COLOR = {
  low: 'var(--mantine-color-red-6)',
  fair: 'var(--mantine-color-yellow-5)',
  good: 'var(--mantine-color-teal-6)',
};
const STATUS_LABEL = { low: 'Sube el volumen', fair: 'Mejorable', good: 'Bien' };
const PERIODS = [{ value: '28', label: '4 semanas' }, { value: '7', label: '7 días' }];
let rememberedDays = '28';
let rememberedMode = 'sets';
const MODES = [{ value: 'sets', label: 'Series' }, { value: 'progress', label: 'Progreso' }];

// Modo "Progreso" (feature 17): ritmo mediano de los ejercicios de cada grupo
const PROGRESS_COLOR = {
  sube: 'var(--mantine-color-teal-6)',
  plano: 'var(--mantine-color-yellow-5)',
  baja: 'var(--mantine-color-orange-6)',
};
const PROGRESS_LABEL = { sube: 'Subiendo', plano: 'Plano', baja: 'Bajando' };
const progressStatus = (rate) => (rate > RATE_UP ? 'sube' : rate < RATE_DOWN ? 'baja' : 'plano');
const pctMonth = (v) => `${v > 0 ? '+' : ''}${fnum(v, 1)} %/mes`;

function ProgressDetail({ part, p, close }) {
  return (
    <Stack gap="sm" data-testid="muscle-progress-detail">
      <Group gap="sm" align="baseline">
        <Text fz={32} fw={750} lh={1} className="tnum">{pctMonth(p.rate)}</Text>
        <Text c="dimmed">mediana de {p.n} {p.n === 1 ? 'ejercicio' : 'ejercicios'}</Text>
      </Group>
      <Stack gap={2}>
        {p.exercises.map((e) => (
          <UnstyledButton key={e.id} className={classes.row} onClick={() => { close(); navigate(`/exercise/${encodeURIComponent(e.id)}`); }}>
            <span className={classes.dot} style={{ background: PROGRESS_COLOR[e.status] }} />
            <Text size="sm" fw={550} truncate="end" style={{ flex: 1 }}>{exerciseName(e.id)}</Text>
            <Text size="sm" className="tnum">{pctMonth(e.rate)}</Text>
          </UnstyledButton>
        ))}
      </Stack>
      <Text size="xs" c="dimmed">
        Ritmo del 1RM estimado de cada ejercicio de {part} en sus últimas 12 sesiones (últimos 4 meses). Solo cuentan los
        que tienen al menos 6 sesiones en 21 días.
      </Text>
    </Stack>
  );
}

function ProgressMap() {
  const ins = useInsights();
  const catalogVersion = useCatalog();
  const [selected, setSelected] = useState(null);
  const data = useMemo(
    () => progressByPart((id) => getExercise(id)?.bodyPart),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ins, catalogVersion, state.exercises],
  );
  const sorted = [...data].sort((a, b) => a[1].rate - b[1].rate);
  const open = (part) => {
    const p = data.get(part);
    if (!p) return;
    setSelected(part);
    openSheet({ title: part, onClose: () => setSelected(null), render: (close) => <ProgressDetail part={part} p={p} close={close} /> });
  };
  if (!data.size) {
    return <Text size="sm" c="dimmed" data-testid="muscle-progress-empty">El progreso por músculo aparece cuando tus ejercicios tienen 6 sesiones en al menos 21 días.</Text>;
  }
  return (
    <Box data-testid="muscle-progress">
      <BodyMap colorOf={(part) => (data.has(part) ? PROGRESS_COLOR[progressStatus(data.get(part).rate)] : 'transparent')} selected={selected} onSelect={open} />
      <Group gap="md" justify="center" mt="sm" mb="md" className={classes.legend}>
        {['baja', 'plano', 'sube'].map((st) => (
          <Group key={st} gap={6} wrap="nowrap">
            <span className={classes.dot} style={{ background: PROGRESS_COLOR[st] }} />
            <Text size="xs" c="dimmed">{st === 'baja' ? `Menos de ${fnum(RATE_DOWN, 1)} %` : st === 'plano' ? 'Plano' : `Más de +${fnum(RATE_UP, 0)} %`}</Text>
          </Group>
        ))}
      </Group>
      <Stack gap={2}>
        {sorted.map(([part, p]) => {
          const st = progressStatus(p.rate);
          return (
            <UnstyledButton key={part} className={classes.row} onClick={() => open(part)} data-testid="muscle-progress-row" data-status={st}>
              <span className={classes.dot} style={{ background: PROGRESS_COLOR[st] }} />
              <Text size="sm" fw={600} style={{ flex: 1 }} truncate="end">{part}</Text>
              <Text size="sm" fw={700} className="tnum">{pctMonth(p.rate)}</Text>
              <Text size="xs" c={st === 'baja' ? 'orange.7' : 'dimmed'} fw={st === 'baja' ? 700 : 500} className={classes.status}>{PROGRESS_LABEL[st]}</Text>
            </UnstyledButton>
          );
        })}
      </Stack>
    </Box>
  );
}

const perWeekText = (v) => `${fnum(v, v < 10 ? 1 : 0)}/sem`;

const regionsOfId = (id) => prefsOf(id)?.regions;
const partOfId = (id) => getExercise(id)?.bodyPart;

function RegionList({ part, days, weeks, close }) {
  const workouts = useAnalysis();
  useData();
  const catalogVersion = useCatalog();
  const r = useMemo(
    () => regionStats(workouts, { group: part, days, weeks, partOf: partOfId, regionsOf: regionsOfId, nameOf: exerciseName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, part, days, weeks, catalogVersion, state.exercise_prefs],
  );
  if (!regionsFor(part).length) return null;
  const any = r.regions.some((x) => x.sets || x.unworked);
  return (
    <Box data-testid="muscle-regions">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>Por región</Text>
      {any ? (
        <Stack gap={2}>
          {r.regions.map((x) => (
            <Group key={x.key} className={classes.row} wrap="nowrap" data-testid="region-row" data-unworked={x.unworked || undefined}>
              <Text size="sm" fw={550} style={{ flex: 1 }} truncate="end">{x.label}</Text>
              {x.unworked ? <Badge size="sm" variant="light" color="orange" data-testid="region-unworked">Sin trabajar esta semana</Badge> : null}
              <Text size="sm" c={x.sets ? undefined : 'dimmed'} className="tnum">{x.sets ? `${fnum(x.perWeek, 1)}/sem` : '—'}</Text>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">Asigna a cada ejercicio la región que busca para ver aquí cómo se reparten las series.</Text>
      )}
      {r.unassigned.length ? (
        <Box mt="sm">
          <Text size="xs" c="dimmed" mb={4}>Sin región asignada:</Text>
          <Stack gap={2}>
            {r.unassigned.map((e) => (
              <UnstyledButton key={e.id} className={classes.row} onClick={() => openMuscleAssign({ id: e.id, name: e.name })} data-testid="region-assign">
                <Text size="sm" fw={550} truncate="end" style={{ flex: 1 }}>{e.name}</Text>
                <Text size="xs" fw={600} c="brand">Asignar</Text>
              </UnstyledButton>
            ))}
          </Stack>
        </Box>
      ) : null}
      <Text size="xs" c="dimmed" mt={6}>
        Cada serie suma 1 a cada región de su ejercicio. "Sin trabajar esta semana": tiene series en las últimas 4
        semanas y ninguna en los últimos 7 días.
      </Text>
    </Box>
  );
}

function MuscleDetail({ g, target, weeks, days, close }) {
  const missing = Math.max(0, target - g.perWeek);
  return (
    <Stack gap="md" data-testid="muscle-detail">
      <Group gap="sm" align="baseline">
        <Text fz={32} fw={750} lh={1} className="tnum">{fnum(g.perWeek, 1)}</Text>
        <Text c="dimmed">series directas por semana</Text>
      </Group>
      <Box className={classes.verdict} data-status={g.status}>
        {g.status === 'low' ? (
          <Text size="sm" fw={600}>
            {g.sets ? 'Rezagado: recibe poco estímulo directo.' : 'Sin estímulo directo en este periodo.'} Sube el
            volumen: te faltan {fnum(missing, 1)} series por semana para la meta de {target}.
          </Text>
        ) : g.status === 'fair' ? (
          <Text size="sm" fw={600}>
            Mejorable: te faltan {fnum(missing, 1)} series por semana para la meta de {target}.
          </Text>
        ) : (
          <Text size="sm" fw={600}>Bien: recibe estímulo directo suficiente.</Text>
        )}
      </Box>
      <RegionList part={g.part} days={days} weeks={weeks} close={close} />
      {g.exercises.length ? (
        <Box>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>Ejercicios que lo trabajan directo</Text>
          <Stack gap={2}>
            {g.exercises.map((e) => (
              <UnstyledButton
                key={e.id} className={classes.row}
                onClick={() => { close(); navigate(`/exercise/${encodeURIComponent(e.id)}`); }}
              >
                <Text size="sm" fw={550} truncate="end" style={{ flex: 1 }}>{e.name}</Text>
                <Text size="sm" c="dimmed" className="tnum">{fnum(e.sets / weeks, 1)}/sem · {e.sets} series</Text>
              </UnstyledButton>
            ))}
          </Stack>
        </Box>
      ) : null}
      <Text size="xs" c="dimmed">
        Solo cuentan las series efectivas de ejercicios cuyo grupo es {g.part}. Si un ejercicio está mal
        catalogado, cambia su grupo en su ficha (Músculo).
      </Text>
    </Stack>
  );
}

export function MuscleSection({ workouts }) {
  const settings = useSettings();
  const catalogVersion = useCatalog();
  const [days, setDays] = useState(rememberedDays);
  const [mode, setMode] = useState(rememberedMode);
  const [selected, setSelected] = useState(null);
  const target = settings.muscleTarget || DEFAULT_MUSCLE_TARGET;

  const data = useMemo(
    () => muscleStats(workouts, {
      days: Number(days), target, partOf: (id) => getExercise(id)?.bodyPart, nameOf: exerciseName,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, days, target, catalogVersion, state.exercises, state.exercise_prefs],
  );
  const byPart = useMemo(() => new Map(data.groups.map((g) => [g.part, g])), [data]);
  const sorted = useMemo(() => [...data.groups].sort((a, b) => a.perWeek - b.perWeek || a.part.localeCompare(b.part)), [data]);
  const lagging = data.groups.filter((g) => g.status === 'low').length;

  const open = (part) => {
    const g = byPart.get(part);
    if (!g) return;
    setSelected(part);
    openSheet({
      title: part,
      onClose: () => setSelected(null),
      render: (close) => <MuscleDetail g={g} target={target} weeks={data.weeks} days={Number(days)} close={close} />,
    });
  };
  const changeTarget = async () => {
    const v = await promptDialog({
      title: 'Meta de series directas',
      label: 'Series directas por semana para considerar un músculo "Bien"',
      initial: String(target), confirmLabel: 'Guardar',
    });
    const n = Math.round(Number(String(v ?? '').replace(',', '.')));
    if (v == null) return;
    if (!(n >= 1 && n <= 40)) { notify.warn('Usa un número entre 1 y 40'); return; }
    saveSettings({ muscleTarget: n });
  };

  return (
    <ChartCard
      title="Estímulo directo por músculo"
      subtitle="Series efectivas por semana de ejercicios de ese músculo"
      value={lagging || null}
      delta={lagging ? <Text size="xs" c="red.6" fw={600} mt={2}>{lagging === 1 ? 'rezagado' : 'rezagados'}</Text> : null}
      data-testid="muscle-card"
    >
      <SegmentedControl
        fullWidth size="xs" radius="md" mb="xs" data={MODES} value={mode}
        onChange={(v) => { rememberedMode = v; setMode(v); }} data-testid="muscle-mode"
      />
      {mode === 'progress' ? <ProgressMap /> : (<>
      <SegmentedControl
        fullWidth size="xs" radius="md" mb="md" data={PERIODS} value={days}
        onChange={(v) => { rememberedDays = v; setDays(v); }}
      />
      <BodyMap colorOf={(p) => STATUS_COLOR[byPart.get(p)?.status] || 'transparent'} selected={selected} onSelect={open} />

      <Group gap="md" justify="center" mt="sm" mb="md" className={classes.legend}>
        {['low', 'fair', 'good'].map((s) => (
          <Group key={s} gap={6} wrap="nowrap">
            <span className={classes.dot} style={{ background: STATUS_COLOR[s] }} />
            <Text size="xs" c="dimmed">
              {s === 'low' ? `Menos de ${fnum(target / 2, 1)}` : s === 'fair' ? `Entre ${fnum(target / 2, 1)} y ${target}` : `${target} o más`}
            </Text>
          </Group>
        ))}
      </Group>

      <Stack gap={2}>
        {sorted.map((g) => (
          <UnstyledButton key={g.part} className={classes.row} onClick={() => open(g.part)} data-testid="muscle-row" data-status={g.status}>
            <span className={classes.dot} style={{ background: STATUS_COLOR[g.status] }} />
            <Text size="sm" fw={600} style={{ flex: 1 }} truncate="end">{g.part}</Text>
            <Text size="sm" fw={700} className="tnum">{perWeekText(g.perWeek)}</Text>
            <Text size="xs" fw={g.status === 'low' ? 700 : 500} c={g.status === 'low' ? 'red.6' : 'dimmed'} className={classes.status}>
              {STATUS_LABEL[g.status]}
            </Text>
          </UnstyledButton>
        ))}
      </Stack>

      <Text size="xs" c="dimmed" mt="sm">
        Meta: {target} series directas por semana.{' '}
        <UnstyledButton component="span" className={classes.link} onClick={changeTarget} data-testid="muscle-target">Cambiar</UnstyledButton>
      </Text>
      {data.unassignedExercises.length ? (
        <Box mt="sm" data-testid="muscle-unassigned">
          <Text size="xs" c="dimmed" mb={4}>
            Sin grupo muscular ({data.unassigned} series que no cuentan). Asígnalo para que cuenten:
          </Text>
          <Stack gap={2}>
            {data.unassignedExercises.map((e) => (
              <UnstyledButton key={e.id} className={classes.row} onClick={() => openMuscleAssign({ id: e.id, name: e.name })}>
                <Text size="sm" fw={550} truncate="end" style={{ flex: 1 }}>{e.name}</Text>
                <Text size="xs" fw={600} c="brand">Asignar</Text>
              </UnstyledButton>
            ))}
          </Stack>
        </Box>
      ) : null}
      </>)}
    </ChartCard>
  );
}
