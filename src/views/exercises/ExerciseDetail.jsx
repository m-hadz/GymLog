// Ficha de ejercicio: cabecera con imagen y cifras clave, y cuatro pestañas
// (Descripción, Historial, Gráficas, Registros). Se usa como página y dentro de una
// hoja inferior desde el editor de entrenamiento, por eso no trae encabezado propio.
import { useMemo, useState } from 'react';
import {
  Badge, Box, Button, Card, Group, Image, SimpleGrid, Stack, Table, Tabs, Text, ThemeIcon, UnstyledButton,
} from '@mantine/core';
import {
  IconBarbell, IconCalendarEvent, IconChevronRight, IconEdit, IconFlame, IconRepeat, IconStack2, IconTrash, IconTrophy,
  IconWeight,
} from '@tabler/icons-react';
import { useCatalog, useData } from '../../lib/hooks.js';
import { getExercise } from '../../lib/catalog.js';
import { remove } from '../../lib/data.js';
import { computePRs, e1rm, exerciseRecords, exerciseSessions } from '../../lib/stats.js';
import { fmtDate, fmtNum, fmtSet, fmtTime } from '../../lib/format.js';
import { goBack, navigate } from '../../lib/router.js';
import { ChartCard, DeltaText, RangeControl, TrendChart, dateLong, deltaOf, fnum, kg, kgAxis } from '../../charts/charts.jsx';
import { EmptyState, ExerciseThumb, StatGrid, StatTile } from '../../components/ui.jsx';
import { confirmDialog } from '../../components/dialogs.jsx';
import { openExerciseForm } from '../../components/ExercisePicker.jsx';
import classes from './ExerciseDetail.module.css';

const TABS = [['about', 'Descripción'], ['history', 'Historial'], ['charts', 'Gráficas'], ['records', 'Registros']];
const RANGES = [['1m', '1M', 31], ['3m', '3M', 92], ['6m', '6M', 183], ['1y', '1A', 366], ['all', 'Todo', null]];
const LEVEL = { beginner: 'Principiante', intermediate: 'Intermedio', expert: 'Avanzado' };

// Recordados mientras la app está abierta
let lastTab = 'about';
let lastRange = 'all';

const shortDate = (iso) => fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const setLabel = (s, n) => (!s.type || s.type === 'N' ? String(n) : s.type);

/**
 * @param {object} p
 * @param {string} p.id
 * @param {string|number} [p.stickyTop]  posición del selector de pestañas fijo (página: bajo el encabezado)
 */
export function ExerciseDetail({ id, stickyTop = 0 }) {
  const { workouts } = useData();
  useCatalog();
  const ex = getExercise(id);
  const sessions = useMemo(() => exerciseSessions(workouts, id), [workouts, id]);
  const [tab, setTab] = useState(lastTab);
  const name = ex?.name || sessions.at(-1)?.workout.exercises.find((e) => e.exercise_id === id)?.name || 'Ejercicio';
  const weighted = sessions.some((s) => s.maxWeight > 0);

  const change = (t) => { lastTab = t; setTab(t); };

  return (
    <Box className={classes.root}>
      <Hero ex={ex} name={name} sessions={sessions} weighted={weighted} />
      <Tabs value={tab} onChange={change} variant="unstyled" keepMounted={false} classNames={{ list: classes.tabList, tab: classes.tab }}>
        <Box className={classes.tabs} style={{ top: stickyTop }}>
          <Tabs.List grow data-testid="exercise-tabs">
            {TABS.map(([value, label]) => <Tabs.Tab key={value} value={value}>{label}</Tabs.Tab>)}
          </Tabs.List>
        </Box>
        {TABS.map(([value]) => (
          <Tabs.Panel key={value} value={value} pt="sm" className="app-enter">
            {value === 'about' && <About ex={ex} />}
            {value === 'history' && <History id={id} sessions={sessions} workouts={workouts} />}
            {value === 'charts' && <Charts sessions={sessions} weighted={weighted} />}
            {value === 'records' && <Records sessions={sessions} weighted={weighted} />}
          </Tabs.Panel>
        ))}
      </Tabs>
    </Box>
  );
}

// ---------- Cabecera ----------

