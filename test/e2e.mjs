// Prueba end-to-end con Playwright contra el build de producción.
//   npm run test:e2e          (compila, levanta un servidor temporal y recorre la app)
// Variables: SHOTS=/ruta para guardar capturas (por defecto, una carpeta temporal).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  env: {
    ...process.env, PORT: String(PORT), APP_PASSWORD: 'test', DATA_FILE, SUPABASE_URL: '', YOUTUBE_CHANNEL_ID: '',
    // claves VAPID solo para pruebas (las mismas de test/push.test.js)
    VAPID_PUBLIC_KEY: 'BOWLMMux9ZgtzXCJuCOvWDafG5nVlParQFnayMexvfusqBb1OEE2g0PnLlxgXWSpWCdNuM7daOVNwRbNhbKX9dg',
    VAPID_PRIVATE_KEY: 'ioLc8hP9ehp5yxsjhbrd4vq9iDWlvRKzPSaTDxn3dKE',
  },
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

  // Los pasos 5 y 6 comprueban la app sin el objetivo para superar (regresión): se apaga aquí
  // y se prueba en el paso 6b.
  await tab('profile');
  const suggestSwitch = page.getByRole('switch', { name: 'Mostrar objetivo para superar' });
  await suggestSwitch.focus();
  await page.keyboard.press('Space');
  assert.ok(!await suggestSwitch.isChecked(), 'no se desactivó el objetivo para superar');
  await tab('train');

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
  await expectCount(tid('goal-line'), 0); // desactivado: sin objetivo
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
  await visible(tid('workout-muscles').getByTestId('workout-muscle').first()); // mini mapa (feature 08)
  await shot('summary');
  step('plantilla: feedback, récord, discos, RPE, deshacer, resumen');

  // 6b. Objetivo para superar (feature 01). La última sentadilla fue 110 × 5 (barra 20, discos
  // estándar): mismo peso 110 × 6, o subir a 112,5 × 5.
  await tab('profile');
  await suggestSwitch.focus();
  await page.keyboard.press('Space');
  assert.ok(await suggestSwitch.isChecked());
  await tab('train');
  await tid('template-start').first().click();
  const sq2 = cards().filter({ hasText: 'Barbell Squat' }).first();
  await visible(sq2.getByTestId('goal-line'));
  assert.match(await sq2.getByTestId('goal-line').innerText(), /Para superar:\s*110 × 6 · o 112,5 × 5/);
  assert.equal(await sq2.getByTestId('set-weight').first().getAttribute('placeholder'), '110');
  assert.equal(await sq2.getByTestId('set-reps').first().getAttribute('placeholder'), '6');
  // la otra opción pasa a ser la principal
  await sq2.getByTestId('goal-alt').click();
  assert.equal((await sq2.getByTestId('goal-main').innerText()).trim(), '112,5 × 5');
  assert.equal(await sq2.getByTestId('set-weight').first().getAttribute('placeholder'), '112,5');
  await sq2.getByTestId('goal-alt').click();
  // ✓ en vacío guarda la principal, y supera la vez anterior
  await sq2.getByTestId('set-check').first().click();
  await expectValue(sq2.getByTestId('set-weight').first(), '110');
  await expectValue(sq2.getByTestId('set-reps').first(), '6');
  await expectCount(sq2.locator('[data-testid=set-row][data-fb=pr]'), 1);
  // tope de la máquina en 110: solo se proponen más reps, y la preferencia llega al servidor
  await sq2.getByTestId('exercise-menu').click();
  await menuItem('Ajustes del ejercicio').click();
  await tid('prefs-max').fill('110');
  await tid('prefs-save').click();
  await expectCount(sq2.getByTestId('goal-alt'), 0);
  assert.match(await sq2.getByTestId('goal-line').innerText(), /Para superar:\s*110 × 6$/);
  await page.waitForTimeout(500);
  const sqPrefs = Object.values(db().exercise_prefs || {});
  assert.equal(sqPrefs.length, 1);
  assert.equal(sqPrefs[0].max_load, 110);
  await shot('06b-objetivo');
  await tid('cancel-workout').click();
  await confirmUntil(page.getByRole('heading', { name: 'Entrenar' }));
  step('objetivo para superar: línea, alternativa, ✓, tope de máquina');

  // 6c. Calentamiento (feature 02): peso de trabajo = objetivo 110 kg → 20×10, 45×5, 65×5, 87,5×3
  await tid('template-start').first().click();
  const sq3 = cards().filter({ hasText: 'Barbell Squat' }).first();
  await visible(sq3.getByTestId('warmup-line'));
  assert.match(await sq3.getByTestId('warmup-line').innerText(), /Calentamiento:\s*20 × 10 · 45 × 5 · 65 × 5 · 87,5 × 3/);
  await sq3.getByTestId('warmup-add').click();
  await expectCount(sq3.locator('[data-testid=set-type][data-type=W]'), 4);
  await expectCount(sq3.getByTestId('warmup-line'), 0);
  // "Anterior" se alinea por tipo: los calentamientos no corren la serie efectiva
  assert.equal((await sq3.getByTestId('set-prev').nth(0).innerText()).trim(), '—');
  assert.equal((await sq3.getByTestId('set-prev').nth(4).innerText()).trim(), '100 × 5');
  assert.equal(await sq3.getByTestId('set-reps').nth(4).getAttribute('placeholder'), '6');
  // cambiar el peso de trabajo ofrece recalcular
  await sq3.getByTestId('set-weight').nth(4).fill('100');
  await sq3.getByTestId('warmup-recalc').click();
  await expectValue(sq3.getByTestId('set-weight').nth(1), '40');
  await expectValue(sq3.getByTestId('set-weight').nth(3), '80');
  await sq3.getByTestId('set-check').first().click();
  await visible(page.locator('#rest-bar'));
  // el menú no duplica: pide confirmación y reemplaza solo las pendientes
  await sq3.getByTestId('exercise-menu').click();
  await menuItem('Agregar calentamiento').click();
  await tid('confirm-ok').click();
  await expectCount(sq3.locator('[data-testid=set-type][data-type=W]'), 4);
  await shot('06c-calentamiento');
  await tid('cancel-workout').click();
  await confirmUntil(page.getByRole('heading', { name: 'Entrenar' }));
  step('calentamiento: línea, agregar, alinear anterior, recalcular, sin duplicar');

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

  // 10b. Mapa del cuerpo: estímulo directo por músculo (sentadillas recientes → cuádriceps con series)
  await tab('profile');
  await visible(tid('body-map'));
  await expectCount(tid('muscle-row'), 15);
  const quad = tid('muscle-row').filter({ hasText: 'Cuádriceps' });
  assert.notEqual(await quad.getAttribute('data-status'), null);
  assert.match(await quad.innerText(), /\/sem/);
  await tid('muscle-row').filter({ hasText: 'Glúteos' }).click();
  await visible(tid('muscle-detail').getByText('Sin estímulo directo'));
  await tid('muscle-card').screenshot({ path: join(SHOTS, '10b-musculos.png') });
  await page.keyboard.press('Escape');
  await tid('muscle-detail').waitFor({ state: 'detached' });
  step('mapa del cuerpo y estímulo directo por músculo');

  // 10b2. Regiones y grupo por ejercicio (feature 08): asignar "Vastos" a la sentadilla en 2 toques
  await quad.click();
  await visible(tid('muscle-regions'));
  const assign = tid('region-assign').first();
  const squatName = (await assign.innerText()).split('\n')[0];
  await assign.click();
  await tid('assign-region-cuadriceps.vastos').click();
  await page.keyboard.press('Escape');
  await tid('muscle-assign').waitFor({ state: 'detached' });
  const vastos = tid('region-row').filter({ hasText: 'Vastos' });
  assert.match(await vastos.innerText(), /\/sem/);
  assert.match(await tid('region-row').filter({ hasText: 'Recto femoral' }).innerText(), /—/);
  await shot('10b2-regiones');
  await page.keyboard.press('Escape');
  await tid('muscle-detail').waitFor({ state: 'detached' });
  // Cambiar el grupo: sus series pasan a Glúteos; la región de cuádriceps se descarta
  const glutes = () => tid('muscle-row').filter({ hasText: 'Glúteos' });
  assert.match(await glutes().innerText(), /0\/sem/);
  await tid('muscle-row').filter({ hasText: 'Cuádriceps' }).click();
  await tid('muscle-detail').getByText(squatName, { exact: true }).click();
  await tid('assign-group-Glúteos').click();
  await page.goBack();
  await tab('profile');
  assert.doesNotMatch(await glutes().innerText(), /^Glúteos\s*0\/sem/);
  step('regiones: asignar en 2 toques, series por región, cambiar el grupo');

  // 10c. Peso corporal (feature 03): dos registros, tarjeta, mismo día reemplaza, gráfico y borrar
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 864e5));
  await tid('body-add').click();
  await tid('body-weight').fill('80,4');
  await tid('body-date').fill(yesterday);
  await tid('body-save').click();
  await tid('body-form').waitFor({ state: 'detached' });
  await tid('body-add').click();
  await expectValue(tid('body-weight'), '80,4'); // prellenado con el último
  await tid('body-weight').fill('80,1');
  await tid('body-save').click();
  await tid('body-form').waitFor({ state: 'detached' });
  await visible(tid('body-last').getByText('Último: 80,1 kg · hoy'));
  assert.match(await tid('body-trend').innerText(), /^80,\d kg$/);
  // otro registro el mismo día pide confirmación y reemplaza
  await tid('body-add').click();
  await tid('body-weight').fill('79,9');
  await tid('body-save').click();
  await visible(text('Ya hay un registro ese día'));
  await tid('confirm-ok').click();
  await tid('body-form').waitFor({ state: 'detached' });
  await page.waitForTimeout(500);
  assert.equal(db().body_metrics[today].weight, 79.9);
  assert.equal(db().body_metrics[yesterday].weight, 80.4);
  // pantalla de peso: gráfico, lista y borrar
  await tid('body-open').click();
  await visible(tid('body-chart'));
  await expectCount(tid('body-entry'), 2);
  await shot('10c-peso');
  await tid('body-entry').last().click();
  await tid('body-delete').click();
  await tid('confirm-ok').click();
  await expectCount(tid('body-entry'), 1);
  await page.waitForTimeout(500);
  assert.deepEqual(Object.keys(db().body_metrics), [today]);
  dl = page.waitForEvent('download');
  await tid('body-csv').click();
  assert.match(readFileSync(await (await dl).path(), 'utf8'), new RegExp(`^Fecha,Peso \\(kg\\),Tendencia \\(kg\\),Grasa \\(%\\),Notas\n${today},79\\.9,79\\.9,,`));
  step('peso corporal: registrar, tendencia, reemplazar el mismo día, gráfico, borrar, CSV');

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

  // 12b. Tipos de ejercicio (feature 04): dominada con lastre, plancha por tiempo y nota fija
  await tab('train');
  await tid('start-empty').click();
  await tid('add-exercises').click();
  await tid('picker').getByTestId('exercise-search').fill('pullups');
  await tid('picker').getByTestId('exercise-row').filter({ hasText: 'Pullups' }).first().click();
  await tid('picker').getByTestId('exercise-search').fill('plank');
  await tid('picker').getByTestId('exercise-row').filter({ hasText: 'Plank' }).first().click();
  await tid('picker-add').click();
  await expectCount(cards(), 2);
  const pull = cards().nth(0);
  const plank = cards().nth(1);
  // Peso corporal por defecto: sin columna de peso
  await expectCount(pull.getByTestId('set-weight'), 0);
  // Cambiar a "con lastre": columna "+kg"
  await pull.getByTestId('exercise-menu').click();
  await tid('prefs-open').click();
  await tid('prefs-kind-lastre').click();
  await tid('prefs-save').click();
  await visible(pull.getByText('+kg', { exact: true }));
  await pull.getByTestId('set-weight').first().fill('10');
  await pull.getByTestId('set-reps').first().fill('8');
  await pull.getByTestId('set-check').first().click();
  // Nota fija con link
  await pull.getByTestId('exercise-menu').click();
  await tid('fixed-note-menu').click();
  await tid('fixed-note-input').fill('Agarre ancho https://example.com/tecnica');
  await tid('fixed-note-save').click();
  await visible(pull.getByTestId('fixed-note'));
  assert.equal(await pull.getByTestId('fixed-note').locator('a').getAttribute('target'), '_blank');
  // Plancha por tiempo: cuenta regresiva de 2 s que sobrevive a recargar
  await plank.getByTestId('exercise-menu').click();
  await tid('prefs-open').click();
  await tid('prefs-kind-tiempo').click();
  await tid('prefs-save').click();
  await visible(plank.getByTestId('set-time'));
  await plank.getByTestId('set-time').first().fill('0:02');
  await plank.getByTestId('set-timer').first().click();
  await visible(plank.getByTestId('set-timer-clock'));
  await page.reload();
  await expectCount(cards(), 2);
  await visible(cards().nth(1).getByTestId('set-timer-clock'));
  await page.waitForTimeout(2300);
  assert.equal(await cards().nth(1).getByTestId('set-timer-clock').getAttribute('data-running'), 'done');
  await cards().nth(1).getByTestId('set-check').first().click();
  // Segunda serie sin objetivo: cuenta hacia adelante y ■ deja el tiempo escrito
  await cards().nth(1).getByTestId('add-set').click();
  await cards().nth(1).getByTestId('set-time').nth(1).fill('');
  await cards().nth(1).getByTestId('set-timer').nth(1).click();
  await page.waitForTimeout(1300);
  await cards().nth(1).getByTestId('set-timer').nth(1).click();
  await expectValue(cards().nth(1).getByTestId('set-time').nth(1), '0:01');
  await cards().nth(1).getByTestId('set-check').nth(1).click();
  await shot('12b-tipos');
  await tid('finish-workout').click();
  await confirmUntil(text('¡Entrenamiento guardado!'));
  // Volumen con peso corporal: (79,9 + 10) × 8 = 719 kg; la plancha no suma
  await visible(tid('summary-stats').getByText('719 kg'));
  await visible(text('PC + 10 kg × 8'));
  await visible(text('0:02', true));
  await page.waitForTimeout(500);
  const typed = Object.values(db().workouts).find((w) => w.exercises.some((e) => e.exercise_id === 'Plank'));
  assert.equal(typed.exercises[0].sets[0].weight, 10); // se guarda lo anotado
  assert.deepEqual(typed.exercises[1].sets.map((x) => x.seconds), [2, 1]);
  assert.equal(db().exercise_prefs.Pullups.kind, 'lastre');
  assert.equal(db().exercise_prefs.Pullups.note, 'Agarre ancho https://example.com/tecnica');
  // La nota fija aparece al empezar otro entrenamiento con el ejercicio
  await tid('workout-menu').or(page.getByRole('button', { name: 'Más opciones' })).first().click();
  await menuItem('Repetir entrenamiento').click();
  await visible(cards().first().getByTestId('fixed-note'));
  await tid('cancel-workout').click();
  await tid('confirm-ok').click();
  step('tipos: lastre (volumen con PC), plancha cronometrada, nota fija con link');

  // 12c. Mancuernas por mano (feature 05): pregunta única, "kg c/u" y volumen ×2
  await tab('train');
  await tid('start-empty').click();
  await tid('add-exercises').click();
  await tid('picker').getByTestId('exercise-search').fill('bicep curl (d');
  await tid('picker').getByTestId('exercise-row').filter({ hasText: 'Bicep Curl (Dumbbell)' }).first().click();
  await tid('picker-add').click();
  const db1 = cards().first();
  await visible(db1.getByTestId('dumbbell-ask'));
  assert.equal((await db1.getByTestId('weight-head').innerText()).toLowerCase(), 'kg');
  await shot('12c-pregunta');
  await db1.getByTestId('dumbbell-all').click();
  await db1.getByTestId('dumbbell-one').click();
  await expectCount(db1.getByTestId('dumbbell-ask'), 0);
  assert.equal((await db1.getByTestId('weight-head').innerText()).toLowerCase(), 'kg c/u');
  await db1.getByTestId('set-weight').first().fill('12');
  await db1.getByTestId('set-reps').first().fill('10');
  await db1.getByTestId('set-check').first().click();
  await shot('12c-mancuerna');
  await tid('finish-workout').click();
  await confirmUntil(text('¡Entrenamiento guardado!'));
  await visible(tid('summary-stats').getByText('240 kg')); // 2 × 12 kg × 10
  await page.waitForTimeout(500);
  const curlRow = Object.values(db().exercises).find((e) => e.name === 'Bicep Curl (Dumbbell)');
  const curlPrefs = db().exercise_prefs[curlRow.id];
  assert.equal(curlPrefs.load_mode, 'por_mano');
  // Cambiar el modo avisa cuántas sesiones se recalculan
  await page.locator('a[href^="#/exercise/"]').filter({ hasText: 'Bicep Curl (Dumbbell)' }).first().click();
  await visible(tid('mode-badge'));
  await page.getByRole('tab', { name: 'Descripción' }).click();
  await tid('prefs-mode-total').click();
  await tid('prefs-save').click();
  await visible(text(/Esto cambia el volumen de tus \d+ sesiones anteriores \(se reduce a la mitad\)/));
  await tid('confirm-ok').click();
  await expectCount(tid('mode-badge'), 0);
  await page.waitForTimeout(500);
  assert.equal(db().exercise_prefs[curlPrefs.id].load_mode, 'total');
  step('mancuernas: pregunta única, kg c/u, volumen ×2, aviso al cambiar el modo');

  // 12d. Estancamiento (feature 06): 12 sesiones planas de Chest Press 63 × 7 en los últimos 24 días
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 18:00:00`;
  const rows = ['Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Weight Unit,Reps,Distance,Seconds,Notes,Workout Notes,RPE'];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.now() - (2 + 2 * i) * 864e5);
    rows.push(`${stamp(d)},"Pecho plano",40m,"Chest Press (Machine)",1,57,kg,9,0,0,"","",`);
    rows.push(`${stamp(d)},"Pecho plano",40m,"Chest Press (Machine)",2,63,kg,7,0,0,"","",`);
  }
  const stallCsv = join(TMP, 'stall.csv');
  writeFileSync(stallCsv, rows.join('\n'));
  await tab('profile');
  await page.setInputFiles('input[accept*=csv]', stallCsv);
  await confirmUntil(text('Importados'));
  await visible(tid('stalled-row').filter({ hasText: 'Chest Press (Machine)' }));
  // En el entrenamiento: etiqueta, reinicio como opción principal (63 × 7 con pesos 57 y 63 → 57 × 10)
  await tab('train');
  await tid('start-empty').click();
  await tid('add-exercises').click();
  await tid('picker').getByTestId('exercise-search').fill('chest press (m');
  await tid('picker').getByTestId('exercise-row').filter({ hasText: 'Chest Press (Machine)' }).first().click();
  await tid('picker-add').click();
  const cp = cards().first();
  await visible(cp.getByTestId('stall-tag'));
  assert.equal((await cp.getByTestId('goal-main').innerText()).trim(), '57 × 10');
  assert.equal(await cp.getByTestId('goal-line').getAttribute('data-source'), 'reinicio');
  await visible(cp.getByTestId('goal-alt'));
  await cp.getByTestId('stall-tag').click();
  await visible(tid('stall-sheet').getByText('Reinicio: 57 × 10.'));
  await shot('12d-estancado');
  await tid('stall-use-reset').click();
  await cp.getByTestId('set-check').first().click(); // el ✓ guarda el reinicio
  await expectValue(cp.getByTestId('set-weight').first(), '57');
  await expectValue(cp.getByTestId('set-reps').first(), '10');
  await expectCount(cp.locator('[data-testid=set-row][data-fb]'), 1);
  // Ignorar por 7 sesiones: la etiqueta desaparece y se guarda en el servidor
  await cp.getByTestId('stall-tag').click();
  await tid('stall-snooze').click();
  await expectCount(cp.getByTestId('stall-tag'), 0);
  await page.waitForTimeout(500);
  assert.ok(Object.values(db().exercise_prefs).some((p) => p.stall_snooze_until));
  await tid('cancel-workout').click();
  await tid('confirm-ok').click();
  step('estancamiento: tarjeta del perfil, etiqueta, reinicio 57 × 10 con ✓, ignorar por 7 sesiones');

  // 12f. Constancia (feature 09): meta día por medio, misma racha en Entrenar / Calendario / Perfil,
  // registrar un entrenamiento pasado desde el calendario, pausa y sincronización
  const expectUntil = async (fn, what) => {
    for (let i = 0; i < 40; i++) { if (fn()) return; await page.waitForTimeout(150); }
    throw new Error(`No se cumplió: ${what}`);
  };
  await tab('profile');
  await tid('goal-row').click();
  await tid('goal-mode').getByText('Cada N días').click();
  await visible(tid('goal-preview').getByText(/tu racha sería de/));
  await tid('goal-save').click();
  await tid('goal-sheet').waitFor({ state: 'detached' });
  await expectUntil(() => db().user_settings?.me?.data?.goal?.mode === 'cadencia', 'meta sincronizada');
  const streakOf = async (id) => (await tid(id).innerText()).match(/\d+/)[0];
  const profileStreak = await streakOf('profile-streak');
  await visible(tid('streak-card'));
  await tab('train');
  await visible(tid('constancy-due'));
  await tid('constancy-card').screenshot({ path: join(SHOTS, '12f-entrenar.png') });
  assert.equal(await streakOf('train-streak'), profileStreak);
  await tab('history');
  await tid('calendar-link').click();
  assert.equal(await streakOf('calendar-streak'), profileStreak);
  const before = count(db().workouts);
  const empty = page.locator('[data-testid=cal-day][data-past-empty]').first();
  await empty.click();
  await tid('register-empty').click();
  await visible(text('Registrar entrenamiento'));
  await tid('add-exercises').click();
  await tid('picker').getByTestId('exercise-search').fill('squat');
  await tid('picker').getByTestId('exercise-row').filter({ hasText: 'Barbell Squat' }).first().click();
  await tid('picker-add').click();
  await cards().nth(0).getByTestId('set-weight').first().fill('50');
  await cards().nth(0).getByTestId('set-reps').first().fill('8');
  await tid('editor-save').click();
  await visible(tid('celebrate-streak'));
  await expectUntil(() => count(db().workouts) === before + 1, 'entrenamiento pasado guardado');
  const saved = Object.values(db().workouts).sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  assert.ok(saved.some((w) => new Date(w.started_at).getHours() === 18 && w.exercises[0]?.sets[0]?.reps === 8));
  await shot('12f-constancia');
  // Pausa: se agrega y se sincroniza
  await tab('profile');
  await tid('streak-card').screenshot({ path: join(SHOTS, '12f-perfil.png') });
  await tid('goal-open').click();
  await tid('pause-add').click();
  await visible(tid('pause-row'));
  await expectUntil(() => db().user_settings?.me?.data?.pauses?.length === 1, 'pausa sincronizada');
  await page.keyboard.press('Escape');
  await tid('goal-sheet').waitFor({ state: 'detached' });
  step('constancia: meta día por medio, misma racha en 3 lugares, registrar día pasado, pausa');

  // 12e. Resumen mensual y anual (feature 07)
  await tab('history');
  await tid('month-report').last().click(); // el mes más antiguo del historial
  for (const id of ['report-totals', 'report-calendar', 'report-constancy', 'report-records', 'report-top', 'report-muscles']) {
    await visible(tid(id));
  }
  await visible(tid('report-totals').getByText('Primer periodo registrado: sin comparación.'));
  await tid('report-next').click();
  await visible(tid('report-totals').getByText(/^Contra el mes anterior/));
  await shot('12e-resumen');
  await tid('report-share').click();
  await visible(tid('share-preview'));
  const [shareDl] = await Promise.all([page.waitForEvent('download'), tid('share-download').click()]);
  if (!/^gymlog-resumen-\d{4}-\d{2}\.png$/.test(shareDl.suggestedFilename())) throw new Error(`nombre de la imagen: ${shareDl.suggestedFilename()}`);
  await shot('12e-compartir');
  await page.keyboard.press('Escape');
  await tid('share-sheet').waitFor({ state: 'hidden' });
  await tid('report-kind').getByText('Año').click();
  await visible(tid('report-cars'));
  await visible(tid('report-new'));
  await tab('profile');
  await visible(tid('report-entry'));
  step('resumen: mes con secciones, primer mes, siguiente mes con comparación, compartir imagen, año');

  // 12g. Reemplazar un ejercicio (feature 10): press de banca con 2 series hechas → Chest Press
  // (mismo grupo, ya hecho: sugerido con tu última serie); las hechas se quedan, las pendientes pasan
  await tab('train');
  await tid('start-empty').click();
  await tid('add-exercises').click();
  await tid('picker').getByTestId('exercise-search').fill('bench press (b');
  await tid('picker').getByTestId('exercise-row').filter({ hasText: 'Bench Press (Barbell)' }).first().click();
  await tid('picker-add').click();
  const bp = cards().first();
  await visible(bp.getByTestId('set-row'));
  while (await bp.getByTestId('set-row').count() < 4) await bp.getByTestId('add-set').click();
  const nSets = await bp.getByTestId('set-row').count();
  for (const i of [0, 1]) {
    await bp.getByTestId('set-weight').nth(i).fill('60');
    await bp.getByTestId('set-reps').nth(i).fill('8');
    await bp.getByTestId('set-check').nth(i).click();
  }
  const openReplace = async (card) => {
    await card.getByTestId('exercise-menu').click();
    await tid('exercise-replace').click();
    await visible(tid('replace-sheet').getByTestId('replace-current'));
  };
  await openReplace(bp);
  const firstSug = tid('replace-suggestion').first();
  await visible(firstSug.getByText('Chest Press (Machine)'));
  assert.equal((await firstSug.getByTestId('replace-last').innerText()).trim(), 'La última vez: 63 × 7');
  await shot('12g-reemplazar');
  await firstSug.getByTestId('replace-pick').click();
  await expectCount(cards(), 2);
  await expectCount(cards().nth(0).getByTestId('set-row'), 2);
  await expectCount(cards().nth(0).locator('[data-testid=set-row][data-done=true]'), 2);
  await visible(cards().nth(1).getByText('Chest Press (Machine)'));
  await expectCount(cards().nth(1).getByTestId('set-row'), nSets - 2);
  await expectCount(cards().nth(1).locator('[data-testid=set-row][data-done=true]'), 0);
  assert.equal(await cards().nth(1).getByTestId('set-weight').first().inputValue(), '');
  assert.equal((await cards().nth(1).getByTestId('set-prev').first().innerText()).trim(), '57 × 9'); // "Anterior" del nuevo
  // Deshacer: vuelve el original con todas sus series
  await tid('undo').click();
  await expectCount(cards(), 1);
  await expectCount(cards().nth(0).getByTestId('set-row'), nSets);
  await expectCount(cards().nth(0).locator('[data-testid=set-row][data-done=true]'), 2);
  // De nuevo, y terminar: cada ejercicio guarda sus propias series
  await openReplace(cards().first());
  await tid('replace-suggestion').first().getByTestId('replace-pick').click();
  await expectCount(cards(), 2);
  await cards().nth(1).getByTestId('set-check').first().click(); // usa el objetivo del Chest Press
  await tid('finish-workout').click();
  await confirmUntil(text('¡Entrenamiento guardado!'));
  await page.waitForTimeout(500);
  const replaced = Object.values(db().workouts).sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0];
  assert.deepEqual(replaced.exercises.map((e) => [e.name, e.sets.length]), [['Bench Press (Barbell)', 2], ['Chest Press (Machine)', 1]]);
  assert.ok(replaced.exercises[1].sets[0].weight >= 57, 'el Chest Press debe guardar su propio peso'); // objetivo para superar 57 × 9 / 63 × 7

  // Desde la plantilla, "También en la plantilla" (eligiendo con el buscador de la hoja): mismas
  // series y reps objetivo, sin peso
  await tab('train');
  await tid('template-start').first().click();
  const sqCard = cards().filter({ hasText: 'Barbell Squat' }).first();
  await visible(sqCard);
  const tplSquat = Object.values(db().templates)[0].exercises.find((e) => e.exercise_id === 'Barbell_Squat');
  await openReplace(sqCard);
  await tid('replace-scope').getByText('También en la plantilla').click();
  await tid('replace-sheet').getByTestId('exercise-search').fill('reverse barbell');
  await tid('replace-sheet').getByTestId('exercise-row').filter({ hasText: 'Reverse Barbell Curl' }).first().click();
  await visible(cards().filter({ hasText: 'Reverse Barbell Curl' }).first());
  await page.waitForTimeout(500);
  const tplAfter = Object.values(db().templates)[0].exercises.find((e) => e.exercise_id === 'Reverse_Barbell_Curl');
  assert.ok(tplAfter, 'la plantilla no cambió');
  assert.ok(!Object.values(db().templates)[0].exercises.some((e) => e.exercise_id === 'Barbell_Squat'));
  assert.deepEqual(tplAfter.sets.map((s) => [s.type, s.weight, s.reps]), tplSquat.sets.map((s) => [s.type || 'N', null, s.reps]));
  await tid('cancel-workout').click();
  await tid('confirm-ok').click();

  // "No sugerir más": desaparece, se guarda en el servidor y se revierte desde la ficha
  await tid('start-empty').click();
  await tid('add-exercises').click();
  await tid('picker').getByTestId('exercise-search').fill('bench press (b');
  await tid('picker').getByTestId('exercise-row').filter({ hasText: 'Bench Press (Barbell)' }).first().click();
  await tid('picker-add').click();
  await openReplace(cards().first());
  await tid('replace-suggestion').filter({ hasText: 'Chest Press (Machine)' }).getByTestId('replace-exclude').click();
  await expectCount(tid('replace-suggestion').filter({ hasText: 'Chest Press (Machine)' }), 0);
  await page.waitForTimeout(500);
  const excludedId = Object.values(db().exercise_prefs).find((p) => p.exclude_from_suggestions)?.id;
  assert.ok(excludedId, 'no se guardó la exclusión');
  await page.keyboard.press('Escape');
  await tid('replace-sheet').waitFor({ state: 'hidden' });
  await tid('cancel-workout').click();
  await tid('confirm-ok').click();
  await tab('exercises');
  await page.getByTestId('exercise-search').fill('chest press (m');
  await page.getByTestId('exercise-row').filter({ hasText: 'Chest Press (Machine)' }).first().click();
  await tid('excluded-revert').click();
  await expectCount(tid('excluded-hint'), 0);
  await page.waitForTimeout(500);
  assert.equal(db().exercise_prefs[excludedId]?.exclude_from_suggestions ?? Object.values(db().exercise_prefs).find((p) => p.id === excludedId).exclude_from_suggestions, false);
  step('reemplazar: sugerencias con última serie, hechas se quedan, deshacer, historial, plantilla, no sugerir más');

  // 12h. Aviso de fin de descanso por push (feature 11), lado del teléfono. Chromium sin cabeza no
  // tiene servicio de push: se simula la suscripción del navegador. El envío a la hora se prueba en
  // test/push.test.js; aquí, que la app registre, mueva y cancele la alerta, y el modo sin conexión.
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  const pp = await ctx.newPage();
  pp.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await pp.addInitScript(() => {
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device',
      options: { applicationServerKey: null },
      toJSON() {
        return { endpoint: this.endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
      },
      unsubscribe: async () => { window.__unsubscribed = true; return true; },
    };
    let current = null;
    const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => { current = sub; return sub; } }, getNotifications: async () => [] };
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', { value: async () => reg });
  });
  await pp.goto(`${BASE}/#/profile`);
  const tp = (id) => pp.getByTestId(id);
  const pushSwitch = pp.getByRole('switch', { name: 'Aviso con la app cerrada' });
  await pushSwitch.focus();
  await pp.keyboard.press('Space');
  await tp('rest-push-test').waitFor();
  const subs = () => Object.values(db().push_subscriptions || {});
  const alerts = () => Object.values(db().rest_alerts || {});
  const waitDb = async (fn, what) => {
    for (let i = 0; i < 40; i++) { if (fn()) return; await pp.waitForTimeout(150); }
    throw new Error(`No se cumplió: ${what}`);
  };
  await waitDb(() => subs().length === 1, 'suscripción guardada');
  assert.equal(subs()[0].endpoint, 'https://fcm.googleapis.com/fcm/send/e2e-device');
  // Empezar un descanso: alerta pendiente a la hora de término
  await tp('tab-train').click();
  await tp('start-empty').click();
  await tp('add-exercises').click();
  await tp('picker').getByTestId('exercise-search').fill('bench press (b');
  await tp('picker').getByTestId('exercise-row').filter({ hasText: 'Bench Press (Barbell)' }).first().click();
  await tp('picker-add').click();
  const pc = tp('exercise-card').first();
  await pc.getByTestId('set-weight').first().fill('60');
  await pc.getByTestId('set-reps').first().fill('8');
  const t0 = Date.now();
  await pc.getByTestId('set-check').first().click();
  await waitDb(() => alerts().length === 1, 'alerta registrada');
  const a1 = alerts()[0];
  assert.equal(a1.status, 'pending');
  assert.equal(a1.subscription_id, subs()[0].id);
  const restMs = Date.parse(a1.end_at) - t0;
  assert.ok(restMs > 10e3 && restMs < 1000e3, `fin del descanso: ${restMs} ms`);
  // +15 s mueve la alerta
  await pp.getByRole('button', { name: 'Sumar 15 segundos' }).click();
  await waitDb(() => Date.parse(alerts()[0]?.end_at) - Date.parse(a1.end_at) > 14e3, 'alerta movida 15 s');
  // Saltar el descanso la cancela
  await tp('rest-skip').click();
  await waitDb(() => alerts().length === 0, 'alerta cancelada');
  // Sin conexión: el descanso funciona y se marca "aviso no disponible", sin errores
  await ctx.setOffline(true);
  await tp('add-set').first().click();
  await pc.getByTestId('set-check').nth(1).click();
  await tp('rest-alert-off').waitFor();
  await pp.locator('#rest-bar').waitFor();
  await ctx.setOffline(false);
  await tp('rest-skip').click();
  await tp('cancel-workout').click();
  await tp('confirm-ok').click();
  // Desactivar borra la suscripción del servidor y la del navegador
  await tp('tab-profile').click();
  await pushSwitch.focus();
  await pp.keyboard.press('Space');
  await waitDb(() => subs().length === 0, 'suscripción borrada');
  assert.equal(await pp.evaluate(() => window.__unsubscribed), true);
  await pp.close();
  step('aviso push: activar, alerta al descansar, +15 s la mueve, saltar la cancela, sin conexión, desactivar');

  // 12i. Programas (feature 12): crear un 5/3/1 con TM 100 en sentadilla, hacer el día 1 y ver el día 2
  await tab('train');
  await tid('programs-open').click();
  await tid('new-531').click();
  await visible(tid('program-wizard'));
  const pickSlot = async (slot, q, name) => {
    await tid(`slot-${slot}`).click();
    await tid('picker').last().getByTestId('exercise-search').fill(q);
    await tid('picker').last().getByTestId('exercise-row').filter({ hasText: name }).first().click();
    await visible(tid(`slot-${slot}`).getByText(name));
  };
  await pickSlot('squat', 'barbell squat', 'Barbell Squat');
  await pickSlot('bench', 'bench press (b', 'Bench Press (Barbell)');
  await pickSlot('deadlift', 'deadlift', 'Deadlift (Barbell)');
  await pickSlot('ohp', 'shrug', 'Barbell Shrug');
  await tid('wizard-next').click();
  for (const [k, v] of [['squat', '100'], ['bench', '80'], ['deadlift', '140'], ['ohp', '50']]) await tid(`wizard-tm-${k}`).fill(v);
  await tid('wizard-next').click();
  await tid('wizard-create').click();
  await visible(tid('program-card'));
  assert.equal((await tid('program-position').innerText()).trim(), 'Semana 1 · Día 1 · Barbell Squat');
  assert.equal((await tid('program-day-sets').first().innerText()).trim(), '65 × 5 · 75 × 5 · 85 × 5+');
  await expectCount(tid('template-card').filter({ hasText: '5/3/1 ·' }), 0); // sus plantillas no van en "Mis plantillas"
  await tid('program-wizard-sheet').waitFor({ state: 'detached' });
  await shot('12i-programa');
  // Empezar: pesos del programa (no los de la vez anterior), la última serie "5+"
  await tid('program-start').click();
  const sq531 = cards().first();
  await visible(sq531.getByText('Barbell Squat'));
  const ph = async (i, what) => sq531.getByTestId(what).nth(i).getAttribute('placeholder');
  assert.deepEqual([await ph(0, 'set-weight'), await ph(1, 'set-weight'), await ph(2, 'set-weight')], ['65', '75', '85']);
  assert.equal(await ph(2, 'set-reps'), '5+');
  await expectCount(sq531.getByTestId('goal-line'), 0); // el programa manda: sin "Para superar"
  for (const i of [0, 1, 2]) await sq531.getByTestId('set-check').nth(i).click();
  await expectValue(sq531.getByTestId('set-weight').nth(2), '85');
  await tid('finish-workout').click();
  await confirmUntil(text('¡Entrenamiento guardado!'));
  await visible(tid('program-result').getByText('Próximo: semana 1, Bench Press (Barbell)'));
  await shot('12i-resultado');
  // Día 2: press banca con TM 80 → 52,5 (65 % = 52, armable) · 60 · 67,5 (85 % = 68)
  await tab('train');
  await visible(tid('program-position').getByText('Semana 1 · Día 2 · Bench Press (Barbell)'));
  assert.equal((await tid('program-day-sets').first().innerText()).trim(), '52,5 × 5 · 60 × 5 · 67,5 × 5+');
  // Saltar y repetir
  await tid('program-menu').click();
  await tid('program-skip').click();
  await visible(tid('program-position').getByText('Semana 1 · Día 3 · Deadlift (Barbell)'));
  await tid('program-menu').click();
  await tid('program-repeat').click();
  await visible(tid('program-position').getByText('Semana 1 · Día 2 · Bench Press (Barbell)'));
  // Semana 3 de sentadilla: 75 × 5, 85 × 3, 95 × 1+
  await tid('program-menu').click();
  await tid('program-week').click();
  await tid('program-week-3').click();
  await visible(tid('program-position').getByText('Semana 3 · Día 1 · Barbell Squat'));
  assert.equal((await tid('program-day-sets').first().innerText()).trim(), '75 × 5 · 85 × 3 · 95 × 1+');
  await expectCount(tid('program-week-4'), 0); // sin descarga no hay semana 4
  await page.keyboard.press('Escape');
  // Se guarda en el servidor: programa, plantillas de los 4 días y máximos
  await page.waitForTimeout(500);
  const prog = Object.values(db().programs || {});
  assert.equal(prog.length, 1);
  assert.deepEqual([prog[0].kind, prog[0].state.week, prog[0].state.day], ['531', 3, 1]);
  assert.equal(prog[0].config.templates.filter((id) => db().templates[id]).length, 4);
  assert.equal(db().exercise_prefs.Barbell_Squat.training_max, 100);
  // Ficha: máximo de entrenamiento con su historial
  await tab('exercises');
  await page.getByTestId('exercise-search').fill('barbell squat');
  await page.getByTestId('exercise-row').filter({ hasText: 'Barbell Squat' }).first().click();
  await visible(tid('tm-card'));
  assert.equal((await tid('tm-value').innerText()).trim(), '100 kg');
  await visible(tid('tm-log-row').getByText(/100 kg · al crear el programa/));
  // Pausar: la tarjeta desaparece de Entrenar
  await tab('train');
  await tid('program-menu').click();
  await tid('program-pause').click();
  await expectCount(tid('program-card'), 0);
  // GZCLP: asistente con pesos iniciales, día A1 con T1, T2 y T3
  await tid('programs-open').click();
  await visible(tid('program-row').getByText(/en pausa/));
  await tid('new-gzclp').click();
  await pickSlot('squat', 'barbell squat', 'Barbell Squat');
  await pickSlot('bench', 'bench press (b', 'Bench Press (Barbell)');
  await pickSlot('deadlift', 'deadlift', 'Deadlift (Barbell)');
  await pickSlot('ohp', 'shrug', 'Barbell Shrug');
  await pickSlot('A', 'lat pulldown', 'Wide-Grip Lat Pulldown');
  await pickSlot('B', 'reverse barbell', 'Reverse Barbell Curl');
  await tid('wizard-next').click();
  for (const k of ['squat', 'bench', 'deadlift', 'ohp']) {
    await tid(`wizard-t1-${k}`).fill('60');
    await tid(`wizard-t2-${k}`).fill('40');
  }
  for (const k of ['A', 'B']) await tid(`wizard-t3-${k}`).fill('20');
  await tid('wizard-next').click();
  await tid('wizard-create').click();
  await visible(tid('program-position').getByText('Sesión A1'));
  assert.deepEqual(await tid('program-day-sets').allInnerTexts(), ['60 × 3 · 60 × 3 · 60 × 3 · 60 × 3 · 60 × 3+', '40 × 10 · 40 × 10 · 40 × 10', '20 × 15 · 20 × 15 · 20 × 15+']);
  await tid('program-start').click();
  await expectCount(cards(), 3);
  await visible(cards().nth(0).getByText(/· T1/));
  await visible(cards().nth(2).getByText(/· T3/));
  await tid('cancel-workout').click();
  await tid('confirm-ok').click();
  await tid('program-menu').click();
  await tid('program-pause').click();
  await expectCount(tid('program-card'), 0);
  step('programas: 5/3/1 con TM 100 → 65/75/85×5+, día hecho, día 2 con 52,5/60/67,5, saltar, repetir, semana 3, ficha, pausar; GZCLP A1');

  // Plantilla normal con series en % del máximo (TM de sentadilla = 100): 75 % × 5+ → 75 kg; al terminar
  // con una serie más, "Actualizar plantilla" la deja en % y con el "+"
  await tid('new-template').click();
  await tid('workout-name').fill('Sentadilla al 75');
  await tid('add-exercises').click();
  await tid('picker').getByTestId('exercise-search').fill('barbell squat');
  await tid('picker').getByTestId('exercise-row').filter({ hasText: 'Barbell Squat' }).first().click();
  await tid('picker-add').click();
  const pt = cards().nth(0);
  await pt.getByTestId('set-reps').first().fill('5');
  await pt.getByTestId('set-type').first().click();
  await tid('set-pct-toggle').click();
  await visible(pt.getByTestId('set-pct-kg').getByText('= 75 kg'));
  await pt.getByTestId('set-type').first().click();
  await tid('set-amrap-toggle').click();
  await tid('editor-save').click();
  const pctTpl = () => Object.values(db().templates).find((t) => t.name === 'Sentadilla al 75');
  await expectUntil(() => pctTpl(), 'plantilla con % guardada');
  assert.deepEqual(pctTpl().exercises[0].sets.map(({ weight, reps, pct, amrap }) => ({ weight, reps, pct, amrap })), [{ weight: null, reps: 5, pct: 75, amrap: true }]);
  await tid('template-card').filter({ hasText: 'Sentadilla al 75' }).getByTestId('template-start').click();
  const ps = cards().nth(0);
  assert.equal(await ps.getByTestId('set-weight').first().getAttribute('placeholder'), '75');
  assert.equal(await ps.getByTestId('set-reps').first().getAttribute('placeholder'), '5+');
  await ps.getByTestId('set-reps').first().fill('9');
  await ps.getByTestId('set-check').first().click();
  await ps.getByTestId('add-set').click();
  await ps.getByTestId('set-weight').nth(1).fill('60');
  await ps.getByTestId('set-reps').nth(1).fill('10');
  await ps.getByTestId('set-check').nth(1).click();
  await tid('finish-workout').click();
  await confirmUntil(text('¡Entrenamiento guardado!')); // acepta "Actualizar plantilla"
  await expectUntil(() => pctTpl().exercises[0].sets.length === 2, 'plantilla actualizada');
  assert.deepEqual(pctTpl().exercises[0].sets.map(({ weight, reps, pct, amrap }) => ({ weight, reps, pct, amrap })), [
    { weight: null, reps: 5, pct: 75, amrap: true }, { weight: 60, reps: 10, pct: undefined, amrap: undefined },
  ]);
  step('plantilla normal en % del máximo: 75 % × 5+ → 75 kg; "Actualizar plantilla" la deja en %');

  // 13. Lectura del día: estado vacío y error claro si falta configurar el canal
  await tab('reading');
  await visible(text('Todavía no hay resúmenes'));
  await tid('summary-refresh').click();
  await visible(text('Falta la variable YOUTUBE_CHANNEL_ID'));
  await shot('13-lectura');
  step('lectura: estado vacío y refresco sin configurar');
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
