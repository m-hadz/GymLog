# 11 · Aviso de fin de descanso con el teléfono bloqueado

**Esfuerzo:** M–L · **Depende de:** — · **Es infraestructura para:** recordatorios, resumen semanal por
notificación (fuera de alcance aquí)

## Problema y objetivo

El temporizador de descanso funciona bien con la app abierta, pero:
- con la pantalla bloqueada o con otra app delante, el navegador suspende la página y **no suena**;
- en iPhone, `navigator.vibrate` no existe en Safari, así que hoy **nunca vibra** (el código lo llama,
  pero no hace nada).

El objetivo: que al terminar el descanso llegue una **notificación del sistema** (sonido y vibración del
teléfono) aunque la app esté en segundo plano o la pantalla bloqueada.

## Evidencia

- Queja frecuente en reseñas ("el temporizador no suena si no estás en la app"). Usuarios de Whoop y Bevel
  dicen que mantienen Strong solo por la campana de fin de descanso. Hevy y Setgraph lo resuelven con
  Live Activities (nativo).
  https://help.hevyapp.com/hc/en-us/articles/35649846517399 · https://feedback.caliberstrong.com
- Límites de la plataforma en 2026 (lo que decide el diseño):
  - Las PWA **no pueden programar notificaciones locales** (la API Notification Triggers nunca salió del
    origin trial; Safari solo soporta push).
    https://developer.chrome.com/docs/web-platform/notification-triggers · https://developer.apple.com/forums/thread/735402
  - Web Push en iPhone funciona **solo con la app instalada** en la pantalla de inicio (iOS 16.4+).
    https://firt.dev/notes/pwa-ios/
  - En iOS, cada push **debe mostrar una notificación**; si no, Safari revoca la suscripción tras 3 pushes.
    https://dev.to/progressier/how-to-fix-ios-push-subscriptions-being-terminated-after-3-notifications-39a7
  - Sin Live Activities ni widgets desde la web.
  - El cron de Vercel en plan Hobby corre como máximo una vez al día: no sirve para esto.
  - Las Edge Functions de Supabase duran como máximo 150 s en el plan gratis.
    https://supabase.com/docs/guides/functions/limits

## Qué hay hoy en el código

- `src/lib/rest-timer.js`: guarda la hora de término en `localStorage`, revisa cada 500 ms, y al terminar
  suena con Web Audio y llama a `navigator.vibrate`.
- Service worker generado por Workbox (`vite.config.js`, `injectRegister: false`); no maneja `push`.
- Pantalla encendida durante el entrenamiento (Wake Lock), ya implementada.

## Diseño

### Flujo

1. El usuario activa "Avisar fin de descanso con la app cerrada" en Perfil → Ajustes. Solo después de
   ese toque se pide el permiso de notificaciones (requisito de iOS). En iPhone sin la app instalada se
   explica cómo instalarla en lugar de pedir el permiso.
2. El navegador crea una suscripción push (clave pública VAPID) que se guarda en el servidor.
3. Al empezar un descanso, la app hace `POST /api/rest-alert` con `{ alert_id, end_at }` (y `PUT` al
   sumar o restar 15 s, `DELETE` al saltar el descanso, terminar o descartar el entrenamiento).
4. El servidor envía un push **sin contenido** a la hora `end_at`, solo si la alerta sigue activa y su
   `end_at` no cambió.
5. El service worker recibe el push y muestra la notificación "Descanso terminado" con `tag: 'rest'`
   (cada una reemplaza a la anterior). Tocarla abre la app en `#/workout`.
6. Si la app está visible al terminar el descanso, suena como hoy y, además, cierra la notificación con
   `registration.getNotifications({ tag: 'rest' })` apenas aparece (en iOS no se puede evitar mostrarla).

**Push sin contenido:** evita implementar el cifrado de contenido de Web Push (RFC 8291); solo hace falta
la autenticación VAPID (un JWT ES256, que se firma con `node:crypto` sin dependencias, siguiendo la
convención del repo). El texto de la notificación es fijo en el service worker.

