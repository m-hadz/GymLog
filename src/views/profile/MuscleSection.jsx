// Estímulo directo por músculo: mapa del cuerpo (frente y espalda) coloreado por estado y lista
// de músculos, con los rezagados primero. Solo avisa de poco volumen; mucho volumen es "Bien".
import { useMemo, useState } from 'react';
import { Box, Group, SegmentedControl, Stack, Text, UnstyledButton } from '@mantine/core';
import { ChartCard, fnum } from '../../charts/charts.jsx';
import { openSheet } from '../../components/Sheet.jsx';
import { promptDialog, notify } from '../../components/dialogs.jsx';
import { exerciseName, getExercise } from '../../lib/catalog.js';
import { saveSettings } from '../../lib/data.js';
import { useCatalog, useSettings } from '../../lib/hooks.js';
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

const perWeekText = (v) => `${fnum(v, v < 10 ? 1 : 0)}/sem`;

function MuscleDetail({ g, target, weeks, close }) {
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
        catalogado, cambia su grupo en su ficha (Descripción → Editar).
      </Text>
    </Stack>
  );
}

export function MuscleSection({ workouts }) {
  const settings = useSettings();
  const catalogVersion = useCatalog();
  const [days, setDays] = useState(rememberedDays);
  const [selected, setSelected] = useState(null);
  const target = settings.muscleTarget || DEFAULT_MUSCLE_TARGET;

  const data = useMemo(
    () => muscleStats(workouts, {
      days: Number(days), target, partOf: (id) => getExercise(id)?.bodyPart, nameOf: exerciseName,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, days, target, catalogVersion],
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
      render: (close) => <MuscleDetail g={g} target={target} weeks={data.weeks} close={close} />,
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
        {data.unassigned ? ` ${data.unassigned} series de ejercicios sin grupo muscular no cuentan.` : ''}
      </Text>
    </ChartCard>
  );
}
