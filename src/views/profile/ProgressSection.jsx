// Progreso general: entrenamientos y volumen por semana, series por grupo muscular.
import { useMemo, useState } from 'react';
import { Text } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { ChartCard, RangeControl, dateShort, fnum, vol, volAxis } from '../../charts/charts.jsx';
import { HBarList, PeriodBarChart } from '../../charts/bars.jsx';
import { EmptyState } from '../../components/ui.jsx';
import { getExercise } from '../../lib/catalog.js';
import { useCatalog } from '../../lib/hooks.js';
import { state } from '../../lib/data.js';
import { weeklySummary } from '../../lib/stats.js';
import { mondayOf, setsByBodyPart } from './summary.js';
import { MuscleSection } from './MuscleSection.jsx';

const RANGES = [[12, '12 semanas'], [26, '6 meses'], [52, '1 año']];
let rememberedRange = 12; // se conserva al cambiar de pestaña

const times = (v) => `${fnum(v, 0)} ${v === 1 ? 'entrenamiento' : 'entrenamientos'}`;
const avgOf = (list, key) => (list.length ? list.reduce((a, w) => a + w[key], 0) / list.length : 0);
const ThisWeek = () => <Text size="xs" c="dimmed" mt={2}>esta semana</Text>;

export function ProgressSection({ workouts }) {
  const [range, setRange] = useState(rememberedRange);
  const catalogVersion = useCatalog();
  const onRange = (v) => { rememberedRange = v; setRange(v); };

  const weeks = useMemo(() => weeklySummary(workouts, range), [workouts, range]);
  const parts = useMemo(
    () => setsByBodyPart(workouts, weeks[0].date, getExercise),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, weeks, catalogVersion, state.exercises, state.exercise_prefs],
  );

  const bars = (key) => weeks.map((w, i) => ({
    date: w.date, value: w[key], label: `Semana del ${dateShort(w.date)}`, partial: i === weeks.length - 1,
  }));
  // Semanas completas desde que hay registros (no diluir el promedio con semanas previas)
  const firstWeek = workouts.length ? mondayOf(workouts.at(-1).started_at) : new Date();
  const done = weeks.slice(0, -1).filter((w) => w.date >= firstWeek);
  const now = weeks.at(-1);
  const avgCount = avgOf(done, 'count');
  const avgVolume = avgOf(done, 'volume');
  const label = RANGES.find(([k]) => k === range)[1];

  return (
    <>
      <RangeControl options={RANGES} value={range} onChange={onRange} />

      <ChartCard
        title="Entrenamientos por semana"
        subtitle={`Promedio: ${fnum(avgCount)} por semana`}
        value={now.count}
        delta={<ThisWeek />}
      >
        <PeriodBarChart bars={bars('count')} format={times} axisFormat={(v) => fnum(v, 0)} average={avgCount} averageFormat={(v) => fnum(v)} integer />
      </ChartCard>

      <ChartCard
        title="Volumen por semana"
        subtitle={`Promedio: ${vol(avgVolume)} por semana · kg × reps`}
        value={vol(now.volume)}
        delta={<ThisWeek />}
      >
        <PeriodBarChart bars={bars('volume')} format={vol} axisFormat={volAxis} average={avgVolume} color="grape.5" />
      </ChartCard>

      <MuscleSection workouts={workouts} />

      <ChartCard
        title="Series por grupo muscular"
        subtitle={`Series efectivas · últimas ${label}`}
        value={parts.total ? fnum(parts.total, 0) : null}
        delta={parts.total ? <Text size="xs" c="dimmed" mt={2}>series</Text> : null}
      >
        {parts.items.length ? (
          <HBarList items={parts.items} />
        ) : (
          <EmptyState icon={IconChartBar} title="Sin series en este periodo" description="Completa series en un entrenamiento para ver cómo se reparte tu trabajo." />
        )}
      </ChartCard>
    </>
  );
}
