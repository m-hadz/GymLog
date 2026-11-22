// Resumen mensual (#/report/2026-11) y anual (#/report/2026), feature 07. Secciones en tarjetas
// que se recorren con scroll; selector de periodo arriba. Los cálculos están en lib/report.js.
import { useMemo } from 'react';
import {
  ActionIcon, Badge, Box, Button, Card, Group, SegmentedControl, Stack, Text, UnstyledButton,
} from '@mantine/core';
import { IconCalendarStats, IconChevronLeft, IconChevronRight, IconShare, IconTrophy } from '@tabler/icons-react';
import { openShareSheet } from './report/ShareSheet.jsx';
import { Page, PageHeader } from '../components/PageHeader.jsx';
import { DeltaBadge, EmptyState, StatGrid } from '../components/ui.jsx';
import { ChartCard, fnum, vol, volAxis } from '../charts/charts.jsx';
import { HBarList, PeriodBarChart } from '../charts/bars.jsx';
import { useAnalysis, useCatalog } from '../lib/hooks.js';
import { exerciseName, getExercise } from '../lib/catalog.js';
import { kindOf } from '../lib/effective.js';
import { MIN_YEAR_WORKOUTS, monthReport, reportPeriods, yearReport } from '../lib/report.js';
import { fmtDate, fmtDuration, fmtNum, fmtSet, fmtVolume, plural } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { state, syncedSettings } from '../lib/data.js';
import classes from './report.module.css';

import { monthNameOf as monthName } from './profile/reportNames.js';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n) => String(n).padStart(2, '0');
const shortDay = (d) => fmtDate(d, { day: 'numeric', month: 'short' }).replace('.', '');
const STATUS = {
  progresando: ['Progresando', 'teal'], manteniendo: ['Manteniendo', 'gray'], bajando: ['Bajando', 'orange'], nuevo: ['Sin comparación', 'blue'],
};
const strengthText = (x, v) => (x.metric === 'e1rm' ? `${fmtNum(v, 1)} kg` : `${fmtNum(v, 0)} reps`);

