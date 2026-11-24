# 19 · Sincronización y almacenamiento confiables

**Estado:** propuesta (ronda 2, 2026-11-22) · **Esfuerzo:** M–L · **Depende de:** —
· **Relacionada con:** 18 (respaldo), 22 (Atajos que escriben desde afuera)

## Problema y objetivo

La capa de datos (`src/lib/data.js`) funciona sin conexión, pero tiene puntos donde un entrenamiento
puede quedar días sin subir o perderse.

1. **Solo sincroniza al abrir.**
   - `refresh()` corre al arrancar (`src/App.jsx:80`) y en el login.
   - `flush()` corre después de un `refresh`, con cada cambio o con el evento `online`, que iOS no
     dispara de forma confiable.
   - iOS deja la PWA suspendida en memoria días enteros. Un entrenamiento terminado sin señal puede
     quedar solo en el teléfono, y lo que se escribe desde otro dispositivo o un Atajo no aparece.
2. **`fetch` no tiene timeout** (`src/lib/api.js`). Con señal débil, un request colgado deja
   `flushing = true` y bloquea todas las sincronizaciones siguientes.
3. **Se descartan cambios.** Ante un 400, 404 o 413 la operación se borra de la cola con solo un aviso
   de 5 s (`data.js`). Si un entrenamiento o un programa no pasa la validación del servidor, se pierde.
   En v0.1 ya no se descartan el 409 (tabla sin crear) ni el 404 sin JSON, pero los demás sí.
4. **Conflictos.**
   - El servidor rellena con valores por defecto los campos que faltan y reemplaza la fila completa.
   - `savePrefs` y `saveSyncedSettings` mandan la fila entera armada desde el estado local.
   - Un dispositivo con datos viejos pisa un `training_max` o un `programs.state` más nuevos.
   - `refresh()` reaplica la cola sobre los datos frescos, así que una fila vieja pendiente le gana a la
     del servidor.
5. **localStorage tiene un límite de ~5 MB.**
   - Cada cambio reescribe la caché completa y la cola guarda filas enteras sin fusionar.
   - Un entrenamiento ocupa ~4,1 KB, así que se llega al límite en ~3 años, o antes si se restaura un
     respaldo sin señal.
   - Cuando se llena, `writeJSON` solo hace `console.warn`: el entrenamiento en curso deja de guardarse
     y se pierde si iOS cierra la app.
6. **No hay pruebas de `data.js`.** Los puntos 1–5 tocan justo ese código.

Objetivo: que **ningún cambio se pierda**, que sincronice **al volver a la app**, que un dispositivo
viejo **no pise** datos nuevos y que el almacenamiento **no se llene** sin aviso.

## Evidencia

- **Medición del agente de confiabilidad:** ~4,1 KB por entrenamiento de 14 ejercicios. 60
  entrenamientos ocupan 249 KB y 500 ocupan 2,07 M caracteres. WebKit guarda localStorage en UTF-16, así
  que 5 MB ≈ 2,5 M caracteres.
  - https://bugs.webkit.org/show_bug.cgi?id=245479
  - https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- **WebKit:** `navigator.storage.persist()` se concede con heurísticas que favorecen las apps de
  pantalla de inicio. https://webkit.org/blog/14403/updates-to-storage-policy/
- **PostgREST:** con `Prefer: resolution=merge-duplicates`, solo actualiza las columnas que vienen en el
  cuerpo.
- **Búsqueda en el código:** `grep "refresh()"` encuentra solo `App.jsx:80` y `LoginView.jsx:20`.
  Ningún test importa `data.js`.

## Qué hay hoy en el código

- **`src/lib/data.js`:**
  - `refresh`, `upsert`, `remove`, `flush` (cola `outbox`), `persistCache`, `writeJSON`.
  - `savePrefs`, `saveSyncedSettings`.
- **`src/lib/api.js`:** `api()` con `ApiError` e `isHeld` (409 / 404 sin JSON, v0.1).
- **`lib/router.js`:** `sanitize` rellena valores por defecto. El upsert va con `merge-duplicates`.

## Alcance

### A. Sincronizar cuando corresponde

- **`api()`:** `AbortSignal.timeout(15000)`. Si se agota, el error es de red y se reintenta.
- **Reintentos con backoff:** 5 s → 15 s → 1 min → 5 min, mientras `outbox.length > 0` y haya red. Se
  reinicia con cada cambio nuevo.
- **`visibilitychange → visible`:** `flush()` y después `refresh()`, como máximo una vez cada 60 s y
  nunca durante un entrenamiento en curso (no cambia lo que se ve mientras entrenas).
