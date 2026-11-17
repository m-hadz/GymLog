// Gráficos con d3 (vendorizado en /vendor/d3.min.js, funciona sin conexión).
// Reglas de diseño: una serie = un color; línea de 2px con área tenue; barras de
// máx. 24px con punta redondeada; grilla en líneas finas; etiquetas selectivas
// (último valor y mejor marca); tooltip con crosshair al tocar/arrastrar; tabla
// "Ver datos" como alternativa accesible.
import { h } from './ui.js';

const COLOR = {
  series: '#3987e5', seriesHover: '#6da7ec', grid: '#2e3238', axis: '#3d424a', surface: '#22252b',
};

const ES = {
  dateTime: '%A, %e de %B de %Y, %X', date: '%d/%m/%Y', time: '%H:%M:%S', periods: ['AM', 'PM'],
  days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  shortDays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  shortMonths: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
};

let loc;
function locale() {
  if (!loc) {
    const d3 = window.d3;
    loc = {
      num: d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['$', ''] }),
      time: d3.timeFormatLocale(ES),
    };
  }
  return loc;
}

export const num = (v, spec = ',.1~f') => locale().num.format(spec)(v);

// kg, o toneladas desde 10.000 kg
export const kg = (v) => (Math.abs(v) >= 10000 ? `${num(v / 1000)} t` : `${num(v)} kg`);
// Eje en kg: una sola unidad por eje según el máximo del eje (0 / 5 t / 10 t, o 0 / 50 / 100)
export const kgAxis = (v, max = v) => (v === 0 ? '0' : max >= 10000 ? `${num(v / 1000)} t` : num(v));
// Volumen: toneladas desde 1.000 kg (2,8 t), kg debajo
export const vol = (v) => (Math.abs(v) >= 1000 ? `${num(v / 1000)} t` : `${num(v, ',~f')} kg`);
export const volAxis = (v, max = v) => (v === 0 ? '0' : max >= 1000 ? `${num(v / 1000)} t` : num(v));

export const dateShort = (d) => locale().time.format('%-d %b')(d);
export const dateLong = (d) => locale().time.format('%-d %b %Y')(d);

function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

// Redibuja cuando cambia el ancho del contenedor (rotar el teléfono, abrir en desktop…)
function observeWidth(el, draw) {
  let last = 0;
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w > 0 && w !== last) { last = w; draw(w); }
  }).observe(el);
}

function dataTable(headers, rows) {
  return h('details', { class: 'viz-table' },
    h('summary', {}, 'Ver datos'),
    h('table', {},
      h('tr', {}, headers.map((t) => h('th', { class: 'left' }, t))),
      rows.map((r) => h('tr', {}, r.map((c) => h('td', { class: 'left' }, c))))));
}

function tooltip(tip, value, ...lines) {
  tip.replaceChildren(h('strong', {}, value), ...lines.filter(Boolean).map((l) => h('div', {}, l)));
  tip.hidden = false;
}

function placeTip(tip, host, px, py) {
  const w = tip.offsetWidth, hgt = tip.offsetHeight, W = host.clientWidth;
  const left = Math.max(0, Math.min(W - w, px - w / 2));
  const top = py - hgt - 14 >= 0 ? py - hgt - 14 : py + 14;
  tip.style.transform = `translate(${left}px, ${top}px)`;
}

function noD3(host) {
  host.append(h('p', { class: 'muted small' }, 'No se pudo cargar la librería de gráficos.'));
}

/**
 * Línea en el tiempo, una serie.
 * points: [{ date: Date, value: number, label?: string }] ordenados por fecha
 * format: valor -> texto (tooltip, etiquetas); axisFormat: valor -> texto corto (eje Y)
 */
