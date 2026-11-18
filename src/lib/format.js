// Formatos y utilidades sin DOM (números, fechas, ids, descargas).

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

// Volumen: toneladas desde 10.000 kg ("12,4 t"), kg debajo ("8.250 kg")
export const fmtVolume = (v) => (Math.abs(v) >= 10000 ? `${fmtNum(v / 1000)} t` : `${fmtNum(v, 0)} kg`);

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
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
