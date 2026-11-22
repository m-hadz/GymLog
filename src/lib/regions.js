// Regiones dentro de cada grupo muscular (feature 08): con 3–4 ejercicios por músculo, cada uno
// buscando una región distinta, contar solo "pecho" no alcanza. Cada ejercicio tiene 1–2 regiones
// (exercise_prefs.regions). Lista fija en esta versión. Módulo puro, sin DOM.
import { isWorking } from './stats.js';

export const MAX_REGIONS = 2;
export const UNWORKED_LOOKBACK_DAYS = 28; // regiones "tuyas": las usadas en las últimas 4 semanas
export const RECENT_DAYS = 7;             // "sin trabajar esta semana": sin series en los últimos 7 días

/** Grupo (BODY_PARTS) → regiones [clave, nombre]. Los grupos que no aparecen no tienen regiones. */
export const REGIONS = {
  Pecho: [['pecho.superior', 'Superior (clavicular)'], ['pecho.medio', 'Medio'], ['pecho.inferior', 'Inferior']],
  Hombros: [['hombros.anterior', 'Deltoide anterior'], ['hombros.lateral', 'Deltoide lateral'], ['hombros.posterior', 'Deltoide posterior']],
  'Espalda alta': [['espalda.trapecio_superior', 'Trapecio superior'], ['espalda.trapecio_medio', 'Trapecio medio y romboides']],
  Bíceps: [['biceps.larga', 'Cabeza larga'], ['biceps.corta', 'Cabeza corta'], ['biceps.braquial', 'Braquial']],
  Antebrazo: [['antebrazo.braquiorradial', 'Braquiorradial'], ['antebrazo.flexores', 'Flexores'], ['antebrazo.extensores', 'Extensores']],
  Tríceps: [['triceps.larga', 'Cabeza larga'], ['triceps.lateral_medial', 'Cabezas lateral y medial']],
  Cuádriceps: [['cuadriceps.recto', 'Recto femoral'], ['cuadriceps.vastos', 'Vastos']],
  Isquiotibiales: [['isquios.rodilla', 'Por flexión de rodilla'], ['isquios.cadera', 'Por extensión de cadera']],
  Glúteos: [['gluteos.mayor', 'Glúteo mayor'], ['gluteos.medio', 'Glúteo medio']],
  Pantorrillas: [['pantorrillas.gastrocnemio', 'Gastrocnemio'], ['pantorrillas.soleo', 'Sóleo']],
};

const LABEL = new Map(Object.values(REGIONS).flat());
const GROUP_OF = new Map(Object.entries(REGIONS).flatMap(([g, list]) => list.map(([k]) => [k, g])));

export const regionsFor = (group) => REGIONS[group] || [];
export const regionLabel = (key) => LABEL.get(key) || key;
export const regionGroup = (key) => GROUP_OF.get(key) || null;

/** Regiones válidas de un ejercicio para su grupo actual (descarta las de otro grupo y repetidas). */
export function cleanRegions(regions, group) {
  const ok = new Set(regionsFor(group).map(([k]) => k));
  return [...new Set(regions || [])].filter((k) => ok.has(k)).slice(0, MAX_REGIONS);
}

/**
 * Series por región de un grupo. Una serie efectiva suma 1 a cada región del ejercicio.
 * @param {object[]} workouts
 * @param {{ group: string, days?: number, weeks?: number, now?: number,
 *           partOf: (id: string) => string|undefined, regionsOf: (id: string) => string[]|null|undefined,
 *           nameOf?: (id: string, fallback?: string) => string }} o
 * @returns {{ regions: {key, label, sets, perWeek, recentSets, unworked}[],
 *             unassigned: {id, name, sets}[] }}
 *   `unworked`: la región tiene series en las últimas 4 semanas pero ninguna en los últimos 7 días.
 *   `unassigned`: ejercicios del grupo con series en el periodo y sin regiones.
 */
export function regionStats(workouts, { group, days = 28, weeks = days / 7, now = Date.now(), partOf, regionsOf, nameOf = (id, n) => n || id }) {
  const list = regionsFor(group);
  const by = new Map(list.map(([key, label]) => [key, { key, label, sets: 0, recentSets: 0, lookback: 0 }]));
  const unassigned = new Map();
  const from = now - days * 864e5;
  const recentFrom = now - RECENT_DAYS * 864e5;
  const lookFrom = now - UNWORKED_LOOKBACK_DAYS * 864e5;
  const earliest = Math.min(from, lookFrom);
  for (const w of workouts) {
    const t = Date.parse(w.started_at);
    if (!(t >= earliest && t <= now)) continue;
    for (const ex of w.exercises || []) {
      if (partOf(ex.exercise_id) !== group) continue;
      const n = (ex.sets || []).filter(isWorking).length;
      if (!n) continue;
      const regions = cleanRegions(regionsOf(ex.exercise_id), group);
      if (!regions.length) {
        if (t >= from) {
          const u = unassigned.get(ex.exercise_id) || { id: ex.exercise_id, name: nameOf(ex.exercise_id, ex.name), sets: 0 };
          u.sets += n;
          unassigned.set(ex.exercise_id, u);
        }
        continue;
      }
      for (const k of regions) {
        const r = by.get(k);
        if (t >= from) r.sets += n;
        if (t >= recentFrom) r.recentSets += n;
        if (t >= lookFrom) r.lookback += n;
      }
    }
  }
  return {
    regions: [...by.values()].map(({ lookback, ...r }) => ({ ...r, perWeek: r.sets / weeks, unworked: lookback > 0 && r.recentSets === 0 })),
    unassigned: [...unassigned.values()].sort((a, b) => b.sets - a.sets),
  };
}