function Hero({ ex, name, sessions, weighted }) {
  const last = sessions.at(-1);
  const best = sessions.reduce((a, s) => Math.max(a, s.bestE1rm), 0);
  const maxReps = sessions.reduce((a, s) => Math.max(a, ...s.working.map((x) => x.reps || 0)), 0);
  return (
    <Stack gap="sm" pb="sm">
      <Group wrap="nowrap" gap="md" align="center">
        <ExerciseThumb exercise={ex} name={name} size={64} />
        <Box style={{ minWidth: 0 }}>
          <Text fw={750} fz={20} lh={1.2} className={classes.name}>{name}</Text>
          <Group gap={6} mt={6}>
            {ex ? <Badge variant="light" color="brand">{ex.bodyPart}</Badge> : null}
            {ex ? <Badge variant="light" color="gray">{ex.category}</Badge> : null}
            {ex?.level ? <Badge variant="light" color="gray">{LEVEL[ex.level] || ex.level}</Badge> : null}
            {ex?.custom ? <Badge variant="light" color="grape">propio</Badge> : null}
          </Group>
        </Box>
      </Group>
      {sessions.length ? (
        <StatGrid cols={3}>
          <StatTile label="Sesiones" value={sessions.length} icon={IconStack2} />
          {weighted
            ? <StatTile label="1RM est." value={best ? `${fnum(best, 0)} kg` : '—'} icon={IconTrophy} color="yellow" />
            : <StatTile label="Máx. reps" value={maxReps || '—'} icon={IconRepeat} color="yellow" />}
          <StatTile
            label="Último"
            value={last ? fmtDate(last.workout.started_at, { day: 'numeric', month: 'short' }).replace('.', '') : '—'}
            hint={last?.best ? fmtSet(last.best) : null}
            icon={IconCalendarEvent}
            color="teal"
          />
        </StatGrid>
      ) : null}
    </Stack>
  );
}

// ---------- Descripción ----------

