// Celda de una serie por tiempo (feature 04 C): campo mm:ss y cronómetro ▶/■.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { UnstyledButton } from '@mantine/core';
import { IconPlayerPlayFilled, IconPlayerStopFilled } from '@tabler/icons-react';
import { useNow } from '../../lib/hooks.js';
import { fmtSecs, parseSecs } from '../../lib/kinds.js';
import { elapsedSecs, getSetTimer, setTimerChannel, startSetTimer, stopSetTimer } from '../../lib/set-timer.js';
import classes from './workout.module.css';

export const useSetTimer = () => useSyncExternalStore(setTimerChannel.subscribe, getSetTimer);

// Campo de tiempo que conserva lo escrito ("1:" mientras se tipea "1:30")
export function TimeField({ value, onValue, placeholder }) {
  const [text, setText] = useState(value ? fmtSecs(value) : '');
  useEffect(() => {
    if (parseSecs(text) !== (value ?? null)) setText(value ? fmtSecs(value) : '');
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className={classes.num} inputMode="numeric" enterKeyHint="next" autoComplete="off" aria-label="Tiempo (m:ss)"
      placeholder={placeholder} value={text} data-testid="set-time"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const v = e.currentTarget.value.replace(/[^\d:.,]/g, '');
        setText(v);
        onValue(parseSecs(v));
      }}
      onBlur={() => { if (value) setText(fmtSecs(value)); }}
    />
  );
}

/** Tiempo que muestra la celda mientras corre el cronómetro de esta serie. */
export function RunningTime({ timer }) {
  const now = useNow(250, true);
  const el = elapsedSecs(timer, now);
  const shown = timer.target ? Math.max(0, timer.target - el) : el;
  return (
    <div className={classes.num} data-running={timer.target && el >= timer.target ? 'done' : 'on'} data-testid="set-timer-clock" aria-live="off">
      {fmtSecs(shown)}
    </div>
  );
}

/**
 * Botón ▶/■ del cronómetro de una serie.
 * @param {{timerKey:string, running:boolean, target:number|null, disabled?:boolean, onStop:(secs:number)=>void}} p
 */
export function TimerButton({ timerKey, running, target, disabled, onStop }) {
  return (
    <UnstyledButton
      className={classes.timerBtn} data-on={running || undefined} disabled={disabled}
      aria-label={running ? 'Detener cronómetro' : target ? `Cuenta regresiva de ${fmtSecs(target)}` : 'Iniciar cronómetro'}
      onClick={() => {
        if (running) { const secs = stopSetTimer(); if (secs > 0) onStop(secs); } else startSetTimer(timerKey, target);
      }}
      data-testid="set-timer"
    >
      {running ? <IconPlayerStopFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
    </UnstyledButton>
  );
}