- **Al arrancar:** `flush()` aunque falle `refresh()`.
- **`refresh` y `flush` se encadenan:** nunca corren a la vez.

### B. No perder cambios rechazados

- Lo que hoy se descarta (400/413, y 404 con JSON en un upsert) pasa a una cola **`rejected`**
  persistida, con el mensaje del servidor.
- Perfil → Datos → **"Cambios sin guardar (N)"**, con las opciones "Reintentar", "Descargar JSON" y
  "Descartar".
- `rejected` entra en el respaldo JSON.
- Un 404 en un DELETE se sigue descartando: la fila ya no existe.

### C. Enviar solo lo que cambió (preferencias y ajustes)

- `savePrefs(id, patch)` y `saveSyncedSettings(patch)` encolan **solo el patch**: `{op:'patch', table,
  id, fields}`.
- **Servidor:** `PATCH /api/<tabla>?id=` (por el mismo router, sin funciones nuevas) actualiza solo esas
  columnas. En `user_settings.data`, que es un objeto, se hace un merge de primer nivel con
  `data || patch`, mediante una RPC o leyendo y escribiendo en una transacción.
- **`refresh()`:** al reaplicar la cola, los patches solo pisan sus campos.

### D. Conflictos en workouts, templates y programs

- Cada fila guarda `updated_at` del servidor. El cliente manda `base_updated_at` con el upsert.
- Si el servidor tiene una fila más nueva (`updated_at > base`), responde **409 `conflict`** con la fila
  actual. La app guarda las dos versiones y muestra "Este entrenamiento cambió en otro dispositivo:
  ¿cuál dejar?".
- Las filas nuevas (sin `base`) se insertan como hoy.

### E. Almacenamiento

- `cache` y `outbox` pasan a **IndexedDB** con un envoltorio mínimo de ~40 líneas, sin dependencia, o
  con `idb-keyval` (< 1 KB). `activeWorkout` sigue en localStorage (chico y síncrono).
- Migración única al arrancar: leer las claves viejas, escribir en IndexedDB y borrarlas.
- `navigator.storage.persist()` al arrancar (y el resultado en Perfil → Datos).
- **Cola compacta:** varios upserts de la misma fila se fusionan en el último; un upsert seguido de un
  delete deja solo el delete.
- **Si una escritura falla:** `state.storageError` y un aviso rojo persistente con "Descargar respaldo".

### F. Pruebas de la capa de datos

- `test/data.test.js` con `localStorage`, `indexedDB` (fake-indexeddb, solo dev), `fetch` y `window`
  simulados.

## Casos borde

- **Entrenamiento en curso al volver a la app:** `refresh` se pospone hasta terminar; `flush` sí corre.
- **Dos patches al mismo campo sin conexión:** gana el último (orden de la cola).
- **Conflicto en un programa (12):** se ofrece "usar el del servidor" por defecto. El estado del
  programa suele avanzar en un solo dispositivo.
- **Navegador sin IndexedDB** (modo privado antiguo): vuelve a localStorage con el aviso de espacio.

## Fuera de alcance

- Sincronización incremental (`bootstrap?since=`). Se descarga todo en cada arranque (~750 KB por año
  de historial); queda para cuando pese.
- Edición simultánea en tiempo real.

## Criterios de aceptación

- [ ] Un request que no responde se corta a los 15 s y no bloquea los siguientes (test con fetch
      colgado).
- [ ] Un entrenamiento terminado sin red se sube solo al volver la red, **sin reabrir la app**: el
      reintento o `visibilitychange` (test con reloj simulado).
- [ ] Un upsert rechazado con 400 queda en "Cambios sin guardar"; "Reintentar" lo vuelve a mandar y
      "Descargar" baja el JSON.
- [ ] Cambiar `stall_snooze_until` en el teléfono no pisa un `training_max` que cambió en otro
      dispositivo (test con dos clientes simulados y el router con fileStore).
- [ ] Guardar un entrenamiento con `base_updated_at` viejo responde 409 `conflict` y la app pregunta.
- [ ] Con 500 entrenamientos en caché, no se usa localStorage para `cache` ni `outbox`, y la cola con
      10 cambios a la misma fila tiene una sola operación.
- [ ] Simular la cuota llena muestra el aviso rojo con "Descargar respaldo".
- [ ] `test/data.test.js` cubre: sin señal → reabrir → flush; 500 y reintento; descarte a `rejected`;
      fusión de la cola; `refresh` concurrente con `flush`.

## Pruebas

- **Unitarias:** `test/data.test.js` (los casos de arriba) y el router con `PATCH` y `base_updated_at`.
- **e2e:** dos contextos de navegador editando la misma plantilla. El segundo ve el aviso de conflicto.
