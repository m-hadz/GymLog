// Tendencia, ritmo e índice de fuerza (feature 17). Módulo puro, sin DOM.
// Con una serie al fallo por ejercicio, cada sesión trae ruido (en el historial real, ±2,8 % de
// mediana respecto de su tendencia): la tendencia lo filtra y el ritmo se mide con una pendiente
// robusta (Theil–Sen) sobre el logaritmo del 1RM estimado.

export const DAY = 864e5;
export const TREND_HALF_LIFE = 14;   // días: media móvil exponencial con peso por tiempo
export const RATE_SESSIONS = 12;     // sesiones para el ritmo
export const RATE_DAYS = 120;        // …dentro de los últimos 120 días
export const RATE_MIN_SESSIONS = 6;
export const RATE_MIN_SPAN = 21;     // días entre la primera y la última de la ventana
export const INDEX_MAX_GAP = 21;     // días: comparar con la sesión anterior solo si es reciente
export const INDEX_MIN_EXERCISES = 3;
// Las primeras sesiones de un ejercicio no entran al índice: al principio se sube por técnica y por
// encontrar el peso, no por fuerza. En el historial real, sin esto el índice salía +100 % en 4 meses
// mientras la mediana de los ejercicios subía +26 %; con 3 sesiones de aprendizaje, +60 %.
export const INDEX_LEARNING = 3;
export const RATE_UP = 1;            // %/mes: "subiendo"
export const RATE_DOWN = -0.5;       // %/mes: "bajando"

export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** Media recortada: descarta el `cut` (10 %) de cada extremo. */
export function trimmedMean(xs, cut = 0.1) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length * cut);
  return mean(s.slice(k, s.length - k));
}

/**
 * Recta de Theil–Sen: pendiente = mediana de las pendientes entre pares; aguanta valores raros.
 * lo/hi: intervalo de confianza del 90 % de la pendiente (método de Sen, 1968: rangos de la
 * distribución de Kendall con aproximación normal).
 * @param {{x:number, y:number}[]} pts
 * @returns {null | {slope:number, intercept:number, lo:number, hi:number}}
 */
export function theilSen(pts) {
  const sl = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (pts[j].x !== pts[i].x) sl.push((pts[j].y - pts[i].y) / (pts[j].x - pts[i].x));
    }
  }
  if (!sl.length) return null;
  sl.sort((a, b) => a - b);
  const slope = median(sl);
  const n = pts.length;
  const N = sl.length;
  const C = 1.645 * Math.sqrt((n * (n - 1) * (2 * n + 5)) / 18);
  const lo = sl[Math.max(0, Math.floor((N - C) / 2))];
  const hi = sl[Math.min(N - 1, Math.ceil((N + C) / 2))];
  return { slope, intercept: median(pts.map((p) => p.y - slope * p.x)), lo, hi };
}

/** Pendiente diaria de ln(valor) → % por mes (30 días). */
export const toMonthly = (k) => (Math.exp(k * 30) - 1) * 100;

/**
 * Tendencia de una serie de valores en el tiempo: media móvil exponencial sobre ln(valor), con
 * α según los días transcurridos (vida media TREND_HALF_LIFE).
 * @param {{t:number, value:number}[]} pts ascendentes, value > 0
 * @returns {{t:number, value:number, trend:number}[]}
 */
export function trendLine(pts, halfLife = TREND_HALF_LIFE) {
  let tr = null;
  let lastT = null;
  return pts.map((p) => {
    const y = Math.log(p.value);
    if (tr == null) tr = y;
    else {
      const a = 1 - 0.5 ** ((p.t - lastT) / DAY / halfLife);
      tr += a * (y - tr);
    }
    lastT = p.t;
    return { ...p, trend: Math.exp(tr) };
  });
}

/**
 * Ritmo de progreso: Theil–Sen sobre ln(valor) de las últimas RATE_SESSIONS sesiones dentro de
 * RATE_DAYS días, en %/mes.
 * @returns {{rate:number|null, lo:number|null, hi:number|null, n:number, enough:boolean, status:string}}
 */
export function progressRate(pts, { now = Date.now() } = {}) {
  const win = pts.filter((p) => p.value > 0 && now - p.t <= RATE_DAYS * DAY).slice(-RATE_SESSIONS);
  const span = win.length ? (win.at(-1).t - win[0].t) / DAY : 0;
  const enough = win.length >= RATE_MIN_SESSIONS && span >= RATE_MIN_SPAN;
  if (!enough) return { rate: null, lo: null, hi: null, n: win.length, enough: false, status: 'pocos' };
  const fit = theilSen(win.map((p) => ({ x: p.t / DAY, y: Math.log(p.value) })));
  const rate = toMonthly(fit.slope);
  const lo = toMonthly(fit.lo);
  const hi = toMonthly(fit.hi);
  const status = rate > RATE_UP ? 'sube' : rate < RATE_DOWN ? 'baja' : 'plano';
  // ¿El rango apoya el estado? (si no, se muestra como "incierto")
  const sure = status === 'sube' ? lo > 0 : status === 'baja' ? hi < 0 : lo > -3 && hi < 3;
  return { rate, lo, hi, n: win.length, enough: true, status, sure };
}

