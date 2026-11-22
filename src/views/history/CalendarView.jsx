// Calendario: un mes por tarjeta (el más reciente primero), días entrenados
// marcados; al tocar uno se abre el historial filtrado por ese día. Un día pasado sin entrenamiento
// permite registrarlo (feature 09); los días de pausa se ven rayados.
import { useMemo } from 'react';
import { Box, Button, Card, Group, Stack, Text } from '@mantine/core';
import { IconCalendarCheck, IconCalendarMonth, IconFlame, IconCalendarStats } from '@tabler/icons-react';
import { useData, useStreak } from '../../lib/hooks.js';
import { syncedSettings } from '../../lib/data.js';
import { keyOfDay, pauseDays } from '../../lib/streak.js';
import { streakTile } from '../streak/StreakCards.jsx';
import { openRegisterPast } from '../streak/RegisterPast.jsx';
import { navigate } from '../../lib/router.js';
import { dayKey, fmtDate, plural } from '../../lib/format.js';
import { Page, PageHeader } from '../../components/PageHeader.jsx';
import { EmptyState, StatGrid, StatTile } from '../../components/ui.jsx';
import classes from './history.module.css';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Lunes de la semana de d (00:00 local)
function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function MonthCard({ m, days, today, paused }) {
  const year = m.getFullYear(), month = m.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const offset = (m.getDay() + 6) % 7;
  const cells = [];
  let trained = 0;
  for (let i = 0; i < offset; i++) cells.push(<span key={`e${i}`} />);
  for (let d = 1; d <= count; d++) {
    const key = dayKey(new Date(year, month, d));
    const has = days.has(key);
    const pause = paused.has(key);
    const pastEmpty = !has && key < today;
    if (has) trained++;
    cells.push(
      <button
        key={key}
        type="button"
        className={classes.calDay}
        data-testid="cal-day"
        data-has={has ? 'true' : 'false'}
        data-today={key === today || undefined}
        data-future={key > today || undefined}
        data-pause={pause || undefined}
        data-past-empty={pastEmpty || undefined}
        disabled={!has && !pastEmpty}
        onClick={has ? () => navigate(`/history?day=${key}`) : pastEmpty ? () => openRegisterPast(key) : undefined}
        aria-label={has ? `Ver entrenamientos del ${d}` : pastEmpty ? `Registrar un entrenamiento el ${d}` : undefined}
      >
        {d}
      </button>,
    );
  }
  return (
    <Card withBorder className={classes.calCard} padding="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>{cap(fmtDate(m, { month: 'long', year: 'numeric' }))}</Text>
        <Text size="xs" c={trained ? 'brand' : 'dimmed'} fw={trained ? 650 : 400} className="tnum">
          {trained ? plural(trained, 'día') : 'Sin entrenos'}
        </Text>
      </Group>
      <Box className={classes.calGrid}>
        {WEEKDAYS.map((x, i) => <span key={i} className={classes.calHead}>{x}</span>)}
        {cells}
      </Box>
    </Card>
  );
}

export function CalendarView() {
  const { workouts, user_settings: us } = useData();
  const today = dayKey(new Date());
  const s = useStreak();
  const streak = streakTile(s);
  const paused = useMemo(() => new Set([...pauseDays(syncedSettings().pauses)].map(keyOfDay)), [us]); // eslint-disable-line react-hooks/exhaustive-deps

  const { days, months, thisMonth } = useMemo(() => {
    const dates = workouts.map((w) => new Date(w.started_at));
    const days = new Set(dates.map(dayKey));
    const now = new Date();
    const first = dates.length ? new Date(Math.min(...dates)) : now;
    const months = [];
    for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d >= new Date(first.getFullYear(), first.getMonth(), 1);
      d = new Date(d.getFullYear(), d.getMonth() - 1, 1)) months.push(d);
    const prefix = today.slice(0, 7);
    const thisMonth = [...days].filter((k) => k.startsWith(prefix)).length;
    return { days, months, thisMonth };
  }, [workouts, today]);

  return (
    <>
      <PageHeader title="Calendario" back backFallback="/history" />
      <Page gap="sm">
        {!workouts.length ? (
          <EmptyState
            icon={IconCalendarMonth}
            title="Calendario vacío"
            description="Los días que entrenes aparecerán marcados aquí."
            action={<Button onClick={() => navigate('/train')}>Ir a Entrenar</Button>}
          />
        ) : (
          <>
            <StatGrid cols={3}>
              <StatTile label="Este mes" icon={IconCalendarCheck} value={thisMonth} hint={thisMonth === 1 ? 'día' : 'días'} />
              <StatTile label="Total" icon={IconCalendarStats} value={days.size} hint="días entrenados" />
              <StatTile
                label="Racha"
                icon={IconFlame}
                color="orange"
                value={streak.value}
                hint={streak.hint}
                data-testid="calendar-streak"
              />
            </StatGrid>
            <Text size="xs" c="dimmed">Toca un día pasado sin entrenamiento para registrarlo (repara la racha).</Text>
            <Stack gap="sm" mt={4}>
              {months.map((m) => <MonthCard key={m.getTime()} m={m} days={days} today={today} paused={paused} />)}
            </Stack>
          </>
        )}
      </Page>
    </>
  );
}
