// Capa de almacenamiento. Dos implementaciones con la misma interfaz
// (list, query, get, upsert, remove):
//  - supabaseStore: producción (Postgres de Supabase vía su API REST, sin dependencias)
//  - fileStore: desarrollo local (un archivo JSON en disco)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PAGE = 1000; // Supabase devuelve máx. 1000 filas por request por defecto

function supabaseStore(url, key) {
  const base = url.replace(/\/+$/, '') + '/rest/v1/';
  const baseHeaders = { apikey: key, 'Content-Type': 'application/json' };
  // Las llaves antiguas (service_role) son JWT y van también en Authorization.
  // Las nuevas (sb_secret_...) solo van en el header apikey.
  if (key.startsWith('eyJ')) baseHeaders.Authorization = `Bearer ${key}`;

  async function req(path, opts = {}) {
    const res = await fetch(base + path, {
      ...opts,
      headers: { ...baseHeaders, ...(opts.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new HttpError(502, `Supabase ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  return {
    kind: 'supabase',
    async list(table, order) {
      const out = [];
      for (let offset = 0; ; offset += PAGE) {
        const rows = await req(`${table}?select=*&order=${order}&limit=${PAGE}&offset=${offset}`);
        out.push(...rows);
        if (rows.length < PAGE) break;
      }
      return out;
    },
    async query(table, { order, limit = 1, eq = {}, select = '*' } = {}) {
      const params = [`select=${select}`];
      if (order) params.push(`order=${order}`);
      params.push(`limit=${limit}`);
      for (const [col, val] of Object.entries(eq)) params.push(`${col}=eq.${encodeURIComponent(val)}`);
      return req(`${table}?${params.join('&')}`);
    },
    async get(table, id) {
      const rows = await req(`${table}?select=*&id=eq.${encodeURIComponent(id)}`);
      return rows[0] || null;
    },
    async upsert(table, rows) {
      return req(`${table}?on_conflict=id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(rows),
      });
    },
    async remove(table, id) {
      await req(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

function sortRows(rows, order) {
  const keys = order.split(',').map((p) => {
    const [col, dir] = p.split('.');
    return { col, desc: dir === 'desc' };
  });
  return rows.sort((a, b) => {
    for (const { col, desc } of keys) {
      const x = a[col] ?? '';
      const y = b[col] ?? '';
      if (x < y) return desc ? 1 : -1;
      if (x > y) return desc ? -1 : 1;
    }
    return 0;
  });
}

function fileStore(path) {
  let db = null;
  async function load() {
    if (db) return db;
    try {
      db = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      db = {};
    }
    return db;
  }
  async function save() {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(db));
  }
  return {
    kind: 'file',
    async list(table, order) {
      const d = await load();
      return sortRows(Object.values(d[table] || {}).map((r) => ({ ...r })), order);
    },
    async query(table, { order, limit = 1, eq = {}, select = '*' } = {}) {
      const d = await load();
      let rows = Object.values(d[table] || {})
        .filter((r) => Object.entries(eq).every(([col, val]) => String(r[col]) === String(val)))
        .map((r) => ({ ...r }));
      if (order) rows = sortRows(rows, order);
      rows = rows.slice(0, limit);
      if (select !== '*') {
        const cols = select.split(',').map((c) => c.trim());
        rows = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
      }
      return rows;
    },
    async get(table, id) {
      const d = await load();
      return d[table]?.[id] ?? null;
    },
    async upsert(table, rows) {
      const d = await load();
      d[table] ||= {};
      const now = new Date().toISOString();
      for (const r of rows) d[table][r.id] = { created_at: d[table][r.id]?.created_at ?? now, ...r };
      await save();
      return rows.map((r) => d[table][r.id]);
    },
    async remove(table, id) {
      const d = await load();
      if (d[table]) delete d[table][id];
      await save();
    },
  };
}

let cached = null;
export function getStore() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    cached = supabaseStore(url, key);
  } else if (process.env.VERCEL) {
    throw new HttpError(500, 'Faltan las variables SUPABASE_URL y SUPABASE_SECRET_KEY en Vercel.');
  } else {
    cached = fileStore(process.env.DATA_FILE || './data/dev-db.json');
  }
  return cached;
}
