// Servidor de desarrollo: enruta /api/* al mismo handler que usa Vercel y sirve el
// frontend con Vite (recarga en caliente). Datos en ./data/dev-db.json salvo que
// definas SUPABASE_*.
//   node dev-server.js           -> http://localhost:3000 (Vite en modo desarrollo)
//   node dev-server.js --dist    -> sirve el build de producción (npm run build antes)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { handle } from './lib/router.js';

// Carga .env si existe (formato KEY=VALUE)
try {
  const env = await readFile('.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* sin .env */ }

const PORT = Number(process.env.PORT || 3000);
const DIST = process.argv.includes('--dist');
const ROOT = join(process.cwd(), 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

let vite = null;
const server = createServer();

async function api(req, res, url) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const response = await handle(new Request(url, { method: req.method, headers: req.headers, body }));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function staticFile(res, url) {
  let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT)) throw new Error('fuera de raíz');
  if (!(await stat(path).catch(() => null))?.isFile()) path = join(ROOT, 'index.html');
  const data = await readFile(path);
  res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
  res.end(data);
}

server.on('request', async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (vite) return vite.middlewares(req, res);
    return await staticFile(res, url);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

if (!DIST) {
  const { createServer: createVite } = await import('vite');
  vite = await createVite({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
}

server.listen(PORT, () => console.log(`GymLog ${DIST ? '(dist)' : 'dev'} en http://localhost:${PORT}`));
