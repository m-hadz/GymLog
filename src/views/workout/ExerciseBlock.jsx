// Tarjeta de un ejercicio dentro del editor: encabezado, menú y tabla de series.
import { lazy, memo, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon, Box, Button, Card, Center, Group, Loader, Menu, Text, Textarea, UnstyledButton,
} from '@mantine/core';
import {
  IconAdjustments, IconArrowDown, IconArrowUp, IconCheck, IconClockHour4, IconDots, IconFlame, IconNote, IconPlus,
  IconRefresh, IconTrash, IconTrendingUp, IconWeight,
} from '@tabler/icons-react';
import { ExerciseThumb } from '../../components/ui.jsx';
import { confirmDialog, notify, promptDialog } from '../../components/dialogs.jsx';
import { openSheet } from '../../components/Sheet.jsx';
import { useData } from '../../lib/hooks.js';
import { exerciseName, getExercise } from '../../lib/catalog.js';
import { previousSets } from '../../lib/stats.js';
import { defaultIncrement } from '../../lib/loads.js';
import { suggest } from '../../lib/progression.js';
import { openExercisePrefs } from '../exercises/ExercisePrefs.jsx';
import { startRest } from '../../lib/rest-timer.js';
import { fmtClock, fmtNum, fmtSet, num } from '../../lib/format.js';
import {
  FB_LABEL, RPE_OPTIONS, SET_TYPES, SET_TYPE_LABEL, isBarbell, setFeedback, warmupFor,
} from '../../lib/workout.js';
import { DEFAULT_WARMUP_REST } from '../../lib/warmup.js';
import { openPlates, openRestPicker } from './sheets.jsx';
import classes from './workout.module.css';

// La ficha trae gráficos (Recharts): se carga recién al abrirla.
const ExerciseDetail = lazy(() => import('../exercises/ExerciseDetail.jsx').then((m) => ({ default: m.ExerciseDetail })));

const toText = (v) => (v == null ? '' : String(v).replace('.', ','));
const selectAll = (e) => e.currentTarget.select();

// "Anterior" por tipo de serie: calentamientos con calentamientos y efectivas con efectivas,
// así agregar calentamientos no corre la comparación de las series efectivas.
function alignPrev(sets, prev) {
  const pw = prev.filter((s) => s.type === 'W');
  const pn = prev.filter((s) => s.type !== 'W');
  let w = 0;
  let n = 0;
  return sets.map((s) => (s.type === 'W' ? pw[w++] : pn[n++]));
}

const sameSets = (a, b) => a.length === b.length && a.every((x, i) => x.weight === b[i].weight && x.reps === b[i].reps);

// "63 × 8" / "62,5 × 10" / "13 reps"
const goalText = (g) => (g.weight ? `${fmtNum(g.weight, 2)} × ${g.reps}` : `${g.reps} reps`);

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

