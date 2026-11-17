// Catálogo de ejercicios: free-exercise-db (dominio público, 800+ ejercicios con
// imágenes) servido por CDN, combinado con los ejercicios propios guardados en la BD.
import { state } from './data.js';

const REPO = 'yuhonas/free-exercise-db';
const SOURCES = [
  `https://cdn.jsdelivr.net/gh/${REPO}@main/dist/exercises.json`,
  `https://raw.githubusercontent.com/${REPO}/main/dist/exercises.json`,
];
const IMG_BASE = `https://cdn.jsdelivr.net/gh/${REPO}@main/exercises/`;

export const BODY_PARTS = ['Brazos', 'Espalda', 'Pecho', 'Hombros', 'Piernas', 'Core', 'Cardio', 'Otro'];
export const CATEGORIES = ['Barra', 'Mancuerna', 'Máquina', 'Polea', 'Peso corporal', 'Kettlebell',
  'Banda', 'Barra Z', 'Cardio', 'Otro'];

const MUSCLE_TO_PART = {
  abdominals: 'Core', abductors: 'Piernas', adductors: 'Piernas', biceps: 'Brazos', calves: 'Piernas',
  chest: 'Pecho', forearms: 'Brazos', glutes: 'Piernas', hamstrings: 'Piernas', lats: 'Espalda',
  'lower back': 'Espalda', 'middle back': 'Espalda', neck: 'Otro', quadriceps: 'Piernas',
  shoulders: 'Hombros', traps: 'Hombros', triceps: 'Brazos',
};
const EQUIPMENT_TO_CAT = {
  barbell: 'Barra', dumbbell: 'Mancuerna', machine: 'Máquina', cable: 'Polea', 'body only': 'Peso corporal',
  kettlebells: 'Kettlebell', bands: 'Banda', 'e-z curl bar': 'Barra Z',
};

let catalog = [];
let byId = new Map();
let loading = null;

// Avisa a React cuando termina de cargar el catálogo (ver hooks.js: useCatalog)
const listeners = new Set();
let catalogVersion = 0;
export const catalogChannel = {
  subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  version: () => catalogVersion,
};

function fromCatalog(raw) {
  return {
    id: raw.id,
    name: raw.name,
    bodyPart: raw.category === 'cardio' ? 'Cardio' : MUSCLE_TO_PART[raw.primaryMuscles?.[0]] || 'Otro',
    category: raw.category === 'cardio' ? 'Cardio' : EQUIPMENT_TO_CAT[raw.equipment] || 'Otro',
    images: (raw.images || []).map((p) => IMG_BASE + p),
    instructions: raw.instructions || [],
    primary: raw.primaryMuscles || [],
    secondary: raw.secondaryMuscles || [],
    level: raw.level,
    custom: false,
  };
}

export function loadCatalog() {
  loading ||= (async () => {
    for (const url of SOURCES) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        catalog = (await res.json()).map(fromCatalog);
        byId = new Map(catalog.map((e) => [e.id, e]));
        catalogVersion++;
        listeners.forEach((fn) => fn());
        return catalog;
      } catch { /* probar la siguiente fuente */ }
    }
    console.warn('No se pudo cargar el catálogo de ejercicios');
    return catalog;
  })();
  return loading;
}

export const catalogSize = () => catalog.length;

function fromCustom(row) {
  const linked = row.catalog_id ? byId.get(row.catalog_id) : null;
  const own = (row.instructions || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    bodyPart: row.body_part || 'Otro',
    category: row.category || 'Otro',
    images: linked?.images || [],
    instructions: own.length ? own : linked?.instructions || [],
    primary: linked?.primary || [],
    secondary: linked?.secondary || [],
    custom: true,
    catalogId: row.catalog_id,
    linkedName: linked?.name,
    rest: row.rest_seconds,
    row,
  };
}

let allCache = { custom: null, catalog: null, list: [] };
export function allExercises() {
  if (allCache.custom !== state.exercises || allCache.catalog !== catalog) {
    allCache = { custom: state.exercises, catalog, list: [...state.exercises.map(fromCustom), ...catalog] };
  }
  return allCache.list;
}

export function getExercise(id) {
  const row = state.exercises.find((e) => e.id === id);
  return row ? fromCustom(row) : byId.get(id) || null;
}

