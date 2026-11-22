# 21 · Acceso más seguro

**Estado:** propuesta (ronda 2, 2026-11-22) · **Esfuerzo:** S (varias piezas chicas) · **Depende de:** —
· **Relacionada con:** 18 (respaldo), 20 (cabeceras en `vercel.json`)

## Problema y objetivo

La app protege todo con una sola clave compartida (`APP_PASSWORD` en el header `x-app-key`). Lo básico
está bien hecho:
- comparación con `timingSafeEqual`;
- RLS sin políticas y `revoke` para anon y authenticated;
- lista cerrada de hosts para los endpoints de push;
- sin CORS;
- los links de las notas solo aceptan `http(s)`.

`npm audit --omit=dev` da 0 vulnerabilidades. Pero hay puntos donde el riesgo es real para este caso:

1. **Sin límite de intentos.** `checkAuth` no limita, no demora y no registra los fallos. Quien adivine
   la clave puede leer, cambiar y borrar todo (`/api/bootstrap`, `DELETE`).
2. **Sin cabeceras de seguridad.** `vercel.json` solo define cachés: no hay CSP, `frame-ancestors`,
   `Referrer-Policy` ni `X-Content-Type-Options`. La clave vive en `localStorage`, así que cualquier XSS
   futuro podría leerla y mandarla afuera. Posibles vías: el markdown generado por la IA, el catálogo de
   terceros cargado desde `@main` o una dependencia comprometida.
3. **Previews con la base real.** Se trabaja con una rama por feature y Vercel despliega un preview por
   rama. Si las variables de Supabase están también en Preview, código a medio hacer escribe en los
   datos reales.
4. **No se puede cerrar sesión ni rotar la clave sin cortar el servicio.**
   - Ningún código borra `appKey`.
   - Rotar la clave obliga a redesplegar y a volver a entrar en todos los dispositivos.
   - El historial completo queda en claro en el almacenamiento del teléfono.
5. **Gasto en APIs de pago sin tope.**
   - `?force=1` (con la clave) se salta "ya resumido" y `MAX_ATTEMPTS`.
   - Cada llamada consume Supadata y OpenAI: hasta 200.000 caracteres de entrada.
6. **Esperas acumuladas del aviso de descanso.**
   - Cada POST/PUT a `/api/rest-alert` lanza una espera de hasta 240 s, y las reemplazadas siguen
     durmiendo.
   - El rearme manda la clave maestra a `url.origin`.
   - Un bug que repita PUT puede gastar la cuota de Hobby, y Vercel pausa el proyecto.
7. **Entrada sin topes por campo y errores internos expuestos.**
   - No hay largo máximo en `notes`, `name` ni `exercises`.
   - `readBody` mide el tamaño después de leer todo el cuerpo.
   - Los mensajes de Supabase se reenvían al cliente, y `/api/health` sin clave devuelve `e.message`.

Objetivo: cerrar estas puertas **sin agregar funciones de Vercel** y **sin romper el modo sin conexión**.

## Evidencia

- **OWASP:**
  - Authentication Cheat Sheet (proteger contra ataques automatizados).
  - Secure Headers Project.
  - HTML5 Security Cheat Sheet (tokens en localStorage).
  - API Security Top 10, API4:2023 Unrestricted Resource Consumption.
  - Input Validation y Error Handling Cheat Sheets.
- **Vercel WAF:** el plan Hobby incluye 1 regla de rate limiting. Según el foro de Vercel, la acción 429
  pide subir a Pro, así que se usa "deny".
  - https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
  - https://community.vercel.com/t/hobby-firewall-selecting-429-opens-pro-upgrade-despite-documented-allowance/50801
- **Vercel:** documentación de Environment Variables (alcance por entorno) y de Deployment Protection.
- **Código:**
  - `lib/router.js`: `checkAuth`, `sanitize`, `readBody`, `summaryRefresh` (`force`).
  - `lib/push-api.js`: `waitAndSend`, rearme.
  - `src/lib/api.js`: clave en localStorage.
  - `src/lib/catalog.js`: catálogo desde `@main`.

## Alcance

### A. Configuración (sin código, documentada en el README)

- **Vercel → Environment Variables:**
  - `SUPABASE_*`, `OPENAI_API_KEY`, `SUPADATA_API_KEY`, `CRON_SECRET` y `VAPID_PRIVATE_KEY` solo en
    **Production**.
  - Preview, sin base (los previews quedan solo con la interfaz) o con un segundo proyecto Supabase Free
    y otra `APP_PASSWORD`.
- **Deployment Protection** (Vercel Authentication) activada para los previews.
- **Firewall de Vercel:** 1 regla de rate limit sobre `/api/*`, por ejemplo 120 req/min por IP con
  acción deny. Antes hay que medir la importación de Strong, que manda lotes, para no bloquearla.
