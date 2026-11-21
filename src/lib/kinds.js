// Tipos de ejercicio (feature 04 A y C): peso y reps, peso corporal, con lastre, asistido y por tiempo.
// Lo guardado no cambia (se guarda lo que anotaste); la carga efectiva se calcula al analizar.
// Módulo puro, sin DOM. Ver docs/features/04-pendientes-validados.md.

export const KINDS = [
  ['peso_reps', 'Peso y reps'],
  ['peso_corporal', 'Peso corporal'],
  ['lastre', 'Con lastre'],
  ['asistido', 'Asistido'],
  ['tiempo', 'Por tiempo'],
];
export const KIND_LABEL = Object.fromEntries(KINDS);
export const BODYWEIGHT_KINDS = new Set(['peso_corporal', 'lastre', 'asistido']);

// Ejercicios de peso corporal típicos que suelen venir sin categoría (p. ej. importados de Strong)
const BODYWEIGHT_NAME = /\b(pull.?ups?|chin.?ups?|push.?ups?|dips?|muscle.?ups?|inverted rows?)\b/i;

/**
 * Tipo de un ejercicio: el elegido en sus ajustes o, si no, uno por defecto según el catálogo.
 * @param {{kind?:string}|null} prefs
 * @param {{category?:string, name?:string}|null} meta
 */
export function resolveKind(prefs, meta) {
  if (prefs?.kind && KIND_LABEL[prefs.kind]) return prefs.kind;
  if (meta?.category === 'Peso corporal') return 'peso_corporal';
  if ((!meta?.category || meta.category === 'Otro') && BODYWEIGHT_NAME.test(meta?.name || '') &&
    !/assist|machine|weighted|band/i.test(meta?.name || '')) return 'peso_corporal';
  return 'peso_reps';
}

/**
 * Carga efectiva de una serie según el tipo y el peso corporal (null si no se conoce).
 * peso_corporal / lastre: PC + lo anotado; asistido: PC − asistencia (mínimo 0).
 */
export function effectiveLoad(kind, raw, bw) {
  if (bw == null || !BODYWEIGHT_KINDS.has(kind)) return raw;
  if (kind === 'asistido') return Math.max(0, bw - (raw || 0));
  return bw + (raw || 0);
}

/**
 * Copia de los entrenamientos con la carga efectiva en `weight` (lo anotado queda en `raw`).
 * Cada serie transformada lleva `kind`, `raw`, `bw` y `vw` (peso que cuenta para el volumen).
 * Los entrenamientos sin ejercicios de peso corporal se devuelven tal cual (misma identidad).
 * @param {object[]} workouts
 * @param {{kindFor:(exId:string)=>string, bodyweightFor:(date:string)=>number|null, countBodyweight?:boolean}} o
 */
export function withEffectiveLoads(workouts, { kindFor, bodyweightFor, countBodyweight = true }) {
  const kinds = new Map();
  const kindOf = (id) => { if (!kinds.has(id)) kinds.set(id, kindFor(id)); return kinds.get(id); };
  return workouts.map((w) => {
    let changed = false;
    let bw;
    const exercises = (w.exercises || []).map((ex) => {
      const kind = kindOf(ex.exercise_id);
      if (!BODYWEIGHT_KINDS.has(kind)) return ex;
      changed = true;
      if (bw === undefined) bw = bodyweightFor(localDay(w.started_at));
      return {
        ...ex,
        kind,
        sets: (ex.sets || []).map((s) => {
          const raw = s.weight || 0;
          const weight = effectiveLoad(kind, raw, bw);
          return { ...s, kind, raw, bw, weight, vw: bw != null && countBodyweight ? weight : raw };
        }),
      };
    });
    return changed ? { ...w, exercises } : w;
  });
}

// Fecha local 'YYYY-MM-DD' de un instante ISO
export function localDay(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---- Tiempo (parte C) ----

// 75 → "1:15"; 3725 → "1:02:05"
export function fmtSecs(secs) {
  const s = Math.max(0, Math.round(secs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// "1:30" → 90, "90" → 90, "1:02:05" → 3725, "1,5" → 2 (segundos redondeados). null si no se entiende.
export function parseSecs(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (/^\d+([.,]\d+)?$/.test(t)) { const v = Math.round(Number(t.replace(',', '.'))); return v > 0 ? v : null; }
  const m = t.match(/^(?:(\d+):)?(\d{1,3}):(\d{1,2})$/);
  if (!m) return null;
  const v = Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return v > 0 ? v : null;
}
