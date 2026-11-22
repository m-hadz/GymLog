// Programas (feature 12), lado de la app: guarda el programa, genera sus plantillas (una por día, en una
// carpeta con el nombre del programa) y procesa el entrenamiento de cada día al terminarlo.
// Las reglas están en programs.js (puro).
import { remove, state, templateById, upsert } from './data.js';
import { exerciseName } from './catalog.js';
import { uid } from './format.js';
import {
  completeDay, dayPlan, GZCLP_DAYS, nextPosition, prevPosition, redoLastDay, weeksOf,
} from './programs.js';
import { isLower, programLoad, setTrainingMax, tmOf } from './tm.js';
import { startWorkout } from './workout.js';

export const activeProgram = () => state.programs.find((p) => p.active) || null;

/** Programa y día (1–4) al que pertenece una plantilla, o null. */
export function programOfTemplate(tid) {
  if (!tid) return null;
  for (const p of state.programs) {
    const i = p.config?.templates?.indexOf(tid) ?? -1;
    if (i >= 0) return { program: p, day: i + 1 };
  }
  return null;
}

const helpers = () => ({ isLower, round: programLoad, name: (ex) => exerciseName(ex), tmOf });

/** "Día 3 · Peso muerto" (5/3/1) o "A2" (GZCLP). */
export function dayTitle(p, day = p.state.day) {
  if (p.kind === '531') return `Día ${day} · ${exerciseName(p.config.lifts[day - 1], '¿?')}`;
  return GZCLP_DAYS[day - 1].label;
}
/** "Semana 2 · Día 3 · Peso muerto" / "Sesión A2" */
export const positionText = (p) => (p.kind === '531' ? `Semana ${p.state.week} · ${dayTitle(p)}` : `Sesión ${dayTitle(p)}`);

// Plantillas de los días: los ejercicios del programa se regeneran; los que agregaste se conservan.
function buildTemplates(p) {
  return p.config.templates.map((tid, i) => {
    const day = i + 1;
    const existing = templateById(tid);
    const old = existing?.exercises || [];
    const main = dayPlan(p, day).map((x) => ({
      exercise_id: x.exercise_id,
      name: exerciseName(x.exercise_id),
      rest: old.find((e) => e.prog && e.exercise_id === x.exercise_id)?.rest ?? null,
      prog: x.prog,
      sets: x.sets,
    }));
    return {
      id: tid,
      name: `${p.name} · ${dayTitle(p, day)}`,
      folder: p.name,
      notes: existing?.notes || '',
      position: existing?.position ?? state.templates.length + i,
      exercises: [...main, ...old.filter((e) => !e.prog)],
    };
  });
}

export function saveProgram(p) {
  upsert('programs', p);
  upsert('templates', buildTemplates(p));
}

/**
 * Crea un programa y lo deja activo (los demás quedan en pausa).
 * @param {{kind:'531'|'gzclp', name:string, config:object, tms?:Record<string,number>, stages?:object}} o
 */
export function createProgram({ kind, name, config, tms = {}, stages = {} }) {
  const id = uid('p_');
  for (const other of state.programs.filter((x) => x.active)) upsert('programs', { ...other, active: false });
  for (const [ex, tm] of Object.entries(tms)) if (tm > 0) setTrainingMax(ex, tm, 'inicio');
  const p = {
    id, name, kind, active: true,
    config: { ...config, templates: [1, 2, 3, 4].map((d) => `t_${id}_${d}`) },
    state: { week: 1, day: 1, cycle: 1, stages, pendingBump: null, last: null },
  };
  saveProgram(p);
  return p;
}

export function startProgramDay(p) {
  const tpl = templateById(p.config.templates[p.state.day - 1]);
  return startWorkout({ template: tpl });
}

/**
 * Al terminar un entrenamiento: si es el día que tocaba del programa activo, aplica la progresión y
 * avanza. Un día que no tocaba (o un programa en pausa) no cambia nada.
 */
export function finishProgramWorkout(w) {
  const info = programOfTemplate(w.template_id);
  if (!info || !info.program.active || info.day !== info.program.state.day) return null;
  const next = completeDay(info.program, w, helpers());
  saveProgram(next);
  return next;
}

/** Entrenamiento corregido después: si fue el último día procesado, se recalcula. */
export function reprocessProgramWorkout(w) {
  for (const p of state.programs) {
    const next = redoLastDay(p, w, helpers());
    if (next) saveProgram(next);
  }
}

/** Saltar el día que toca (sin cambiar pesos; al cerrar un ciclo de 5/3/1 igual ofrece subir los máximos). */
export function skipDay(p) {
  const next = completeDay(p, { id: null, exercises: [] }, helpers());
  next.state.last = null;
  saveProgram(next);
}

/** Repetir el día anterior. */
export function repeatDay(p) {
  const pos = prevPosition(p);
  saveProgram({ ...p, state: { ...p.state, ...pos } });
}

/** Mover el programa a otra semana (5/3/1), desde el día 1. */
export function setWeek(p, week) {
  if (week < 1 || week > weeksOf(p)) return;
  saveProgram({ ...p, state: { ...p.state, week, day: 1 } });
}

export function pauseProgram(p) { upsert('programs', { ...p, active: false }); }
export function resumeProgram(p) {
  for (const other of state.programs.filter((x) => x.active && x.id !== p.id)) upsert('programs', { ...other, active: false });
  upsert('programs', { ...p, active: true });
}
export function deleteProgram(p) {
  for (const tid of p.config.templates || []) if (templateById(tid)) remove('templates', tid);
  remove('programs', p.id);
}

/** Subir los máximos al cerrar un ciclo de 5/3/1, menos los excluidos. */
export function applyBump(p, excluded = new Set()) {
  for (const b of p.state.pendingBump || []) if (!excluded.has(b.ex)) setTrainingMax(b.ex, b.to, 'programa');
  upsert('programs', { ...p, state: { ...p.state, pendingBump: null } });
}
export function dismissBump(p) {
  upsert('programs', { ...p, state: { ...p.state, pendingBump: null } });
}

