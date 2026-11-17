// Genera los PNG del ícono (PWA / iOS) a partir de public/icon.svg:  node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const b = await chromium.launch();
for (const [size, name, pad] of [[192, 'icon-192.png', 0], [512, 'icon-512.png', 0], [180, 'apple-touch-icon.png', 0]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  // fondo completo (sin esquinas transparentes) para maskable / iOS
  const full = svg.replace('rx="112"', name === 'icon-192.png' ? 'rx="112"' : 'rx="0"');
  await p.setContent(`<html><body style="margin:0;background:transparent">${full.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: `public/${name}`, omitBackground: true });
}
await b.close();
