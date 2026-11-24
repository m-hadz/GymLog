// Metas por ejercicio con fecha estimada (feature 26). Módulo puro, sin DOM.
// La fecha sale del ritmo de progreso (trend.js): meses = ln(meta / tendencia) / ln(1 + ritmo).
// Con el rango del ritmo se da un rango de fechas; con el ritmo plano no se inventa una fecha.

export const MIN_RATE = 0.3;        // %/mes: con menos, "a este ritmo no llega"
export const MAX_MONTHS = 24;       // más de 2 años: no se da fecha
export const SUGGEST_MONTHS = 2;    // horizonte de la meta sugerida
export const SUGGEST_MIN_RATE = 1;  // %/mes mínimo para sugerir (si tu ritmo es menor, igual propone +2 %)

const monthsFor = (from, to, rate) => (rate > MIN_RATE ? Math.log(to / from) / Math.log(1 + rate / 100) : null);
const addMonths = (t, m) => t + m * 30.44 * 864e5;

/**
 * @param {{target:number, start:number}} goal target = 1RM estimado de la meta; start = tendencia al crearla
 * @param {{trend:number|null, rate:{rate:number|null, lo:number|null, hi:number|null, enough:boolean},
 *   best:number|null, now?:number}} o best = mejor 1RM estimado desde que se creó
 * @returns {{status:'lograda'|'en_camino'|'plana'|'pocos', progress:number, eta:number|null,
 *   etaEarly:number|null, etaLate:number|null, months:number|null, remaining:number|null}}
 */
export function goalStatus(goal, { trend, rate, best, now = Date.now() }) {
  const target = goal.target;
  const cur = trend || goal.start;
  const span = target - goal.start;
  const progress = span > 0 ? Math.max(0, Math.min(1, (cur - goal.start) / span)) : (cur >= target ? 1 : 0);
  const base = { progress, remaining: target > cur ? ((target / cur) - 1) * 100 : 0 };
  if (best >= target) return { ...base, progress: 1, status: 'lograda', eta: null, etaEarly: null, etaLate: null, months: null };
  if (!rate?.enough) return { ...base, status: 'pocos', eta: null, etaEarly: null, etaLate: null, months: null };
  if (cur >= target) return { ...base, status: 'en_camino', months: 0, eta: now, etaEarly: now, etaLate: now };
  const m = monthsFor(cur, target, rate.rate);
  if (m == null || m > MAX_MONTHS) return { ...base, status: 'plana', eta: null, etaEarly: null, etaLate: null, months: null };
  const early = monthsFor(cur, target, rate.hi);
  const late = monthsFor(cur, target, rate.lo);
  return {
    ...base, status: 'en_camino', months: m, eta: addMonths(now, m),
    etaEarly: early != null ? addMonths(now, early) : null,
    etaLate: late != null && late <= MAX_MONTHS ? addMonths(now, late) : null,
  };
}

/** 1RM estimado de una meta sugerida: la tendencia proyectada SUGGEST_MONTHS meses a tu ritmo. */
export function suggestedTarget(trend, rate) {
  if (!(trend > 0)) return null;
  const r = Math.max(rate?.enough ? rate.rate : 0, SUGGEST_MIN_RATE);
  return trend * (1 + r / 100) ** SUGGEST_MONTHS;
}
