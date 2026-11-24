// Entrada a Análisis desde Perfil (features 17 y 23–26): índice de fuerza con su variación.
import { Box, Card, Text, UnstyledButton } from '@mantine/core';
import { IconChartLine, IconChevronRight } from '@tabler/icons-react';
import { navigate } from '../../lib/router.js';
import { useInsights } from '../../lib/hooks.js';
import { fnum } from '../../charts/charts.jsx';
import { indexChange } from '../../lib/trend.js';
import { pctText } from '../exercises/ExerciseInsights.jsx';
import classes from '../report.module.css';

export function IndexSummary({ index }) {
  const first = index[0]?.t ?? Date.now();
  const c4 = indexChange(index, Date.now() - 28 * 864e5);
  // con menos de 12 semanas de índice, la variación de 12 semanas sería la misma "desde el inicio"
  const c12 = first <= Date.now() - 84 * 864e5 ? indexChange(index, Date.now() - 84 * 864e5) : null;
  const parts = [c4 != null && `${pctText(c4)} en 4 sem.`, c12 != null && `${pctText(c12)} en 12 sem.`].filter(Boolean);
  return <Text size="xs" c="dimmed" className="tnum">{parts.join(' · ')}</Text>;
}

export function AnalysisCard() {
  const ins = useInsights();
  if (!ins.workouts) return null;
  const idx = ins.index.at(-1);
  return (
    <Card withBorder padding={0} className={classes.entry}>
      <UnstyledButton onClick={() => navigate('/analysis')} className={classes.entry} p="md" c="inherit" data-testid="analysis-entry">
        <IconChartLine size={22} style={{ flex: 'none' }} />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fw={650}>Análisis{idx && ins.index.length > 1 ? ` · índice de fuerza ${fnum(idx.value, 0)}` : ''}</Text>
          {ins.index.length > 1 ? <IndexSummary index={ins.index} /> : <Text size="xs" c="dimmed">Ritmo, factores, orden, fórmula y metas</Text>}
        </Box>
        <IconChevronRight size={18} style={{ flex: 'none' }} />
      </UnstyledButton>
    </Card>
  );
}
