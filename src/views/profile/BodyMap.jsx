// Mapa del cuerpo (frente y espalda) con cada grupo muscular como una zona coloreable.
// Dibujo anatómico de react-native-body-highlighter (licencia MIT, ver bodyPaths.js), guardado en el
// proyecto: funciona sin conexión. Las zonas de la librería se agrupan en los grupos de BODY_PARTS.
import { BACK, FRONT, OUTLINE_BACK, OUTLINE_FRONT } from './bodyPaths.js';
import classes from './BodyMap.module.css';

// Músculo de la librería → grupo de la app. Lo que no está aquí (cabeza, manos, rodillas, tibial…)
// es parte de la silueta. Abductores no tiene zona propia en el dibujo: se ve en la lista.
const PART_OF = {
  chest: 'Pecho',
  deltoids: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearm: 'Antebrazo',
  abs: 'Core',
  obliques: 'Core',
  'upper-back': 'Dorsales',
  trapezius: 'Espalda alta',
  'lower-back': 'Lumbar',
  gluteal: 'Glúteos',
  adductors: 'Aductores',
  quadriceps: 'Cuádriceps',
  hamstring: 'Isquiotibiales',
  calves: 'Pantorrillas',
};

// Recorte del dibujo (incluye las manos): el original deja mucho espacio arriba y a los lados
const VIEW = { front: '40 86 650 1275', back: '760 87 650 1275' };

// Zonas agrupadas por grupo muscular, una vez
const group = (list) => {
  const base = [];
  const zones = new Map();
  for (const [slug, paths] of list) {
    const part = PART_OF[slug];
    if (!part) { base.push(...paths); continue; }
    if (!zones.has(part)) zones.set(part, []);
    zones.get(part).push(...paths);
  }
  return { base, zones: [...zones] };
};
const VIEWS = [
  { key: 'front', label: 'Frente', outline: OUTLINE_FRONT, ...group(FRONT) },
  { key: 'back', label: 'Espalda', outline: OUTLINE_BACK, ...group(BACK) },
];

function Figure({ view, colorOf, selected, onSelect }) {
  return (
    <figure className={classes.figure}>
      <svg viewBox={VIEW[view.key]} className={classes.svg} role="img" aria-label={`Cuerpo, ${view.label.toLowerCase()}`}>
        <path d={view.outline} className={classes.outline} />
        <g className={classes.base}>
          {view.base.map((d, i) => <path key={i} d={d} />)}
        </g>
        {view.zones.map(([part, paths]) => {
          const color = colorOf(part);
          return (
            <g
              key={part}
              className={classes.zone}
              style={color && color !== 'transparent' ? { fill: color } : undefined}
              data-empty={!color || color === 'transparent' || undefined}
              data-selected={selected === part || undefined}
              data-part={part}
              onClick={() => onSelect(part)}
            >
              <title>{part}</title>
              {paths.map((d, i) => <path key={i} d={d} />)}
            </g>
          );
        })}
      </svg>
      <figcaption className={classes.caption}>{view.label}</figcaption>
    </figure>
  );
}

/**
 * @param {object} p
 * @param {(part: string) => string} p.colorOf  color CSS de cada grupo ('transparent' = sin dato)
 * @param {string|null} [p.selected]
 * @param {(part: string) => void} [p.onSelect]
 * @param {boolean} [p.compact]  versión chica (resumen de un entrenamiento)
 */
export function BodyMap({ colorOf, selected = null, onSelect = () => {}, compact = false }) {
  return (
    <div className={classes.root} data-compact={compact || undefined} data-testid="body-map">
      {VIEWS.map((v) => <Figure key={v.key} view={v} colorOf={colorOf} selected={selected} onSelect={onSelect} />)}
    </div>
  );
}

export const MAP_PARTS = [...new Set(VIEWS.flatMap((v) => v.zones.map(([p]) => p)))];