/**
 * Residuo de cada sesión respecto de su tendencia local: recta Theil–Sen de las ±4 sesiones vecinas
 * (sin la propia) a menos de 35 días, evaluada en su fecha. Es la base de los análisis de "qué
 * explica" el rendimiento (feature 23), del orden (24) y de la fórmula personal (25).
 * @param {{t:number, value:number}[]} pts ascendentes
 * @returns {{i:number, d:number}[]} d = ln(valor) − ln(esperado)
 */
export function localResiduals(pts, { k = 4, maxDays = 35, min = 5 } = {}) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const nb = [...pts.slice(Math.max(0, i - k), i), ...pts.slice(i + 1, i + 1 + k)]
      .filter((p) => Math.abs(p.t - pts[i].t) / DAY <= maxDays);
    if (nb.length < min) continue;
    const fit = theilSen(nb.map((p) => ({ x: p.t / DAY, y: Math.log(p.value) })));
    const expected = fit ? fit.intercept + fit.slope * (pts[i].t / DAY) : median(nb.map((p) => Math.log(p.value)));
    out.push({ i, d: Math.log(pts[i].value) - expected });
  }
  return out;
}

/**
 * Lo esperado para hoy según las sesiones anteriores (sin mirar el futuro): recta Theil–Sen de las
 * últimas 8 sesiones a menos de 60 días, proyectada a `t`. Con menos de 3, la última.
 */
export function expectedAt(prev, t) {
  const win = prev.filter((p) => p.value > 0 && (t - p.t) / DAY <= 60).slice(-8);
  if (!win.length) return null;
  if (win.length < 3) return win.at(-1).value;
  const fit = theilSen(win.map((p) => ({ x: p.t / DAY, y: Math.log(p.value) })));
  if (!fit) return win.at(-1).value;
  // sin extrapolar más allá de 2 semanas desde la última sesión
  const x = Math.min(t, win.at(-1).t + 14 * DAY) / DAY;
  return Math.exp(fit.intercept + fit.slope * x);
}

/**
 * Índice de fuerza encadenado (parte en 100): en cada entrenamiento, para cada ejercicio con sesión
 * anterior a menos de INDEX_MAX_GAP días, ln(1RM hoy / 1RM anterior); el paso del día es la media
 * recortada (10 %) de esos logaritmos con al menos INDEX_MIN_EXERCISES ejercicios. Como cada
 * ejercicio se compara consigo mismo, no importa que entren o salgan ejercicios ni que las máquinas
 * tengan pesos raros. Las primeras INDEX_LEARNING sesiones de cada ejercicio no cuentan.
 * @param {{id:string, t:number, values:Map<string, number>}[]} days entrenamientos ascendentes:
 *   values = ejercicio → mejor 1RM estimado de ese día
 * @returns {{id:string, t:number, value:number, n:number}[]}
 */
export function strengthIndex(days) {
  const last = new Map(); // ejercicio → {t, value}
  const count = new Map(); // ejercicio → sesiones anteriores
  let idx = 100;
  let base = null; // primer entrenamiento con datos: el punto 100
  const out = [];
  for (const d of days) {
    const steps = [];
    for (const [ex, v] of d.values) {
      const p = last.get(ex);
      if (p && v > 0 && p.value > 0 && (d.t - p.t) / DAY <= INDEX_MAX_GAP && (count.get(ex) || 0) >= INDEX_LEARNING) {
        steps.push(Math.log(v / p.value));
      }
    }
    for (const [ex, v] of d.values) {
      if (!(v > 0)) continue;
      last.set(ex, { t: d.t, value: v });
      count.set(ex, (count.get(ex) || 0) + 1);
    }
    if (steps.length >= INDEX_MIN_EXERCISES) {
      if (!out.length && base) out.push({ id: base.id, t: base.t, value: 100, n: 0 });
      idx *= Math.exp(trimmedMean(steps));
      out.push({ id: d.id, t: d.t, value: idx, n: steps.length });
    } else if (!out.length && d.values.size) base = d; // el 100 es el día anterior al primer paso
  }
  return out;
}

/** Valor del índice en una fecha (el último punto anterior o igual). */
export function indexAt(series, t) {
  let v = null;
  for (const p of series) { if (p.t <= t) v = p.value; else break; }
  return v;
}

/** Cambio % del índice entre `from` y el último punto (null sin datos). */
export function indexChange(series, from) {
  if (!series.length) return null;
  const base = indexAt(series, from) ?? series.find((p) => p.t >= from)?.value;
  if (!base) return null;
  return (series.at(-1).value / base - 1) * 100;
}
