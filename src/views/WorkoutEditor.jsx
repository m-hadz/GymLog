// Editor de entrenamientos y plantillas. Tres modos:
//  - 'active'   entrenamiento en curso: reloj, ✓ por serie, descanso automático
//  - 'edit'     corregir un entrenamiento ya guardado
//  - 'template' crear o editar una plantilla
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon, Box, Button, Group, Progress, Stack, Text, Textarea, TextInput,
} from '@mantine/core';
import {
  IconChevronDown, IconClockPlay, IconMoodEmpty, IconPlus, IconTrash, IconX,
} from '@tabler/icons-react';
import { Page, PageHeader } from '../components/PageHeader.jsx';
import { EmptyState } from '../components/ui.jsx';
import { confirmDialog, notify } from '../components/dialogs.jsx';
import { openPicker } from '../components/ExercisePicker.jsx';
import { useActiveWorkout, useCatalog, useData, useNow, useRest, useSettings } from '../lib/hooks.js';
import {
  clearActive, getActive, getSettings, remove, setActive, state, templateById, upsert, workoutById,
} from '../lib/data.js';
import { exerciseName, getExercise } from '../lib/catalog.js';
import { previousSets } from '../lib/stats.js';
import { stopRest } from '../lib/rest-timer.js';
import { fmtClock, fmtDate, fmtTime, toLocalInput, uid } from '../lib/format.js';
import { goBack, navigate } from '../lib/router.js';
import { defaultWorkoutName, templateFromWorkout } from '../lib/workout.js';
import { finishProgramWorkout, programOfTemplate, reprocessProgramWorkout } from '../lib/program-runtime.js';
import { ExerciseBlock } from './workout/ExerciseBlock.jsx';
import { openRestTimer } from './workout/sheets.jsx';
import classes from './workout/workout.module.css';

// ¿Es el primer ejercicio de su grupo muscular en el entrenamiento? (calentamiento, feature 02)
const partOf = (e) => { const p = getExercise(e.exercise_id)?.bodyPart; return !p || p === 'Otro' ? e.exercise_id : p; };
const isFirstOfPart = (list, i) => !list.slice(0, i).some((e) => partOf(e) === partOf(list[i]));

const structure = (exs) => exs.map((e) => `${e.exercise_id}x${e.sets.length}`).join('|');

function setsFromHistory(exId) {
  const prev = previousSets(state.workouts, exId);
  if (!prev.length) return [{ type: 'N', weight: null, reps: null, done: false }];
  return prev.slice(0, 10).map((s) => ({ type: s.type || 'N', weight: null, reps: null, done: false }));
}

// ---------- Encabezados ----------
function ActiveHeader({ doc, onFinish }) {
  const now = useNow(1000);
  const { end } = useRest();
  const total = doc.exercises.reduce((a, e) => a + e.sets.length, 0);
  const done = doc.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  return (
    <PageHeader
      title={<span className={classes.clock} data-testid="workout-clock">{fmtClock(now - new Date(doc.started_at))}</span>}
      subtitle={total ? `${done} de ${total} series` : 'Sin series aún'}
      left={(
        <Group gap={2} wrap="nowrap">
          <ActionIcon size={40} variant="subtle" color="gray" onClick={() => navigate('/train')} aria-label="Minimizar" data-testid="minimize">
            <IconChevronDown size={24} />
          </ActionIcon>
          <ActionIcon
            size={40} variant={end ? 'light' : 'subtle'} color={end ? 'brand' : 'gray'}
            onClick={openRestTimer} aria-label="Temporizador de descanso" data-testid="rest-open"
          >
            <IconClockPlay size={22} />
          </ActionIcon>
        </Group>
      )}
      right={(
        <Button color="teal" radius="xl" size="sm" onClick={onFinish} data-testid="finish-workout">
          Terminar
        </Button>
      )}
    >
      <Progress value={total ? (done / total) * 100 : 0} size={3} color="teal" radius={0} mx="calc(var(--mantine-spacing-md) * -1)" />
    </PageHeader>
  );
}

function FormHeader({ title, onCancel, onSave }) {
  return (
    <PageHeader
      title={title}
      left={<Button variant="subtle" color="gray" size="compact-md" px={6} onClick={onCancel} data-testid="editor-cancel">Cancelar</Button>}
      right={<Button size="compact-md" radius="xl" px="md" onClick={onSave} data-testid="editor-save">Guardar</Button>}
    />
  );
}

