// Pruebas de "Lectura del día": RSS, Supadata, OpenAI, refreshSummary y rutas.
// Todo con fetch simulado (sin red real). Ejecutar: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'gymlog-sum-')), 'db.json');
process.env.APP_PASSWORD = 'secreto';
process.env.CRON_SECRET = 'cron-123';
process.env.YOUTUBE_CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';
process.env.SUPADATA_API_KEY = 'sd_test';
process.env.OPENAI_API_KEY = 'sk-test';
delete process.env.OPENAI_MODEL;
delete process.env.SUPABASE_URL;
delete process.env.VERCEL;

const { handle } = await import('../lib/router.js');
const { getStore } = await import('../lib/store.js');
const { parseFeed, getLatestVideo, getTranscript, refreshSummary, wordCount } = await import('../lib/summary.js');

const store = getStore();
const env = { ...process.env };

// ---- datos simulados

const entry = (id, title, published, shorts = false) => `
  <entry>
    <id>yt:video:${id}</id>
    <yt:videoId>${id}</yt:videoId>
    <title>${title}</title>
    <link rel="alternate" href="https://www.youtube.com/${shorts ? `shorts/${id}` : `watch?v=${id}`}"/>
    <published>${published}</published>
    <media:group><media:title>no usar</media:title></media:group>
  </entry>`;
const feed = (...entries) => `<?xml version="1.0"?><feed>${entries.join('')}</feed>`;

const SUMMARY = '# Título propio\n\nIdea central del video.\n\n## Sección\n\nTexto con **negrita**.';
const openaiResponse = (text = SUMMARY) => ({
  status: 'completed',
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
  ],
  usage: { input_tokens: 100, output_tokens: 50 },
});

/**
 * fetch simulado. `routes` mapea un prefijo de URL a una función (url, opts) -> Response.
 * Registra cada llamada en `calls`.
 */
function mockFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    for (const [prefix, handler] of Object.entries(routes)) {
      if (String(url).startsWith(prefix)) return handler(String(url), opts);
    }
    throw new Error(`fetch inesperado: ${url}`);
  };
  fn.calls = calls;
  fn.count = (prefix) => calls.filter((c) => c.url.startsWith(prefix)).length;
  return fn;
}

const YT = 'https://www.youtube.com/feeds/';
const SD = 'https://api.supadata.ai/';
const OA = 'https://api.openai.com/';
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status });

function happyFetch({ videoId = 'vid1', supadata, openai } = {}) {
  return mockFetch({
    [YT]: () => new Response(feed(entry(videoId, 'Rutina &amp; técnica', '2026-11-19T10:00:00+00:00'))),
    [SD]: supadata ?? (() => jsonRes({ content: 'hola esto es la transcripción', lang: 'es' })),
    [OA]: openai ?? (() => jsonRes(openaiResponse())),
  });
}

async function reset() {
  for (const r of await store.list('video_summaries', 'id.asc')) await store.remove('video_summaries', r.id);
}
beforeEach(reset);

// ---- 5. Parser del RSS

test('parseFeed decodifica entidades e ignora media:title', () => {
  const [e] = parseFeed(feed(entry('a1', 'Press &amp; banca: &quot;sí&quot; &#39;no&#39; &lt;3 &gt; &#233;', '2026-01-01T00:00:00Z')));
  assert.equal(e.id, 'a1');
  assert.equal(e.title, `Press & banca: "sí" 'no' <3 > é`);
  assert.equal(e.url, 'https://www.youtube.com/watch?v=a1');
  assert.equal(e.publishedAt, '2026-01-01T00:00:00Z');
});

test('getLatestVideo usa el feed UULF y elige el más reciente', async () => {
  const f = mockFetch({
    [YT]: () => new Response(feed(
      entry('viejo', 'Viejo', '2026-11-01T00:00:00+00:00'),
      entry('nuevo', 'Nuevo', '2026-11-10T00:00:00+00:00'),
      entry('medio', 'Medio', '2026-11-05T00:00:00+00:00'),
    )),
  });
  const v = await getLatestVideo('UCabcdefghijklmnopqrstuv', { fetch: f });
  assert.deepEqual(v, { id: 'nuevo', title: 'Nuevo', url: 'https://www.youtube.com/watch?v=nuevo', publishedAt: '2026-11-10T00:00:00+00:00' });
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].url, /playlist_id=UULFabcdefghijklmnopqrstuv$/);
});

