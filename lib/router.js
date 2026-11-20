// Router único para todas las funciones de /api. Usa Request/Response estándar,
// así corre igual en Vercel y en el servidor de desarrollo local.
import { timingSafeEqual } from 'node:crypto';
import { getStore, HttpError } from './store.js';
import { refreshSummary, TABLE as SUMMARIES } from './summary.js';

// Columnas permitidas por tabla (todo lo demás se ignora) y valores por defecto.
const TABLES = {
  workouts: {
    order: 'started_at.desc',
    fields: {
      id: null, name: '', started_at: null, ended_at: null, notes: '',
      template_id: null, exercises: [],
    },
    required: ['id', 'started_at'],
  },
  templates: {
    order: 'position.asc,name.asc',
    fields: { id: null, name: '', folder: '', notes: '', position: 0, exercises: [] },
    required: ['id', 'name'],
  },
  exercises: {
    order: 'name.asc',
    fields: {
      id: null, name: '', body_part: 'Otro', category: 'Otro', catalog_id: null,
      instructions: '', rest_seconds: null,
    },
    required: ['id', 'name'],
  },
  // Preferencias por ejercicio (del catálogo o propio); id = exercise_id. Ver docs/features/00-indice.md.
  exercise_prefs: {
    order: 'id.asc',
    optional: true, // si la tabla aún no existe en Supabase, la app sigue funcionando
    fields: {
      id: null, min_increment: null, max_load: null, rep_max: null, compare_same_template: false,
      stall_snooze_until: null, load_mode: null, kind: null, note: '', primary_muscles: null,
      secondary_muscles: null, regions: null, training_max: null, exclude_from_suggestions: false,
    },
    required: ['id'],
    positive: ['min_increment', 'max_load', 'rep_max', 'training_max'],
  },
};

// Supabase: tabla que aún no se creó (PostgREST PGRST205 / Postgres 42P01)
const isMissingTable = (e) => /PGRST205|42P01|Could not find the table|does not exist/.test(e?.message || '');

const ID_RE = /^[A-Za-z0-9_:.-]{1,100}$/;
const MAX_BODY = 4 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function safeEqual(got, expected) {
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function checkAuth(request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    if (process.env.VERCEL) throw new HttpError(500, 'Falta la variable APP_PASSWORD en Vercel.');
    return; // en local sin clave se permite todo
  }
  if (!safeEqual(request.headers.get('x-app-key') || '', expected)) throw new HttpError(401, 'Clave incorrecta');
}

const hasAppKey = (request) => {
  try { checkAuth(request); return true; } catch { return false; }
};

// Vercel Cron manda "Authorization: Bearer $CRON_SECRET". Sin CRON_SECRET esta vía queda cerrada.
function hasCronSecret(request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && safeEqual(request.headers.get('authorization') || '', `Bearer ${secret}`);
}

// POST|GET /api/summary-refresh: lo llama el cron (sin x-app-key) o la app (con x-app-key).
async function summaryRefresh(request, url, method) {
  if (method !== 'GET' && method !== 'POST') throw new HttpError(405, 'Método no permitido');
  const byKey = hasAppKey(request);
  if (!byKey && !hasCronSecret(request)) throw new HttpError(401, 'No autorizado');
  // force (regenerar aunque ya exista) solo con la clave de la app, nunca desde el cron.
  const force = byKey && ['1', 'true'].includes(url.searchParams.get('force'));
  const result = await refreshSummary({ store: getStore(), env: process.env, force });
  console.log('[summary-refresh]', JSON.stringify(result));
  return json(result);
}

