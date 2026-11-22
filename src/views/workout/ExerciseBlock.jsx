// Tarjeta de un ejercicio dentro del editor: encabezado, menú y tabla de series.
import { lazy, memo, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon, Box, Button, Card, Center, Checkbox, Group, Loader, Menu, Text, Textarea, UnstyledButton,
} from '@mantine/core';
import {
  IconAdjustments, IconArrowDown, IconArrowUp, IconArrowsExchange, IconCheck, IconPercentage, IconRepeat, IconTarget, IconClockHour4, IconDots, IconFlame, IconNote, IconPin, IconPlus,
  IconRefresh, IconTrash, IconTrendingUp, IconWeight,
} from '@tabler/icons-react';
import { ExerciseThumb } from '../../components/ui.jsx';
import { confirmDialog, notify, promptDialog } from '../../components/dialogs.jsx';
import { openSheet } from '../../components/Sheet.jsx';
import { useData, useStalls } from '../../lib/hooks.js';
import { exerciseName, getExercise } from '../../lib/catalog.js';
import { previousSets } from '../../lib/stats.js';
import { defaultIncrement } from '../../lib/loads.js';
import { suggest } from '../../lib/progression.js';
import { openExercisePrefs } from '../exercises/ExercisePrefs.jsx';
import { FixedNoteBox, openFixedNote } from '../exercises/FixedNote.jsx';
import { fmtSecs, modeAllowed, resolveKind, resolveLoadMode } from '../../lib/kinds.js';
import { saveSettings, savePrefs, state as dataState, templateById, upsert } from '../../lib/data.js';
import { replaceActive, replaceTemplate, templateIndexOf } from '../../lib/substitutes.js';
import { openReplaceSheet } from './ReplaceSheet.jsx';
import { programLoad } from '../../lib/tm.js';
import { getSetTimer, stopSetTimer } from '../../lib/set-timer.js';
import { RunningTime, TimeField, TimerButton, useSetTimer } from './TimeCell.jsx';
import { openStallSheet } from './StallSheet.jsx';
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

// Encabezado de la columna de peso según el tipo de ejercicio (peso corporal: sin columna)
const WEIGHT_HEAD = { peso_reps: 'kg', lastre: '+kg', asistido: '−kg', tiempo: 'kg' };
const WEIGHT_LABEL = { peso_reps: 'Peso (kg)', lastre: 'Lastre (kg)', asistido: 'Asistencia (kg)', tiempo: 'Peso (kg)' };
const MODE_SUFFIX = { total: '', por_mano: ' c/u', unilateral: '/lado' }; // feature 05

// "Usar esto para todas las mancuernas": guarda el modo en los ejercicios de mancuerna que ya usaste
// (se sincroniza) y lo deja como respaldo para los que agregues después.
function answerDumbbell(id, mode, all) {
  savePrefs(id, { load_mode: mode });
  if (!all) return;
  saveSettings({ dumbbellMode: mode });
  const used = new Set([...dataState.workouts, ...dataState.templates].flatMap((w) => (w.exercises || []).map((e) => e.exercise_id)));
  for (const exId of used) {
    if (exId !== id && getExercise(exId)?.category === 'Mancuerna' && !dataState.exercise_prefs.find((p) => p.id === exId)?.load_mode) {
      savePrefs(exId, { load_mode: mode });
    }
  }
}

function DumbbellAsk({ id }) {
  const [all, setAll] = useState(false);
  return (
    <Box className={`${classes.goal} ${classes.ask}`} data-testid="dumbbell-ask">
      <IconWeight size={16} className={classes.goalIcon} />
      <Box>
        <Text size="sm" className={classes.goalText}>¿Anotas el peso de una mancuerna o el total?</Text>
        <Group gap={6} mt={6}>
          <Button size="compact-sm" variant="filled" onClick={() => answerDumbbell(id, 'por_mano', all)} data-testid="dumbbell-one">Una mancuerna</Button>
          <Button size="compact-sm" variant="default" onClick={() => answerDumbbell(id, 'total', all)} data-testid="dumbbell-total">El total</Button>
        </Group>
        <Checkbox mt={8} size="xs" label="Usar esto para todas las mancuernas" checked={all} onChange={(e) => setAll(e.currentTarget.checked)} data-testid="dumbbell-all" />
      </Box>
    </Box>
  );
}