function About({ ex }) {
  if (!ex) {
    return <EmptyState icon={IconBarbell} title="Sin descripción" description="Este ejercicio ya no existe en el catálogo (se conserva tu historial)." />;
  }
  const del = async () => {
    const ok = await confirmDialog({
      title: `¿Eliminar "${ex.name}"?`,
      message: 'Tu historial se conserva con el nombre guardado.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (ok) { remove('exercises', ex.id); goBack('/exercises'); }
  };
  return (
    <Stack gap="md">
      {ex.images.length ? (
        <SimpleGrid cols={Math.min(2, ex.images.length)} spacing="xs">
          {ex.images.slice(0, 2).map((src, i) => (
            <Box key={src} className={classes.imgBox}>
              <Image src={src} alt={`${ex.name} (${i + 1})`} loading="lazy" crossOrigin="anonymous" fit="contain" h="100%" />
              {ex.images.length > 1 ? <span className={classes.imgStep}>{i === 0 ? 'Inicio' : 'Final'}</span> : null}
            </Box>
          ))}
        </SimpleGrid>
      ) : null}

      {ex.primary.length || ex.secondary.length ? (
        <Box>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" className={classes.label} mb={6}>Músculos</Text>
          <Group gap={6}>
            {ex.primary.map((m) => <Badge key={m} size="lg" variant="filled" color="brand" className={classes.muscle}>{m}</Badge>)}
            {ex.secondary.map((m) => <Badge key={m} size="lg" variant="default" className={classes.muscle}>{m}</Badge>)}
          </Group>
          {ex.secondary.length ? <Text size="xs" c="dimmed" mt={6}>Resaltados: principales · resto: secundarios</Text> : null}
        </Box>
      ) : null}

      {ex.custom && ex.linkedName ? (
        <Text size="sm" c="dimmed">Imagen e instrucciones de: {ex.linkedName}</Text>
      ) : null}

      {ex.instructions.length ? (
        <Box>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" className={classes.label} mb={8}>Instrucciones</Text>
          <Stack gap={12} component="ol" className={classes.steps}>
            {ex.instructions.map((step, i) => (
              <Group key={i} component="li" wrap="nowrap" align="flex-start" gap="sm">
                <span className={classes.stepNum}>{i + 1}</span>
                <Text size="sm" lh={1.55} style={{ flex: 1 }}>{step}</Text>
              </Group>
            ))}
          </Stack>
        </Box>
      ) : !ex.images.length ? (
        <Text size="sm" c="dimmed">Sin instrucciones. {ex.custom ? 'Puedes vincularlo a un ejercicio del catálogo para ver imagen e instrucciones.' : ''}</Text>
      ) : null}

      {ex.custom ? (
        <Group grow mt="xs">
          <Button variant="default" leftSection={<IconEdit size={16} />} onClick={() => openExerciseForm(ex.row)}>Editar</Button>
          <Button variant="light" color="red" leftSection={<IconTrash size={16} />} onClick={del}>Eliminar</Button>
        </Group>
      ) : null}
    </Stack>
  );
}

// ---------- Historial ----------

function History({ id, sessions, workouts }) {
  const prs = useMemo(() => computePRs(workouts), [workouts]);
  if (!sessions.length) {
    return <EmptyState icon={IconCalendarEvent} title="Todavía no has hecho este ejercicio" description="Cuando lo registres en un entrenamiento, aparecerá aquí." />;
  }
  return (
    <Stack gap="sm">
      {[...sessions].reverse().map((sess) => {
        const w = sess.workout;
        const marks = prs.get(w.id);
        const rows = [];
        const notes = [];
        w.exercises.forEach((e, ei) => {
          if (e.exercise_id !== id) return;
          let n = 0;
          e.sets.forEach((s, si) => {
            if (s.done === false) return;
            if (!s.type || s.type === 'N') n++;
            rows.push({ s, label: setLabel(s, n), badges: marks?.get(`${ei}:${si}`) || [], key: `${ei}:${si}` });
          });
          if (e.notes) notes.push(e.notes);
        });
        return (
          <UnstyledButton key={w.id} onClick={() => navigate(`/workout/${w.id}`)} className={classes.sessionBtn} data-testid="exercise-session">
            <Card withBorder className={classes.card} padding="sm">
              <Group justify="space-between" wrap="nowrap" mb={6}>
                <Box style={{ minWidth: 0 }}>
                  <Text fw={650} size="sm" truncate="end">{w.name}</Text>
                  <Text size="xs" c="dimmed">{fmtDate(w.started_at)} · {fmtTime(w.started_at)}</Text>
                </Box>
                <IconChevronRight size={18} color="var(--mantine-color-dimmed)" style={{ flex: 'none' }} />
              </Group>
              <Group justify="space-between" className={classes.setHead}>
                <Text size="xs" c="dimmed" fw={600}>Serie</Text>
                <Text size="xs" c="dimmed" fw={600}>1RM est.</Text>
              </Group>
              {rows.map(({ s, label, badges, key }) => (
                <Group key={key} justify="space-between" wrap="nowrap" className={classes.setRow}>
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <span className={classes.setNum} data-type={s.type && s.type !== 'N' ? s.type : undefined}>{label}</span>
                    <Text size="sm" className="tnum" fw={500}>{fmtSet(s)}{s.rpe ? <Text span size="xs" c="dimmed"> @{fmtNum(s.rpe)}</Text> : null}</Text>
                    {badges.map((b) => (
                      <Badge key={b} size="xs" color="yellow" variant="light" leftSection={<IconTrophy size={10} />} data-testid="pr-badge">{b}</Badge>
                    ))}
                  </Group>
                  <Text size="sm" c="dimmed" className="tnum">{s.type !== 'W' && s.weight ? fmtNum(e1rm(s.weight, s.reps), 0) : ''}</Text>
                </Group>
              ))}
              {notes.map((t) => <Text key={t} size="xs" c="dimmed" mt={6} fs="italic">{t}</Text>)}
            </Card>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}

// ---------- Gráficas ----------

function Charts({ sessions, weighted }) {
  const [range, setRange] = useState(lastRange);
  const onRange = (v) => { lastRange = v; setRange(v); };
  const r = RANGES.find((x) => x[0] === range) || RANGES.at(-1);
  const since = r[2] ? Date.now() - r[2] * 864e5 : 0;
  const sess = useMemo(() => sessions.filter((s) => new Date(s.workout.started_at).getTime() >= since), [sessions, since]);

  if (!sessions.length) {
    return <EmptyState icon={IconFlame} title="Sin datos todavía" description="Registra este ejercicio para ver tu progreso." />;
  }

  const control = <RangeControl options={RANGES.map(([k, l]) => [k, l])} value={range} onChange={onRange} />;
  const pt = (s, value, label) => ({ date: new Date(s.workout.started_at), value, label });
  const reps = (v) => `${fnum(v, 0)} reps`;

  let cards;
  if (!sess.length) {
    cards = [<Text key="none" c="dimmed" ta="center" py="xl" size="sm">No hay sesiones en este periodo.</Text>];
  } else if (!weighted) {
    const pts = sess.filter((s) => s.working.length)
      .map((s) => pt(s, Math.max(...s.working.map((x) => x.reps || 0)), plural(s.working.length, 'serie', 'series')));
    cards = [<Chart key="reps" title="Máx. repeticiones en una serie" points={pts} format={reps} axisFormat={(v) => fnum(v, 0)} />];
  } else {
    const ws = sess.filter((s) => s.best);
    const repsAtMax = (s) => Math.max(...s.working.filter((x) => (x.weight || 0) === s.maxWeight).map((x) => x.reps || 0));
    cards = [
      <Chart key="1rm" title="Mejor serie (1RM estimado)" format={kg} axisFormat={kgAxis}
        points={ws.map((s) => pt(s, Math.round(s.bestE1rm * 10) / 10, `Mejor serie: ${fmtSet(s.best)}`))} />,
      <Chart key="max" title="Peso máximo" format={kg} axisFormat={kgAxis}
        points={ws.map((s) => pt(s, s.maxWeight, `${fmtNum(s.maxWeight)} kg × ${repsAtMax(s)}`))} />,
      <Chart key="vol" title="Volumen por sesión" format={kg} axisFormat={kgAxis} color="teal.5"
        points={ws.map((s) => pt(s, s.volume, plural(s.working.length, 'serie efectiva', 'series efectivas')))} />,
    ];
  }
  return <Stack gap="sm">{control}{cards}</Stack>;
}

function Chart({ title, points, format, axisFormat, color }) {
  if (!points.length) return null;
  return (
    <ChartCard
      title={title}
      subtitle={plural(points.length, 'sesión', 'sesiones')}
      value={format(points.at(-1).value)}
      delta={<DeltaText delta={deltaOf(points)} format={format} />}
      table={{
        headers: ['Fecha', 'Valor', 'Detalle'],
        rows: [...points].reverse().map((p) => [dateLong(p.date), format(p.value), p.label || '']),
      }}
    >
      <TrendChart points={points} format={format} axisFormat={axisFormat} color={color} />
    </ChartCard>
  );
}

// ---------- Registros ----------

function Records({ sessions, weighted }) {
  const r = useMemo(() => exerciseRecords(sessions), [sessions]);
  if (!sessions.length) {
    return <EmptyState icon={IconTrophy} title="Sin récords todavía" description="Tus mejores marcas aparecerán aquí." />;
  }
  const when = (rec) => (rec?.workout ? shortDate(rec.workout.started_at) : '');
  const items = [
    weighted && { icon: IconTrophy, color: 'yellow', label: '1RM estimado', value: r.e1rm && `${fmtNum(r.e1rm.value, 0)} kg`, ctx: r.e1rm && `${fmtSet(r.e1rm.set)} · ${when(r.e1rm)}` },
    weighted && { icon: IconWeight, color: 'brand', label: 'Peso máximo', value: r.weight && `${fmtNum(r.weight.value)} kg (×${r.weight.set.reps})`, ctx: when(r.weight) },
    weighted && { icon: IconBarbell, color: 'teal', label: 'Máx. volumen en una serie', value: r.setVolume && `${fmtNum(r.setVolume.value)} kg`, ctx: r.setVolume && `${fmtSet(r.setVolume.set)} · ${when(r.setVolume)}` },
    weighted && { icon: IconStack2, color: 'teal', label: 'Máx. volumen en una sesión', value: r.sessionVolume && `${fmtNum(r.sessionVolume.value)} kg`, ctx: when(r.sessionVolume) },
    { icon: IconRepeat, color: 'grape', label: 'Máx. repeticiones', value: r.reps && `${r.reps.value}`, ctx: r.reps && `${fmtSet(r.reps.set)} · ${when(r.reps)}` },
    { icon: IconCalendarEvent, color: 'gray', label: 'Sesiones', value: String(sessions.length), ctx: `Desde ${shortDate(sessions[0].workout.started_at)}` },
  ].filter(Boolean);

  const rows = weighted ? r.repTable : [];
  return (
    <Stack gap="md">
      <Card withBorder className={classes.card} padding={0} data-testid="records">
        {items.map((it, i) => (
          <Group key={it.label} wrap="nowrap" gap="sm" className={classes.recordRow} data-first={i === 0 || undefined}>
            <ThemeIcon variant="light" color={it.color} size={36} radius="md"><it.icon size={19} stroke={1.8} /></ThemeIcon>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={550}>{it.label}</Text>
              {it.ctx ? <Text size="xs" c="dimmed" truncate="end">{it.ctx}</Text> : null}
            </Box>
            <Text fw={700} size="md" className="tnum" ta="right" style={{ flex: 'none' }}>{it.value ?? '—'}</Text>
          </Group>
        ))}
      </Card>

      {rows.length ? (
        <Box>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" className={classes.label} mb={6}>Por repeticiones</Text>
          <Card withBorder className={classes.card} padding={0}>
            <Table verticalSpacing={8} horizontalSpacing="md" className={classes.repTable}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={64}>Reps</Table.Th>
                  <Table.Th>Mejor rendimiento</Table.Th>
                  <Table.Th ta="right">Previsto</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.reps}>
                    <Table.Td fw={700}>{row.reps}</Table.Td>
                    <Table.Td c={row.best ? undefined : 'dimmed'}>{row.best ? fmtSet(row.best) : '—'}</Table.Td>
                    <Table.Td ta="right" c="dimmed">{row.predicted ? `${fmtNum(row.predicted, 0)} kg` : '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Box>
      ) : null}
      {weighted ? (
        <Text size="xs" c="dimmed">
          1RM estimado con la fórmula de Brzycki. &quot;Mejor rendimiento&quot; = mayor peso logrado con al menos esas reps.
        </Text>
      ) : null}
    </Stack>
  );
}
