// Entrada a los resúmenes desde el perfil (feature 07): el del mes anterior se destaca los primeros
// 7 días de cada mes; "Tu AAAA" aparece del 15 de diciembre al 31 de enero.
import { Box, Card, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconCalendarStats, IconChevronRight, IconConfetti } from '@tabler/icons-react';
import { navigate } from '../../lib/router.js';
import { MIN_YEAR_WORKOUTS, monthKey, reportPeriods } from '../../lib/report.js';
import { monthNameOf } from './reportNames.js';
import classes from '../report.module.css';

function Entry({ icon: Icon, title, hint, to, highlight, testId }) {
  return (
    <Card withBorder padding={0} className={classes.entry} data-highlight={highlight || undefined}>
      <UnstyledButton onClick={() => navigate(to)} className={classes.entry} p="md" c="inherit" data-testid={testId}>
        <Icon size={22} style={{ flex: 'none' }} />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fw={650}>{title}</Text>
          {hint ? <Text size="xs" c={highlight ? 'rgba(255,255,255,0.85)' : 'dimmed'}>{hint}</Text> : null}
        </Box>
        <IconChevronRight size={18} style={{ flex: 'none' }} />
      </UnstyledButton>
    </Card>
  );
}

export function ReportCard({ workouts, now = new Date() }) {
  if (!workouts.length) return null;
  const { months, years } = reportPeriods(workouts);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKey(prev);
  const curKey = monthKey(now);
  const early = now.getDate() <= 7 && months.has(prevKey);
  const month = early
    ? { title: `Resumen de ${monthNameOf(prev.getMonth() + 1)} →`, hint: 'Tu mes en un minuto', to: `/report/${prevKey}` }
    : months.has(curKey)
      ? { title: `Resumen de ${monthNameOf(now.getMonth() + 1)}`, hint: 'Hasta hoy', to: `/report/${curKey}` }
      : { title: `Resumen de ${monthNameOf(prev.getMonth() + 1)}`, hint: null, to: `/report/${prevKey}` };
  // "Tu 2026" del 15 de diciembre al 31 de enero
  const y = now.getMonth() === 11 && now.getDate() >= 15 ? now.getFullYear() : now.getMonth() === 0 ? now.getFullYear() - 1 : null;
  const showYear = y != null && (years.get(y) || 0) >= MIN_YEAR_WORKOUTS;
  return (
    <Stack gap="sm">
      {showYear ? <Entry icon={IconConfetti} title={`Tu ${y} →`} hint="Tu año en entrenamientos" to={`/report/${y}`} highlight testId="report-year-entry" /> : null}
      <Entry icon={IconCalendarStats} title={month.title} hint={month.hint} to={month.to} highlight={early && !showYear} testId="report-entry" />
    </Stack>
  );
}
