// Capturas de pantalla en tamaño teléfono (390×844) para revisar la interfaz.
//   BASE=http://localhost:3000 KEY=test OUT=/tmp/shots node scripts/shots.mjs train history profile 'exercise/Barbell_Squat'
// Opciones: LIGHT=1 (tema claro), FULL=1 (página completa), SCALE=2
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.OUT || '/tmp/shots';
mkdirSync(OUT, { recursive: true });
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['train', 'history', 'exercises', 'profile'];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.SCALE || 1), hasTouch: true, isMobile: true,
  serviceWorkers: 'block', colorScheme: process.env.LIGHT ? 'light' : 'dark',
});
await ctx.addInitScript(([key, light]) => {
  localStorage.setItem('appKey', key);
  if (light) localStorage.setItem('mantine-color-scheme-value', 'light');
}, [process.env.KEY || 'test', !!process.env.LIGHT]);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
for (const r of routes) {
  await page.goto(`${BASE}/#/${r}`);
  await page.waitForTimeout(1500);
  const file = `${OUT}/${r.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path: file, fullPage: !!process.env.FULL });
  console.log(file);
}
await browser.close();
