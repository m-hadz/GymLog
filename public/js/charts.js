// Gráficos SVG mínimos, sin librerías.
import { fmtNum } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

const W = 340, H = 180, PL = 8, PR = 48, PT = 12, PB = 24;

function frame(minY, maxY, unit) {
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
  svg.append(
    s('rect', { x: PL, y: PT, width: W - PL - PR, height: H - PT - PB, fill: 'none', stroke: '#353a42' }),
    s('text', { x: W - PR + 4, y: PT + 10, fill: '#8b93a1', 'font-size': 11 }, `${fmtNum(maxY)} ${unit}`),
    s('text', { x: W - PR + 4, y: H - PB, fill: '#8b93a1', 'font-size': 11 }, `${fmtNum(minY)} ${unit}`),
  );
  return svg;
}

const shortDate = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });

// points: [{x: fecha ISO, y: número}]
export function lineChart(points, unit = 'kg') {
  if (points.length === 0) return s('svg', { viewBox: `0 0 ${W} 40`, class: 'chart' });
  const ys = points.map((p) => p.y);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (minY === maxY) { minY = Math.max(0, minY - 1); maxY += 1; }
  const pad = (maxY - minY) * 0.1;
  minY = Math.max(0, minY - pad); maxY += pad;
  const xs = points.map((p) => new Date(p.x).getTime());
  const minX = Math.min(...xs), maxX = Math.max(...xs) || minX + 1;
  const px = (x) => PL + ((x - minX) / (maxX - minX || 1)) * (W - PL - PR);
  const py = (y) => H - PB - ((y - minY) / (maxY - minY)) * (H - PT - PB);
  const svg = frame(minY, maxY, unit);
  const coords = points.map((p, i) => [px(xs[i]), py(p.y)]);
  svg.append(s('polyline', { points: coords.map((c) => c.join(',')).join(' '), fill: 'none', stroke: '#3b9eff', 'stroke-width': 2 }));
  points.forEach((p, i) => {
    const dot = s('circle', { cx: coords[i][0], cy: coords[i][1], r: 3.5, fill: '#3b9eff' });
    dot.append(s('title', {}, `${shortDate(p.x)}: ${fmtNum(p.y)} ${unit}`));
    svg.append(dot);
  });
  svg.append(
    s('text', { x: PL, y: H - 6, fill: '#8b93a1', 'font-size': 11 }, shortDate(minX)),
    s('text', { x: W - PR, y: H - 6, fill: '#8b93a1', 'font-size': 11, 'text-anchor': 'end' }, shortDate(maxX)),
  );
  return svg;
}

// bars: [{label, y}]
export function barChart(bars, unit = '') {
  const maxY = Math.max(1, ...bars.map((b) => b.y));
  const svg = frame(0, maxY, unit);
  const bw = (W - PL - PR) / bars.length;
  bars.forEach((b, i) => {
    const hgt = (b.y / maxY) * (H - PT - PB);
    const r = s('rect', { x: PL + i * bw + 2, y: H - PB - hgt, width: bw - 4, height: hgt, fill: '#3b9eff' });
    r.append(s('title', {}, `${b.label}: ${fmtNum(b.y)} ${unit}`));
    svg.append(r);
  });
  if (bars.length) {
    svg.append(
      s('text', { x: PL, y: H - 6, fill: '#8b93a1', 'font-size': 11 }, bars[0].label),
      s('text', { x: W - PR, y: H - 6, fill: '#8b93a1', 'font-size': 11, 'text-anchor': 'end' }, bars.at(-1).label),
    );
  }
  return svg;
}
