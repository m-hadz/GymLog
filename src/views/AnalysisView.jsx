// Análisis (#/analysis): índice de fuerza, ritmo por ejercicio, qué explica tu rendimiento, efecto
// del orden, tu fórmula de reps → 1RM y tus metas (features 17, 23, 24, 25, 26). Cada cifra viene
// con su margen; lo que no se puede afirmar con tus datos se dice así ("sin diferencia detectable").
import { useMemo } from 'react';
import { Badge, Box, Card, Group, SegmentedControl, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { IconChartLine } from '@tabler/icons-react';
import { Page, PageHeader } from '../components/PageHeader.jsx';
import { EmptyState, SectionTitle } from '../components/ui.jsx';
import { ChartCard, TrendChart, fnum } from '../charts/charts.jsx';
import { useInsights } from '../lib/hooks.js';
import { goals, rateRanking, statusOf } from '../lib/insights.js';
import { brzycki, e1rm } from '../lib/stats.js';
import { formulaSetting } from '../lib/effective.js';
import { saveSyncedSettings } from '../lib/data.js';
import { exerciseName } from '../lib/catalog.js';
import { navigate } from '../lib/router.js';
import { fmtDate } from '../lib/format.js';
import { pctText } from './exercises/ExerciseInsights.jsx';
import { IndexSummary } from './profile/AnalysisCard.jsx';
import classes from './analysis.module.css';

const pctLn = (v, d = 1) => pctText((Math.exp(v) - 1) * 100, d);
const day = (t) => fmtDate(new Date(t).toISOString(), { day: 'numeric', month: 'short' }).replace('.', '');
const openEx = (id) => navigate(`/exercise/${encodeURIComponent(id)}`);

function IndexCard({ index }) {
  const points = index.map((p) => ({ date: new Date(p.t), value: p.value, label: `${p.n} ejercicios comparados` }));
  return (
    <ChartCard
      title="Índice de fuerza"
      subtitle="Base 100"
      value={fnum(index.at(-1).value, 0)}
      delta={<IndexSummary index={index} />}
      data-testid="index-card"
    >
      <TrendChart points={points} format={(v) => fnum(v, 1)} axisFormat={(v) => fnum(v, 0)} markBest={false} />
      <Text size="xs" c="dimmed" mt={6}>
        Todos tus ejercicios en una cifra. En cada entrenamiento se compara cada ejercicio con su vez anterior (si fue hace 3 semanas o menos) y se
        promedia el cambio, sin los extremos. Así no importa que cambies de ejercicios ni los pesos de cada máquina.
        Las 3 primeras sesiones de cada ejercicio no cuentan (ahí se sube por técnica, no por fuerza).
      </Text>
    </ChartCard>
  );
}

function Ranking({ rows }) {
  if (!rows.length) {
    return <Text size="sm" c="dimmed">El ritmo se mide con 6 sesiones de un ejercicio en al menos 21 días (últimos 4 meses).</Text>;
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.rate)), 1);
  return (
    <Card withBorder padding="sm" className={classes.card} data-testid="rate-ranking">
      <Stack gap={2}>
        {rows.map((r) => (
          <UnstyledButton key={r.id} className={classes.row} onClick={() => openEx(r.id)} data-testid="rate-row" data-status={r.status}>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate="end">{exerciseName(r.id)}</Text>
              <Box className={classes.bar}>
                <Box className={classes.barFill} data-neg={r.rate < 0 || undefined} style={{ width: `${(Math.abs(r.rate) / max) * 100}%` }} />
              </Box>
            </Box>
            <Box ta="right" style={{ flex: 'none' }}>
              <Text size="sm" fw={700} className="tnum">{pctText(r.rate)}/mes</Text>
              <Text size="xs" c="dimmed" className="tnum">{pctText(r.lo, 0)} a {pctText(r.hi, 0)}</Text>
            </Box>
          </UnstyledButton>
        ))}
      </Stack>
      <Text size="xs" c="dimmed" mt="xs">
        Ritmo: pendiente robusta (Theil–Sen) del 1RM estimado en tus últimas 12 sesiones (4 meses). El rango es su
        intervalo de confianza del 90 %; si no respalda el estado, se marca "incierto".
      </Text>
    </Card>
  );
}

const VERDICT = { mejor: ['Rindes más', 'teal'], peor: ['Rindes menos', 'orange'], igual: ['Sin diferencia detectable', 'gray'], pocos: ['Pocos datos', 'gray'] };

