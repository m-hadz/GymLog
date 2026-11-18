// Prueba end-to-end con Playwright contra el build de producción.
//   npm run test:e2e          (compila, levanta un servidor temporal y recorre la app)
// Variables: SHOTS=/ruta para guardar capturas (por defecto, una carpeta temporal).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const FIX = new URL('./fixtures/', import.meta.url).pathname;
const TMP = mkdtempSync(join(tmpdir(), 'gymlog-e2e-'));
const DATA_FILE = join(TMP, 'db.json');
const SHOTS = process.env.SHOTS || join(TMP, 'shots');
mkdirSync(SHOTS, { recursive: true });
const PORT = Number(process.env.E2E_PORT || 3377);
const BASE = `http://localhost:${PORT}`;
const timeout = 8000;

const server = spawn(process.execPath, ['dev-server.js', '--dist'], {
  env: { ...process.env, PORT: String(PORT), APP_PASSWORD: 'test', DATA_FILE, SUPABASE_URL: '' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => { if (String(d).includes('http://')) resolve(); });
  server.on('exit', (c) => reject(new Error(`servidor terminó (${c})`)));
});

const db = () => JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const count = (o) => Object.keys(o).length;
const errors = [];
const step = (msg) => console.log('ok', msg);

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true });
  ctx.setDefaultTimeout(timeout);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const catalog = readFileSync(join(FIX, 'catalog.json'), 'utf8');
  await ctx.route(/exercises\.json$/, (r) => r.fulfill({ body: catalog, contentType: 'application/json' }));
  await ctx.route(/\.jpg$/, (r) => r.abort());

  const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  const tid = (id) => page.getByTestId(id);
  const tab = (name) => tid(`tab-${name}`).click();
  const text = (t, exact = false) => page.getByText(t, { exact });
  const visible = (loc) => loc.first().waitFor({ state: 'visible' });
  const expectCount = async (loc, n) => {
    for (let i = 0; i < 40; i++) { if (await loc.count() === n) return; await page.waitForTimeout(100); }
    assert.equal(await loc.count(), n);
  };
  // Acepta todos los diálogos de confirmación que vayan apareciendo hasta ver `until`
  const confirmUntil = async (until) => {
    for (let i = 0; i < 40; i++) {
      if (await until.first().isVisible().catch(() => false)) return;
      const ok = tid('confirm-ok');
      if (await ok.first().isVisible().catch(() => false)) await ok.first().click();
      await page.waitForTimeout(150);
    }
    await visible(until);
  };
  const expectValue = async (loc, v) => {
    for (let i = 0; i < 40; i++) { if (await loc.inputValue() === v) return; await page.waitForTimeout(100); }
    assert.equal(await loc.inputValue(), v);
  };
  const cards = () => tid('exercise-card');
  const menuItem = (label) => page.getByRole('menuitem', { name: label });

  // 1. Login
  await page.goto(BASE);
  await visible(text('Ingresa la clave'));
  await tid('login-key').fill('malaclave');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await visible(text('Clave incorrecta'));
  await tid('login-key').fill('test');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await visible(page.getByRole('heading', { name: 'Entrenar' }));
  step('login');

  // 2. Importar CSV de Strong
  await tab('profile');
  await page.setInputFiles('input[accept*=csv]', join(FIX, 'strong.csv'));
  await confirmUntil(text('4 entrenamientos', true));
  await shot('profile');
  step('import');

  // 3. Historial y récords
  await tab('history');
  await expectCount(tid('workout-card'), 4);
  await shot('history');
  await tid('workout-card').nth(2).click(); // 6 oct: debería tener récords
  await visible(text('FBEOD'));
  await visible(tid('pr-badge'));
  const badges = await tid('pr-badge').count();
  assert.ok(badges >= 2, `esperaba récords el 6 oct, hay ${badges}`);
  await shot('detail');
  step(`history, récords: ${badges}`);

  // 4. Ficha de ejercicio: registros y gráficos
  await tab('exercises');
  await tid('exercise-search').fill('bicep curl (d');
  await tid('exercise-row').filter({ hasText: 'Bicep Curl (Dumbbell)' }).first().click();
  await page.getByRole('tab', { name: 'Registros' }).click();
  await visible(text('20 kg (×7)'));
  await shot('records');
  await page.getByRole('tab', { name: 'Gráficas' }).click();
  await expectCount(tid('chart-card'), 3);
  await shot('charts');
  await page.getByRole('tab', { name: 'Descripción' }).click();
  await visible(text('Imagen e instrucciones de: Dumbbell Bicep Curl'));
  step('ficha de ejercicio');

  // 5. Entrenamiento vacío con un ejercicio del catálogo + uno importado
  await tab('train');
  await tid('start-empty').click();
  await tid('add-exercises').click();
  const picker = tid('picker');
  await picker.getByTestId('exercise-search').fill('squat');
  await picker.getByTestId('exercise-row').filter({ hasText: 'Barbell Squat' }).first().click();
  await picker.getByTestId('exercise-search').fill('bicep curl (d');
  await picker.getByTestId('exercise-row').filter({ hasText: 'Bicep Curl (Dumbbell)' }).first().click();
  await tid('picker-add').click();
  await expectCount(cards(), 2);
  const sq = cards().nth(0);
  await sq.getByTestId('set-weight').first().fill('100');
  await sq.getByTestId('set-reps').first().fill('5');
  await sq.getByTestId('set-check').first().click();
  await visible(page.locator('#rest-bar'));
  // Curl: tiene "anterior" del historial → marcar sin escribir usa los valores previos
  const curl = cards().nth(1);
  assert.equal((await curl.getByTestId('set-prev').first().innerText()).trim(), '18 × 10');
  await curl.getByTestId('set-check').first().click();
  await expectValue(curl.getByTestId('set-weight').first(), '18');
  await expectCount(curl.locator('[data-testid=set-row][data-fb=eq]'), 1);
  // recargar a mitad de entrenamiento: no se pierde
  await page.reload();
  await expectCount(cards(), 2);
  await expectCount(page.locator('[data-testid=set-row][data-done=true]'), 2);
  await shot('active');
  await tid('finish-workout').click(); // confirma descartar la 2a serie del curl
  await confirmUntil(text('¡Entrenamiento guardado!'));
  await shot('done');
  step('entrenamiento en curso');

  // 6. Guardar como plantilla, activar RPE y entrenar desde la plantilla
  await page.getByRole('button', { name: 'Guardar como plantilla' }).or(menuItem('Guardar como plantilla')).first().click()
    .catch(async () => { await tid('workout-menu').click(); await menuItem('Guardar como plantilla').click(); });
  await visible(tid('prompt-input')); // deja el nombre por defecto (= nombre del entrenamiento)
  await tid('prompt-ok').click();
  await expectCount(tid('template-card'), 1);
  await tab('profile');
  const rpe = page.getByRole('switch', { name: 'Registrar RPE por serie' });
  await rpe.focus();
  await page.keyboard.press('Space');
  assert.ok(await rpe.isChecked(), 'no se activó el RPE');
  await tab('train');
  await tid('template-start').first().click();
  await expectCount(cards(), 2);
  // calculadora de discos: 100 kg con barra de 20 → 25 + 15 por lado
  await cards().nth(0).getByTestId('exercise-menu').click();
  await menuItem('Discos').click();
  await visible(tid('plates-sheet').getByText('Por lado'));
  assert.match(await tid('plates-sheet').innerText(), /Por lado:\s*25 \+ 15 kg/);
  await page.keyboard.press('Escape');
  await tid('plates-sheet').waitFor({ state: 'detached' });
  await cards().nth(0).getByTestId('set-rpe').first().selectOption('8');
  await cards().nth(0).getByTestId('set-check').first().click(); // usa el objetivo 100×5
  await expectCount(cards().nth(0).locator('[data-testid=set-row][data-fb=eq]'), 1);
  await cards().nth(0).getByTestId('add-set').click();
  await cards().nth(0).getByTestId('set-weight').nth(1).fill('110');
  await cards().nth(0).getByTestId('set-check').nth(1).click();
  await visible(text('Barbell Squat'));
  await expectCount(cards().nth(0).locator('[data-testid=set-row][data-fb=pr]'), 1);
  // quitar ejercicio y deshacer
  await cards().nth(1).getByTestId('exercise-menu').click();
  await menuItem('Quitar ejercicio').click();
  await expectCount(cards(), 1);
  await tid('undo').click();
  await expectCount(cards(), 2);
  await tid('finish-workout').click();
  await confirmUntil(text('¡Entrenamiento guardado!'));
  await visible(text('Contra la última vez'));
  assert.match(await tid('summary-stats').innerText(), /vs anterior/);
  await visible(text('🏆 3 récords')); // 1RM + PESO + VOL.
  await shot('summary');
  step('plantilla: feedback, récord, discos, RPE, deshacer, resumen');

  // 7. Editar plantilla: agregar serie y guardar
  await tab('train');
  await tid('template-menu').first().click();
  await menuItem('Editar').click();
  await cards().nth(0).getByTestId('add-set').click();
  await tid('editor-save').click();
  await visible(tid('template-card'));
  const tpl = Object.values(db().templates)[0];
  assert.equal(tpl.exercises[0].sets.length, 3, 'la plantilla debería tener 3 series de sentadilla');
  step('editar plantilla');

  // 8. Editar un entrenamiento pasado
  await tab('history');
  await tid('workout-card').first().click();
  await page.getByRole('button', { name: 'Editar' }).or(menuItem('Editar')).first().click()
    .catch(async () => { await tid('workout-menu').click(); await menuItem('Editar').click(); });
  await cards().nth(0).getByTestId('set-reps').first().fill('6');
  await tid('editor-save').click();
  await visible(text('100 kg × 6'));
  step('editar entrenamiento pasado');

  // 9. Persistencia en el servidor
  await page.waitForTimeout(500);
  assert.equal(count(db().workouts), 6);
  assert.equal(count(db().templates), 1);
  step('persistencia en servidor');

  // 10. Calendario, exportación y respaldo
  await tab('history');
  await tid('calendar-link').click();
  await visible(page.getByRole('heading', { name: 'Calendario' }).or(text('Calendario', true)));
  await expectCount(page.locator('[data-testid=cal-day][data-has=true]'), 5);
  await shot('calendar');
  await tab('profile');
  let dl = page.waitForEvent('download');
  await text('Exportar CSV').click();
  const csv = readFileSync(await (await dl).path(), 'utf8');
  assert.ok(csv.startsWith('Date,Workout Name') && csv.includes('Bicep Curl (Dumbbell)'));
  assert.match(csv, /Barbell Squat,1,100,6,,,,,8/, 'falta el RPE en el CSV');
  dl = page.waitForEvent('download');
  await text('Descargar respaldo completo').click();
  const backup = await (await dl).path();
  await page.setInputFiles('input[accept*=json]', backup);
  await confirmUntil(text('Respaldo restaurado'));
  await page.waitForTimeout(500);
  assert.equal(count(db().workouts), 6);
  step('calendario, exportar y respaldo sin duplicar');

  // 11. Sin conexión: guardar y sincronizar al volver
  await ctx.route('**/api/**', (r) => r.abort());
  await tab('train');
  await tid('start-empty').click();
  await tid('add-exercises').click();
  await tid('picker').getByTestId('exercise-search').fill('shrug');
  await tid('picker').getByTestId('exercise-row').filter({ hasText: 'Barbell Shrug' }).first().click();
  await tid('picker-add').click();
  await tid('set-weight').first().fill('60');
  await tid('set-reps').first().fill('10');
  await tid('set-check').first().click();
  await tid('finish-workout').click();
  await confirmUntil(text('¡Entrenamiento guardado!'));
  await tab('profile');
  await visible(text('cambio(s) sin sincronizar'));
  await ctx.unroute('**/api/**');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await page.waitForTimeout(800);
  assert.equal(count(db().workouts), 7);
  step('sincronización tras estar sin conexión');

  // 12. Strong en libras
  await page.setInputFiles('input[accept*=csv]', join(FIX, 'strong-lbs.csv'));
  await confirmUntil(text('Importados'));
  await page.waitForTimeout(500);
  const lbs = Object.values(db().workouts).find((w) => w.name === 'Lbs test');
  assert.equal(lbs.exercises[0].sets[0].weight, 45.4);
  step('Strong en libras → kg');
  await ctx.close();

  // 13. Service worker: la app abre sin conexión
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  ctx2.setDefaultTimeout(timeout);
  await ctx2.route(/exercises\.json$/, (r) => r.fulfill({ body: catalog, contentType: 'application/json' }));
  const p2 = await ctx2.newPage();
  await p2.goto(BASE);
  await p2.getByTestId('login-key').fill('test');
  await p2.getByRole('button', { name: 'Entrar' }).click();
  await p2.getByRole('heading', { name: 'Entrenar' }).waitFor();
  await p2.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  await p2.reload();
  await p2.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p2.waitForTimeout(500);
  await ctx2.setOffline(true);
  await p2.reload();
  await p2.getByRole('heading', { name: 'Entrenar' }).waitFor();
  await p2.getByTestId('tab-history').click();
  await p2.getByTestId('workout-card').first().waitFor();
  step(`sin conexión: la app abre con ${await p2.getByTestId('workout-card').count()} entrenamientos`);
  await ctx2.close();
} catch (e) {
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) await p.screenshot({ path: join(SHOTS, 'FALLO.png'), fullPage: true }).catch(() => {});
  console.log(`Captura del fallo: ${join(SHOTS, 'FALLO.png')}`);
  throw e;
} finally {
  await browser.close();
  server.kill();
}

const real = errors.filter((e) => !/ERR_FAILED|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e));
if (real.length) {
  console.log('ERRORES:\n' + real.join('\n'));
  process.exit(1);
}
console.log(`TODO OK (capturas en ${SHOTS})`);
