// Calculadora de discos: qué poner a cada lado de la barra para un peso total.
// Algoritmo voraz con los discos disponibles (se asume un par de cada uno, ilimitados).
export function platesFor(total, bar, available) {
  let side = (total - bar) / 2;
  const out = [];
  if (side < 0) return { out, rest: side };
  for (const p of [...available].sort((a, b) => b - a)) {
    while (side >= p - 1e-9) { out.push(p); side -= p; }
  }
  return { out, rest: Math.round(side * 100) / 100 };
}

// Colores estándar de discos olímpicos (kg)
export const PLATE_COLORS = { 25: '#e5484d', 20: '#3b82f6', 15: '#eab308', 10: '#22c55e', 5: '#e5e7eb', 2.5: '#71717a', 1.25: '#d4d4d8' };
