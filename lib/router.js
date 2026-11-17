// Router único para todas las funciones de /api. Usa Request/Response estándar,
// así corre igual en Vercel y en el servidor de desarrollo local.
import { timingSafeEqual } from 'node:crypto';
import { getStore, HttpError } from './store.js';

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
};

const ID_RE = /^[A-Za-z0-9_:.-]{1,100}$/;
const MAX_BODY = 4 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function checkAuth(request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    if (process.env.VERCEL) throw new HttpError(500, 'Falta la variable APP_PASSWORD en Vercel.');
    return; // en local sin clave se permite todo
  }
  const got = request.headers.get('x-app-key') || '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Clave incorrecta');
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

    checkAuth(request);
    const store = getStore();

    if (resource === 'bootstrap' && method === 'GET') {
      const [workouts, templates, exercises] = await Promise.all(
        Object.keys(TABLES).map((t) => store.list(t, TABLES[t].order)),
      );
      return json({ workouts, templates, exercises });
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
      const saved = await store.upsert(resource, rows);
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