// ---------- Editor ----------
function Editor({ mode, doc, update, onSave, onCancel, title }) {
  const settings = useSettings();
  useCatalog();
  useData();
  const isActive = mode === 'active';
  const isTemplate = mode === 'template';
  const isEdit = mode === 'edit';

  const addExercises = (ids) => update((d) => {
    for (const id of ids) {
      d.exercises.push({
        exercise_id: id,
        name: exerciseName(id),
        rest: null,
        notes: '',
        sets: isTemplate ? [{ type: 'N', weight: null, reps: null }] : setsFromHistory(id).map((s) => ({ ...s, done: !isActive })),
      });
    }
  });

  const finish = async () => {
    const cur = getActive();
    if (!cur) return;
    const pending = cur.exercises.reduce((a, e) => a + e.sets.filter((s) => !s.done).length, 0);
    if (pending && !(await confirmDialog({
      title: '¿Terminar el entrenamiento?',
      message: `Hay ${pending} ${pending === 1 ? 'serie sin completar. Se descartará' : 'series sin completar. Se descartarán'}.`,
      confirmLabel: 'Terminar',
    }))) return;
    const final = structuredClone(getActive() || cur);
    final.exercises = final.exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done).map(({ target, fb, ...s }) => s) }))
      .filter((e) => e.sets.length);
    if (!final.exercises.length) {
      if (await confirmDialog({
        title: 'No completaste ninguna serie',
        message: '¿Descartar el entrenamiento?',
        confirmLabel: 'Descartar',
        danger: true,
      })) {
        clearActive(); stopRest(); navigate('/train');
      }
      return;
    }
    final.ended_at = new Date().toISOString();
    upsert('workouts', final);
    // Día de un programa (feature 12): progresión y siguiente día; su plantilla la genera el programa
    const inProgram = !!programOfTemplate(final.template_id);
    if (inProgram) finishProgramWorkout(final);
    const tpl = !inProgram && final.template_id && templateById(final.template_id);
    if (tpl && structure(tpl.exercises) !== structure(final.exercises) && await confirmDialog({
      title: 'Actualizar plantilla',
      message: `¿Actualizar "${tpl.name}" con los ejercicios y series de hoy?`,
      confirmLabel: 'Actualizar',
      cancelLabel: 'Mantener',
    })) {
      upsert('templates', { ...templateFromWorkout(final, tpl.name), id: tpl.id, position: tpl.position, folder: tpl.folder, notes: tpl.notes });
    }
    clearActive();
    stopRest();
    navigate(`/workout/${final.id}?done=1`);
  };

  const cancelWorkout = async () => {
    if (await confirmDialog({
      title: '¿Cancelar el entrenamiento?', message: 'Se descartará todo lo que registraste.',
      confirmLabel: 'Descartar', cancelLabel: 'Seguir', danger: true,
    })) {
      clearActive(); stopRest(); navigate('/train');
    }
  };

  const deleteWorkout = async () => {
    if (await confirmDialog({ title: '¿Eliminar este entrenamiento?', message: 'No se puede deshacer.', confirmLabel: 'Eliminar', danger: true })) {
      remove('workouts', doc.id);
      navigate('/history', { replace: true });
    }
  };

  const deleteTemplate = async () => {
    if (await confirmDialog({ title: `¿Eliminar "${doc.name}"?`, message: 'Tu historial no se modifica.', confirmLabel: 'Eliminar', danger: true })) {
      remove('templates', doc.id);
      onCancel();
    }
  };

  const setField = (k) => (e) => { const v = e.currentTarget.value; update((d) => { d[k] = v; }); };
  const setDate = (k) => (e) => {
    const v = e.currentTarget.value;
    if (v) update((d) => { d[k] = new Date(v).toISOString(); });
  };

  return (
    <>
      {isActive ? <ActiveHeader doc={doc} onFinish={finish} />
        : <FormHeader title={title || (isTemplate ? 'Plantilla' : 'Editar entrenamiento')} onCancel={onCancel} onSave={onSave} />}
      <Page gap="sm">
        <Box mt={4}>
          <TextInput
            variant="unstyled" value={doc.name} onChange={setField('name')}
            placeholder={isTemplate ? 'Nombre de la plantilla' : 'Nombre del entrenamiento'}
            classNames={{ input: classes.nameInput }} aria-label="Nombre" data-testid="workout-name"
          />
          {isActive ? (
            <Text size="sm" c="dimmed" mt={2} className={classes.firstUpper}>
              {fmtDate(doc.started_at, { weekday: 'long', day: 'numeric', month: 'short' })} · {fmtTime(doc.started_at)}
            </Text>
          ) : null}
          <Textarea
            variant="unstyled" autosize minRows={1} mt={2}
            placeholder={isTemplate ? 'Notas de la plantilla' : 'Añadir notas…'}
            value={doc.notes || ''} onChange={setField('notes')}
            classNames={{ input: classes.notesInput }} aria-label="Notas"
          />
        </Box>

        {isEdit ? (
          <Group grow gap="sm">
            <TextInput
              type="datetime-local" label="Inicio" size="md"
              value={toLocalInput(doc.started_at)} onChange={setDate('started_at')} data-testid="edit-start"
            />
            <TextInput
              type="datetime-local" label="Término" size="md"
              value={toLocalInput(doc.ended_at || doc.started_at)} onChange={setDate('ended_at')} data-testid="edit-end"
            />
          </Group>
        ) : null}

        {doc.exercises.length ? (
          <Stack gap="sm" mt={4}>
            {doc.exercises.map((ex, ei) => (
              <ExerciseBlock
                firstOfPart={isFirstOfPart(doc.exercises, ei)}
                // eslint-disable-next-line react/no-array-index-key
                key={`${ex.exercise_id}-${ei}`}
                ex={ex} ei={ei} count={doc.exercises.length} mode={mode} docId={doc.id} templateId={doc.template_id}
                before={isEdit ? doc.started_at : undefined}
                settings={settings} update={update}
              />
            ))}
          </Stack>
        ) : (
          <EmptyState
            icon={IconMoodEmpty}
            title="Sin ejercicios"
            description={isTemplate ? 'Añade los ejercicios de esta rutina.' : 'Añade tu primer ejercicio para empezar a registrar series.'}
          />
        )}

        <Button
          size="lg" fullWidth variant="light" leftSection={<IconPlus size={20} />} mt={4}
          onClick={() => openPicker({ onDone: addExercises })} data-testid="add-exercises"
        >
          Añadir ejercicios
        </Button>

        {isActive ? (
          <Button size="md" fullWidth variant="subtle" color="red" leftSection={<IconX size={18} />} onClick={cancelWorkout} data-testid="cancel-workout">
            Cancelar entrenamiento
          </Button>
        ) : null}
        {isEdit ? (
          <Button size="md" fullWidth variant="subtle" color="red" leftSection={<IconTrash size={18} />} onClick={deleteWorkout} data-testid="delete-workout">
            Eliminar entrenamiento
          </Button>
        ) : null}
        {isTemplate && templateById(doc.id) ? (
          <Button size="md" fullWidth variant="subtle" color="red" leftSection={<IconTrash size={18} />} onClick={deleteTemplate} data-testid="delete-template">
            Eliminar plantilla
          </Button>
        ) : null}
      </Page>
    </>
  );
}

