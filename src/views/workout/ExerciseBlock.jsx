// Tarjeta de un ejercicio dentro del editor: encabezado, menú y tabla de series.
import { memo, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon, Box, Button, Card, Group, Menu, Text, Textarea, UnstyledButton,
} from '@mantine/core';
import {
  IconArrowDown, IconArrowUp, IconCheck, IconClockHour4, IconDots, IconNote, IconPlus, IconTrash, IconWeight,
} from '@tabler/icons-react';
import { ExerciseThumb } from '../../components/ui.jsx';
import { notify } from '../../components/dialogs.jsx';
import { openSheet } from '../../components/Sheet.jsx';
import { ExerciseDetail } from '../ExercisesView.jsx';
import { state } from '../../lib/data.js';
import { exerciseName, getExercise } from '../../lib/catalog.js';
import { previousSets } from '../../lib/stats.js';
import { startRest } from '../../lib/rest-timer.js';
import { fmtClock, fmtNum, fmtSet, num } from '../../lib/format.js';
import {
  FB_LABEL, RPE_OPTIONS, SET_TYPES, SET_TYPE_LABEL, setFeedback,
} from '../../lib/workout.js';
import { openPlates, openRestPicker } from './sheets.jsx';
import classes from './workout.module.css';

const toText = (v) => (v == null ? '' : String(v).replace('.', ','));
const selectAll = (e) => e.currentTarget.select();

export function isBarbell(ex) {
  const e = getExercise(ex.exercise_id);
  return e?.category === 'Barra' || /barbell|barra\b/i.test(exerciseName(ex.exercise_id, ex.name));
}

const prevText = (p) => {
  if (!p) return '—';
  if (p.weight) return `${fmtNum(p.weight)} × ${p.reps ?? 0}`;
  return `${p.reps ?? 0} reps`;
};

