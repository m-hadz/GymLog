// Utilidades de interfaz: creación de DOM, modales, toasts y formatos.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function mount(root, ...children) {
  root.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

// Modal tipo "hoja" desde abajo. render(close) devuelve el contenido.
export function openModal(render) {
  const root = document.getElementById('modal-root');
  const sheet = h('div', { class: 'sheet' });
  const backdrop = h('div', { class: 'backdrop' }, sheet);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  const rerender = () => mount(sheet, render(close, rerender));
  rerender();
  root.append(backdrop);
  return close;
}

let toastTimer;
export function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export const uid = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

export function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const fmtNum = (n, d = 1) =>
  n == null ? '' : Number(n).toLocaleString('es-CL', { maximumFractionDigits: d });

export const fmtSet = (s) => {
  if (!s) return '—';
  if (s.weight) return `${fmtNum(s.weight)} kg × ${s.reps ?? 0}`;
  return `${s.reps ?? 0} reps`;
};

export function fmtDate(iso, opts = { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) {
  return iso ? new Date(iso).toLocaleDateString('es-CL', opts) : '';
}

export function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
}

export function fmtDuration(ms) {
  if (!ms || ms < 0) return '0 min';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Fecha local en formato YYYY-MM-DD
export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// Para <input type="datetime-local">
export function toLocalInput(iso) {
  const d = new Date(iso);
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function select(options, value, onChange) {
  return h('select', { onchange: (e) => onChange(e.target.value) },
    options.map((o) => {
      const [val, label] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: val, selected: val === value }, label);
    }));
}
