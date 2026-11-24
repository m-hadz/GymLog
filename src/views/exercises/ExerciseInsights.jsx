// Progreso de un ejercicio (features 17, 24, 26): ritmo de progreso con su rango, efecto del orden
// y meta con fecha estimada. Cada frase sale de un cálculo con su margen de error; si los datos no
// alcanzan, se dice y no se inventa.
import { useState } from 'react';
import { Badge, Box, Button, Card, Group, Progress, Stack, Text, TextInput } from '@mantine/core';
import { IconFlag, IconTarget } from '@tabler/icons-react';
import { openSheet } from '../../components/Sheet.jsx';
import { notify } from '../../components/dialogs.jsx';
import { useInsights } from '../../lib/hooks.js';
import { addGoal, doneGoalsOf, exerciseInsight, goalOf, removeGoal, statusOf, trendNow } from '../../lib/insights.js';
import { suggestedTarget } from '../../lib/goals.js';
import { RATE_MIN_SESSIONS, RATE_MIN_SPAN } from '../../lib/trend.js';
import { e1rm, weightForReps } from '../../lib/stats.js';
import { fmtDate } from '../../lib/format.js';
import { fnum } from '../../charts/charts.jsx';
import classes from './ExerciseDetail.module.css';

export const STATUS = {
  sube: { label: 'Subiendo', color: 'teal' },
  plano: { label: 'Plano', color: 'gray' },
  baja: { label: 'Bajando', color: 'orange' },
  pocos: { label: 'Pocos datos', color: 'gray' },
};
export const pctText = (v, d = 1) => `${v > 0 ? '+' : ''}${fnum(v, d)} %`;
const day = (t) => fmtDate(new Date(t).toISOString(), { day: 'numeric', month: 'short' }).replace('.', '');
const num = (v) => Number(String(v ?? '').replace(',', '.'));

/** Frase del ritmo: "+6,2 %/mes (rango probable +2 a +10)". */
export function RateText({ rate }) {
  if (!rate?.enough) return null;
  return (
    <Text size="sm" className="tnum">
      <b>{pctText(rate.rate)}/mes</b>
      <Text span size="xs" c="dimmed"> · rango probable {pctText(rate.lo, 0)} a {pctText(rate.hi, 0)}</Text>
    </Text>
  );
}

export function StatusBadge({ rate, ...rest }) {
  const st = STATUS[rate?.enough ? rate.status : 'pocos'];
  return (
    <Badge variant="light" color={st.color} {...rest}>
      {st.label}{rate?.enough && !rate.sure ? ' (incierto)' : ''}
    </Badge>
  );
}

function GoalForm({ id, close }) {
  const ins = exerciseInsight(id);
  const trend = trendNow(id);
  const lastReps = ins?.pts.at(-1)?.reps || 8;
  const target = suggestedTarget(trend, ins?.rate);
  const sugW = target ? Math.ceil(weightForReps(target, lastReps) * 2) / 2 : '';
  const [w, setW] = useState(sugW ? String(sugW).replace('.', ',') : '');
  const [r, setR] = useState(String(lastReps));
  const weight = num(w);
  const reps = Math.round(num(r));
  const valid = weight > 0 && reps >= 1 && reps <= 15;
  const save = () => {
    if (!valid) { notify.warn('Usa un peso mayor a 0 y entre 1 y 15 reps'); return; }
    addGoal(id, weight, reps);
    notify.success('Meta guardada');
    close();
  };
  return (
    <Stack gap="sm" data-testid="xgoal-form">
      <Text size="sm" c="dimmed">
        {target
          ? `Sugerida: lo que alcanzarías en 2 meses a tu ritmo (${pctText(Math.max(ins?.rate?.enough ? ins.rate.rate : 0, 1))}/mes).`
          : 'Elige el peso y las reps que quieres lograr.'}
      </Text>
      <Group grow>
        <TextInput label="Peso (kg)" inputMode="decimal" value={w} onChange={(e) => setW(e.currentTarget.value)} data-testid="xgoal-weight" />
        <TextInput label="Reps" inputMode="numeric" value={r} onChange={(e) => setR(e.currentTarget.value)} data-testid="xgoal-reps" />
      </Group>
      {valid ? (
        <Text size="xs" c="dimmed">
          1RM estimado de la meta: {fnum(e1rm(weight, reps), 1)} kg
          {trend ? ` (${pctText((e1rm(weight, reps) / trend - 1) * 100)} sobre tu tendencia actual)` : ''}.
        </Text>
      ) : null}
      <Button onClick={save} disabled={!valid} data-testid="xgoal-save">Guardar meta</Button>
    </Stack>
  );
}

