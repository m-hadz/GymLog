// Cabecera del perfil: total de entrenamientos y cifras de la semana / el mes.
import { useMemo } from 'react';
import { Box, Group, Text, ThemeIcon } from '@mantine/core';
import { IconBarbell, IconCalendarWeek, IconClockHour4, IconFlame, IconWeight } from '@tabler/icons-react';
import { StatGrid, StatTile } from '../../components/ui.jsx';
import { fnum, vol } from '../../charts/charts.jsx';
import { profileSummary } from './summary.js';
import { useStreak } from '../../lib/hooks.js';
import { dueText, streakText } from '../../lib/streak.js';
import classes from './Profile.module.css';

const monthName = new Intl.DateTimeFormat('es', { month: 'long' });
const since = new Intl.DateTimeFormat('es', { month: 'short', year: 'numeric' });

export function ProfileHero({ workouts }) {
  const s = useMemo(() => profileSummary(workouts), [workouts]);
  const streak = useStreak();
  const month = monthName.format(new Date());

  return (
    <>
      <Box className={classes.hero}>
        <Group gap="md" wrap="nowrap">
          <ThemeIcon size={52} radius="xl" variant="white" color="brand" className={classes.heroIcon}>
            <IconBarbell size={28} stroke={1.8} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text className={classes.heroTotal} data-testid="workout-total">{`${s.total} entrenamientos`}</Text>
            <Text size="sm" className={classes.heroSub}>
              {s.first ? `Registrando desde ${since.format(s.first).replace('.', '')}` : 'Aún no hay entrenamientos'}
            </Text>
          </Box>
        </Group>
      </Box>

      <StatGrid cols={2}>
        <StatTile
          icon={IconCalendarWeek}
          label="Esta semana"
          value={s.thisWeek}
          hint={s.thisWeek === 1 ? 'entrenamiento' : 'entrenamientos'}
        />
        <StatTile
          icon={IconFlame}
          color="orange"
          label="Racha"
          value={streakText(streak)}
          hint={streak.mode === 'cadencia' ? dueText(streak) : streak.current ? 'seguidas entrenando' : 'Entrena esta semana'}
          tone={streak.current >= 4 ? 'up' : undefined}
          data-testid="profile-streak"
        />
        <StatTile
          icon={IconWeight}
          color="grape"
          label="Volumen del mes"
          value={vol(s.monthVolume)}
          hint={`${month} · ${s.monthCount} ${s.monthCount === 1 ? 'sesión' : 'sesiones'}`}
        />
        <StatTile
          icon={IconClockHour4}
          color="cyan"
          label="Horas del mes"
          value={`${fnum(s.monthHours)} h`}
          hint={s.monthCount ? `${fnum((s.monthHours * 60) / s.monthCount, 0)} min por sesión` : 'Sin sesiones aún'}
        />
      </StatGrid>
    </>
  );
}
