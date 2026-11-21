// Peso corporal y medidas (feature 03): tendencia, ritmo, peso a una fecha y grasa estimada.
// Módulo puro, sin DOM. Ver docs/features/03-peso-corporal-medidas.md.

export const MEASUREMENTS = [
  ['cuello', 'Cuello'], ['hombros', 'Hombros'], ['pecho', 'Pecho'], ['cintura', 'Cintura'], ['cadera', 'Cadera'],
  ['brazo_izq', 'Brazo izq.'], ['brazo_der', 'Brazo der.'], ['antebrazo_izq', 'Antebrazo izq.'],
  ['antebrazo_der', 'Antebrazo der.'], ['muslo_izq', 'Muslo izq.'], ['muslo_der', 'Muslo der.'],
  ['pantorrilla_izq', 'Pantorrilla izq.'], ['pantorrilla_der', 'Pantorrilla der.'],
];
export const MEASUREMENT_LABEL = Object.fromEntries(MEASUREMENTS);

const DAY = 864e5;

// Peso con un decimal fijo: 80,0 kg (no "80 kg", que parece redondeado)
export const kg1 = (v) => `${Number(v).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
const dayNum = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY; // días desde 1970 (sin horario de verano)

// Fecha local del teléfono como 'YYYY-MM-DD'
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Tendencia: media móvil exponencial ponderada por tiempo.
 * t_n = t_{n-1} + (1 − 0,9^días) × (peso_n − t_{n-1}); t_0 = primer peso. Los días sin registro no la mueven.
 * @param {{date:string, weight:number|null}[]} entries (cualquier orden)
 * @returns {{date:string, weight:number, trend:number}[]} ascendente, solo registros con peso
 */
export function trendSeries(entries) {
  const list = entries.filter((e) => e.weight > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const out = [];
  for (const e of list) {
    const prev = out.at(-1);
    const trend = prev ? prev.trend + (1 - 0.9 ** (dayNum(e.date) - dayNum(prev.date))) * (e.weight - prev.trend) : e.weight;
    out.push({ date: e.date, weight: e.weight, trend });
  }
  return out;
}

// Último punto de la serie en o antes de `date` (o null)
const at = (series, date) => {
  let found = null;
  for (const p of series) { if (p.date <= date) found = p; else break; }
  return found;
};

/**
 * Ritmo de la tendencia en los últimos `days` días, en kg por semana. null con menos de 3 registros
 * o sin un registro anterior a la ventana con el que comparar.
 */
export function trendRate(series, days) {
  if (series.length < 3) return null;
  const last = series.at(-1);
  const fromDate = new Date((dayNum(last.date) - days) * DAY).toISOString().slice(0, 10);
  const base = at(series, fromDate) || series[0];
  const span = dayNum(last.date) - dayNum(base.date);
  if (span < 3) return null;
  return ((last.trend - base.trend) / span) * 7;
}

/**
 * Peso corporal a una fecha: la tendencia a esa fecha, o el último registro anterior si hay menos de
 * 3 registros hasta ahí. null si no hay registros previos. Lo usan otras features (lastre, asistido).
 */
export function bodyweightAt(entries, date) {
  const series = trendSeries(entries).filter((p) => p.date <= date);
  if (!series.length) return null;
  const last = series.at(-1);
  return series.length < 3 ? last.weight : last.trend;
}

/**
 * Igual que bodyweightAt, pero precalculado para consultar muchas fechas (análisis del historial).
 * Para fechas anteriores al primer registro usa ese primer registro si está a `backfillDays` días
 * o menos (el peso corporal cambia lento), y si no, null.
 * @returns {(date:string) => number|null}
 */
export function bodyweightLookup(entries, { backfillDays = 60 } = {}) {
  const series = trendSeries(entries);
  if (!series.length) return () => null;
  const first = series[0];
  return (date) => {
    let lo = 0;
    let hi = series.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (series[mid].date <= date) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (found < 0) return dayNum(first.date) - dayNum(date) <= backfillDays ? first.weight : null;
    return found < 2 ? series[found].weight : series[found].trend;
  };
}

/**
 * % de grasa estimado con el método de la Marina de EE. UU. (medidas en cm). null si falta algo.
 * Hombres: cuello, cintura, estatura. Mujeres: además cadera.
 */
export function navyBodyFat({ sex, height, neck, waist, hip }) {
  if (!(height > 0 && neck > 0 && waist > 0)) return null;
  let v;
  if (sex === 'm') {
    if (waist <= neck) return null;
    v = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  } else if (sex === 'f') {
    if (!(hip > 0) || waist + hip <= neck) return null;
    v = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(height)) - 450;
  } else return null;
  return v > 0 && v < 75 ? v : null;
}

// Avisos de valores fuera de lo normal (se piden confirmar, no se bloquean)
export function unusualValues({ weight, body_fat: fat }) {
  const out = [];
  if (weight != null && (weight < 25 || weight > 300)) out.push(`peso de ${weight} kg`);
  if (fat != null && (fat < 2 || fat > 70)) out.push(`${fat} % de grasa`);
  return out;
}

// CSV para planillas: fecha, peso, tendencia, grasa y cada medida usada
export function bodyCsv(entries) {
  const trend = new Map(trendSeries(entries).map((p) => [p.date, p.trend]));
  const used = MEASUREMENTS.filter(([k]) => entries.some((e) => e.measurements?.[k] != null));
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const n = (v, d = 2) => (v == null ? '' : String(Math.round(v * 10 ** d) / 10 ** d));
  const head = ['Fecha', 'Peso (kg)', 'Tendencia (kg)', 'Grasa (%)', ...used.map(([, l]) => `${l} (cm)`), 'Notas'];
  const rows = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => [
    e.date, n(e.weight), n(trend.get(e.date)), n(e.body_fat, 1),
    ...used.map(([k]) => n(e.measurements?.[k], 1)), esc(e.notes || ''),
  ].join(','));
  return [head.join(','), ...rows].join('\n') + '\n';
}
