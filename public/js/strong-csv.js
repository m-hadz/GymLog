// Importar el CSV que exporta Strong (Ajustes > Exportar datos) y exportar en el
// mismo formato, para que tus datos nunca queden atrapados en ninguna app.
import { state } from './data.js';
import { createNameResolver, normalize, exerciseName, hashId } from './catalog.js';
import { num, dayKey } from './ui.js';

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n') >>> 0);
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}


function parseDate(s) {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDuration(s) {
  if (!s) return 0;
  if (/^\d+$/.test(s.trim())) return Number(s) * 1000;
  const hh = Number(s.match(/(\d+)\s*h/)?.[1] || 0);
  const mm = Number(s.match(/(\d+)\s*m/)?.[1] || 0);
  const ss = Number(s.match(/(\d+)\s*s/)?.[1] || 0);
  return ((hh * 60 + mm) * 60 + ss) * 1000;
}

export function analyzeStrongCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('El archivo está vacío');
  const header = rows[0].map((c) => normalize(c).trim());
  const col = (...names) => header.findIndex((c) => names.some((n) => c === n || c.startsWith(n)));
  const C = {
    date: col('date', 'fecha'), workout: col('workout name', 'nombre del entrenamiento'),
    duration: col('duration', 'duracion'), exercise: col('exercise name', 'nombre del ejercicio'),
    order: col('set order', 'orden'), weight: col('weight', 'peso'), reps: col('reps', 'repeticiones'),
    distance: col('distance', 'distancia'), seconds: col('seconds', 'segundos'),
    notes: col('notes', 'notas'), wnotes: col('workout notes', 'notas del entrenamiento'), rpe: col('rpe'),
  };
  if (C.date < 0 || C.exercise < 0 || C.reps < 0) {
    throw new Error('No parece un CSV de Strong (faltan columnas Date / Exercise Name / Reps)');
  }

  const names = createNameResolver();
  const resolve = names.resolve;
  const lbs = C.weight >= 0 && /lb/.test(header[C.weight]);
  const unitCol = header.findIndex((c) => c.includes('unit') || c.includes('unidad'));
  let sawLbs = lbs;

  const workouts = new Map();
  let setCount = 0;
  for (const r of rows.slice(1)) {
    const get = (i) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const date = parseDate(get(C.date));
    const exName = get(C.exercise);
    if (!date || !exName) continue;
    const orderRaw = get(C.order).toUpperCase();
    const type = /^\d+$/.test(orderRaw) || orderRaw === '' ? 'N' : ['W', 'D', 'F'].includes(orderRaw) ? orderRaw : null;
    if (!type) continue; // filas que no son series (p. ej. "Rest Timer")
    let weight = num(get(C.weight)) ?? 0;
    if (lbs || (unitCol >= 0 && /lb/i.test(get(unitCol)))) {
      weight = Math.round(weight * 0.45359237 * 10) / 10;
      sawLbs = true;
    }
    const set = { type, weight, reps: num(get(C.reps)), done: true };
    const secs = num(get(C.seconds)); const dist = num(get(C.distance)); const rpe = num(get(C.rpe));
    if (secs) set.seconds = secs;
    if (dist) set.distance = dist;
    if (rpe) set.rpe = rpe;
    if (!set.reps && !set.seconds && !set.distance) continue;

    const wName = get(C.workout) || 'Entrenamiento';
    const key = `${get(C.date)}|${wName}`;
    if (!workouts.has(key)) {
      const dur = parseDuration(get(C.duration));
      workouts.set(key, {
        id: `s_${hashId(key)}`, name: wName, started_at: date.toISOString(),
        ended_at: new Date(date.getTime() + (dur || 3600000)).toISOString(),
        notes: get(C.wnotes), template_id: null, exercises: [],
      });
    }
    const w = workouts.get(key);
    const exId = resolve(exName);
    let entry = w.exercises.at(-1);
    if (!entry || entry.exercise_id !== exId) {
      entry = { exercise_id: exId, name: exName, notes: get(C.notes), sets: [] };
      w.exercises.push(entry);
    }
    entry.sets.push(set);
    setCount++;
  }

  const { fresh, alreadyImported, duplicates } = splitExisting([...workouts.values()]);
  const created = names.created();
  return {
    workouts: fresh,
    newExercises: created,
    setCount,
    alreadyImported,
    duplicates,
    lbs: sawLbs,
    linked: created.filter((e) => e.catalog_id).length,
  };
}

// Separa lo que ya existe: mismo id = se actualiza; misma hora de inicio con otro id
// (p. ej. ya registrado a mano o importado de otra fuente) = se omite para no duplicar.
export function splitExisting(list) {
  const ids = new Set(state.workouts.map((w) => w.id));
  const minute = (iso) => Math.round(new Date(iso).getTime() / 60000);
  const minutes = new Map(state.workouts.map((w) => [minute(w.started_at), w.id]));
  const fresh = [];
  let alreadyImported = 0, duplicates = 0;
  for (const w of list) {
    if (ids.has(w.id)) { alreadyImported++; fresh.push(w); continue; }
    const other = minutes.get(minute(w.started_at));
    if (other && other !== w.id) { duplicates++; continue; }
    fresh.push(w);
  }
  return { fresh, alreadyImported, duplicates };
}

const q = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportStrongCSV(workouts) {
  const head = ['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps',
    'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE'];
  const lines = [head.join(',')];
  for (const w of [...workouts].sort((a, b) => (a.started_at < b.started_at ? -1 : 1))) {
    const d = new Date(w.started_at);
    const date = `${dayKey(d)} ${d.toTimeString().slice(0, 8)}`;
    const mins = w.ended_at ? Math.round((new Date(w.ended_at) - d) / 60000) : 0;
    const dur = `${Math.floor(mins / 60) ? `${Math.floor(mins / 60)}h ` : ''}${mins % 60}m`;
    for (const ex of w.exercises || []) {
      let n = 0;
      for (const s of ex.sets || []) {
        if (s.done === false) continue;
        const order = s.type === 'N' || !s.type ? ++n : s.type;
        lines.push([date, w.name, dur, exerciseName(ex.exercise_id, ex.name), order, s.weight ?? 0, s.reps ?? 0,
          s.distance ?? '', s.seconds ?? '', ex.notes || '', w.notes || '', s.rpe ?? ''].map(q).join(','));
      }
    }
  }
  return lines.join('\n');
}
