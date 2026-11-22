// Router único para todas las funciones de /api. Usa Request/Response estándar,
// así corre igual en Vercel y en el servidor de desarrollo local.
import { timingSafeEqual } from 'node:crypto';
import { getStore, HttpError } from './store.js';
import { refreshSummary, TABLE as SUMMARIES } from './summary.js';
import { pushSubscribe, restAlert } from './push-api.js';

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
  // Peso corporal y medidas (feature 03); id = fecha local 'YYYY-MM-DD', un registro por día.
  body_metrics: {
    order: 'date.desc',
    optional: true,
    fields: { id: null, date: null, weight: null, body_fat: null, measurements: {}, notes: '' },
    required: ['id', 'date'],
    positive: ['weight', 'body_fat'],
    validate(row) {
      if (!DATE_RE.test(row.id) || row.date !== row.id) throw new HttpError(400, 'id y date deben ser la misma fecha YYYY-MM-DD');
      const m = row.measurements;
      if (!m || typeof m !== 'object' || Array.isArray(m)) throw new HttpError(400, 'measurements debe ser un objeto');
      for (const [k, v] of Object.entries(m)) {
        if (!/^[a-z_]{1,30}$/.test(k) || !(typeof v === 'number' && v > 0 && v < 1000)) {
          throw new HttpError(400, `Medida inválida: ${k}`);
        }
      }
    },
  },
  // Ajustes que deben estar en todos los dispositivos (feature 09: meta de constancia y pausas).
  // Una sola fila, id = 'me'; data es un objeto libre (máx. 32 KB).
  user_settings: {
    order: 'id.asc',
    optional: true,
    fields: { id: null, data: {} },
    required: ['id'],
    validate(row) {
      if (row.id !== 'me') throw new HttpError(400, "user_settings solo admite la fila id = 'me'");
      if (!row.data || typeof row.data !== 'object' || Array.isArray(row.data)) throw new HttpError(400, 'data debe ser un objeto');
      if (JSON.stringify(row.data).length > 32 * 1024) throw new HttpError(413, 'data supera 32 KB');
    },
  },
  // Programas por porcentaje (feature 12): 5/3/1 y GZCLP. config = ejercicios y opciones; state =
  // posición (semana, día), etapas de GZCLP, último resultado y máximos por subir.
  programs: {
    order: 'id.asc',
    optional: true,
    fields: { id: null, name: '', kind: null, config: {}, state: {}, active: true },
    required: ['id', 'name', 'kind'],
    validate(row) {
      if (!['531', 'gzclp'].includes(row.kind)) throw new HttpError(400, 'kind debe ser 531 o gzclp');
      for (const k of ['config', 'state']) {
        if (!row[k] || typeof row[k] !== 'object' || Array.isArray(row[k])) throw new HttpError(400, `${k} debe ser un objeto`);
      }
      if (JSON.stringify([row.config, row.state]).length > 64 * 1024) throw new HttpError(413, 'programa demasiado grande');
      if (typeof row.active !== 'boolean') throw new HttpError(400, 'active debe ser true o false');
    },
  },
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Supabase: tabla que aún no se creó (PostgREST PGRST205 / Postgres 42P01)
const isMissingTable = (e) => /PGRST205|42P01|Could not find the table|does not exist/.test(e?.message || '');

// 409 (no 400): la app guarda el cambio para cuando exista la tabla, en vez de descartarlo
const missing = (spec, resource) => (e) => {
  if (spec.optional && isMissingTable(e)) throw new HttpError(409, `Falta crear la tabla ${resource} en Supabase (ver schema.sql)`);
  throw e;
};

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
    if (v === undefined) v = Array.isArray(def) ? [] : def && typeof def === 'object' ? { ...def } : def;
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
  spec.validate?.(row);
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

    // Aviso de fin de descanso por push (feature 11)
    const bodyOf = () => (method === 'POST' || method === 'PUT' ? readBody(request) : null);
    if (resource === 'push-subscribe') return json(await pushSubscribe(store, request, url, method, await bodyOf()));
    if (resource === 'rest-alert') {
      const [data, task] = await restAlert(store, request, url, method, await bodyOf());
      if (task) await task; // solo en Vercel sin waitUntil
      return json(data);
    }

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
      const saved = await store.upsert(resource, rows).catch(missing(spec, resource));
      return json(Array.isArray(body) ? saved : saved[0]);
    }

    if (method === 'DELETE') {
      if (!id || !ID_RE.test(id)) throw new HttpError(400, 'Falta id');
      await store.remove(resource, id).catch(missing(spec, resource));
      return json({ ok: true });
    }

    throw new HttpError(405, 'Método no permitido');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error(err);
    return json({ error: err.message || 'Error interno' }, status);
  }
}
