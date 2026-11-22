# 20 · Arranque rápido y sin pantallas en blanco

**Estado:** propuesta (ronda 2, 2026-11-22) · **Esfuerzo:** S–M · **Depende de:** —
· **Relacionada con:** 19 (datos), 21 (cabeceras de seguridad en `vercel.json`)

## Problema y objetivo

Hay tres cosas que hacen que la app se sienta lenta o frágil en el iPhone:

1. **El bundle principal pesa 953 KB (283 KB gzip).**
   - Recharts entra al chunk principal por una cadena de imports:
     `WorkoutEditor → ExerciseBlock → StallSheet → charts.jsx → @mantine/charts → recharts`.
   - Cada arranque descarga y parsea Recharts, Redux Toolkit, immer, d3 y decimal.js, aunque no haya
     ningún gráfico en pantalla.
2. **Un deploy puede dejar la app en blanco a mitad del entrenamiento.**
   - El service worker usa `registerType: 'autoUpdate'` con `skipWaiting` y `cleanupOutdatedCaches`.
   - Si sale un deploy con la PWA abierta (en iOS puede estar abierta días), la página vieja pide un chunk
     diferido con un hash que ya no existe. El import falla.
   - No hay `ErrorBoundary` ni manejo de `vite:preloadError`, así que React desmonta todo: pantalla en
     blanco.
   - Un dato corrupto en la caché también rompe el render en cada arranque, y nunca te enteras porque
     no hay registro de errores.
3. **El arranque no parece de app nativa.**
   - `index.html` no tiene `apple-touch-startup-image`, así que iOS muestra una **pantalla blanca** y
     después el cargador.
   - `data-mantine-color-scheme="dark"` está fijo, así que con el tema "Claro" se ve primero oscuro y
     luego claro.
   - `theme-color` y el estilo de la barra de estado son fijos.