// GET /api/summary              -> { summary } el último resumen bueno (o null)
// GET /api/summary?id=VIDEO_ID  -> { summary } ese resumen (404 si no existe)
// GET /api/summary?list=1       -> [{ id, title, video_url, published_at, word_count }] (últimos 20)
async function summaryRead(store, url, method) {
  if (method !== 'GET') throw new HttpError(405, 'Método no permitido');
  const id = url.searchParams.get('id');
  if (id) {
    if (!ID_RE.test(id)) throw new HttpError(400, 'id inválido');
    const row = await store.get(SUMMARIES, id);
    if (!row || row.status !== 'ok') throw new HttpError(404, 'No encontrado');
    return json({ summary: row });
  }
  const order = 'published_at.desc.nullslast';
  if (url.searchParams.get('list')) {
    return json(await store.query(SUMMARIES, {
      order, limit: 20, eq: { status: 'ok' }, select: 'id,title,video_url,published_at,word_count',
    }));
  }
  const [row] = await store.query(SUMMARIES, { order, limit: 1, eq: { status: 'ok' } });
  return json({ summary: row ?? null });
}

function sanitize(table, input) {
  const spec = TABLES[table];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Cada fila debe ser un objeto');
  }
  const row = {};
  for (const [field, def] of Object.entries(spec.fields)) {
    let v = input[field];
    if (v === undefined) v = Array.isArray(def) ? [] : def;
    row[field] = v;
  }
  for (const f of spec.required) {
    if (row[f] == null || row[f] === '') throw new HttpError(400, `Falta el campo ${f}`);
  }
  if (typeof row.id !== 'string' || !ID_RE.test(row.id)) throw new HttpError(400, `id inválido: ${row.id}`);
  if ('exercises' in row && !Array.isArray(row.exercises)) throw new HttpError(400, 'exercises debe ser una lista');
  for (const f of spec.positive || []) {
    if (row[f] != null && !(typeof row[f] === 'number' && row[f] > 0 && row[f] < 10000)) {
      throw new HttpError(400, `${f} debe ser un número positivo`);
    }
  }
  row.updated_at = new Date().toISOString();
  return row;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Payload demasiado grande');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

export async function handle(request) {
  try {
    const url = new URL(request.url);
    const resource = url.pathname.replace(/^\/api\/?/, '').split('/')[0];
    const method = request.method.toUpperCase();

    if (resource === 'health') {
      let storage = 'sin configurar';
      try { storage = getStore().kind; } catch (e) { storage = e.message; }
      return json({ ok: true, storage, auth: Boolean(process.env.APP_PASSWORD) });
    }

    if (resource === 'summary-refresh') return await summaryRefresh(request, url, method);

    checkAuth(request);
    const store = getStore();

    if (resource === 'summary') return await summaryRead(store, url, method);

    if (resource === 'bootstrap' && method === 'GET') {
      const names = Object.keys(TABLES);
      const lists = await Promise.all(names.map((t) => store.list(t, TABLES[t].order).catch((e) => {
        if (TABLES[t].optional && isMissingTable(e)) return [];
        throw e;
      })));
      return json(Object.fromEntries(names.map((t, i) => [t, lists[i]])));
    }

    const spec = TABLES[resource];
    if (!spec) throw new HttpError(404, `Recurso desconocido: ${resource}`);
    const id = url.searchParams.get('id');

    if (method === 'GET') {
      if (id) {
        const row = await store.get(resource, id);
        if (!row) throw new HttpError(404, 'No encontrado');
        return json(row);
      }
      return json(await store.list(resource, spec.order));
    }

    if (method === 'POST' || method === 'PUT') {
      const body = await readBody(request);
      const rows = (Array.isArray(body) ? body : [body]).map((r) => sanitize(resource, r));
      if (rows.length === 0) return json([]);
      if (rows.length > 500) throw new HttpError(413, 'Máximo 500 filas por request');
      const saved = await store.upsert(resource, rows).catch((e) => {
        if (spec.optional && isMissingTable(e)) {
          throw new HttpError(400, `Falta crear la tabla ${resource} en Supabase (ver schema.sql)`);
        }
        throw e;
      });
      return json(Array.isArray(body) ? saved : saved[0]);
    }

    if (method === 'DELETE') {
      if (!id || !ID_RE.test(id)) throw new HttpError(400, 'Falta id');
      await store.remove(resource, id);
      return json({ ok: true });
    }

    throw new HttpError(405, 'Método no permitido');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error(err);
    return json({ error: err.message || 'Error interno' }, status);
  }
}