test('getLatestVideo: si UULF no existe usa el feed del canal y descarta /shorts/', async () => {
  const f = mockFetch({
    [`${YT}videos.xml?playlist_id=`]: () => new Response('not found', { status: 404 }),
    [`${YT}videos.xml?channel_id=`]: () => new Response(feed(
      entry('largo', 'Largo', '2026-11-01T00:00:00+00:00'),
      entry('short', 'Short', '2026-11-09T00:00:00+00:00', true),
    )),
  });
  const v = await getLatestVideo('UCabcdefghijklmnopqrstuv', { fetch: f });
  assert.equal(v.id, 'largo');
  assert.equal(f.calls.length, 2);
});

test('getLatestVideo rechaza un ID de canal inválido', async () => {
  await assert.rejects(getLatestVideo('@micanal', { fetch: mockFetch({}) }), /YOUTUBE_CHANNEL_ID inválido/);
});

// ---- Supadata

test('getTranscript: mode=native, text=true, header x-api-key', async () => {
  const f = mockFetch({ [SD]: () => jsonRes({ content: 'texto', lang: 'es' }) });
  const t = await getTranscript('https://www.youtube.com/watch?v=abc', { fetch: f, apiKey: 'sd_x' });
  assert.equal(t, 'texto');
  const u = new URL(f.calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://api.supadata.ai/v1/transcript');
  assert.equal(u.searchParams.get('mode'), 'native');
  assert.equal(u.searchParams.get('text'), 'true');
  assert.equal(u.searchParams.get('url'), 'https://www.youtube.com/watch?v=abc');
  assert.equal(f.calls[0].opts.headers['x-api-key'], 'sd_x');
});

// 4. 202 + jobId
test('getTranscript: 202 + jobId hace polling hasta completed', async () => {
  let polls = 0;
  const f = mockFetch({
    [`${SD}v1/transcript/job-1`]: () => {
      polls++;
      return jsonRes(polls < 3 ? { status: 'active' } : { status: 'completed', content: 'del job', lang: 'es' });
    },
    [`${SD}v1/transcript?`]: () => jsonRes({ jobId: 'job-1' }, 202),
  });
  const t = await getTranscript('https://www.youtube.com/watch?v=abc', { fetch: f, apiKey: 'k', pollMs: 1 });
  assert.equal(t, 'del job');
  assert.equal(polls, 3);
});

test('getTranscript: 206 (sin transcripción) y contenido vacío son errores legibles', async () => {
  let f = mockFetch({ [SD]: () => jsonRes({ error: 'transcript-unavailable', message: 'No hay' }, 206) });
  await assert.rejects(getTranscript('u', { fetch: f, apiKey: 'k' }), /Supadata 206: .*transcript-unavailable/);
  f = mockFetch({ [SD]: () => jsonRes({ content: '   ', lang: 'es' }) });
  await assert.rejects(getTranscript('u', { fetch: f, apiKey: 'k' }), /vacía/);
});

test('getTranscript recorta a 200.000 caracteres', async () => {
  const f = mockFetch({ [SD]: () => jsonRes({ content: 'a'.repeat(250_000) }) });
  assert.equal((await getTranscript('u', { fetch: f, apiKey: 'k' })).length, 200_000);
});

// ---- refreshSummary

// 2. Video nuevo
test('video nuevo: Supadata -> OpenAI -> fila ok', async () => {
  const f = happyFetch();
  const r = await refreshSummary({ store, env, fetch: f });
  assert.equal(r.action, 'created');
  assert.equal(r.id, 'vid1');
  assert.equal(f.count(SD), 1);
  assert.equal(f.count(OA), 1);
  assert.ok(f.calls.findIndex((c) => c.url.startsWith(SD)) < f.calls.findIndex((c) => c.url.startsWith(OA)));

  const body = JSON.parse(f.calls.find((c) => c.url.startsWith(OA)).opts.body);
  assert.equal(body.model, 'gpt-5-mini');
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.match(body.input, /^Título del video: Rutina & técnica\n\nTranscripción:\nhola esto/);
  assert.equal(f.calls.find((c) => c.url.startsWith(OA)).opts.headers.Authorization, 'Bearer sk-test');

  const row = await store.get('video_summaries', 'vid1');
  assert.equal(row.status, 'ok');
  assert.equal(row.summary, SUMMARY);
  assert.equal(row.title, 'Rutina & técnica');
  assert.equal(row.channel_id, env.YOUTUBE_CHANNEL_ID);
  assert.ok(row.word_count > 0);
  assert.equal(row.word_count, wordCount(SUMMARY));
});

// 1. Ya resumido
test('video ya resumido: skipped sin llamar a Supadata ni OpenAI', async () => {
  await refreshSummary({ store, env, fetch: happyFetch() });
  const f = happyFetch();
  const r = await refreshSummary({ store, env, fetch: f });
  assert.deepEqual(r, { action: 'skipped', reason: 'ya resumido', id: 'vid1' });
  assert.equal(f.count(SD), 0);
  assert.equal(f.count(OA), 0);
});

// 3. Supadata falla
test('Supadata falla: error con attempts, y al llegar a 3 deja de intentar', async () => {
  const failing = () => happyFetch({ supadata: () => jsonRes({ error: 'transcript-unavailable' }, 206) });
  for (let i = 1; i <= 3; i++) {
    const r = await refreshSummary({ store, env, fetch: failing() });
    assert.equal(r.action, 'error');
    const row = await store.get('video_summaries', 'vid1');
    assert.equal(row.status, 'error');
    assert.equal(row.attempts, i);
    assert.match(row.error, /Supadata 206/);
  }
  const f = failing();
  const r = await refreshSummary({ store, env, fetch: f });
  assert.deepEqual(r, { action: 'skipped', reason: 'demasiados intentos', id: 'vid1' });
  assert.equal(f.count(SD), 0);

  // Con force se vuelve a intentar, y si sale bien queda ok.
  const ok = await refreshSummary({ store, env, fetch: happyFetch(), force: true });
  assert.equal(ok.action, 'created');
  assert.equal((await store.get('video_summaries', 'vid1')).status, 'ok');
});

test('force sobre un resumen bueno que falla no pisa el resumen', async () => {
  await refreshSummary({ store, env, fetch: happyFetch() });
  const origError = console.error;
  console.error = () => {};
  try {
    const r = await refreshSummary({ store, env, force: true, fetch: happyFetch({ openai: () => jsonRes({ error: { message: 'cuota' } }, 429) }) });
    assert.equal(r.action, 'error');
    assert.match(r.error, /OpenAI 429/);
  } finally {
    console.error = origError;
  }
  const row = await store.get('video_summaries', 'vid1');
  assert.equal(row.status, 'ok');
  assert.equal(row.summary, SUMMARY);
});

test('OpenAI incompleto es error; modelo sin razonamiento no manda reasoning', async () => {
  const incomplete = () => jsonRes({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] });
  let r = await refreshSummary({ store, env, fetch: happyFetch({ openai: incomplete }) });
  assert.equal(r.action, 'error');
  assert.match(r.error, /incompleta \(max_output_tokens\)/);

  const f = happyFetch({ videoId: 'vid2' });
  r = await refreshSummary({ store, env: { ...env, OPENAI_MODEL: 'gpt-4.1-mini' }, fetch: f });
  assert.equal(r.action, 'created');
  const body = JSON.parse(f.calls.find((c) => c.url.startsWith(OA)).opts.body);
  assert.equal(body.model, 'gpt-4.1-mini');
  assert.equal(body.reasoning, undefined);
});