export const exerciseName = (id, fallback = '¿?') => getExercise(id)?.name || fallback;

export const normalize = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function filterExercises(list, { q = '', bodyPart = '', category = '' } = {}) {
  const tokens = normalize(q).split(/\s+/).filter(Boolean);
  return list.filter((e) => {
    if (bodyPart && e.bodyPart !== bodyPart) return false;
    if (category && e.category !== category) return false;
    const name = normalize(e.name);
    return tokens.every((t) => name.includes(t));
  });
}

// ---- Ayudas para importar nombres estilo Strong: "Bicep Curl (Dumbbell)" ----

const STRONG_EQUIPMENT = [
  [/barbell|smith/i, 'Barra'], [/dumbbell/i, 'Mancuerna'], [/cable/i, 'Polea'], [/machine/i, 'Máquina'],
  [/bodyweight|assisted|weighted/i, 'Peso corporal'], [/kettlebell/i, 'Kettlebell'], [/band/i, 'Banda'],
  [/ez bar|ez-bar/i, 'Barra Z'],
];

export function guessCategory(name) {
  const paren = name.match(/\(([^)]*)\)/)?.[1] || '';
  for (const [re, cat] of STRONG_EQUIPMENT) if (re.test(paren)) return cat;
  return 'Otro';
}

const tokenize = (s) =>
  new Set(normalize(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)));

// Busca un ejercicio del catálogo que contenga todas las palabras del nombre
// (incluido el equipo). Es conservador: si no hay match claro, no vincula.
export function autoLinkCatalog(name) {
  const want = tokenize(name);
  if (!want.size) return null;
  let best = null;
  let bestScore = 0;
  for (const e of catalog) {
    const have = tokenize(`${e.name} ${e.category === 'Barra' ? 'barbell' : ''} ${e.category === 'Mancuerna' ? 'dumbbell' : ''} ${e.category === 'Máquina' ? 'machine' : ''} ${e.category === 'Polea' ? 'cable' : ''}`);
    let inter = 0;
    for (const t of want) if (have.has(t)) inter++;
    if (inter < want.size) continue;
    const score = inter / (want.size + have.size - inter);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return bestScore >= 0.5 ? best : null;
}

// Convierte nombres de ejercicio importados en ids: reutiliza los existentes y crea
// ejercicios propios para los nuevos, vinculándolos a una imagen del catálogo
// (solo si hay un match claro por nombre).
export function createNameResolver() {
  const known = new Map();
  for (const e of allExercises()) {
    const k = normalize(e.name);
    if (!known.has(k) || e.custom) known.set(k, e.id);
  }
  const created = new Map();
  const resolve = (rawName) => {
    const name = String(rawName).trim();
    const k = normalize(name);
    if (known.has(k)) return known.get(k);
    const id = `c_${hashId(k)}`;
    const linked = autoLinkCatalog(name);
    created.set(id, {
      id, name, category: guessCategory(name), body_part: linked?.bodyPart || guessBodyPart(name),
      catalog_id: linked?.id || null, instructions: '', rest_seconds: null,
    });
    known.set(k, id);
    return id;
  };
  return { resolve, created: () => [...created.values()] };
}

export function hashId(str) { // FNV-1a: ids deterministas, reimportar no duplica
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

const PART_RULES = [
  [/squat|leg press|lunge|leg curl|leg extension|calf|hip thrust|glute|deadlift|abductor|adductor|split/i, 'Piernas'],
  [/curl|bicep|tricep|pushdown|skullcrusher|kickback|wrist/i, 'Brazos'],
  [/row|pulldown|pull up|chin up|lat |pullover|back extension|shrug/i, 'Espalda'],
  [/bench|chest|fly|crossover|dip|push up|pec/i, 'Pecho'],
  [/shoulder|overhead|military|lateral raise|front raise|face pull|rear delt|arnold|external rotation/i, 'Hombros'],
  [/crunch|plank|sit up|sit-up|ab wheel|leg raise|knee raise|pallof|roman chair/i, 'Core'],
  [/run|cycling|bike|row(ing)? machine|jump|hop|skater|elliptical/i, 'Cardio'],
];
export function guessBodyPart(name) {
  for (const [re, part] of PART_RULES) if (re.test(name)) return part;
  return 'Otro';
}