// Meses desde el primer entrenamiento hasta hoy
function monthList(first, now = new Date()) {
  const out = [];
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= now; d.setMonth(d.getMonth() + 1)) {
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1, key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` });
  }
  return out;
}

function Tile({ label, value, delta, first }) {
  return (
    <Card withBorder padding="sm" className={classes.tile}>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">{label}</Text>
      <Text fw={750} fz={22} lh={1.2} className="tnum">{value}</Text>
      {first ? null : delta == null ? <Text size="xs" c="dimmed">—</Text> : <DeltaBadge value={delta} />}
    </Card>
  );
}

function Section({ title, subtitle, children, ...rest }) {
  return (
    <Card withBorder padding="md" className={classes.card} {...rest}>
      <Text fw={650}>{title}</Text>
      {subtitle ? <Text size="xs" c="dimmed" mb="sm">{subtitle}</Text> : <Box mb="sm" />}
      {children}
    </Card>
  );
}

function Totals({ r, title }) {
  const prevLabel = r.kind === 'month' ? 'el mes anterior' : `${r.year - 1}`;
  return (
    <Section
      title={<Group gap={8}>{title}{r.partial ? <Badge size="sm" variant="light" color="brand">Hasta hoy</Badge> : null}</Group>}
      subtitle={r.first ? 'Primer periodo registrado: sin comparación.' : `Contra ${prevLabel}${r.partial ? ' (completo)' : ''}.`}
      data-testid="report-totals"
    >
      <StatGrid cols={2}>
        <Tile label="Entrenamientos" value={r.totals.workouts} delta={r.delta?.workouts} first={r.first} />
        <Tile label="Tiempo" value={fmtDuration(r.totals.ms)} delta={r.delta?.ms} first={r.first} />
        <Tile label="Volumen" value={fmtVolume(r.totals.volume)} delta={r.delta?.volume} first={r.first} />
        <Tile label="Series efectivas" value={r.totals.sets} delta={r.delta?.sets} first={r.first} />
      </StatGrid>
    </Section>
  );
}

function MonthCalendar({ r }) {
  const offset = (new Date(r.year, r.month - 1, 1).getDay() + 6) % 7;
  const trained = new Set(r.days);
  const cells = [...Array(offset).fill(null), ...Array.from({ length: r.daysInMonth }, (_, i) => i + 1)];
  return (
    <Section title="Días entrenados" subtitle={plural(r.days.length, 'día', 'días')} data-testid="report-calendar">
      <Box className={classes.cal}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <Text key={i} size="xs" c="dimmed" ta="center" fw={600}>{d}</Text>)}
        {cells.map((d, i) => (
          <Box key={i} className={classes.day} data-on={d && trained.has(d) ? true : undefined}>{d || ''}</Box>
        ))}
      </Box>
    </Section>
  );
}

function Constancy({ r }) {
  const c = r.constancy;
  return (
    <Section title="Constancia" data-testid="report-constancy">
      <Text size="sm">
        <b>{c.trained} de {c.weeks}</b> semanas con al menos un entrenamiento.
        {' '}Racha al cierre: <b>{plural(c.streak, 'semana', 'semanas')}</b>.
        {r.kind === 'year' ? <> Racha más larga del año: <b>{plural(r.longestStreak, 'semana', 'semanas')}</b>.</> : null}
      </Text>
      {c.cadence ? (
        <Text size="sm" mt={6} data-testid="report-cadence">
          Con tu meta: racha al cierre de <b>{c.cadence.streak} {c.cadence.streak === 1 ? 'seguido' : 'seguidos'}</b>,
          {' '}{c.cadence.breaks ? <b>{plural(c.cadence.breaks, 'corte', 'cortes')}</b> : 'sin cortes'} en el periodo
          {c.cadence.avgGap != null ? <>, y un entrenamiento cada <b>{fmtNum(c.cadence.avgGap, 1)} días</b> en promedio</> : null}.
        </Text>
      ) : null}
    </Section>
  );
}

const go = (id) => navigate(`/exercise/${encodeURIComponent(id)}`);

function Records({ r }) {
  return (
    <Section title={`Récords: ${r.records.count}`} subtitle={r.records.top.length ? 'Las mayores mejoras de 1RM estimado' : 'Sin mejoras de 1RM estimado en este periodo.'} data-testid="report-records">
      <Stack gap={0}>
        {r.records.top.map((x) => (
          <UnstyledButton key={x.id} className={classes.row} onClick={() => go(x.id)}>
            <IconTrophy size={16} color="var(--mantine-color-yellow-filled)" style={{ flex: 'none' }} />
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate="end">{x.name}</Text>
              <Text size="xs" c="dimmed">{fmtSet(x.set)} · {shortDay(x.date)}</Text>
            </Box>
            <Text size="sm" fw={700} c="teal" className="tnum">+{fmtNum(x.gain * 100, 1)} %</Text>
          </UnstyledButton>
        ))}
      </Stack>
    </Section>
  );
}

function Progress({ r }) {
  const counts = r.progress.reduce((a, x) => ({ ...a, [x.status]: (a[x.status] || 0) + 1 }), {});
  if (!r.progress.some((x) => x.status !== 'nuevo')) return null; // nada con qué comparar
  return (
    <Section
      title="Progreso por ejercicio"
      subtitle={`Ejercicios hechos 2 o más veces: mejor 1RM estimado contra ${r.kind === 'month' ? 'el mes anterior' : 'el año anterior'}.`}
      data-testid="report-progress"
    >
      <Group gap={6} mb="sm">
        {Object.entries(STATUS).filter(([k]) => counts[k]).map(([k, [label, color]]) => (
          <Badge key={k} variant="light" color={color}>{counts[k]} {label.toLowerCase()}</Badge>
        ))}
      </Group>
      <Stack gap={0}>
        {r.progress.map((x) => (
          <UnstyledButton key={x.id} className={classes.row} onClick={() => go(x.id)} data-testid="report-progress-row">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate="end">{x.name}</Text>
              <Text size="xs" c="dimmed" className="tnum">
                {x.prev != null ? `${strengthText(x, x.prev)} → ` : ''}{strengthText(x, x.value)}
              </Text>
            </Box>
            <Badge size="sm" variant="light" color={STATUS[x.status][1]} className="tnum">
              {x.change != null ? `${x.change > 0 ? '+' : ''}${fmtNum(x.change * 100, 1)} %` : STATUS[x.status][0]}
            </Badge>
          </UnstyledButton>
        ))}
      </Stack>
    </Section>
  );
}

function Stalls({ r }) {
  if (!r.stalls) return null;
  return (
    <Section
      title={`Estancados al cierre: ${r.stalls.list.length}`}
      subtitle={r.stalls.recovered.length ? `${plural(r.stalls.recovered.length, 'ejercicio salió', 'ejercicios salieron')} de la lista con un reinicio: ${r.stalls.recovered.map((x) => x.name).join(', ')}.` : null}
      data-testid="report-stalls"
    >
      {r.stalls.list.length ? (
        <Stack gap={0}>
          {r.stalls.list.map((x) => (
            <UnstyledButton key={x.id} className={classes.row} onClick={() => go(x.id)}>
              <Text size="sm" fw={600} truncate="end" style={{ flex: 1 }}>{x.name}</Text>
              <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
            </UnstyledButton>
          ))}
        </Stack>
      ) : <Text size="sm" c="dimmed">Ninguno.</Text>}
    </Section>
  );
}

function Common({ r }) {
  return (
    <>
      <Constancy r={r} />
      <Records r={r} />
      {r.topExercises.length ? (
        <Section title="Ejercicios más hechos" subtitle="Por series efectivas" data-testid="report-top">
          <HBarList items={r.topExercises.map((x) => ({ label: x.name, value: x.sets }))} format={(v) => `${fnum(v, 0)} series`} />
        </Section>
      ) : null}
      <Progress r={r} />
      {r.muscles.length ? (
        <Section title="Series por músculo" subtitle={`Entre paréntesis, ${r.kind === 'month' ? 'el mes anterior' : 'el año anterior'}`} data-testid="report-muscles">
          <HBarList items={r.muscles.map((x) => ({ label: x.part, value: x.sets, hint: `(${x.prev})` }))} />
        </Section>
      ) : null}
    </>
  );
}

function MonthBody({ r }) {
  return (
    <>
      <Totals r={r} title={cap(`${monthName(r.month)} ${r.year}`)} />
      <MonthCalendar r={r} />
      <Common r={r} />
      {r.bestWeek ? (
        <Section title="Mejor semana" data-testid="report-best-week">
          <Text size="sm">
            La del <b>{shortDay(r.bestWeek.monday)}</b>: {fmtVolume(r.bestWeek.volume)} en {plural(r.bestWeek.workouts, 'entrenamiento')}.
          </Text>
        </Section>
      ) : null}
      <Stalls r={r} />
    </>
  );
}

function YearBody({ r }) {
  const bars = (key) => r.months.map((m) => ({
    date: new Date(r.year, m.month - 1, 1), value: m[key], label: cap(monthName(m.month)),
    partial: r.partial && m.month === new Date().getMonth() + 1 && r.year === new Date().getFullYear(),
  }));
  return (
    <>
      <Totals r={r} title={`Tu ${r.year}`} />
      <Section title={`${fmtVolume(r.totals.volume)} levantados`} data-testid="report-cars">
        <Text size="sm">Como levantar <b>{fmtNum(r.cars, 0)} autos</b> de 1,5 toneladas.</Text>
      </Section>
      <ChartCard title="Entrenamientos por mes" subtitle={r.bestMonth ? `Mejor mes: ${monthName(r.bestMonth.month)} (${fmtVolume(r.bestMonth.volume)})` : null}>
        <PeriodBarChart bars={bars('workouts')} format={(v) => plural(v, 'entrenamiento')} axisFormat={(v) => fnum(v, 0)} integer />
      </ChartCard>
      <ChartCard title="Volumen por mes" subtitle="kg × reps">
        <PeriodBarChart bars={bars('volume')} format={vol} axisFormat={volAxis} color="grape.5" />
      </ChartCard>
      <Common r={r} />
      {r.firstLast.length ? (
        <Section title="Mejora en tus ejercicios más hechos" subtitle="Mejor 1RM estimado del primer mes contra el del último mes con datos" data-testid="report-first-last">
          <Stack gap={0}>
            {r.firstLast.map((x) => (
              <UnstyledButton key={x.id} className={classes.row} onClick={() => go(x.id)}>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate="end">{x.name}</Text>
                  <Text size="xs" c="dimmed" className="tnum">
                    {monthName(x.fromMonth)}: {strengthText(x, x.from)} → {monthName(x.toMonth)}: {strengthText(x, x.to)}
                  </Text>
                </Box>
                <DeltaBadge value={Math.round(x.gain * 1000) / 10} />
              </UnstyledButton>
            ))}
          </Stack>
        </Section>
      ) : null}
      {r.newExercises.length ? (
        <Section title={`Ejercicios nuevos: ${r.newExercises.length}`} data-testid="report-new">
          <Text size="sm">{r.newExercises.map((x) => x.name).join(' · ')}</Text>
        </Section>
      ) : null}
      <Stalls r={r} />
    </>
  );
}

/**
 * @param {{year:number, month?:number|null}} p sin `month`, resumen anual
 */
export function ReportView({ year, month = null }) {
  const workouts = useAnalysis();
  const catalogVersion = useCatalog();
  const { months, years } = useMemo(() => reportPeriods(workouts), [workouts]);
  const first = workouts.length ? new Date(workouts.at(-1).started_at) : new Date();
  const list = useMemo(() => monthList(first), [first.getFullYear(), first.getMonth()]); // eslint-disable-line react-hooks/exhaustive-deps
  const isYear = month == null;

  const r = useMemo(() => {
    const opts = {
      nameOf: (id, n) => exerciseName(id, n || id),
      partOf: (id) => getExercise(id)?.bodyPart || 'Otro',
      stallable: (id) => kindOf(id) !== 'tiempo',
      goal: syncedSettings().goal,
      pauses: syncedSettings().pauses,
    };
    return isYear ? yearReport(workouts, year, opts) : monthReport(workouts, year, month, opts);
  }, [workouts, year, month, isYear, catalogVersion, state.exercises, state.exercise_prefs, state.user_settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = isYear ? String(year) : `${year}-${pad(month)}`;
  const enabled = isYear
    ? [...years].filter(([, n]) => n >= MIN_YEAR_WORKOUTS).map(([y]) => String(y)).sort()
    : list.filter((m) => months.has(m.key)).map((m) => m.key);
  const idx = enabled.indexOf(key);
  const step = (d) => {
    const target = idx >= 0 ? enabled[idx + d] : d < 0 ? [...enabled].reverse().find((k) => k < key) : enabled.find((k) => k > key);
    if (target) navigate(`/report/${target}`, { replace: true });
  };
  const switchKind = (v) => {
    if (v === 'year') navigate(`/report/${year}`, { replace: true });
    else navigate(`/report/${enabled.length && isYear ? (list.filter((m) => months.has(m.key) && m.year === year).at(-1)?.key || `${year}-01`) : key}`, { replace: true });
  };

  const options = isYear
    ? [...years.keys()].sort().map((y) => ({ value: String(y), label: String(y), disabled: years.get(y) < MIN_YEAR_WORKOUTS }))
    : list.map((m) => ({ value: m.key, label: cap(`${monthName(m.month)} ${m.year}`), disabled: !months.has(m.key) }));
  if (!options.some((o) => o.value === key)) options.push({ value: key, label: isYear ? key : cap(`${monthName(month)} ${year}`), disabled: true });

  const shareable = !(r.empty || (isYear && !r.available));
  const share = () => {
    const title = isYear ? `Mi ${year} en el gym` : cap(`${monthName(month)} ${year}`);
    const prevLabel = isYear ? `${year - 1}` : monthName(month === 1 ? 12 : month - 1);
    const subtitle = [r.partial ? 'Hasta hoy' : null, r.first ? 'Primer periodo registrado' : `Contra ${prevLabel}`].filter(Boolean).join(' · ');
    openShareSheet({ r, title, subtitle, filename: `gymlog-resumen-${key}.png` });
  };

  return (
    <>
      <PageHeader
        title="Resumen" back backFallback="/profile"
        right={shareable ? (
          <ActionIcon size={40} variant="subtle" onClick={share} aria-label="Compartir resumen" data-testid="report-share">
            <IconShare size={22} />
          </ActionIcon>
        ) : null}
      />
      <Page>
        <SegmentedControl
          fullWidth value={isYear ? 'year' : 'month'} onChange={switchKind}
          data={[{ value: 'month', label: 'Mes' }, { value: 'year', label: 'Año' }]} data-testid="report-kind"
        />
        <Group gap="xs" wrap="nowrap">
          <ActionIcon size={40} variant="default" onClick={() => step(-1)} disabled={!enabled.some((k) => k < key)} aria-label="Periodo anterior" data-testid="report-prev">
            <IconChevronLeft size={20} />
          </ActionIcon>
          <select
            className={classes.select} value={key} aria-label="Periodo" data-testid="report-period"
            onChange={(e) => navigate(`/report/${e.currentTarget.value}`, { replace: true })}
          >
            {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}{o.disabled ? ' (sin datos)' : ''}</option>)}
          </select>
          <ActionIcon size={40} variant="default" onClick={() => step(1)} disabled={!enabled.some((k) => k > key)} aria-label="Periodo siguiente" data-testid="report-next">
            <IconChevronRight size={20} />
          </ActionIcon>
        </Group>

        {r.empty || (isYear && !r.available) ? (
          <EmptyState
            icon={IconCalendarStats}
            title={isYear ? `Sin resumen de ${year}` : 'Sin entrenamientos este mes'}
            description={isYear ? `El resumen anual aparece con al menos ${MIN_YEAR_WORKOUTS} entrenamientos en el año.` : 'Elige otro mes en el selector.'}
          />
        ) : (
          <>
            {isYear ? <YearBody r={r} /> : <MonthBody r={r} />}
            <Button size="md" variant="light" leftSection={<IconShare size={18} />} onClick={share} data-testid="report-share-bottom">
              Compartir resumen
            </Button>
          </>
        )}
      </Page>
    </>
  );
}