export function lineChart({ points, format, axisFormat = format, height = 210, title = '' }) {
  const plot = h('div', { class: 'viz-plot' });
  const tip = h('div', { class: 'viz-tip', hidden: true, role: 'status' });
  const wrap = h('div', { class: 'viz', tabindex: '0', 'aria-label': `${title}. Usa las flechas para recorrer los puntos.` },
    plot, tip,
    dataTable(['Fecha', 'Valor', 'Detalle'], [...points].reverse().map((p) => [dateLong(p.date), format(p.value), p.label || ''])));
  if (!window.d3) { noD3(plot); return wrap; }
  if (!points.length) { plot.append(h('p', { class: 'muted small' }, 'Sin datos en este periodo.')); return wrap; }

  const d3 = window.d3;
  let active = null;
  let show = () => {};

  const draw = (width) => {
    const m = { t: 22, r: 16, b: 28, l: 44 };
    const H = height;
    let [x0, x1] = d3.extent(points, (p) => p.date);
    if (+x0 === +x1) { x0 = d3.timeDay.offset(x0, -7); x1 = d3.timeDay.offset(x1, 7); }
    const x = d3.scaleTime().domain([x0, x1]).range([m.l, width - m.r]);
    const [lo, hi] = d3.extent(points, (p) => p.value);
    const pad = (hi - lo) * 0.2 || Math.max(1, hi * 0.1);
    const y = d3.scaleLinear().domain([Math.max(0, lo - pad), hi + pad]).nice(4).range([H - m.b, m.t]);
    const X = (p) => x(p.date), Y = (p) => y(p.value);

    const svg = svgEl('svg', { class: 'viz-svg', width, height: H, viewBox: `0 0 ${width} ${H}`, 'aria-hidden': 'true' });
    // Grilla y eje Y
    for (const t of y.ticks(4)) {
      svg.append(svgEl('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), stroke: COLOR.grid, 'shape-rendering': 'crispEdges' }));
      svg.append(svgEl('text', { class: 'viz-tick', x: m.l - 8, y: y(t), dy: '0.32em', 'text-anchor': 'end' }, axisFormat(t, y.domain()[1])));
    }
    // Eje X
    const spanDays = (x1 - x0) / 864e5;
    const fmtX = spanDays > 330 ? locale().time.format('%b %y') : locale().time.format('%-d %b');
    let prevX = -Infinity;
    for (const t of x.ticks(Math.max(2, Math.floor((width - m.l) / 80)))) {
      const px = x(t);
      if (px - prevX < 64) continue; // sin etiquetas pegadas
      prevX = px;
      const anchor = px < m.l + 22 ? 'start' : px > width - m.r - 22 ? 'end' : 'middle';
      svg.append(svgEl('text', { class: 'viz-tick', x: px, y: H - 8, 'text-anchor': anchor }, fmtX(t)));
    }
    svg.append(svgEl('line', { x1: m.l, x2: width - m.r, y1: H - m.b, y2: H - m.b, stroke: COLOR.axis, 'shape-rendering': 'crispEdges' }));

    // Área + línea
    const curve = d3.curveLinear; // segmentos rectos: no inventa valores entre sesiones
    svg.append(svgEl('path', { d: d3.area().x(X).y0(H - m.b).y1(Y).curve(curve)(points), fill: COLOR.series, 'fill-opacity': 0.1 }));
    svg.append(svgEl('path', {
      d: d3.line().x(X).y(Y).curve(curve)(points), fill: 'none', stroke: COLOR.series,
      'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));

    // Etiquetas selectivas: último valor y mejor marca
    const dot = (p) => svgEl('circle', { cx: X(p), cy: Y(p), r: 4.5, fill: COLOR.series, stroke: COLOR.surface, 'stroke-width': 2 });
    const label = (p, text, cls) => {
      const px = X(p), py = Y(p);
      const anchor = px > width - m.r - 40 ? 'end' : px < m.l + 40 ? 'start' : 'middle';
      return svgEl('text', { class: cls, x: px, y: py - 11, 'text-anchor': anchor }, text);
    };
    const last = points.at(-1);
    const best = points.reduce((a, b) => (b.value > a.value ? b : a));
    if (best !== last && Math.abs(X(best) - X(last)) > 70) {
      svg.append(dot(best), label(best, `Mejor ${format(best.value)}`, 'viz-label muted'));
    }
    svg.append(dot(last), label(last, format(last.value), 'viz-label'));

    // Crosshair
    const cross = svgEl('g', { visibility: 'hidden' });
    const vline = svgEl('line', { y1: m.t - 6, y2: H - m.b, stroke: '#8b93a1', 'stroke-width': 1, 'shape-rendering': 'crispEdges' });
    const hdot = svgEl('circle', { r: 5, fill: COLOR.series, stroke: COLOR.surface, 'stroke-width': 2 });
    cross.append(vline, hdot);
    svg.append(cross);

    show = (i) => {
      if (i == null) { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; active = null; return; }
      active = Math.max(0, Math.min(points.length - 1, i));
      const p = points[active];
      vline.setAttribute('x1', X(p)); vline.setAttribute('x2', X(p));
      hdot.setAttribute('cx', X(p)); hdot.setAttribute('cy', Y(p));
      cross.setAttribute('visibility', 'visible');
      tooltip(tip, format(p.value), dateLong(p.date), p.label);
      placeTip(tip, plot, X(p), Y(p));
    };

    // Capa de interacción: el puntero solo tiene que estar cerca en X
    const hit = svgEl('rect', { x: m.l, y: 0, width: Math.max(0, width - m.l - m.r), height: H - m.b, fill: 'transparent', class: 'viz-hit' });
    const nearest = (e) => {
      const r = svg.getBoundingClientRect();
      return d3.bisector(X).center(points, e.clientX - r.left);
    };
    hit.addEventListener('pointermove', (e) => show(nearest(e)));
    hit.addEventListener('pointerdown', (e) => show(nearest(e)));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') show(null); });
    svg.append(hit);

    plot.replaceChildren(svg);
    if (active != null) show(active);
  };

  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { show((active ?? points.length) - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { show((active ?? -1) + 1); e.preventDefault(); }
    if (e.key === 'Escape') show(null);
  });
  wrap.addEventListener('focus', () => { if (active == null) show(points.length - 1); });
  wrap.addEventListener('blur', () => show(null));
  observeWidth(plot, draw);
  return wrap;
}

/**
 * Columnas por periodo, una serie.
 * bars: [{ date: Date, value: number, label: string, partial?: boolean }]
 */
export function barChart({ bars, format, axisFormat = format, height = 190, integer = false, title = '' }) {
  const plot = h('div', { class: 'viz-plot' });
  const tip = h('div', { class: 'viz-tip', hidden: true, role: 'status' });
  const hasPartial = bars.some((b) => b.partial);
  const wrap = h('div', { class: 'viz', tabindex: '0', 'aria-label': `${title}. Usa las flechas para recorrer las barras.` },
    plot, tip,
    hasPartial ? h('div', { class: 'viz-legend' }, h('i', { class: 'swatch partial' }), 'Semana en curso') : null,
    dataTable(['Semana', 'Valor'], [...bars].reverse().map((b) => [b.label, format(b.value)])));
  if (!window.d3) { noD3(plot); return wrap; }

  const d3 = window.d3;
  let active = null;
  let show = () => {};

  const draw = (width) => {
    const m = { t: 22, r: 8, b: 28, l: 44 };
    const H = height;
    const x = d3.scaleBand().domain(bars.map((_, i) => i)).range([m.l, width - m.r]).paddingInner(0.3).paddingOuter(0.15);
    const max = d3.max(bars, (b) => b.value) || 1;
    const y = d3.scaleLinear().domain([0, max]).nice(4).range([H - m.b, m.t]);
    const bw = Math.min(24, x.bandwidth());
    const off = (x.bandwidth() - bw) / 2;

    const svg = svgEl('svg', { class: 'viz-svg', width, height: H, viewBox: `0 0 ${width} ${H}`, 'aria-hidden': 'true' });
    for (const t of y.ticks(4).filter((t) => !integer || Number.isInteger(t))) {
      svg.append(svgEl('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), stroke: COLOR.grid, 'shape-rendering': 'crispEdges' }));
      svg.append(svgEl('text', { class: 'viz-tick', x: m.l - 8, y: y(t), dy: '0.32em', 'text-anchor': 'end' }, axisFormat(t, y.domain()[1])));
    }
    // Etiquetas X espaciadas para que no choquen; la última siempre
    const every = Math.max(1, Math.ceil(bars.length / Math.max(1, Math.floor((width - m.l) / 64))));
    bars.forEach((b, i) => {
      if ((bars.length - 1 - i) % every !== 0) return; // espaciadas parejo, terminando en la semana actual
      svg.append(svgEl('text', { class: 'viz-tick', x: x(i) + x.bandwidth() / 2, y: H - 8, 'text-anchor': 'middle' }, dateShort(b.date)));
    });

    // Barras: punta redondeada (4px), base recta
    const barPath = (x0, y0, w, hgt) => {
      const r = Math.min(4, hgt, w / 2);
      return `M${x0},${y0 + hgt}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + w - r}Q${x0 + w},${y0} ${x0 + w},${y0 + r}V${y0 + hgt}Z`;
    };
    const rects = bars.map((b, i) => {
      const hgt = Math.max(0, y(0) - y(b.value));
      const p = svgEl('path', { d: hgt > 0 ? barPath(x(i) + off, y(b.value), bw, hgt) : '', fill: COLOR.series, 'fill-opacity': b.partial ? 0.4 : 1 });
      svg.append(p);
      return p;
    });
    svg.append(svgEl('line', { x1: m.l, x2: width - m.r, y1: H - m.b, y2: H - m.b, stroke: COLOR.axis, 'shape-rendering': 'crispEdges' }));

    // Etiqueta selectiva: valor de la última semana sobre su barra
    const li = bars.length - 1;
    if (bars[li] && bars[li].value > 0) {
      svg.append(svgEl('text', { class: 'viz-label', x: x(li) + x.bandwidth() / 2, y: y(bars[li].value) - 7, 'text-anchor': 'middle' }, axisFormat(bars[li].value, y.domain()[1])));
    }

    show = (i) => {
      rects.forEach((r, j) => r.setAttribute('fill', j === i ? COLOR.seriesHover : COLOR.series));
      if (i == null) { tip.hidden = true; active = null; return; }
      active = Math.max(0, Math.min(bars.length - 1, i));
      rects.forEach((r, j) => r.setAttribute('fill', j === active ? COLOR.seriesHover : COLOR.series));
      const b = bars[active];
      tooltip(tip, format(b.value), b.label, b.partial ? 'Semana en curso' : null);
      placeTip(tip, plot, x(active) + x.bandwidth() / 2, y(b.value));
    };

    // Cada columna completa (no solo la barra pintada) es zona táctil
    bars.forEach((b, i) => {
      const hit = svgEl('rect', { x: x(i) - (x.step() - x.bandwidth()) / 2, y: 0, width: x.step(), height: H - m.b, fill: 'transparent', class: 'viz-hit' });
      hit.addEventListener('pointerenter', () => show(i));
      hit.addEventListener('pointerdown', () => show(i));
      hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') show(null); });
      svg.append(hit);
    });

    plot.replaceChildren(svg);
    if (active != null) show(active);
  };

  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { show((active ?? bars.length) - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { show((active ?? -1) + 1); e.preventDefault(); }
    if (e.key === 'Escape') show(null);
  });
  wrap.addEventListener('blur', () => show(null));
  observeWidth(plot, draw);
  return wrap;
}

// Tarjeta: título, cifra principal (último valor) y variación en el periodo
export function chartCard({ title, sub, value, delta, chart }) {
  return h('section', { class: 'viz-card' },
    h('div', { class: 'viz-head' },
      h('div', {}, h('h3', {}, title), sub ? h('div', { class: 'muted small' }, sub) : null),
      value != null ? h('div', { class: 'viz-figure' },
        h('div', { class: 'viz-value' }, value),
        delta ? h('div', { class: `viz-delta ${delta.dir}` }, delta.text) : null) : null),
    chart);
}

// Variación entre el primer y el último punto: "▲ 3,2 kg desde 1 sept"
export function deltaOf(points, format) {
  if (points.length < 2) return null;
  const diff = points.at(-1).value - points[0].value;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const icon = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '=';
  return { dir, text: `${icon} ${diff === 0 ? 'igual' : format(Math.abs(diff))} desde ${dateShort(points[0].date)}` };
}

// Fila de filtros de periodo (va arriba de los gráficos que afecta)
export function rangeChips(options, value, onChange) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': 'Periodo' },
    options.map(([v, label]) => h('button', {
      class: `chip${v === value ? ' on' : ''}`, 'aria-pressed': String(v === value), onclick: () => onChange(v),
    }, label)));
}