// Estado local (edición / plantilla): `update(fn)` muta una copia nueva.
function useLocalDoc(init) {
  const [doc, setDoc] = useState(init);
  const ref = useRef(doc);
  const update = useCallback((fn) => {
    const d = structuredClone(ref.current);
    fn(d);
    ref.current = d;
    setDoc(d);
  }, []);
  return [doc, update];
}

// ---------- Pantalla de entrenamiento en curso ----------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && getSettings().wake && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* no soportado o pestaña en segundo plano */ }
}

const updateActive = (fn) => {
  const cur = getActive();
  if (!cur) return;
  const d = structuredClone(cur);
  fn(d);
  setActive(d);
};

export function ActiveWorkoutView() {
  const active = useActiveWorkout();
  useEffect(() => {
    // Sin entrenamiento en curso (p. ej. se abrió #/workout directamente). Al terminar o
    // cancelar ya se navegó a otra ruta: no redirigir encima.
    if (!active && /^#\/?workout\/?$/.test(location.hash)) navigate('/train', { replace: true });
  }, [active]);
  useEffect(() => {
    keepAwake(true);
    const onVisible = () => { if (document.visibilityState === 'visible' && getActive()) keepAwake(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { keepAwake(false); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  if (!active) return null;
  return <Editor mode="active" doc={active} update={updateActive} />;
}

// ---------- Plantilla ----------
export function TemplateEditView({ id }) {
  const [doc, update] = useLocalDoc(() => {
    const existing = id !== 'new' && templateById(id);
    return existing ? structuredClone(existing)
      : { id: uid('t_'), name: 'Nueva plantilla', folder: '', notes: '', position: state.templates.length, exercises: [] };
  });
  const done = () => navigate('/train');
  const save = () => {
    if (!doc.name?.trim()) { notify.warn('Ponle un nombre'); return; }
    const final = structuredClone(doc);
    final.name = final.name.trim();
    // pct/amrap: series en % del máximo y "reps al máximo" (feature 12)
    final.exercises.forEach((e) => {
      e.sets = e.sets.map(({ type, weight, reps, pct, amrap }) => ({
        type, weight: pct > 0 ? null : weight, reps, ...(pct > 0 ? { pct } : {}), ...(amrap ? { amrap: true } : {}),
      }));
    });
    upsert('templates', final);
    notify.success('Plantilla guardada');
    done();
  };
  return <Editor mode="template" doc={doc} update={update} onSave={save} onCancel={done} />;
}

// Valida y limpia un entrenamiento editado a mano (corregir uno guardado o registrar uno pasado).
function finalizeEdited(doc) {
  if (!doc.name?.trim()) { notify.warn('Ponle un nombre'); return null; }
  if (doc.ended_at && doc.ended_at < doc.started_at) { notify.warn('El término es antes del inicio'); return null; }
  const final = structuredClone(doc);
  final.name = final.name.trim();
  final.exercises.forEach((e) => {
    e.sets = e.sets.filter((s) => s.reps != null || s.weight != null || s.seconds != null)
      .map(({ target, fb, ...s }) => ({ ...s, done: true, weight: s.weight ?? 0 }));
  });
  final.exercises = final.exercises.filter((e) => e.sets.length);
  return final;
}

// ---------- Corregir un entrenamiento guardado ----------
function WorkoutEditInner({ w }) {
  const [doc, update] = useLocalDoc(() => structuredClone(w));
  const back = () => navigate(`/workout/${w.id}`, { replace: true });
  const save = () => {
    const final = finalizeEdited(doc);
    if (!final) return;
    upsert('workouts', final);
    reprocessProgramWorkout(final); // si era el último día de un programa, se recalcula la progresión
    notify.success('Cambios guardados');
    back();
  };
  return <Editor mode="edit" doc={doc} update={update} onSave={save} onCancel={() => goBack(`/workout/${w.id}`)} />;
}

export function WorkoutEditView({ id }) {
  const { loaded } = useData();
  const w = workoutById(id);
  if (!w) {
    return (
      <>
        <PageHeader title="Editar entrenamiento" back backFallback="/history" />
        <Page>
          <EmptyState icon={IconMoodEmpty} title={loaded ? 'Entrenamiento no encontrado' : 'Cargando…'} />
        </Page>
      </>
    );
  }
  return <WorkoutEditInner w={w} />;
}

// ---------- Registrar un entrenamiento en un día pasado (feature 09: reparar la racha) ----------
// #/workout/new/edit?date=YYYY-MM-DD[&tpl=<id de plantilla>]. Inicio ese día a las 18:00, 1 h; vacío
// o con los ejercicios de una plantilla (series sin números). No usa el entrenamiento en curso.
export function PastWorkoutView({ date, tpl }) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date || '');
  const [doc, update] = useLocalDoc(() => {
    const start = valid ? new Date(`${date}T18:00:00`) : new Date();
    const t = tpl ? templateById(tpl) : null;
    return {
      id: uid('w_'),
      name: t?.name || defaultWorkoutName(start),
      started_at: start.toISOString(),
      ended_at: new Date(start.getTime() + 36e5).toISOString(),
      notes: '',
      template_id: t?.id || null,
      exercises: (t?.exercises || []).map((e) => ({
        exercise_id: e.exercise_id,
        name: exerciseName(e.exercise_id, e.name),
        rest: e.rest ?? null,
        notes: '',
        sets: (e.sets || []).map((s) => ({ type: s.type || 'N', weight: null, reps: null, done: true })),
      })),
    };
  });
  const save = () => {
    const final = finalizeEdited(doc);
    if (!final) return;
    if (!final.exercises.length) { notify.warn('Anota al menos una serie'); return; }
    upsert('workouts', final);
    navigate(`/workout/${final.id}?done=1`, { replace: true });
  };
  return <Editor mode="edit" doc={doc} update={update} onSave={save} onCancel={() => goBack('/calendar')} title="Registrar entrenamiento" />;
}
