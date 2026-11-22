// Imagen para compartir un resumen (feature 07): se dibuja en un canvas en el teléfono, sin servicios
// externos. 1080 × 1350 (4:5, el formato de publicación de Instagram y que se ve bien en WhatsApp).
import { fmtDuration, fmtNum, fmtVolume } from '../../lib/format.js';

const W = 1080;
const H = 1350;
const FONT = '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONTH_INITIALS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const WHITE = (a) => `rgba(255,255,255,${a})`;

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const font = (ctx, size, weight = 400) => { ctx.font = `${weight} ${size}px ${FONT}`; };
const deltaText = (v) => (v == null ? null : v === 0 ? '= igual' : `${v > 0 ? '▲ +' : '▼ '}${fmtNum(v, 1)} %`);

function tile(ctx, x, y, w, h, label, value, delta) {
  rounded(ctx, x, y, w, h, 36);
  ctx.fillStyle = WHITE(0.13);
  ctx.fill();
  ctx.fillStyle = WHITE(0.72);
  font(ctx, 27, 650);
  ctx.fillText(label.toUpperCase(), x + 36, y + 62);
  ctx.fillStyle = '#fff';
  font(ctx, value.length > 9 ? 58 : 70, 800);
  ctx.fillText(value, x + 36, y + 145);
  const d = deltaText(delta);
  if (d) {
    ctx.fillStyle = delta > 0 ? '#9ff2cf' : delta < 0 ? '#ffd29b' : WHITE(0.7);
    font(ctx, 31, 700);
    ctx.fillText(d, x + 36, y + 196);
  }
}

function calendar(ctx, r, x, y, w) {
  const offset = (new Date(r.year, r.month - 1, 1).getDay() + 6) % 7;
  const cell = w / 7;
  const trained = new Set(r.days);
  ctx.textAlign = 'center';
  font(ctx, 26, 650);
  ctx.fillStyle = WHITE(0.6);
  ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d, i) => ctx.fillText(d, x + cell * i + cell / 2, y));
  for (let day = 1; day <= r.daysInMonth; day++) {
    const i = offset + day - 1;
    const cx = x + cell * (i % 7) + cell / 2;
    const cy = y + 46 + Math.floor(i / 7) * 52;
    if (trained.has(day)) {
      ctx.beginPath();
      ctx.arc(cx, cy - 9, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.fillStyle = '#134ddb';
      font(ctx, 24, 800);
    } else {
      ctx.fillStyle = WHITE(0.45);
      font(ctx, 24, 500);
    }
    ctx.fillText(String(day), cx, cy);
  }
  ctx.textAlign = 'left';
}

function monthBars(ctx, r, x, y, w, h) {
  const max = Math.max(1, ...r.months.map((m) => m.workouts));
  const slot = w / 12;
  ctx.textAlign = 'center';
  r.months.forEach((m, i) => {
    const bh = (m.workouts / max) * (h - 50);
    const bx = x + slot * i + slot * 0.18;
    if (bh > 0) {
      rounded(ctx, bx, y + h - 50 - bh, slot * 0.64, bh, Math.min(14, bh / 2));
      ctx.fillStyle = r.bestMonth?.month === m.month ? '#fff' : WHITE(0.45);
      ctx.fill();
    }
    ctx.fillStyle = WHITE(0.65);
    font(ctx, 24, 650);
    ctx.fillText(MONTH_INITIALS[i], x + slot * i + slot / 2, y + h - 10);
  });
  ctx.textAlign = 'left';
}

/**
 * @param {object} r resumen (monthReport o yearReport)
 * @param {{title:string, subtitle?:string}} text
 * @returns {Promise<Blob>}
 */
export async function reportImage(r, { title, subtitle }) {
  try { await document.fonts?.ready; } catch { /* */ }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#225df5');
  g.addColorStop(1, '#0a2f8f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = WHITE(0.06);
  ctx.beginPath(); ctx.arc(W - 60, 140, 260, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(80, H - 40, 200, 0, Math.PI * 2); ctx.fill();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = WHITE(0.75);
  font(ctx, 30, 800);
  ctx.fillText('G Y M L O G', 80, 112);
  ctx.fillStyle = '#fff';
  font(ctx, title.length > 16 ? 72 : 88, 800);
  ctx.fillText(title, 80, 218);
  if (subtitle) {
    ctx.fillStyle = WHITE(0.75);
    font(ctx, 34, 500);
    ctx.fillText(subtitle, 80, 272);
  }

  const t = r.totals;
  const d = r.delta || {};
  tile(ctx, 80, 320, 445, 230, 'Entrenamientos', String(t.workouts), d.workouts);
  tile(ctx, 555, 320, 445, 230, 'Tiempo', fmtDuration(t.ms), d.ms);
  tile(ctx, 80, 575, 445, 230, 'Volumen', fmtVolume(t.volume), d.volume);
  tile(ctx, 555, 575, 445, 230, 'Series', String(t.sets), d.sets);

  if (r.kind === 'month') calendar(ctx, r, 80, 880, 920);
  else monthBars(ctx, r, 80, 850, 920, 330);

  const c = r.constancy;
  const lines = [
    `${r.records.count} ${r.records.count === 1 ? 'récord' : 'récords'}${r.records.top[0] ? ` · mejor: ${r.records.top[0].name} +${fmtNum(r.records.top[0].gain * 100, 1)} %` : ''}`,
    r.kind === 'year'
      ? `${fmtNum(r.cars, 0)} autos levantados · racha más larga: ${r.longestStreak} semanas`
      : c.cadence
        ? `${c.trained} de ${c.weeks} semanas entrenadas · racha: ${c.cadence.streak} ${c.cadence.streak === 1 ? 'seguido' : 'seguidos'}`
        : `${c.trained} de ${c.weeks} semanas entrenadas · racha: ${c.streak} ${c.streak === 1 ? 'semana' : 'semanas'}`,
  ];
  ctx.fillStyle = '#fff';
  lines.forEach((line, i) => {
    font(ctx, 34, i === 0 ? 700 : 500);
    let text = line;
    while (ctx.measureText(text).width > W - 160 && text.length > 10) text = `${text.slice(0, -2)}…`;
    ctx.fillText(text, 80, 1232 + i * 52);
  });

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/png'));
}

/** Comparte la imagen (hoja del sistema) o, si el navegador no puede compartir archivos, la descarga. */
export async function shareOrDownload(blob, filename, title) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