test('falta una variable: error 500 claro antes de llamar a nada', async () => {
  const f = happyFetch();
  await assert.rejects(
    refreshSummary({ store, env: { ...env, SUPADATA_API_KEY: '' }, fetch: f }),
    (e) => e.status === 500 && e.message === 'Falta la variable SUPADATA_API_KEY',
  );
  assert.equal(f.calls.length, 0);
});

// ---- 6 y 7. Rutas

const req = (method, path, headers = {}) => handle(new Request(`http://x/api/${path}`, { method, headers }));

async function withGlobalFetch(f, fn) {
  const real = globalThis.fetch;
  const log = console.log;
  globalThis.fetch = f;
  console.log = () => {};
  try { return await fn(); } finally { globalThis.fetch = real; console.log = log; }
}

test('summary-refresh: auth por CRON_SECRET o x-app-key; force solo con x-app-key', async () => {
  await withGlobalFetch(happyFetch(), async () => {
    let r = await req('GET', 'summary-refresh');
    assert.equal(r.status, 401);
    r = await req('GET', 'summary-refresh', { authorization: 'Bearer otra' });
    assert.equal(r.status, 401);
    r = await req('GET', 'summary-refresh', { 'x-app-key': 'mala' });
    assert.equal(r.status, 401);

    r = await req('GET', 'summary-refresh', { authorization: 'Bearer cron-123' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).action, 'created');

    r = await req('POST', 'summary-refresh', { 'x-app-key': 'secreto' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).action, 'skipped');

    // force con Bearer se ignora
    r = await req('GET', 'summary-refresh?force=1', { authorization: 'Bearer cron-123' });
    assert.equal((await r.json()).action, 'skipped');
    // force con x-app-key regenera
    r = await req('POST', 'summary-refresh?force=1', { 'x-app-key': 'secreto' });
    assert.equal((await r.json()).action, 'created');

    r = await req('DELETE', 'summary-refresh', { 'x-app-key': 'secreto' });
    assert.equal(r.status, 405);
  });
});

