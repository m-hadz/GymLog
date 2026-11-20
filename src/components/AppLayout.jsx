// Estructura general: contenido + "dock" inferior fijo con (de arriba a abajo)
// temporizador de descanso, barra del entrenamiento en curso y navegación por pestañas.
// El alto del dock se publica en --dock-h para que el contenido no quede tapado.
import { useEffect, useRef } from 'react';
import { ActionIcon, Group, Progress, Text, UnstyledButton } from '@mantine/core';
import {
  IconBarbell, IconBook, IconChevronUp, IconHistory, IconListDetails, IconPlayerSkipForward, IconUserCircle,
} from '@tabler/icons-react';
import { useActiveWorkout, useNow, useRest } from '../lib/hooks.js';
import { addRest, stopRest } from '../lib/rest-timer.js';
import { fmtClock } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import classes from './AppLayout.module.css';

const TABS = [
  { key: 'profile', label: 'Perfil', icon: IconUserCircle, to: '/profile' },
  { key: 'history', label: 'Historial', icon: IconHistory, to: '/history' },
  { key: 'train', label: 'Entrenar', icon: IconBarbell, to: '/train' },
  { key: 'exercises', label: 'Ejercicios', icon: IconListDetails, to: '/exercises' },
  { key: 'reading', label: 'Lectura', icon: IconBook, to: '/reading' },
];

export function AppLayout({ tab, showNav = true, onWorkoutScreen = false, children }) {
  const dock = useRef(null);
  useEffect(() => {
    const el = dock.current;
    if (!el) return undefined;
    const set = () => document.documentElement.style.setProperty('--dock-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      {children}
      <div ref={dock} className={classes.dock} data-nav={showNav || undefined}>
        <RestTimerBar />
        {!onWorkoutScreen ? <ActiveWorkoutBar /> : null}
        {showNav ? <BottomNav tab={tab} /> : null}
      </div>
    </>
  );
}

function BottomNav({ tab }) {
  return (
    <nav className={classes.nav} id="tabs" aria-label="Secciones">
      <div className={classes.navInner}>
        {TABS.map(({ key, label, icon: Icon, to }) => (
          <UnstyledButton
            key={key}
            className={classes.tab}
            data-active={tab === key || undefined}
            onClick={() => navigate(to)}
            aria-current={tab === key ? 'page' : undefined}
            data-testid={`tab-${key}`}
          >
            <span className={classes.tabIcon}><Icon size={24} stroke={tab === key ? 2.1 : 1.7} /></span>
            <span className={classes.tabLabel}>{label}</span>
          </UnstyledButton>
        ))}
      </div>
    </nav>
  );
}

function ActiveWorkoutBar() {
  const active = useActiveWorkout();
  const now = useNow(1000, !!active);
  if (!active) return null;
  const done = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const total = active.exercises.reduce((a, e) => a + e.sets.length, 0);
  return (
    <div className={classes.floatWrap}>
      <UnstyledButton className={classes.activeBar} onClick={() => navigate('/workout')} data-testid="active-banner">
        <span className={classes.pulse} aria-hidden />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fw={650} size="sm" truncate="end">{active.name}</Text>
          <Text size="xs" c="dimmed" className="tnum">
            {fmtClock(now - new Date(active.started_at))} · {done}/{total} series
          </Text>
        </div>
        <Group gap={4} wrap="nowrap" c="brand.4">
          <Text size="sm" fw={600}>Continuar</Text>
          <IconChevronUp size={18} />
        </Group>
      </UnstyledButton>
    </div>
  );
}

function RestTimerBar() {
  const { end, total } = useRest();
  const now = useNow(250, !!end);
  if (!end) return null;
  const left = Math.max(0, end - now);
  const pct = total ? Math.min(100, (left / total) * 100) : 0;
  return (
    <div className={classes.floatWrap}>
      <div className={classes.restBar} id="rest-bar" role="timer" aria-live="off">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <div>
            <Text size="xs" fw={600} tt="uppercase" c="brand.2" style={{ letterSpacing: '0.06em' }}>Descanso</Text>
            <Text fz={26} fw={750} lh={1.1} className="tnum" c="white">{fmtClock(left)}</Text>
          </div>
          <Group gap={6} wrap="nowrap">
            <ActionIcon size={40} radius="xl" variant="white" color="dark" className={classes.restBtn} onClick={() => addRest(-15)} aria-label="Restar 15 segundos">
              <Text size="xs" fw={700}>−15</Text>
            </ActionIcon>
            <ActionIcon size={40} radius="xl" variant="white" color="dark" className={classes.restBtn} onClick={() => addRest(15)} aria-label="Sumar 15 segundos">
              <Text size="xs" fw={700}>+15</Text>
            </ActionIcon>
            <ActionIcon size={40} radius="xl" variant="white" color="dark" onClick={stopRest} aria-label="Saltar descanso" data-testid="rest-skip">
              <IconPlayerSkipForward size={18} />
            </ActionIcon>
          </Group>
        </Group>
        <Progress value={pct} size={4} radius="xl" mt={8} color="white" className={classes.restProgress} transitionDuration={250} />
      </div>
    </div>
  );
}
