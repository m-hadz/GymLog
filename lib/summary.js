// "Lectura del día": resume el último video largo de un canal de YouTube.
//   RSS de YouTube -> transcripción (Supadata) -> resumen en español (OpenAI) -> tabla video_summaries
// Si el video ya está resumido no se llama a ningún servicio de pago.
// Todas las funciones reciben `fetch` como dependencia para poder probarlas sin red.
import { HttpError } from './store.js';

export const TABLE = 'video_summaries';
export const MAX_ATTEMPTS = 3; // intentos fallidos antes de dejar de gastar créditos en un video
const MAX_TRANSCRIPT = 200_000; // caracteres (un podcast de 3 h entra holgado)
const BUDGET_MS = 285_000; // maxDuration de la función es 300 s (vercel.json)

export const SUMMARY_PROMPT = `Eres un editor que convierte transcripciones de videos de YouTube en una lectura en español,
clara y agradable, para leer en el teléfono.

Objetivo: un texto de 8 a 10 minutos de lectura (entre 1.700 y 2.200 palabras).
Si el video es corto y no da para tanto, escribe menos; nunca rellenes ni inventes.

Formato (Markdown simple):
- Empieza con un título "# ..." propio (no copies el título del video si es clickbait).
- Un párrafo inicial de 2-3 frases con la idea central.
- Secciones con "## " siguiendo el hilo del video, en prosa corrida (no todo en viñetas).
- Si el video tiene recomendaciones prácticas (ejercicios, series, repeticiones, cargas,
  frecuencias, nutrición), cierra con una sección "## Para llevar al gimnasio" con viñetas
  concretas y los números tal como se dijeron.
- Usa **negritas** solo para conceptos clave, con moderación.

Reglas:
- Escribe siempre en español neutro, aunque el video esté en otro idioma.
- Sé fiel al contenido: no agregues datos, estudios ni consejos que no estén en el video.
  Si el autor cita un estudio o una cifra, mantenla y atribúyela ("según el autor...").
- Omite saludos, autopromoción, sponsors, pedidos de suscripción y relleno.
- Las transcripciones automáticas tienen errores: corrige nombres de ejercicios y términos
  técnicos obvios por contexto.
- No uses tablas, HTML ni bloques de código.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- YouTube (RSS)

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // al final, para no decodificar dos veces "&amp;lt;"
}

/** Entradas de un feed Atom de YouTube: [{ id, title, url, link, publishedAt }] */
export function parseFeed(xml) {
  const out = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim();
    if (!id) continue;
    out.push({
      id,
      title: decodeEntities(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? ''),
      url: `https://www.youtube.com/watch?v=${id}`,
      link: entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '',
      publishedAt: entry.match(/<published>([^<]+)<\/published>/)?.[1]?.trim() ?? null,
    });
  }
  return out;
}

const newest = (entries) =>
  entries.reduce((a, b) => (!a || (b.publishedAt ?? '') > (a.publishedAt ?? '') ? b : a), null);

/**
 * Último video largo (no Short) del canal.
 * Primero prueba la playlist de videos largos (UULF…); si no existe, usa el feed del canal
 * y descarta los /shorts/.
 */
