// Rendimiento de la sesión y qué lo explica (feature 23). Cuántos ejercicios superaron a la vez
// anterior, cuánto rindió contra lo esperado por tu tendencia y, de los factores medidos en tu
// historial, cuáles tienen un efecto real en ti. Si ninguno lo tiene, se dice.
import { Badge, Box, Card, Group, Stack, Text } from '@mantine/core';
import { IconFlag, IconGauge } from '@tabler/icons-react';
import { useInsights } from '../../lib/hooks.js';
import { contextOf, goalsDoneIn, scoreOf } from '../../lib/insights.js';
import { exerciseName } from '../../lib/catalog.js';
import { fnum } from '../../charts/charts.jsx';
import classes from './history.module.css';

const pct = (v) => `${v > 0 ? '+' : ''}${fnum(v * 100, 1)} %`;

/** Etiqueta corta del puntaje para la lista del historial: "6/15 superados". */
export function ScoreBadge({ wid }) {
  useInsights();
  const s = scoreOf(wid);
  if (!s?.total) return null;
  const color = s.beaten * 2 >= s.total ? 'teal' : s.below * 2 > s.total ? 'orange' : 'gray';
  return (
    <Badge variant="light" color={color} size="md" className="tnum" style={{ flex: 'none' }} data-testid="score-badge"
      title="Ejercicios que superaron a la vez anterior">
      {s.beaten}/{s.total} ↑
    </Badge>
  );
}

function verdictLine(s) {
  if (s.vsExpected == null || s.n < 3) return null;
  const p = s.percentile;
  const head = `Contra tu tendencia: ${pct(s.vsExpected)}`;
  if (p == null) return head;
  if (p >= 80) return `${head}. De tus mejores sesiones (mejor que el ${p} %).`;
  if (p <= 20) return `${head}. Más baja de lo normal (peor que el ${100 - p} %).`;
  return `${head}. Dentro de lo normal (percentil ${p}).`;
}

export function SessionScore({ w }) {
  useInsights();
  const s = scoreOf(w.id);
  const ctx = contextOf(w.id);
  const goals = goalsDoneIn(w.id);
  if (!s?.total && !goals.length) return null;
  const real = ctx.filter((c) => c.verdict === 'mejor' || c.verdict === 'peor');
  const measured = ctx.filter((c) => c.verdict !== 'pocos');
  return (
    <Card withBorder padding="md" className={classes.surfaceCard} data-testid="session-score">
      <Group gap={8} wrap="nowrap" mb={6}>
        <IconGauge size={18} />
        <Text fw={700}>Rendimiento</Text>
      </Group>
      <Stack gap={6}>
        {s?.total ? (
          <Text size="sm" data-testid="score-line">
            Superaste <b>{s.beaten}</b> de {s.total} {s.total === 1 ? 'ejercicio' : 'ejercicios'}
            {s.equal ? `, igualaste ${s.equal}` : ''}{s.below ? ` y ${s.below} quedaron bajo la vez anterior` : ''}.
          </Text>
        ) : null}
        {s && verdictLine(s) ? <Text size="sm" c="dimmed" data-testid="score-trend">{verdictLine(s)}</Text> : null}
        {real.length ? (
          <Box data-testid="score-factors">
            {real.map((c) => (
              <Text key={c.key} size="xs" c={c.verdict === 'peor' ? 'orange.7' : 'teal.7'} fw={600}>
                {c.title}: {c.group}. En tu historial rindes {pct(c.effect)} en esas sesiones.
              </Text>
            ))}
          </Box>
        ) : measured.length ? (
          <Text size="xs" c="dimmed" data-testid="score-factors">
            {measured.map((c) => `${c.title.toLowerCase()} (${c.group})`).join(', ')}: en tu historial no cambian tu
            rendimiento de forma detectable.
          </Text>
        ) : null}
        {goals.map((g) => (
          <Group key={g.id} gap={6} wrap="nowrap" data-testid="xgoal-reached">
            <IconFlag size={15} color="var(--mantine-color-teal-6)" />
            <Text size="sm" fw={650}>Meta lograda: {exerciseName(g.ex)} {fnum(g.weight)} kg × {g.reps}</Text>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