Objetivo: **bundle principal a la mitad**, **nunca una pantalla en blanco** (con salida "Recargar /
Descargar respaldo") y un **arranque sin fogonazo**.

## Evidencia

- **Experimento del agente de confiabilidad:** solo con cargar `openStallSheet` mediante `import()`
  dinámico, `index` baja de **953,66 KB (283 KB gzip) a 493,11 KB (154 KB gzip)**.
- **`dist/sw.js`:** contiene `skipWaiting`. `grep "ErrorBoundary|preloadError|onerror" src` no encuentra
  nada.
- **web.dev:** sin imagen de inicio, iOS muestra blanco mientras carga.
  https://web.dev/learn/pwa/enhancements
- **Foro de Apple:** la imagen de inicio tiene que coincidir con la resolución exacta del equipo.
  https://developer.apple.com/forums/thread/733490
- **Vite:** documenta el evento `vite:preloadError` para recargar cuando falla un chunk.

## Qué hay hoy en el código

- **`src/views/workout/StallSheet.jsx:5`:** `import { TrendChart, fnum } from '../../charts/charts.jsx'`.
  `ExerciseBlock.jsx:27` lo importa de forma estática.
- **`src/main.jsx`:** importa `@mantine/charts/styles.css`.
- **`vite.config.js:12`:** `registerType: 'autoUpdate'`.
- **`index.html`:** `data-mantine-color-scheme="dark"`, `theme-color #0f1114`,
  `apple-mobile-web-app-status-bar-style black-translucent` y solo `apple-touch-icon`.
- **`src/App.jsx`:** vistas con `lazy()` y cargador de puntos mientras llegan los datos.

## Alcance

### A. Bundle

- `openStallSheet` se carga con `import()` dinámico desde `ExerciseBlock`. `stallSince` y los textos que
  usa la tarjeta pasan a `src/lib/stalls.js`.
- `fnum`, `vol` y `dateShort` salen de `charts.jsx` a `src/lib/format.js`, porque `ProfileHero` y otros
  los importan solo para formatear.
- `@mantine/charts/styles.css` se importa en `charts.jsx`, no en `main.jsx`.
- **Presupuesto en CI:** `npm run build` falla si `index-*.js` supera **550 KB**. Es un script chico
  que lee `dist/assets`.

### B. A prueba de fallos

- **`ErrorBoundary` raíz** con:
  - "Algo falló" y el mensaje;
  - **"Recargar"**;
  - **"Descargar respaldo"**, que lee la caché y la cola directo del almacenamiento, sin depender de
    React;
  - si hay un entrenamiento en curso, "Descargar entrenamiento en curso".
- `window.addEventListener('vite:preloadError', () => location.reload())`, una sola vez por sesión (una
  marca en `sessionStorage` evita los bucles).
- **Service worker con `registerType: 'prompt'`:**
  - Aviso "Nueva versión disponible · Actualizar", que **no aparece durante un entrenamiento en curso**.
  - Al terminar el entrenamiento se aplica sola.
- **Registro de errores:**
  - `window.onerror` y `unhandledrejection` → un buffer circular local de 50 entradas.
  - Perfil → Datos → "Errores recientes" para verlos y copiarlos.
  - Opcional: enviarlos con `POST /api/client_errors` a una tabla, por `api/[resource].js`, sin función
    nueva.

### C. Arranque nativo

- **Imágenes de inicio** generadas por un script (`scripts/startup-images.mjs`, con
  `pwa-asset-generator` como dependencia de desarrollo o `sharp`) para los tamaños de iPhone actuales:
  fondo #0f1114 con el ícono. Van enlazadas con `media` en `index.html`.
- **Script en línea en `<head>`**, antes de que cargue React, que lee la preferencia de tema guardada y
  `matchMedia`. Con eso fija `data-mantine-color-scheme`, el `theme-color` y el estilo de la barra de
  estado: `default` en claro, `black-translucent` en oscuro. Hay que verificar en el iPhone que iOS lo
  respeta al abrir. Si no, se documenta que el cambio de tema se ve desde la siguiente apertura.
- Dos `<meta name="theme-color">` con `media="(prefers-color-scheme: …)"` para el modo Auto.
- Si los datos ya están en caché, se salta el cargador de puntos y se renderiza directo.

## Casos borde

- **Deploy con un entrenamiento en curso:** el aviso de nueva versión espera. Si igual falla un chunk,
  `preloadError` recarga, y el entrenamiento en curso sigue en el almacenamiento local, así que no se
  pierde.
- **`ErrorBoundary` dentro de una vista diferida:** basta uno raíz. Opcionalmente, uno por vista para
  que un error en Lectura no tumbe Entrenar.
- **Script en línea y la cabecera CSP de la feature 21:** usar un hash `sha256-…` del script en la CSP,
  o moverlo a un archivo chico en `/public`.

## Fuera de alcance

- Reescribir los gráficos sin Recharts.
- Sincronización incremental (ver 19).

## Criterios de aceptación

- [ ] `index-*.js` pesa ≤ 550 KB (≤ 170 KB gzip) y el build falla si se pasa.
- [ ] La hoja de estancamiento sigue abriendo, también sin conexión (su chunk queda precacheado).
- [ ] Forzar un error de render muestra la pantalla de error con "Recargar" y "Descargar respaldo", y el
      respaldo descargado es válido para "Restaurar".
- [ ] Simular la falla de un chunk recarga una sola vez.
- [ ] Con un service worker nuevo disponible y un entrenamiento en curso, no aparece el aviso; al
      terminar, se actualiza.
- [ ] En el iPhone: abrir la app no muestra blanco y el tema "Claro" no parpadea en oscuro (verificado a
      mano).
- [ ] Los errores no atrapados quedan en "Errores recientes".

## Pruebas

- **Unitaria:** script del presupuesto del bundle.
- **e2e:**
  - Componente que lanza un error → pantalla de error y descarga del respaldo.
  - Evento `vite:preloadError` simulado → una sola recarga.
  - La hoja de estancamiento abre (como ya hace la e2e de 06).