- **OpenAI:** límite de gasto mensual en el proyecto. **Supadata:** plan con tope duro.

### B. Clave y sesión

- En Vercel, **rechazar `APP_PASSWORD` con menos de 24 caracteres**: responde 500 con un mensaje claro.
  El README recomienda `openssl rand -base64 24`.
- **Rotación sin corte:** `checkAuth` acepta `APP_PASSWORDS` (lista separada por comas) además de
  `APP_PASSWORD`. Se agrega la nueva, se cambia en los dispositivos y se quita la vieja.
- **Registro de fallos:** cada 401 hace `console.warn` con la IP truncada, para verlo en los logs de
  Vercel.
- **Perfil → "Cerrar sesión en este dispositivo":**
  1. Si hay cambios sin sincronizar, avisa y ofrece descargar un respaldo.
  2. Borra `appKey`, la caché, la cola y el entrenamiento en curso.
  3. Vuelve al login.

### C. Cabeceras (en `vercel.json`, para `/(.*)`)

- Probar primero con `Content-Security-Policy-Report-Only` y el modo sin conexión, y después pasar a
  `Content-Security-Policy`:
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://cdn.jsdelivr.net;
  connect-src 'self' https://cdn.jsdelivr.net https://raw.githubusercontent.com;
  frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  ```
  El script en línea de la feature 20 entra con su hash.
- `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` y
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **Catálogo fijado a un commit** (`@<sha>` en vez de `@main`) en `src/lib/catalog.js`.

### D. Gasto y esperas

- **`force`:** se rechaza con 429 si el resumen se actualizó hace menos de 6 h (usa `updated_at`, que ya
  existe).
- **Aviso de descanso:**
  - `waitAndSend` duerme en tramos de ~30 s y termina si la alerta ya no existe o cambió su `end_at`.
  - Máximo 1 PUT cada 2 s por alerta.
  - El rearme usa `VERCEL_PROJECT_PRODUCTION_URL` como origen y se autentica con un HMAC del id de la
    alerta (secreto `REARM_SECRET`, o derivado de `VAPID_PRIVATE_KEY`), no con la clave maestra.

### E. Entrada y errores

- **Topes por campo en `sanitize`:**
  - textos de hasta 2.000 caracteres;
  - `exercises` de hasta 100 elementos;
  - cada fila de hasta 256 KB serializada.
  Calibrar antes con el historial real (en local, sin subirlo).
- **Tamaño del cuerpo:** rechazar por `content-length` antes de leerlo.
- **Errores:** los 5xx responden un mensaje genérico, con el detalle solo en `console.error`. `/health`
  sin clave devuelve solo `{ok:true}`.

## Casos borde

- **La regla del firewall bloquea la importación de un CSV grande:** la importación manda lotes de 200
  filas, menos de 60 requests. Ajustar el límite tras medirlo.
- **Cerrar sesión sin señal con cambios pendientes:** no se permite sin descargar antes el respaldo, o
  confirmar "perder los cambios".
- **CSP y las imágenes del catálogo:** cubiertas por `img-src`. Las de ejercicios propios no existen.
- **HMAC del rearme durante la transición:** las alertas armadas antes del deploy usan la clave vieja.
  Aceptar las dos durante una versión.

## Fuera de alcance

- Cuentas de usuario o tokens por dispositivo (queda como mejora futura si hace falta).
- Cifrar la caché local (la clave estaría en el mismo dispositivo).

## Criterios de aceptación

- [ ] Con `APP_PASSWORD` corta en Vercel, la API responde 500 con un mensaje claro (test con
      `VERCEL=1`).
- [ ] Con `APP_PASSWORDS="vieja,nueva"`, las dos claves funcionan (test).
- [ ] "Cerrar sesión" sin cambios pendientes deja la app en el login y sin datos locales; con cambios
      pendientes, pide descargar el respaldo primero (e2e).
- [ ] Las respuestas de `/` y `/api/*` traen CSP, `Referrer-Policy` y `nosniff`. La e2e completa pasa con
      la CSP activa, también la parte sin conexión.
- [ ] Un segundo `force` antes de 6 h responde 429 sin llamar a Supadata ni a OpenAI (test con fetch
      simulado).
- [ ] Una alerta movida 3 veces deja como máximo una espera activa por alerta, y el rearme no manda
      `x-app-key` (test de push).
- [ ] Un texto de 5.000 caracteres responde 400. Un 5xx no incluye el mensaje de Supabase.
- [ ] La checklist de configuración (A) está en el README y el usuario la marcó como hecha.

## Pruebas

- **Unitarias:**
  - `api.test.js`: claves, topes y errores genéricos.
  - `summary.test.js`: `force` y las 6 h.
  - `push.test.js`: esperas y HMAC.
- **e2e:** cerrar sesión, y la suite completa con la CSP activa.