export const openGoalForm = (id, name) => openSheet({ title: `Meta · ${name}`, render: (close) => <GoalForm id={id} close={close} /> });

function GoalBox({ id, name }) {
  const goal = goalOf(id);
  const done = doneGoalsOf(id).slice(-2).reverse();
  if (!goal) {
    return (
      <Box>
        <Button variant="light" size="compact-sm" leftSection={<IconTarget size={15} />} onClick={() => openGoalForm(id, name)} data-testid="xgoal-add">
          Poner una meta
        </Button>
        {done.map((g) => (
          <Text key={g.id} size="xs" c="dimmed" mt={6}>Lograda: {fnum(g.weight)} kg × {g.reps} ({day(g.done_at)})</Text>
        ))}
      </Box>
    );
  }
  const st = statusOf(goal);
  let line;
  if (st.status === 'lograda') line = '¡Lograda! Se marca al guardar el entrenamiento.';
  else if (st.status === 'pocos') line = `Faltan sesiones para estimar la fecha (se necesitan ${RATE_MIN_SESSIONS} en ${RATE_MIN_SPAN}+ días).`;
  else if (st.status === 'plana') line = `A tu ritmo actual no llega en los próximos 2 años: te falta ${fnum(st.remaining, 1)} %.`;
  else if (st.months === 0) line = 'Tu tendencia ya está a la altura: puede salir en cualquier sesión.';
  else {
    line = `Fecha estimada: ${day(st.eta)}`;
    if (st.etaEarly && st.etaLate) line += ` (entre ${day(st.etaEarly)} y ${day(st.etaLate)})`;
    else if (st.etaEarly) line += ` (desde ${day(st.etaEarly)}; si se frena, puede no llegar)`;
    line += `. Te falta ${fnum(st.remaining, 1)} %.`;
  }
  return (
    <Box data-testid="xgoal-box" data-status={st.status}>
      <Group justify="space-between" wrap="nowrap" mb={6}>
        <Group gap={6} wrap="nowrap">
          <IconFlag size={16} />
          <Text size="sm" fw={650}>Meta: {fnum(goal.weight)} kg × {goal.reps}</Text>
        </Group>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => removeGoal(goal.id)} data-testid="xgoal-remove">Quitar</Button>
      </Group>
      <Progress value={st.progress * 100} size="sm" radius="xl" color={st.status === 'plana' ? 'orange' : 'teal'} />
      <Text size="xs" c="dimmed" mt={6} data-testid="xgoal-eta">{line}</Text>
    </Box>
  );
}

function OrderLine({ id }) {
  const { order } = useInsights();
  const o = order.byExercise.get(id);
  if (!o) return null;
  const pct = (Math.exp(o.slope) - 1) * 100;
  return (
    <Text size="xs" c="dimmed" data-testid="order-line">
      {o.real
        ? `Orden: por cada puesto más tarde que el habitual (${o.usual + 1}.º) rindes ${pctText(pct)}. Medido en ${o.n} sesiones.`
        : `Orden: hacerlo antes o después (del ${o.usual + 1}.º puesto habitual) no cambia tu rendimiento de forma detectable (${o.n} sesiones).`}
    </Text>
  );
}

/** Tarjeta "Progreso" de la pestaña Gráficas (ejercicios con peso). */
export function ExerciseProgress({ id, name, goals = true }) {
  useInsights();
  const ins = exerciseInsight(id);
  if (!ins) return null;
  const { rate } = ins;
  const trend = ins.pts.at(-1)?.trend;
  return (
    <Card withBorder padding="md" className={classes.card} data-testid="exercise-progress">
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Text fw={700}>Ritmo de progreso</Text>
        <StatusBadge rate={rate} data-testid="rate-status" />
      </Group>
      <Stack gap={8}>
        {rate.enough ? <RateText rate={rate} /> : (
          <Text size="sm" c="dimmed">
            Se mide con {RATE_MIN_SESSIONS} sesiones en al menos {RATE_MIN_SPAN} días (llevas {rate.n} en los últimos 4 meses).
          </Text>
        )}
        {trend ? <Text size="xs" c="dimmed">Tendencia del 1RM estimado: {fnum(trend, 1)} kg (filtra el ruido de cada sesión).</Text> : null}
        <OrderLine id={id} />
        {goals ? <GoalBox id={id} name={name} /> : null}
      </Stack>
    </Card>
  );
}