### Cómo enviar el push a la hora exacta (decidir con una prueba)

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| A. Función de Vercel que espera | `POST /api/rest-alert` guarda la alerta y deja la función esperando hasta `end_at` (con `waitUntil`), luego revisa si sigue vigente y envía | Sin infraestructura nueva; precisión de ~1 s | Una invocación por serie (unas 20 por entrenamiento); descansos limitados a la duración máxima de la función (300 s); hay que confirmar que `waitUntil` sigue corriendo si el teléfono corta la conexión |
| B. Supabase pg_cron cada pocos segundos | Tabla `rest_alerts`; un job de pg_cron revisa en SQL si hay alertas vencidas y solo entonces llama con `pg_net` a `/api/push-due` | Robusto, sin límite de duración | Precisión limitada al intervalo del job; hay que confirmar que Supabase permite intervalos de segundos en el plan gratis |

**Recomendación:** prototipo con A; si falla la prueba en iPhone (la función se corta), pasar a B.

### Datos

```sql
create table if not exists push_subscriptions (
  id          text primary key,         -- hash del endpoint
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists rest_alerts (
  id              text primary key,     -- alert_id generado por el cliente
  subscription_id text not null,
  end_at          timestamptz not null,
  status          text not null default 'pending', -- pending | sent | cancelled
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- + grant/revoke/RLS como el resto; limpiar alertas de más de 1 día
```

Variables nuevas: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (una URL o `mailto:` que
definas tú). Un script `scripts/vapid-keys.mjs` genera el par de claves.

### Endpoints

- `POST /api/push-subscribe` (con `x-app-key`): guarda o actualiza la suscripción.
- `DELETE /api/push-subscribe`: la borra (al desactivar el ajuste).
- `POST|PUT|DELETE /api/rest-alert` (con `x-app-key`).
- Si el servicio de push responde 404 o 410, la suscripción se borra.

### Sin conexión

Sin señal no se puede programar el push: el descanso funciona como hoy (solo en la app) y la app no
muestra errores. Si la alerta no se pudo registrar, el temporizador muestra un ícono discreto de
"aviso no disponible".

## Casos borde

- Descansos de 0 s o el temporizador desactivado: no se programa nada.
- Varios dispositivos suscritos: se avisa solo al que inició el descanso.
- Cambiar de descanso rápido (marcar varias series seguidas): cada alerta nueva cancela la anterior.
- El usuario revoca el permiso desde el sistema: el siguiente envío falla con 410 y se borra la suscripción.
- Android Chrome: el mismo flujo funciona; Android no exige mostrar la notificación, pero se muestra igual.

## Fuera de alcance

- Recordatorios de entrenamiento y resumen semanal por notificación (reutilizarán esta infraestructura).
- Cuenta regresiva visible en la pantalla bloqueada (imposible en una PWA).
- Mostrar el siguiente ejercicio dentro de la notificación (requiere push con contenido cifrado).

## Criterios de aceptación

- [ ] En un iPhone con la app instalada, con el ajuste activo, un descanso de 60 s con la pantalla
      bloqueada produce una notificación con sonido entre 0 y 5 s después del final, en al menos 9 de 10
      intentos (medido y anotado en el PR).
- [ ] Lo mismo en Android con Chrome.
- [ ] Sumar 15 s mueve el aviso; saltar el descanso o terminar el entrenamiento lo cancela (no llega).
- [ ] Con la app abierta y visible, suena como hoy y la notificación se cierra sola.
- [ ] Tocar la notificación abre la app en el entrenamiento en curso.
- [ ] El permiso se pide solo al activar el ajuste; en iPhone sin instalar se explica cómo instalar.
- [ ] Desactivar el ajuste borra la suscripción del servidor.
- [ ] Una suscripción vencida (410) se borra sola.
- [ ] Sin conexión, el descanso funciona como hoy y no aparecen errores.
- [ ] El push se envía sin dependencias nuevas en el backend (VAPID firmado con `node:crypto`), con tests
      del JWT contra un vector de prueba.
- [ ] Ninguna alerta se envía dos veces (test de la condición `pending` → `sent`).

## Pruebas

- Unitarias: firma VAPID (JWT ES256), lógica de alertas (crear, mover, cancelar, vencer), manejo de 404/410.
- Prueba manual documentada en el PR con iPhone y Android (tiempos medidos).

## Preguntas abiertas

- ¿Opción A o B tras el prototipo?
- ~~¿GymLog está instalada en la pantalla de inicio del iPhone?~~ Sí (respondido el 2026-11-20), así que
  Web Push funciona en ese teléfono.