// Campo numérico que conserva lo escrito ("82," mientras se tipea "82,5").
function NumField({ value, onValue, placeholder, mode, testId, label }) {
  const [text, setText] = useState(toText(value));
  useEffect(() => {
    if (num(text) !== (value ?? null)) setText(toText(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className={classes.num}
      inputMode={mode}
      enterKeyHint="next"
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      aria-label={label}
      onFocus={selectAll}
      onChange={(e) => {
        const v = e.currentTarget.value.replace(/[^\d.,]/g, '');
        setText(v);
        onValue(num(v));
      }}
      data-testid={testId}
    />
  );
}

function SetTypeMenu({ s, label, onType, onDelete }) {
  const type = s.type || 'N';
  return (
    <Menu position="bottom-start" width={200}>
      <Menu.Target>
        <UnstyledButton
          className={classes.typeBtn} data-type={type}
          title={s.fb ? FB_LABEL[s.fb] : SET_TYPE_LABEL[type]}
          aria-label={`Serie ${label}: ${SET_TYPE_LABEL[type]}`}
          data-testid="set-type"
        >
          {label}
          {s.fb === 'pr' ? <span className={classes.prTag}>PR</span> : null}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Tipo de serie</Menu.Label>
        {SET_TYPES.map((t) => (
          <Menu.Item
            key={t}
            leftSection={<Text fw={750} w={16} ta="center" size="sm">{t === 'N' ? '1' : t}</Text>}
            rightSection={t === type ? <IconCheck size={16} /> : null}
            onClick={() => onType(t)}
          >
            {SET_TYPE_LABEL[t]}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={onDelete} data-testid="set-delete">
          Eliminar serie
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function SetRow({ s, label, p, cols, ctx, si }) {
  const { isActive, isTemplate, showRpe, ei, update, toggle } = ctx;
  const ph = p || s.target || {};
  const patch = (fn) => update((d) => fn(d.exercises[ei].sets[si]));
  return (
    <div
      className={`${classes.grid} ${classes.setRow}`}
      style={{ '--cols': cols }}
      data-testid="set-row"
      data-done={isActive ? String(!!s.done) : undefined}
      data-fb={s.fb || undefined}
    >
      <SetTypeMenu
        s={s} label={label}
        onType={(t) => patch((x) => { x.type = t; delete x.fb; })}
        onDelete={() => update((d) => { d.exercises[ei].sets.splice(si, 1); })}
      />
      <UnstyledButton
        className={classes.prev} disabled={!p}
        onClick={() => patch((x) => { x.weight = p.weight; x.reps = p.reps; })}
        title={p ? `Copiar ${fmtSet(p)}` : 'Sin registro anterior'}
        data-testid="set-prev"
      >
        {prevText(p)}
      </UnstyledButton>
      <NumField
        value={s.weight} mode="decimal" label="Peso (kg)" testId="set-weight"
        placeholder={ph.weight != null ? fmtNum(ph.weight) : 'kg'}
        onValue={(v) => patch((x) => { x.weight = v; })}
      />
      <NumField
        value={s.reps} mode="numeric" label="Repeticiones" testId="set-reps"
        placeholder={ph.reps != null ? String(ph.reps) : 'reps'}
        onValue={(v) => patch((x) => { x.reps = v; })}
      />
      {showRpe && !isTemplate ? (
        <select
          className={classes.rpe} value={s.rpe ?? ''} aria-label="RPE (esfuerzo, 10 = al fallo)"
          onChange={(e) => {
            const v = e.currentTarget.value;
            patch((x) => { if (v) x.rpe = Number(v); else delete x.rpe; });
          }}
          data-testid="set-rpe"
        >
          <option value="">–</option>
          {RPE_OPTIONS.map((v) => <option key={v} value={v}>{fmtNum(v)}</option>)}
        </select>
      ) : null}
      {isActive ? (
        <UnstyledButton
          className={classes.check} data-on={s.done || undefined}
          onClick={() => toggle(si)} aria-label={s.done ? 'Desmarcar serie' : 'Completar serie'}
          aria-pressed={!!s.done} data-testid="set-check"
        >
          <IconCheck size={22} stroke={2.6} />
        </UnstyledButton>
      ) : null}
    </div>
  );
}

function ExerciseBlockInner({ ex, ei, count, mode, docId, before, settings, update }) {
  const isActive = mode === 'active';
  const isTemplate = mode === 'template';
  const showRpe = !!settings.rpe;
  const name = exerciseName(ex.exercise_id, ex.name);
  const meta = getExercise(ex.exercise_id);
  const [showNote, setShowNote] = useState(!!ex.notes);
  const prev = useMemo(
    () => previousSets(state.workouts, ex.exercise_id, { excludeId: docId, before }),
    [ex.exercise_id, docId, before, state.workouts], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const autoRest = meta?.rest ?? settings.defaultRest;
  const restFor = ex.rest ?? autoRest;
  const cols = [
    '34px', 'minmax(0,1fr)', '62px', '54px',
    showRpe && !isTemplate ? '50px' : null,
    isActive ? '40px' : null,
  ].filter(Boolean).join(' ');

  const toggle = (si) => {
    const s = ex.sets[si];
    const p = prev[si];
    if (!s.done) {
      const ph = p || s.target || {};
      const reps = s.reps ?? ph.reps ?? null;
      if (reps == null) { notify.warn('Ingresa las repeticiones'); return; }
      const next = { ...s, weight: s.weight ?? ph.weight ?? 0, reps, done: true };
      next.fb = setFeedback(ex.exercise_id, next, p, docId);
      if (!next.fb) delete next.fb;
      update((d) => { d.exercises[ei].sets[si] = next; });
      if (next.fb === 'pr') notify.record(`${name}: ${fmtSet(next)}`);
      startRest(s.type === 'W' ? Math.min(60, restFor) : restFor);
    } else {
      update((d) => { const x = d.exercises[ei].sets[si]; x.done = false; delete x.fb; });
    }
  };

  const move = (dir) => update((d) => {
    const j = ei + dir;
    if (j < 0 || j >= d.exercises.length) return;
    [d.exercises[ei], d.exercises[j]] = [d.exercises[j], d.exercises[ei]];
  });

  const removeEx = () => {
    const removed = structuredClone(ex);
    update((d) => { d.exercises.splice(ei, 1); });
    notify.undo(`Quitaste ${name}`, () => update((d) => { d.exercises.splice(Math.min(ei, d.exercises.length), 0, removed); }));
  };

  const pickRest = () => openRestPicker({
    name, current: ex.rest ?? null, auto: autoRest,
    onPick: (v) => update((d) => { d.exercises[ei].rest = v; }),
  });

  const plates = () => {
    const next = ex.sets.find((x) => !x.done && x.type !== 'W') || ex.sets[0];
    openPlates(next?.weight ?? next?.target?.weight ?? prev[0]?.weight);
  };

  const addSet = () => update((d) => {
    const sets = d.exercises[ei].sets;
    const last = sets.at(-1);
    sets.push({ type: 'N', weight: last?.weight ?? null, reps: last?.reps ?? null, done: !isActive && !isTemplate });
  });

  const done = ex.sets.filter((s) => s.done).length;
  const ctx = { isActive, isTemplate, showRpe, ei, update, toggle };
  let n = 0;

  return (
    <Card withBorder padding={0} className={classes.exCard} data-testid="exercise-card">
      <Group className={classes.exHead} wrap="nowrap" gap="sm" align="center">
        <UnstyledButton
          onClick={() => openSheet({ size: 'full', title: name, render: () => <ExerciseDetail id={ex.exercise_id} /> })}
          style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
          data-testid="exercise-open"
        >
          <ExerciseThumb exercise={meta} name={name} size={40} />
          <Box style={{ minWidth: 0 }}>
            <Text className={classes.exName} lineClamp={2}>{name}</Text>
            <Text size="xs" c="dimmed" className="tnum">
              {isActive ? `${done}/${ex.sets.length} series` : `${ex.sets.length} ${ex.sets.length === 1 ? 'serie' : 'series'}`}
              {meta?.bodyPart ? ` · ${meta.bodyPart}` : ''}
            </Text>
          </Box>
        </UnstyledButton>
        {isActive || isTemplate ? (
          <UnstyledButton className={classes.restChip} onClick={pickRest} aria-label="Descanso" data-testid="rest-chip">
            <IconClockHour4 size={14} />
            {restFor ? fmtClock(restFor * 1000) : 'Off'}
          </UnstyledButton>
        ) : null}
        <Menu position="bottom-end" width={210}>
          <Menu.Target>
            <ActionIcon size={36} variant="subtle" color="gray" aria-label="Opciones del ejercicio" data-testid="exercise-menu">
              <IconDots size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {isBarbell(ex) && !isTemplate ? (
              <Menu.Item leftSection={<IconWeight size={16} />} onClick={plates} data-testid="plates-open">Discos</Menu.Item>
            ) : null}
            {isActive || isTemplate ? (
              <Menu.Item leftSection={<IconClockHour4 size={16} />} onClick={pickRest}>
                Descanso
              </Menu.Item>
            ) : null}
            {!isTemplate ? (
              <Menu.Item leftSection={<IconNote size={16} />} onClick={() => setShowNote(true)}>Nota</Menu.Item>
            ) : null}
            <Menu.Item leftSection={<IconArrowUp size={16} />} disabled={ei === 0} onClick={() => move(-1)}>Subir</Menu.Item>
            <Menu.Item leftSection={<IconArrowDown size={16} />} disabled={ei === count - 1} onClick={() => move(1)}>Bajar</Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={removeEx} data-testid="exercise-remove">
              Quitar ejercicio
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {!isTemplate && (showNote || ex.notes) ? (
        <Textarea
          className={classes.exNote} variant="filled" autosize minRows={1} size="md"
          placeholder="Nota del ejercicio" value={ex.notes || ''} autoFocus={showNote && !ex.notes}
          onChange={(e) => { const v = e.currentTarget.value; update((d) => { d.exercises[ei].notes = v; }); }}
        />
      ) : null}

      {ex.sets.length ? (
        <div className={`${classes.grid} ${classes.headRow}`} style={{ '--cols': cols }}>
          <span style={{ textAlign: 'center' }}>Serie</span>
          <span>Anterior</span>
          <span>kg</span>
          <span>Reps</span>
          {showRpe && !isTemplate ? <span>RPE</span> : null}
          {isActive ? <span style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 11 }}><IconCheck size={14} stroke={3} /></span> : null}
        </div>
      ) : null}
      {ex.sets.map((s, si) => {
        const label = s.type === 'N' || !s.type ? String(++n) : s.type;
        return <SetRow key={si} s={s} si={si} label={label} p={prev[si]} cols={cols} ctx={ctx} />;
      })}

      <Button
        className={classes.addSet} variant="light" color="gray" size="sm"
        leftSection={<IconPlus size={16} />} onClick={addSet} data-testid="add-set"
      >
        Añadir serie
      </Button>
    </Card>
  );
}

export const ExerciseBlock = memo(ExerciseBlockInner);