test('summary-refresh: sin CRON_SECRET la vía del cron queda cerrada', async () => {
  const secret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const r = await req('GET', 'summary-refresh', { authorization: 'Bearer ' });
    assert.equal(r.status, 401);
  } finally {
    process.env.CRON_SECRET = secret;
  }
});

test('GET /api/summary: null sin filas, luego el último ok; id y list', async () => {
  const key = { 'x-app-key': 'secreto' };
  let r = await req('GET', 'summary', key);
  assert.deepEqual(await r.json(), { summary: null });
  assert.equal((await req('GET', 'summary')).status, 401);

  await store.upsert('video_summaries', [
    { id: 'v1', status: 'ok', title: 'Uno', summary: 'uno', published_at: '2026-11-01T00:00:00Z', word_count: 1 },
    { id: 'v2', status: 'ok', title: 'Dos', summary: 'dos', published_at: '2026-11-05T00:00:00Z', word_count: 1 },
    { id: 'v3', status: 'error', title: 'Tres', summary: '', published_at: '2026-11-09T00:00:00Z', word_count: 0 },
  ]);
  r = await req('GET', 'summary', key);
  assert.equal((await r.json()).summary.id, 'v2');

  r = await req('GET', 'summary?id=v1', key);
  assert.equal((await r.json()).summary.summary, 'uno');
  assert.equal((await req('GET', 'summary?id=v3', key)).status, 404);
  assert.equal((await req('GET', 'summary?id=nope', key)).status, 404);

  r = await req('GET', 'summary?list=1', key);
  const list = await r.json();
  assert.deepEqual(list.map((x) => x.id), ['v2', 'v1']);
  assert.deepEqual(Object.keys(list[0]).sort(), ['id', 'published_at', 'title', 'video_url', 'word_count']);

  assert.equal((await req('POST', 'summary', key)).status, 405);
  assert.equal((await req('DELETE', 'summary?id=v1', key)).status, 405);
  // no entra al bootstrap
  r = await req('GET', 'bootstrap', key);
  assert.equal((await r.json()).video_summaries, undefined);
});

// ---- 8. store.query

test('fileStore.query: orden, limit, eq y select', async () => {
  await store.upsert('video_summaries', [
    { id: 'a', status: 'ok', published_at: '2026-01-01', title: 'A' },
    { id: 'b', status: 'error', published_at: '2026-03-01', title: 'B' },
    { id: 'c', status: 'ok', published_at: '2026-02-01', title: 'C' },
    { id: 'd', status: 'ok', published_at: null, title: 'D' },
  ]);
  let rows = await store.query('video_summaries', { order: 'published_at.desc.nullslast', limit: 10, eq: { status: 'ok' } });
  assert.deepEqual(rows.map((r) => r.id), ['c', 'a', 'd']);
  rows = await store.query('video_summaries', { order: 'published_at.desc', limit: 1, eq: { status: 'ok' }, select: 'id,title' });
  assert.deepEqual(rows, [{ id: 'c', title: 'C' }]);
  rows = await store.query('video_summaries', { order: 'id.asc', limit: 2 });
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b']);
});

test('supabaseStore.query arma la URL de PostgREST', async () => {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(url); return new Response('[]'); };
  try {
    process.env.SUPABASE_URL = 'https://abc.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_123';
    const mod = await import('../lib/store.js?supabase-query');
    await mod.getStore().query('video_summaries', {
      order: 'published_at.desc.nullslast', limit: 20, eq: { status: 'ok' }, select: 'id,title',
    });
    assert.equal(calls[0], 'https://abc.supabase.co/rest/v1/video_summaries?select=id,title&order=published_at.desc.nullslast&limit=20&status=eq.ok');
  } finally {
    globalThis.fetch = real;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});