function SetRow({ s, label, p, goal, cols, ctx, si }) {
  const { isActive, isTemplate, showRpe, ei, update, toggle } = ctx;
  const ph = goal || p || s.target || {};
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
        placeholder={ph.weight != null ? fmtNum(ph.weight, 2) : 'kg'}
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

function ExerciseBlockInner({ ex, ei, count, mode, docId, templateId, before, firstOfPart = true, settings, update }) {
  const isActive = mode === 'active';
  const isTemplate = mode === 'template';
  const showRpe = !!settings.rpe;
  const name = exerciseName(ex.exercise_id, ex.name);
  const meta = getExercise(ex.exercise_id);
  const category = meta?.category;
  const barbell = isBarbell(ex);
  const { workouts, exercise_prefs: allPrefs } = useData();
  const [showNote, setShowNote] = useState(!!ex.notes);
  const prev = useMemo(
    () => previousSets(workouts, ex.exercise_id, { excludeId: docId, before }),
    [ex.exercise_id, docId, before, workouts],
  );
  const prevA = useMemo(() => alignPrev(ex.sets, prev), [ex.sets, prev]);
  const prefs = useMemo(() => allPrefs.find((x) => x.id === ex.exercise_id) || null, [allPrefs, ex.exercise_id]);

  // Objetivo para superar la vez anterior (feature 01): solo en el entrenamiento en curso
  const goal = useMemo(() => {
    if (!isActive || settings.suggest === false) return null;
    return suggest({
      workouts, exId: ex.exercise_id, excludeId: docId, templateId, prefs,
      increment: defaultIncrement(category),
      barbell: barbell ? { bar: settings.bar, plates: settings.plates } : null,
    });
  }, [isActive, settings.suggest, settings.bar, settings.plates, workouts, ex.exercise_id, docId, templateId, prefs, category, barbell]);
  const goalIdx = goal ? ex.sets.findIndex((s) => s.type !== 'W' && s.type !== 'D') : -1;
  const [goalMain, goalAlt] = !goal ? [null, null] : ex.goal_alt && goal.alt ? [goal.alt, goal.main] : [goal.main, goal.alt];
  const swapGoal = () => update((d) => {
    const x = d.exercises[ei];
    if (x.goal_alt) delete x.goal_alt; else x.goal_alt = true;
  });
  const askIncrement = goal?.source === 'superar' && !prefs?.min_increment && !barbell && category !== 'Mancuerna';
  const openPrefs = () => openExercisePrefs({ id: ex.exercise_id, name, category });

  // Calentamiento (feature 02). Peso de trabajo: lo escrito en la primera serie efectiva →
  // objetivo para superar → objetivo de la plantilla → vez anterior.
  const workIdx = ex.sets.findIndex((s) => s.type !== 'W' && s.type !== 'D');
  const workSet = ex.sets[workIdx];
  const workRef = workSet
    ? workSet.weight ?? (workIdx === goalIdx ? goalMain?.weight : null) ?? workSet.target?.weight ?? prevA[workIdx]?.weight ?? null
    : null;
  const warm = useMemo(
    () => (workRef > 0 && !isTemplate ? warmupFor({ exercise_id: ex.exercise_id, name: ex.name }, workRef, workouts, settings) : []),
    [workRef, isTemplate, ex.exercise_id, ex.name, workouts, settings, prefs],
  );
  const warmSets = ex.sets.filter((s) => s.type === 'W');
  const pendingWarm = warmSets.filter((s) => !s.done);
  const noLoad = (category === 'Peso corporal' || category === 'Cardio') && !(workRef > 0);
  const showWarm = isActive && settings.warmupShow !== false && warm.length > 0 && !warmSets.length && !workSet?.done
    && (settings.warmupFirstOnly === false || firstOfPart);
  const staleWarm = isActive && pendingWarm.length > 0 && pendingWarm.length === warmSets.length && warm.length > 0
    && !workSet?.done && !sameSets(pendingWarm, warm);

  const insertWarm = (sets) => update((d) => {
    const x = d.exercises[ei];
    x.sets = x.sets.filter((s) => !(s.type === 'W' && !s.done));
    const at = x.sets.findIndex((s) => s.type !== 'W');
    // Las ya hechas se conservan y no se repiten
    const doneW = new Set(x.sets.filter((s) => s.type === 'W').map((s) => s.weight));
    const rows = sets.filter((w) => !doneW.has(w.weight))
      .map((w) => ({ type: 'W', weight: w.weight, reps: w.reps, done: !isActive && !isTemplate }));
    x.sets.splice(at < 0 ? x.sets.length : at, 0, ...rows);
  });
  const addWarmup = async () => {
    let work = workRef;
    if (!(work > 0)) {
      const v = await promptDialog({ title: 'Peso de trabajo', label: `Peso de tu primera serie de ${name} (kg)`, confirmLabel: 'Calcular' });
      work = num(v);
      if (!(work > 0)) return;
    }
    const sets = warmupFor({ exercise_id: ex.exercise_id, name: ex.name }, work, workouts, settings);
    if (!sets.length) { notify.warn('Con ese peso no hace falta calentamiento'); return; }
    if (warmSets.length && !await confirmDialog({
      title: 'Ya tienes series de calentamiento',
      message: pendingWarm.length < warmSets.length
        ? 'Se reemplazan las que no has marcado; las hechas se conservan.'
        : '¿Reemplazarlas por las calculadas?',
      confirmLabel: 'Reemplazar',
    })) return;
    insertWarm(sets);
  };
  const toggleAutoWarm = () => update((d) => {
    const x = d.exercises[ei];
    if (x.auto_warmup) delete x.auto_warmup; else x.auto_warmup = true;
  });
  const autoRest = meta?.rest ?? settings.defaultRest;
  const restFor = ex.rest ?? autoRest;
  const cols = [
    '34px', 'minmax(0,1fr)', '62px', '54px',
    showRpe && !isTemplate ? '50px' : null,
    isActive ? '40px' : null,
  ].filter(Boolean).join(' ');

  const toggle = (si) => {
    const s = ex.sets[si];
    const p = prevA[si];
    if (!s.done) {
      const g = si === goalIdx ? goalMain : null;
      const ph = g || p || s.target || {};
      const reps = s.reps ?? ph.reps ?? null;
      if (reps == null) { notify.warn('Ingresa las repeticiones'); return; }
      const next = { ...s, weight: s.weight ?? ph.weight ?? 0, reps, done: true };
      if (g) next.target = { weight: g.weight, reps: g.reps, source: goal.source };
      next.fb = setFeedback(ex.exercise_id, next, p, docId);
      if (!next.fb) delete next.fb;
      update((d) => { d.exercises[ei].sets[si] = next; });
      if (next.fb === 'pr') notify.record(`${name}: ${fmtSet(next)}`);
      startRest(s.type === 'W' ? Math.min(settings.warmupRest ?? DEFAULT_WARMUP_REST, restFor) : restFor);
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
    const g = goalIdx >= 0 && next === ex.sets[goalIdx] ? goalMain?.weight : null;
    openPlates(next?.weight ?? g ?? next?.target?.weight ?? prevA[ex.sets.indexOf(next)]?.weight ?? prev[0]?.weight);
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
          onClick={() => openSheet({ size: 'full', title: name, render: () => <Suspense fallback={<Center py="xl"><Loader type="dots" /></Center>}><ExerciseDetail id={ex.exercise_id} /></Suspense> })}
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
            <Menu.Item
              leftSection={<IconFlame size={16} />} onClick={addWarmup} disabled={noLoad} data-testid="warmup-menu"
              title={noLoad ? 'Sin peso: el calentamiento no aplica' : undefined}
            >
              {noLoad ? 'Calentamiento (sin peso)' : 'Agregar calentamiento'}
            </Menu.Item>
            {isTemplate ? (
              <Menu.Item
                leftSection={<IconFlame size={16} />} onClick={toggleAutoWarm} data-testid="warmup-auto"
                rightSection={ex.auto_warmup ? <IconCheck size={16} /> : null}
              >
                Calentamiento automático
              </Menu.Item>
            ) : null}
            <Menu.Item leftSection={<IconAdjustments size={16} />} onClick={openPrefs} data-testid="prefs-open">
              Ajustes del ejercicio
            </Menu.Item>
            <Menu.Item leftSection={<IconArrowUp size={16} />} disabled={ei === 0} onClick={() => move(-1)}>Subir</Menu.Item>
            <Menu.Item leftSection={<IconArrowDown size={16} />} disabled={ei === count - 1} onClick={() => move(1)}>Bajar</Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={removeEx} data-testid="exercise-remove">
              Quitar ejercicio
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {goal ? (
        <Box className={classes.goal} data-testid="goal-line" data-source={goal.source}>
          <IconTrendingUp size={16} className={classes.goalIcon} />
          <Text size="sm" className={classes.goalText}>
            {goal.source === 'pausa' ? 'Vuelta después de una pausa: ' : 'Para superar: '}
            <b data-testid="goal-main">{goalText(goalMain)}</b>
            {goalAlt ? (
              <>
                {' · o '}
                <UnstyledButton
                  component="span" className={classes.goalAlt} onClick={swapGoal}
                  aria-label={`Usar ${goalText(goalAlt)}`} data-testid="goal-alt"
                >
                  {goalText(goalAlt)}
                </UnstyledButton>
              </>
            ) : null}
            {goal.source === 'pausa' ? ' (iguala tu 1RM)' : ''}
            {goal.atMax ? ' · Estás en el tope de la máquina' : ''}
          </Text>
          {askIncrement ? (
            <UnstyledButton className={classes.goalAsk} onClick={openPrefs} data-testid="goal-ask">
              ¿Cuánto es lo mínimo que puedes subirle? (usando {fmtNum(defaultIncrement(category), 2)} kg)
            </UnstyledButton>
          ) : null}
        </Box>
      ) : null}

      {showWarm ? (
        <Box className={`${classes.goal} ${classes.warm}`} data-testid="warmup-line">
          <IconFlame size={16} className={classes.goalIcon} />
          <Text size="sm" className={classes.goalText}>
            Calentamiento: {warm.map(goalText).join(' · ')}
          </Text>
          <UnstyledButton className={classes.warmBtn} onClick={addWarmup} data-testid="warmup-add">Agregar</UnstyledButton>
        </Box>
      ) : staleWarm ? (
        <Box className={`${classes.goal} ${classes.warm}`} data-testid="warmup-stale">
          <IconRefresh size={16} className={classes.goalIcon} />
          <Text size="sm" className={classes.goalText}>Cambió el peso de trabajo</Text>
          <UnstyledButton className={classes.warmBtn} onClick={() => insertWarm(warm)} data-testid="warmup-recalc">
            Recalcular calentamiento
          </UnstyledButton>
        </Box>
      ) : null}

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
        return <SetRow key={si} s={s} si={si} label={label} p={prevA[si]} goal={si === goalIdx ? goalMain : null} cols={cols} ctx={ctx} />;
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
