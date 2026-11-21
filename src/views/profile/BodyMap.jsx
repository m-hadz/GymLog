// Silueta 2D del cuerpo (frente y espalda) con cada grupo muscular como una zona coloreable.
// Dibujo propio (sin licencias de terceros): formas simples, simétricas, en un viewBox de 200 × 400.
// Las formas "half" se dibujan del lado izquierdo y se reflejan; las "center" van una vez.
import classes from './BodyMap.module.css';

const BASE = {
  center: [
    'M100,12 a18,18 0 1,1 -0.1,0 Z', // cabeza
    'M92,44 h16 v18 h-16 Z', // cuello
  ],
  half: [
    'M100,60 C86,60 72,62 62,68 C55,72 53,80 55,92 C59,120 63,150 65,175 C66,195 65,205 63,218 L100,226 Z', // torso
    'M60,68 C48,70 42,82 42,98 L40,140 C41,147 52,148 54,140 L60,98 Z', // brazo
    'M40,140 C36,160 34,182 34,206 L44,208 C48,186 52,164 54,142 Z', // antebrazo
    'M38,206 C32,210 32,224 38,230 C44,228 46,214 44,208 Z', // mano
    'M63,212 C58,240 61,270 67,302 L95,302 C97,272 99,242 100,224 Z', // muslo
    'M67,300 C64,330 67,360 71,386 L89,386 C91,360 95,330 95,300 Z', // pierna
    'M70,384 C62,388 62,396 72,398 L92,398 C94,394 92,388 89,384 Z', // pie
  ],
};

// Zonas por grupo y vista. Las claves coinciden con BODY_PARTS de lib/catalog.js.
const FRONT = [
  { part: 'Hombros', half: 'M62,68 C51,70 43,80 43,96 C50,97 58,90 64,82 C67,76 66,70 62,68 Z' },
  { part: 'Pecho', half: 'M98,72 C88,70 76,70 67,78 C62,88 64,104 72,112 C82,118 94,116 98,110 Z' },
  { part: 'Bíceps', half: 'M46,100 C42,112 42,128 46,138 C52,138 56,126 56,110 C56,102 52,98 46,100 Z' },
  { part: 'Antebrazo', half: 'M42,148 C38,162 36,180 36,200 L43,201 C47,183 51,165 52,150 Z' },
  { part: 'Core', center: 'M87,122 L113,122 L115,190 C108,198 92,198 85,190 Z' },
  { part: 'Abductores', half: 'M65,206 C61,214 61,228 63,242 C68,234 70,222 70,210 Z' },
  { part: 'Cuádriceps', half: 'M71,226 C67,246 69,272 74,296 L90,296 C92,272 92,248 90,230 Z' },
  { part: 'Aductores', half: 'M92,228 C93,244 94,258 94,274 C97,262 98,244 98,230 Z' },
  { part: 'Pantorrillas', half: 'M70,312 C67,326 68,342 72,356 C75,344 76,328 75,314 Z' },
];
const BACK = [
  { part: 'Espalda alta', center: 'M100,50 C94,58 84,62 70,68 C78,76 86,92 90,108 L100,118 L110,108 C114,92 122,76 130,68 C116,62 106,58 100,50 Z' },
  { part: 'Hombros', half: 'M62,68 C51,70 43,80 43,96 C50,97 58,90 64,82 C67,76 66,70 62,68 Z' },
  { part: 'Dorsales', half: 'M70,84 C64,100 64,124 70,146 C76,160 86,168 95,172 L97,150 C93,130 88,108 80,92 Z' },
  { part: 'Lumbar', center: 'M90,160 L110,160 C112,176 112,190 110,202 L90,202 C88,190 88,176 90,160 Z' },
  { part: 'Tríceps', half: 'M46,98 C42,110 42,126 46,138 C52,140 56,126 56,110 C56,100 52,96 46,98 Z' },
  { part: 'Antebrazo', half: 'M42,148 C38,162 36,180 36,200 L43,201 C47,183 51,165 52,150 Z' },
  { part: 'Abductores', half: 'M65,202 C63,209 63,216 66,222 C73,217 80,211 85,205 C78,200 71,199 65,202 Z' },
  { part: 'Glúteos', half: 'M68,216 C64,230 69,248 84,251 C94,251 99,243 99,229 C99,217 93,208 84,208 C77,208 71,210 68,216 Z' },
  { part: 'Isquiotibiales', half: 'M70,256 C68,272 70,288 74,298 L91,298 C93,284 93,268 93,256 Z' },
  { part: 'Aductores', half: 'M94,256 C95,268 96,278 96,290 C98,278 99,266 99,256 Z' },
  { part: 'Pantorrillas', half: 'M70,306 C66,320 68,340 76,354 C84,352 90,338 90,318 C88,306 80,302 70,306 Z' },
];

const MIRROR = 'translate(200,0) scale(-1,1)';

function Figure({ zones, label, colorOf, selected, onSelect }) {
  return (
    <figure className={classes.figure}>
      <svg viewBox="0 0 200 402" className={classes.svg} role="img" aria-label={`Cuerpo, ${label.toLowerCase()}`}>
        <g className={classes.base}>
          {BASE.center.map((d) => <path key={d} d={d} />)}
          {BASE.half.map((d) => <path key={d} d={d} />)}
          <g transform={MIRROR}>{BASE.half.map((d) => <path key={d} d={d} />)}</g>
        </g>
        {zones.map(({ part, half, center }) => {
          const props = {
            className: classes.zone,
            style: { fill: colorOf(part) },
            'data-selected': selected === part || undefined,
            'data-part': part,
            onClick: () => onSelect(part),
          };
          return (
            <g key={part} {...props}>
              <title>{part}</title>
              {center ? <path d={center} /> : (
                <>
                  <path d={half} />
                  <path d={half} transform={MIRROR} />
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className={classes.caption}>{label}</figcaption>
    </figure>
  );
}

/**
 * @param {object} p
 * @param {(part: string) => string} p.colorOf  color CSS de cada grupo
 * @param {string|null} [p.selected]
 * @param {(part: string) => void} [p.onSelect]
 * @param {boolean} [p.compact]  versión chica (resumen de un entrenamiento)
 */
export function BodyMap({ colorOf, selected = null, onSelect = () => {}, compact = false }) {
  return (
    <div className={classes.root} data-compact={compact || undefined} data-testid="body-map">
      <Figure zones={FRONT} label="Frente" colorOf={colorOf} selected={selected} onSelect={onSelect} />
      <Figure zones={BACK} label="Espalda" colorOf={colorOf} selected={selected} onSelect={onSelect} />
    </div>
  );
}

export const MAP_PARTS = [...new Set([...FRONT, ...BACK].map((z) => z.part))];