export async function getLatestVideo(channelId, { fetch = globalThis.fetch } = {}) {
  if (!/^UC[\w-]{22}$/.test(channelId || '')) {
    throw new Error(`YOUTUBE_CHANNEL_ID inválido: "${channelId}" (debe empezar con UC y tener 24 caracteres)`);
  }
  const get = (qs) => fetch(`https://www.youtube.com/feeds/videos.xml?${qs}`, { signal: AbortSignal.timeout(15_000) });

  let res = await get(`playlist_id=UULF${channelId.slice(2)}`);
  if (res.status === 200) {
    const video = newest(parseFeed(await res.text()));
    if (video) return strip(video);
  }

  res = await get(`channel_id=${channelId}`);
  if (res.status !== 200) {
    throw new Error(`YouTube RSS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const video = newest(parseFeed(await res.text()).filter((e) => !e.link.includes('/shorts/')));
  if (!video) throw new Error('El canal no tiene videos largos en su feed');
  return strip(video);
}

const strip = ({ id, title, url, publishedAt }) => ({ id, title, url, publishedAt });

// ---------------------------------------------------------------- Supadata

const SUPADATA = 'https://api.supadata.ai/v1/transcript';

async function readError(res, who) {
  const body = await res.text().catch(() => '');
  return new Error(`${who} ${res.status}: ${body.slice(0, 200)}`);
}

const asText = (content) =>
  Array.isArray(content) ? content.map((c) => c.text ?? '').join(' ') : String(content ?? '');

/**
 * Transcripción completa en texto plano. Siempre mode=native (1 crédito): el modo generado
 * por IA cobra 2 créditos por minuto de video.
 * Los videos de más de ~20 min responden 202 + jobId: se consulta el job hasta que termine.
 */
export async function getTranscript(videoUrl, {
  fetch = globalThis.fetch, apiKey, pollMs = 3000, maxWaitMs = 120_000,
} = {}) {
  const headers = { 'x-api-key': apiKey };
  const qs = `url=${encodeURIComponent(videoUrl)}&text=true&mode=native`;
  const res = await fetch(`${SUPADATA}?${qs}`, { headers, signal: AbortSignal.timeout(60_000) });

  let data;
  if (res.status === 200) {
    data = await res.json();
  } else if (res.status === 202) {
    const { jobId } = await res.json();
    if (!jobId) throw new Error('Supadata 202 sin jobId');
    const until = Date.now() + maxWaitMs;
    for (;;) {
      await sleep(pollMs);
      const r = await fetch(`${SUPADATA}/${encodeURIComponent(jobId)}`, { headers, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw await readError(r, 'Supadata (job)');
      const job = await r.json();
      if (job.status === 'completed') { data = job.result ?? job; break; }
      if (job.status === 'failed') {
        throw new Error(`Supadata: el job falló (${JSON.stringify(job.error ?? {}).slice(0, 200)})`);
      }
      if (Date.now() > until) throw new Error(`Supadata: el job ${jobId} no terminó en ${maxWaitMs / 1000} s`);
    }
  } else {
    // Ojo: 206 = "transcript-unavailable" (el video no tiene subtítulos todavía). res.ok es true
    // para 206, por eso se revisa el código exacto.
    throw await readError(res, 'Supadata');
  }

  const text = asText(data?.content).trim();
  if (!text) throw new Error('Supadata devolvió una transcripción vacía');
  return text.slice(0, MAX_TRANSCRIPT);
}

// ---------------------------------------------------------------- OpenAI

// Modelos de razonamiento (aceptan el campo `reasoning`).
const isReasoningModel = (m) => /^(o\d|gpt-5)/.test(m) && !/chat/.test(m);

/** Resumen en Markdown. Devuelve { text, usage }. */
export async function summarize({ title, transcript }, {
  fetch = globalThis.fetch, apiKey, model = 'gpt-5-mini', timeoutMs = 240_000,
} = {}) {
  const body = {
    model,
    instructions: SUMMARY_PROMPT,
    input: `Título del video: ${title}\n\nTranscripción:\n${transcript}`,
    max_output_tokens: 12_000,
  };
  if (isReasoningModel(model)) body.reasoning = { effort: 'low' };

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw await readError(res, 'OpenAI');
  const data = await res.json();

  if (data.status === 'incomplete') {
    throw new Error(`OpenAI: respuesta incompleta (${data.incomplete_details?.reason ?? 'sin motivo'})`);
  }
  if (data.status === 'failed' || data.error) {
    throw new Error(`OpenAI: ${data.error?.message ?? 'la respuesta falló'}`);
  }
  // `output_text` es un atajo de los SDKs; en el JSON crudo hay que recorrer output[].
  const text = (data.output ?? [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('')
    .trim();
  if (!text) throw new Error('OpenAI devolvió un texto vacío');
  return { text, usage: data.usage ?? null };
}

// ---------------------------------------------------------------- Proveedores

// Paso "video -> resumen", intercambiable con SUMMARY_PROVIDER. Plan B (no implementado):
// 'gemini', que recibe la URL de YouTube directa y no necesita transcripción.
const PROVIDERS = {
  openai: {
    vars: ['SUPADATA_API_KEY', 'OPENAI_API_KEY'],
    async run(video, { env, fetch, deadline }) {
      const transcript = await getTranscript(video.url, { fetch, apiKey: env.SUPADATA_API_KEY });
      const model = env.OPENAI_MODEL || 'gpt-5-mini';
      const timeoutMs = Math.max(10_000, Math.min(240_000, deadline - Date.now()));
      const { text, usage } = await summarize(
        { title: video.title, transcript },
        { fetch, apiKey: env.OPENAI_API_KEY, model, timeoutMs },
      );
      return { summary: text, model, usage };
    },
  },
};

function providerFor(env) {
  const name = env.SUMMARY_PROVIDER || 'openai';
  const provider = PROVIDERS[name];
  if (!provider) throw new HttpError(500, `SUMMARY_PROVIDER desconocido: ${name}`);
  for (const v of ['YOUTUBE_CHANNEL_ID', ...provider.vars]) {
    if (!env[v]) throw new HttpError(500, `Falta la variable ${v}`);
  }
  return provider;
}

export const wordCount = (text) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

// ---------------------------------------------------------------- Principal

/**
 * Resume el último video si todavía no está resumido.
 * Devuelve { action: 'skipped' | 'created' | 'error', id, ... }. Los errores del proceso
 * no se lanzan (quedan en la fila y en el resultado), para que el cron no reintente en loop.
 */
export async function refreshSummary({ store, env = process.env, fetch = globalThis.fetch, force = false }) {
  const deadline = Date.now() + BUDGET_MS;
  const provider = providerFor(env); // valida variables antes de gastar nada
  const video = await getLatestVideo(env.YOUTUBE_CHANNEL_ID, { fetch });
  const existing = await store.get(TABLE, video.id);

  if (!force && existing?.status === 'ok') {
    return { action: 'skipped', reason: 'ya resumido', id: video.id };
  }
  if (!force && existing?.status === 'error' && existing.attempts >= MAX_ATTEMPTS) {
    return { action: 'skipped', reason: 'demasiados intentos', id: video.id };
  }

  const base = {
    id: video.id,
    channel_id: env.YOUTUBE_CHANNEL_ID,
    title: video.title,
    video_url: video.url,
    published_at: video.publishedAt,
  };

  try {
    const { summary, model, usage } = await provider.run(video, { env, fetch, deadline });
    const words = wordCount(summary);
    await store.upsert(TABLE, [{
      ...base, status: 'ok', error: '', attempts: existing?.attempts ?? 0,
      summary, word_count: words, model, updated_at: new Date().toISOString(),
    }]);
    return { action: 'created', id: video.id, title: video.title, word_count: words, model, usage };
  } catch (e) {
    const error = String(e?.message || e).slice(0, 500);
    if (existing?.status === 'ok') {
      // force sobre un resumen bueno: no se pisa, solo queda en el log.
      console.error('[summary-refresh] falló la regeneración, se mantiene el resumen anterior:', error);
    } else {
      await store.upsert(TABLE, [{
        ...base, status: 'error', error, attempts: (existing?.attempts ?? 0) + 1,
        summary: '', word_count: 0, model: '', updated_at: new Date().toISOString(),
      }]);
    }
    return { action: 'error', id: video.id, error };
  }
}
