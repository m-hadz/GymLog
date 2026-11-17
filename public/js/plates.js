// Calculadora de discos: qué poner a cada lado de la barra para un peso total.
import { h, mount, openModal, num, fmtNum } from './ui.js';
import { getSettings } from './data.js';

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

const COLORS = { 25: '#e5484d', 20: '#3b82f6', 15: '#eab308', 10: '#22c55e', 5: '#e5e7eb', 2.5: '#9ca3af', 1.25: '#d1d5db' };

export function openPlates(initial) {
  const st = getSettings();
  let total = initial || st.bar;
  let bar = st.bar;
  openModal((close) => {
    const result = h('div');
    const draw = () => {
      if (total < bar) { mount(result, h('p', { class: 'muted' }, 'El total es menor que la barra.')); return; }
      const { out, rest } = platesFor(total, bar, st.plates);
      const plate = (p) => h('span', { style: `display:inline-block;width:16px;height:${36 + p * 3}px;background:${COLORS[p] || '#64748b'};border-radius:3px;margin:0 1px;vertical-align:middle` });
      mount(result,
        h('div', { style: 'text-align:center;margin:14px 0;white-space:nowrap;overflow:hidden' },
          [...out].reverse().map(plate),
          h('span', { style: 'display:inline-block;width:70px;height:8px;background:#94a3b8;vertical-align:middle' }),
          out.map(plate)),
        h('p', { style: 'text-align:center' }, h('strong', {}, 'Por lado: '),
          out.length ? `${out.map((p) => fmtNum(p, 2)).join(' + ')} kg` : 'solo la barra'),
        rest > 0 ? h('p', { class: 'muted small', style: 'text-align:center' },
          `Faltan ${fmtNum(rest * 2, 2)} kg que no se pueden armar con tus discos.`) : null);
    };
    draw();
    return [
      h('h3', {}, 'Calculadora de discos'),
      h('div', { class: 'row' },
        h('div', { class: 'grow' }, h('label', {}, 'Peso total (kg)'),
          h('input', { inputmode: 'decimal', value: fmtNum(total, 2), oninput: (e) => { total = num(e.target.value) || 0; draw(); } })),
        h('div', { style: 'width:110px' }, h('label', {}, 'Barra (kg)'),
          h('input', { inputmode: 'decimal', value: fmtNum(bar, 2), oninput: (e) => { bar = num(e.target.value) || 0; draw(); } }))),
      result,
      h('p', { class: 'muted small' }, `Discos disponibles: ${st.plates.map((p) => fmtNum(p, 2)).join(', ')} kg (cámbialos en Perfil).`),
      h('button', { class: 'block', onclick: close }, 'Cerrar'),
    ];
  });
}