function Factor({ f }) {
  return (
    <Box data-testid="factor" data-key={f.key}>
      <Text size="sm" fw={650} mb={4}>{f.title}</Text>
      {f.groups.length ? (
        <Stack gap={4}>
          {f.groups.map((g) => (
            <Group key={g.key} justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" style={{ flex: 1 }}>{g.key} <Text span size="xs" c="dimmed">({g.n})</Text></Text>
              {g.effect != null ? (
                <Text size="xs" c="dimmed" className="tnum">{pctLn(g.effect)} <Text span size="xs">[{pctLn(g.lo, 1)}, {pctLn(g.hi, 1)}]</Text></Text>
              ) : null}
              <Badge size="sm" variant="light" color={VERDICT[g.verdict][1]} data-testid="factor-verdict" data-verdict={g.verdict}>
                {VERDICT[g.verdict][0]}
              </Badge>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          {f.key === 'rest' ? 'Desde esta versión se guarda la hora de cada serie: con unas semanas de datos se mide tu descanso real.'
            : f.key === 'bw' ? 'Registra tu peso al menos 4 veces para analizarlo.' : 'Aún no hay datos.'}
        </Text>
      )}
    </Box>
  );
}

function Factors({ factors, n }) {
  return (
    <Card withBorder padding="md" className={classes.card} data-testid="factors-card">
      <Text fw={700}>¿Qué explica tu rendimiento?</Text>
      <Text size="xs" c="dimmed" mb="sm">
        Cada sesión se compara con la tendencia de cada ejercicio (así el progreso normal no cuenta como "rendí más").
        Se muestra la diferencia de cada grupo contra el resto y su intervalo del 95 % (corregido por cuántos grupos se
        comparan). Solo se afirma un efecto si el intervalo no cruza 0. {n} sesiones analizadas.
      </Text>
      <Stack gap="md">{factors.map((f) => <Factor key={f.key} f={f} />)}</Stack>
    </Card>
  );
}

function Order({ order }) {
  const g = order.global;
  const real = [...order.byExercise].filter(([, v]) => v.real);
  return (
    <Card withBorder padding="md" className={classes.card} data-testid="order-card">
      <Text fw={700}>¿Importa el orden de los ejercicios?</Text>
      {g ? (
        <Text size="sm" mt={4} data-testid="order-global" data-real={g.real || undefined}>
          {g.real
            ? `Sí: por cada puesto más tarde que el habitual, rindes ${pctLn(g.slope, 2)} (intervalo ${pctLn(g.lo, 2)} a ${pctLn(g.hi, 2)}).`
            : `En general, no de forma detectable: ${pctLn(g.slope, 2)} por puesto (intervalo ${pctLn(g.lo, 2)} a ${pctLn(g.hi, 2)}).`}
        </Text>
      ) : <Text size="sm" c="dimmed" mt={4}>Faltan sesiones con ejercicios cambiados de puesto para medirlo.</Text>}
      {g ? <Text size="xs" c="dimmed">{g.n} sesiones de ejercicio, {g.moved} fuera de su puesto habitual.</Text> : null}
      {real.length ? (
        <Stack gap={2} mt="sm">
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">Ejercicios donde sí importa</Text>
          {real.map(([id, v]) => (
            <UnstyledButton key={id} className={classes.row} onClick={() => openEx(id)} data-testid="order-exercise">
              <Text size="sm" fw={600} style={{ flex: 1 }} truncate="end">{exerciseName(id)}</Text>
              <Text size="sm" className="tnum">{pctLn(v.slope)} por puesto</Text>
            </UnstyledButton>
          ))}
          <Text size="xs" c="dimmed">En estos ejercicios, durante el entrenamiento se avisa si van más tarde que de costumbre.</Text>
        </Stack>
      ) : null}
    </Card>
  );
}

function Formula({ model }) {
  const setting = formulaSetting();
  const example = [5, 10, 12].map((r) => ({ r, brz: brzycki(100, r), own: e1rm(100, r) }));
  const active = setting !== 'off' && model.confident;
  return (
    <Card withBorder padding="md" className={classes.card} data-testid="formula-card" data-active={active || undefined}>
      <Group justify="space-between" wrap="nowrap">
        <Text fw={700}>Tu fórmula de reps → 1RM</Text>
        <Badge variant="light" color={active ? 'teal' : 'gray'}>{active ? 'En uso' : 'Brzycki'}</Badge>
      </Group>
      <Text size="sm" mt={4}>
        {model.reason === 'pocos'
          ? `Se calibra con tu historial cuando haya suficientes series de pocas (≤5) y muchas (≥9) reps: llevas ${model.low} y ${model.high}.`
          : model.confident
            ? `Con tus datos, Brzycki ${model.beta > 0 ? 'sobreestima' : 'subestima'} tu 1RM en ${fnum(Math.abs(model.beta) * 100, 2)} % por cada rep sobre ${model.r0} (intervalo ${fnum(model.lo * 100, 2)} a ${fnum(model.hi * 100, 2)} %).`
            : 'Con tus datos, Brzycki ya te queda bien: la diferencia no se distingue del ruido.'}
      </Text>
      <Table mt="sm" fz="xs" verticalSpacing={4} data-testid="formula-buckets">
        <Table.Thead>
          <Table.Tr><Table.Th>Reps</Table.Th><Table.Th>Sesiones</Table.Th><Table.Th>Brzycki vs tu tendencia</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {model.buckets.map((b) => (
            <Table.Tr key={b.label}>
              <Table.Td>{b.label}</Table.Td>
              <Table.Td className="tnum">{b.n}</Table.Td>
              <Table.Td className="tnum">{b.bias == null ? '—' : pctLn(b.bias)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {model.confident ? (
        <Text size="xs" c="dimmed" mt={6} className="tnum">
          100 kg: {example.map((x) => `×${x.r} → ${fnum(x.own, 1)} kg (Brzycki ${fnum(x.brz, 1)})`).join(' · ')}
        </Text>
      ) : null}
      <SegmentedControl
        mt="sm" size="xs" fullWidth value={setting === 'off' ? 'off' : 'auto'}
        data={[{ value: 'auto', label: 'Usar la mía si es confiable' }, { value: 'off', label: 'Siempre Brzycki' }]}
        onChange={(v) => saveSyncedSettings({ formula: v })}
        data-testid="formula-toggle"
      />
      <Text size="xs" c="dimmed" mt={6}>
        Afecta al 1RM estimado en toda la app: récords, objetivo para superar, reinicio, comparación en vivo, metas y
        tendencias.
      </Text>
    </Card>
  );
}

function Goals() {
  const list = goals();
  const open = list.filter((g) => !g.done_at);
  const done = list.filter((g) => g.done_at).slice(-5).reverse();
  if (!list.length) {
    return <Text size="sm" c="dimmed">Pon una meta desde la ficha de un ejercicio (pestaña Gráficas).</Text>;
  }
  return (
    <Card withBorder padding="sm" className={classes.card} data-testid="goals-card">
      <Stack gap={2}>
        {open.map((g) => {
          const st = statusOf(g);
          const when = st.status === 'en_camino' ? (st.months === 0 ? 'cualquier sesión' : `≈ ${day(st.eta)}`)
            : st.status === 'plana' ? 'no llega a este ritmo' : st.status === 'lograda' ? 'lograda' : 'faltan datos';
          return (
            <UnstyledButton key={g.id} className={classes.row} onClick={() => openEx(g.ex)} data-testid="xgoal-row">
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600} truncate="end">{exerciseName(g.ex)}</Text>
                <Text size="xs" c="dimmed">{fnum(g.weight)} kg × {g.reps} · {Math.round(st.progress * 100)} %</Text>
              </Box>
              <Text size="xs" fw={600} c={st.status === 'plana' ? 'orange.7' : undefined}>{when}</Text>
            </UnstyledButton>
          );
        })}
        {done.map((g) => (
          <Group key={g.id} className={classes.row} wrap="nowrap">
            <Text size="sm" style={{ flex: 1 }} truncate="end">{exerciseName(g.ex)} {fnum(g.weight)} kg × {g.reps}</Text>
            <Badge size="sm" variant="light" color="teal">Lograda {day(g.done_at)}</Badge>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

export function AnalysisView() {
  const ins = useInsights();
  const ranking = useMemo(() => rateRanking(), [ins]);
  const sessions = ins.factors[0]?.n || 0;
  return (
    <>
      <PageHeader title="Análisis" back backFallback="/profile" />
      <Page gap="md">
        {!ins.workouts ? (
          <EmptyState icon={IconChartLine} title="Sin datos todavía" description="Registra entrenamientos para ver el análisis." />
        ) : (
          <>
            {ins.index.length > 1 ? <IndexCard index={ins.index} /> : (
              <Text size="sm" c="dimmed">El índice de fuerza aparece cuando un entrenamiento repite al menos 3 ejercicios de uno reciente.</Text>
            )}
            <SectionTitle>Ritmo por ejercicio</SectionTitle>
            <Ranking rows={ranking} />
            <SectionTitle>Metas</SectionTitle>
            <Goals />
            <SectionTitle>Rendimiento</SectionTitle>
            <Factors factors={ins.factors} n={sessions} />
            <Order order={ins.order} />
            <SectionTitle>Fórmula</SectionTitle>
            <Formula model={ins.model} />
          </>
        )}
      </Page>
    </>
  );
}