const sameSets = (a, b) => a.length === b.length && a.every((x, i) => x.weight === b[i].weight && x.reps === b[i].reps);

// "63 × 8" / "62,5 × 10" / "13 reps"
const goalText = (g) => (g.weight ? `${fmtNum(g.weight, 2)} × ${g.reps}` : `${g.reps} reps`);

const prevText = (p, kind) => {
  if (!p) return '—';
  if (kind === 'tiempo' || (!p.reps && p.seconds)) return p.seconds ? `${p.weight ? `${fmtNum(p.weight)} · ` : ''}${fmtSecs(p.seconds)}` : '—';
  if (p.weight && kind !== 'peso_corporal') return `${fmtNum(p.weight)} × ${p.reps ?? 0}`;
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

function SetTypeMenu({ s, label, onType, onDelete, onPct, onAmrap }) {
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
          {s.fb === 'pr' ? <span className={classes.prTag}>PR</span> : s.amrap ? <span className={classes.amrapTag} title="Reps al máximo">+</span> : null}
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
        {onPct ? (
          <>
            <Menu.Divider />
            <Menu.Item leftSection={<IconPercentage size={16} />} rightSection={s.pct != null ? <IconCheck size={16} /> : null} onClick={onPct} data-testid="set-pct-toggle">
              Peso en % del máximo
            </Menu.Item>
            <Menu.Item leftSection={<IconRepeat size={16} />} rightSection={s.amrap ? <IconCheck size={16} /> : null} onClick={onAmrap} data-testid="set-amrap-toggle">
              Reps al máximo (5+)
            </Menu.Item>
          </>
        ) : null}
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={onDelete} data-testid="set-delete">
          Eliminar serie
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function SetRow({ s, label, p, goal, cols, ctx, si }) {
  const { isActive, isTemplate, showRpe, ei, update, toggle, kind, timerKey, timer, prescribed, tm, exId } = ctx;
  // Programa o % del máximo (feature 12): manda el peso indicado, no la vez anterior
  const ph = (prescribed && s.target) || goal || p || s.target || {};
  const pctMode = isTemplate && s.pct != null;
  const pctKg = pctMode && tm ? programLoad(exId, (tm * s.pct) / 100) : null;
  const timed = kind === 'tiempo';
  const key = timerKey(si);
  const running = isActive && timer?.key === key;
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
        onPct={isTemplate ? () => patch((x) => { if (x.pct != null) delete x.pct; else { x.pct = 75; x.weight = null; } }) : null}
        onAmrap={isTemplate ? () => patch((x) => { if (x.amrap) delete x.amrap; else x.amrap = true; }) : null}
      />
      {pctMode ? (
        <span className={classes.prev} data-testid="set-pct-kg" title={tm ? `${s.pct} % de ${fmtNum(tm)} kg` : 'Sin máximo de entrenamiento: se pide al empezar'}>
          {pctKg ? `= ${fmtNum(pctKg)} kg` : 'sin máx.'}
        </span>
      ) : (
        <UnstyledButton
          className={classes.prev} disabled={!p}
          onClick={() => patch((x) => { x.weight = p.weight; x.reps = p.reps; if (p.seconds) x.seconds = p.seconds; })}
          title={p ? `Copiar ${fmtSet(p)}` : 'Sin registro anterior'}
          data-testid="set-prev"
        >
          {prevText(p, kind)}
        </UnstyledButton>
      )}
      {pctMode && kind !== 'peso_corporal' ? (
        <NumField
          key="pct" value={s.pct} mode="decimal" label="% del máximo" testId="set-pct" placeholder="%"
          onValue={(v) => patch((x) => { x.pct = v; })}
        />
      ) : kind !== 'peso_corporal' ? (
        <NumField
          value={s.weight} mode="decimal" label={WEIGHT_LABEL[kind]} testId="set-weight"
          placeholder={ph.weight ? fmtNum(ph.weight, 2) : timed ? '—' : 'kg'}
          onValue={(v) => patch((x) => { x.weight = v; })}
        />
      ) : null}
      {timed ? (
        running ? <RunningTime timer={timer} /> : (
          <TimeField
            value={s.seconds} placeholder={ph.seconds ? fmtSecs(ph.seconds) : 'm:ss'}
            onValue={(v) => patch((x) => { if (v) x.seconds = v; else delete x.seconds; })}
          />
        )
      ) : (
        <NumField
          value={s.reps} mode="numeric" label="Repeticiones" testId="set-reps"
          placeholder={ph.reps != null ? `${ph.reps}${s.amrap ? '+' : ''}` : 'reps'}
          onValue={(v) => patch((x) => { x.reps = v; })}
        />
      )}
      {timed && isActive ? (
        <TimerButton
          timerKey={key} running={running} disabled={!!s.done}
          target={s.seconds || s.target?.seconds || null}
          onStop={(secs) => patch((x) => { x.seconds = secs; })}
        />
      ) : null}
      {showRpe && !isTemplate && !timed ? (
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
  const kind = resolveKind(prefs, meta || { name });
  const timed = kind === 'tiempo';
  const loadMode = resolveLoadMode(prefs, kind, { category, dumbbellMode: settings.dumbbellMode });
  const askDumbbell = isActive && category === 'Mancuerna' && modeAllowed(kind) && !prefs?.load_mode && !settings.dumbbellMode;
  const timer = useSetTimer();
  const timerKey = (si) => `${docId}:${ei}:${si}`;

  // Estancamiento (feature 06): solo en el entrenamiento en curso
  const stalls = useStalls();
  const stall = isActive && stalls.get(ex.exercise_id)?.stalled ? stalls.get(ex.exercise_id) : null;

  // Programa o series en % del máximo (feature 12): el peso viene indicado
  const prescribed = !!ex.prog || ex.sets.some((s) => s.target?.pct != null);
  const tm = prefs?.training_max || null;

  // Objetivo para superar la vez anterior (feature 01): solo en el entrenamiento en curso
  const goal = useMemo(() => {
    if (!isActive || prescribed || settings.suggest === false || kind === 'asistido' || kind === 'tiempo') return null;
    return suggest({
      workouts, exId: ex.exercise_id, excludeId: docId, templateId, prefs,
      increment: defaultIncrement(category),
      barbell: barbell ? { bar: settings.bar, plates: settings.plates } : null,
      stalled: !!stall, resetPct: (settings.resetPct ?? 10) / 100,
    });
  }, [isActive, prescribed, settings.suggest, settings.bar, settings.plates, settings.resetPct, workouts, ex.exercise_id, docId, templateId, prefs, category, barbell, kind, stall]);
  const goalIdx = goal ? ex.sets.findIndex((s) => s.type !== 'W' && s.type !== 'D') : -1;
  // Opciones: reinicio (si está estancado, va primero), la principal y la alternativa
  const goalOptions = !goal ? [] : [
    ...(goal.reset ? [{ key: 'reset', weight: goal.reset.weight, reps: goal.reset.reps }] : []),
    { key: 'main', ...goal.main },
    ...(goal.alt ? [{ key: 'alt', ...goal.alt }] : []),
  ];
  const picked = ex.goal_pick || (ex.goal_alt ? 'alt' : null);
  const goalMain = goalOptions.find((o) => o.key === picked) || goalOptions[0] || null;
  const goalOthers = goalOptions.filter((o) => o !== goalMain);
  const goalSource = goalMain?.key === 'reset' ? 'reinicio' : goal?.source;
  const pickGoal = (key) => update((d) => {
    const x = d.exercises[ei];
    delete x.goal_alt;
    x.goal_pick = key;
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
    () => (workRef > 0 && !isTemplate && kind === 'peso_reps' ? warmupFor({ exercise_id: ex.exercise_id, name: ex.name }, workRef, workouts, settings) : []),
    [workRef, isTemplate, ex.exercise_id, ex.name, workouts, settings, prefs, kind],
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
    '34px', 'minmax(0,1fr)',
    kind !== 'peso_corporal' ? (timed ? '52px' : '62px') : null,
    timed ? '64px' : '54px',
    timed && isActive ? '36px' : null,
    showRpe && !isTemplate && !timed ? '50px' : null,
    isActive ? '40px' : null,
  ].filter(Boolean).join(' ');

  const toggle = (si) => {
    const s = ex.sets[si];
    const p = prevA[si];
    if (!s.done && timed) {
      const ph = p || s.target || {};
      const t = getSetTimer();
      const fromTimer = t?.key === timerKey(si) ? stopSetTimer() : 0;
      const seconds = fromTimer || s.seconds || ph.seconds || null;
      if (!seconds) { notify.warn('Ingresa el tiempo o usa el cronómetro'); return; }
      const next = { ...s, weight: s.weight || ph.weight || null, reps: null, seconds, done: true };
      next.fb = setFeedback(ex.exercise_id, next, p, docId, before);
      if (!next.fb) delete next.fb;
      update((d) => { d.exercises[ei].sets[si] = next; });
      if (next.fb === 'pr') notify.record(`${name}: ${fmtSet(next)}`);
      startRest(restFor);
    } else if (!s.done) {
      const g = si === goalIdx ? goalMain : null;
      const ph = (prescribed && s.target) || g || p || s.target || {};
      const reps = s.reps ?? ph.reps ?? null;
      if (reps == null) { notify.warn('Ingresa las repeticiones'); return; }
      const next = { ...s, weight: s.weight ?? ph.weight ?? 0, reps, done: true };
      if (g) next.target = { weight: g.weight, reps: g.reps, source: goalSource };
      next.fb = setFeedback(ex.exercise_id, next, p, docId, before);
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

  // Reemplazar (feature 10): en curso, las hechas se quedan y las pendientes pasan al nuevo; en la
  // plantilla, mismas series y reps objetivo. Deshacer por 5 s, también el cambio en la plantilla.
  const replace = () => {
    const tpl = isActive && templateId ? templateById(templateId) : null;
    const allDone = isActive && ex.sets.length > 0 && ex.sets.every((s) => s.done);
    openReplaceSheet({
      // Un ejercicio de un programa (feature 12) se cambia en el programa, no en su plantilla
      id: ex.exercise_id, name, allDone, fromTemplate: !!tpl && !allDone && !ex.prog,
      onPick: (newId, scope) => {
        const next = { exercise_id: newId, name: exerciseName(newId) };
        const before = structuredClone(ex);
        let res = null;
        let ti = -1;
        update((d) => {
          if (scope === 'template' && tpl) ti = templateIndexOf(d.exercises, ei, tpl.exercises);
          res = isTemplate ? replaceTemplate(d.exercises, ei, next) : replaceActive(d.exercises, ei, next);
        });
        let tplBefore = null;
        if (scope === 'template' && tpl) {
          if (ti >= 0) {
            tplBefore = structuredClone(tpl);
            const t = structuredClone(tpl);
            replaceTemplate(t.exercises, ti, next);
            upsert('templates', t);
          } else notify.warn(`"${tpl.name}" no tiene este ejercicio: se cambió solo hoy`);
        }
        const msg = res.added ? `Agregaste ${next.name} debajo`
          : res.split ? `${next.name} va debajo con las series pendientes`
            : `Cambiaste ${name} por ${next.name}`;
        notify.undo(tplBefore ? `${msg} (también en la plantilla)` : msg, () => {
          update((d) => {
            if (d.exercises[res.index]?.exercise_id !== newId) return;
            if (res.index === ei) d.exercises[ei] = before;
            else {
              d.exercises.splice(res.index, 1);
              if (d.exercises[ei]?.exercise_id === before.exercise_id) d.exercises[ei] = before;
            }
          });
          if (tplBefore) upsert('templates', tplBefore);
        });
      },
    });
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
    sets.push({
      type: 'N', weight: last?.weight ?? null, reps: last?.reps ?? null, ...(last?.seconds ? { seconds: last.seconds } : {}),
      done: !isActive && !isTemplate,
    });
  });

  const done = ex.sets.filter((s) => s.done).length;
  const ctx = { isActive, isTemplate, showRpe, ei, update, toggle, kind, timerKey, timer, prescribed, tm, exId: ex.exercise_id };
  const tier = ex.prog?.tier && ex.prog.tier !== 'main' ? ex.prog.tier : null;
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
              {tier ? ` · ${tier}` : ''}
            </Text>
            {stall ? (
              <span
                role="button" tabIndex={0} className={classes.stallTag} data-testid="stall-tag"
                onClick={(e) => {
                  e.stopPropagation();
                  openStallSheet({
                    id: ex.exercise_id, name, stall, reset: goal?.reset || null, atMax: goal?.atMax,
                    onUseReset: () => pickGoal('reset'),
                  });
                }}
              >
                Estancado
              </span>
            ) : null}
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
              <Menu.Item leftSection={<IconNote size={16} />} onClick={() => setShowNote(true)}>Nota de hoy</Menu.Item>
            ) : null}
            <Menu.Item leftSection={<IconPin size={16} />} onClick={() => openFixedNote({ id: ex.exercise_id, name })} data-testid="fixed-note-menu">
              Nota fija
            </Menu.Item>
            {kind === 'peso_reps' ? (
              <Menu.Item
                leftSection={<IconFlame size={16} />} onClick={addWarmup} disabled={noLoad} data-testid="warmup-menu"
                title={noLoad ? 'Sin peso: el calentamiento no aplica' : undefined}
              >
                {noLoad ? 'Calentamiento (sin peso)' : 'Agregar calentamiento'}
              </Menu.Item>
            ) : null}
            {isTemplate && kind === 'peso_reps' ? (
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
            {isActive || (isTemplate && !ex.prog) ? (
              <Menu.Item leftSection={<IconArrowsExchange size={16} />} onClick={replace} data-testid="exercise-replace">
                {isActive && ex.sets.length > 0 && done === ex.sets.length ? 'Agregar otro después' : 'Reemplazar'}
              </Menu.Item>
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

      {askDumbbell ? <DumbbellAsk id={ex.exercise_id} /> : null}

      {prefs?.note ? (
        <FixedNoteBox note={prefs.note} className={classes.fixedNote} onEdit={() => openFixedNote({ id: ex.exercise_id, name })} />
      ) : null}

      {ex.prog?.test ? (
        <Box className={classes.goal} data-testid="test-5rm">
          <IconTarget size={16} className={classes.goalIcon} />
          <Text size="sm" className={classes.goalText}>
            <b>Prueba de 5RM:</b> sube hasta el peso más alto que puedas hacer 5 veces y anótalo. El T1 vuelve a 5 × 3 con el 85 %.
          </Text>
        </Box>
      ) : null}
      {isTemplate && ex.prog ? (
        <Text size="xs" c="dimmed" px="sm" pb={4} data-testid="prog-note">Series del programa: se actualizan solas después de cada día.</Text>
      ) : null}

      {goal ? (
        <Box className={classes.goal} data-testid="goal-line" data-source={goalSource}>
          <IconTrendingUp size={16} className={classes.goalIcon} />
          <Text size="sm" className={classes.goalText}>
            {goalSource === 'reinicio' ? 'Reinicio: ' : goal.source === 'pausa' ? 'Vuelta después de una pausa: ' : 'Para superar: '}
            <b data-testid="goal-main">{goalText(goalMain)}</b>
            {goalOthers.map((o) => (
              <span key={o.key}>
                {' · o '}
                <UnstyledButton
                  component="span" className={classes.goalAlt} onClick={() => pickGoal(o.key)}
                  aria-label={`Usar ${goalText(o)}`} data-testid={o.key === 'reset' ? 'goal-reset' : 'goal-alt'}
                >
                  {o.key === 'reset' ? `reinicio ${goalText(o)}` : goalText(o)}
                </UnstyledButton>
              </span>
            ))}
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
          {kind !== 'peso_corporal' ? (
            <span data-testid="weight-head">
              {isTemplate && ex.sets.some((s) => s.pct != null) ? '% máx' : WEIGHT_HEAD[kind]}{modeAllowed(kind) ? MODE_SUFFIX[loadMode] : ''}
            </span>
          ) : null}
          <span>{timed ? 'Tiempo' : 'Reps'}</span>
          {timed && isActive ? <span /> : null}
          {showRpe && !isTemplate && !timed ? <span>RPE</span> : null}
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
