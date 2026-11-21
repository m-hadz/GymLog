// Tipos de ejercicio (feature 04 A y C): peso y reps, peso corporal, con lastre, asistido y por tiempo.
// Modo de carga (feature 05): total, por mano (una de dos mancuernas) o unilateral (un lado).
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

// Cómo se anota la carga. Por mano / unilateral: el volumen cuenta el doble; 1RM y récords de
// peso quedan sobre lo anotado (por mano o por lado).
export const LOAD_MODES = [
  ['total', 'Total', 'Anotas la carga total.', 'Barra con 60 kg → 60'],
  ['por_mano', 'Por mano', 'Anotas el peso de una mancuerna; usas dos.', '2 mancuernas de 12 kg → 12'],
  ['unilateral', 'Unilateral', 'Anotas el peso y las reps de un lado; haces los dos.', 'Remo a una mano con 30 kg → 30'],
];
export const LOAD_MODE_LABEL = Object.fromEntries(LOAD_MODES.map(([k, l]) => [k, l]));
// Solo se combinan con peso y reps o con lastre
export const modeAllowed = (kind) => kind === 'peso_reps' || kind === 'lastre';

/**
 * Modo de carga de un ejercicio: el elegido o, en mancuernas sin modo elegido, el de "todas las
 * mancuernas" (`dumbbellMode`, si se respondió así). Por defecto 'total'.
 */
export function resolveLoadMode(prefs, kind, { category, dumbbellMode } = {}) {
  if (!modeAllowed(kind)) return 'total';
  if (LOAD_MODE_LABEL[prefs?.load_mode]) return prefs.load_mode;
  if (category === 'Mancuerna' && LOAD_MODE_LABEL[dumbbellMode]) return dumbbellMode;
  return 'total';
}
export const modeFactor = (mode) => (mode === 'por_mano' || mode === 'unilateral' ? 2 : 1);

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
 * Cada serie transformada lleva `kind`, `raw`, `bw` y `vw` (peso que cuenta para el volumen, ×2 en
 * modo por mano o unilateral). Los entrenamientos sin nada que cambiar se devuelven tal cual.
 * @param {object[]} workouts
 * @param {{kindFor:(exId:string)=>string, modeFor?:(exId:string)=>string,
 *   bodyweightFor:(date:string)=>number|null, countBodyweight?:boolean}} o
 */
export function withEffectiveLoads(workouts, { kindFor, modeFor = () => 'total', bodyweightFor, countBodyweight = true }) {
  const kinds = new Map();
  const kindOf = (id) => { if (!kinds.has(id)) kinds.set(id, kindFor(id)); return kinds.get(id); };
  const modes = new Map();
  const factorOf = (id) => {
    if (!modes.has(id)) modes.set(id, modeAllowed(kindOf(id)) ? modeFactor(modeFor(id)) : 1);
    return modes.get(id);
  };
  return workouts.map((w) => {
    let changed = false;
    let bw;
    const exercises = (w.exercises || []).map((ex) => {
      const kind = kindOf(ex.exercise_id);
      const f = factorOf(ex.exercise_id);
      if (!BODYWEIGHT_KINDS.has(kind)) {
        if (f === 1) return ex;
        changed = true;
        return { ...ex, sets: (ex.sets || []).map((s) => ({ ...s, vw: (s.weight || 0) * f })) };
      }
      changed = true;
      if (bw === undefined) bw = bodyweightFor(localDay(w.started_at));
      return {
        ...ex,
        kind,
        sets: (ex.sets || []).map((s) => {
          const raw = s.weight || 0;
          const weight = effectiveLoad(kind, raw, bw);
          return { ...s, kind, raw, bw, weight, vw: (bw != null && countBodyweight ? weight : raw) * f };
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
