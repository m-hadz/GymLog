# GymLog — v0.0.9

Registro de entrenamientos personal, inspirado en el flujo de Strong y escrito desde cero.
Frontend en React + [Mantine](https://mantine.dev) (compilado con Vite, instalable como PWA),
funciones serverless en Vercel y Postgres gratuito en Supabase.

## Qué hace (v1)

- **Entrenar:** entrenamiento vacío o desde una plantilla; series con kg/reps, columna
  "Anterior" (tócala para copiar), ✓ por serie que rellena con lo de la vez anterior si lo
  dejas vacío, tipos de serie (normal, W calentamiento, D drop, F fallo), reordenar ejercicios,
  notas, descanso por ejercicio y temporizador automático con sonido y vibración.
- **No pierdes nada:** el entrenamiento en curso vive en el teléfono (sobrevive a recargas) y
  todo se guarda "offline-first": si el gimnasio no tiene señal, se sincroniza después.
- **Plantillas:** crear, editar, duplicar, eliminar, guardar un entrenamiento como plantilla y
  actualizar la plantilla al terminar si cambiaste ejercicios o series.
- **Historial y calendario:** duración, volumen, récords (RP) y mejor serie por ejercicio;
  editar entrenamientos pasados, repetir y eliminar.
- **Ficha de ejercicio:** descripción con imágenes e instrucciones, historial, **gráficas**
  (1RM estimado, peso máximo, volumen y reps) y **registros** (1RM, peso, volumen y tabla por
  repeticiones). Todo gratis, sin muro PRO.
- **Catálogo:** 800+ ejercicios con imágenes de [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
  (dominio público), más tus ejercicios propios, que puedes vincular a una imagen del catálogo.
- **Mapa del cuerpo:** dibujo anatómico de
  [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter)
  (licencia MIT, © 2022 ELABBASSI Hicham), copiado como datos en `src/views/profile/bodyPaths.js`
  con el aviso de la licencia; funciona sin conexión.
- **Lectura del día:** cada mañana resume en español (8–10 min de lectura) el último video
  largo de un canal de YouTube, para leerlo en el teléfono, también sin señal.
- **Tus datos:** importar el CSV de Strong (sin duplicar si lo reimportas; convierte libras a
  kg), exportar en formato Strong, descargar y restaurar un respaldo JSON (se combina, no borra).

### Nuevo en v0.1
- **Programas por porcentaje del máximo** ([feature 12](docs/features/12-programas-porcentaje.md)): Entrenar →
  "Programas" → **5/3/1** (4 días, semanas 65/75/85 % × 5, 70/80/90 % × 3, 75/85/95 % × 5/3/1, la última
  serie "al máximo"; descarga opcional) o **GZCLP** (A1/B1/A2/B2 con T1 5 × 3+ → 6 × 2+ → 10 × 1+ → prueba
  de 5RM, T2 3 × 10 → 8 → 6, T3 3 × 15+ que sube con 25 reps). Asistente de 3 pasos con máximos y pesos
  sugeridos desde tu historial. Tarjeta en Entrenar con el día que toca, "Empezar", saltar, repetir,
  cambiar de semana y pausar; al terminar, el resumen dice qué cambia la próxima vez y, al cerrar un ciclo
  de 5/3/1, ofrece subir los máximos (+2,5 kg superior, +5 kg inferior, con opción de excluir uno).
- **Máximo de entrenamiento** por ejercicio en su ficha, con el sugerido (90 % del mejor 1RM estimado de 3
  meses) y el historial de cambios. **Series en % del máximo** y **"reps al máximo" (5+)** en cualquier
  plantilla (menú del número de serie). Los pesos se redondean a lo que se puede armar con tu barra y discos.
- Tabla nueva `programs`: correr su bloque de `schema.sql` en Supabase. Las plantillas de cada programa
  son plantillas normales, en una carpeta con su nombre (no aparecen en "Mis plantillas").
- `api/[resource].js`: los recursos sin archivo propio (`user_settings`, `programs`) van por una sola
  función, para no pasar el máximo de 12 del plan Hobby de Vercel.

### v0.0.9
- **Tipos de ejercicio** ([feature 04](docs/features/04-pendientes-validados.md)): en Ajustes del
  ejercicio, *peso y reps*, *peso corporal*, *con lastre* (anotas lo agregado), *asistido* (anotas la
  asistencia) o *por tiempo*. Volumen, 1RM y récords usan la carga real con tu peso corporal (ajuste
  "Contar el peso corporal en el volumen" en Perfil → Ajustes → Cuerpo). Se ve "PC + 10 kg × 8".
- **Series por tiempo** con cronómetro en la fila: cuenta regresiva con sonido si hay objetivo, hacia
  adelante si no; sobrevive a bloquear la pantalla. Récord y gráficos de tiempo.
- **Nota fija por ejercicio** (asiento, agarre, link a un video), arriba del ejercicio en todos los
  entrenamientos. Menú del ejercicio → "Nota fija", o desde la ficha.
- **Mancuernas por mano y unilaterales** ([feature 05](docs/features/05-mancuernas-por-mano.md)): en
  Ajustes del ejercicio, la carga se anota *total*, *por mano* o *unilateral*; en los dos últimos el
  volumen cuenta el doble y el 1RM queda sobre lo anotado. La primera vez que usas una mancuerna, la app
  pregunta una sola vez (con opción "para todas las mancuernas"). Columna "kg c/u" / "kg/lado".
- **Estancamiento y reinicio** ([feature 06](docs/features/06-estancamiento-reinicio.md)): un ejercicio está
  estancado si el 1RM estimado de sus últimas 6 sesiones no supera en más de 1 % al de las 6 anteriores.
  Etiqueta "Estancado" en el entrenamiento, tarjeta "Estancados" en el perfil y en la ficha. Propone un
  **reinicio** (−10 % de peso y las reps para superar tu 1RM, ajustable 5/10/15 %) como opción principal;
  "Ignorar por 7 sesiones".
- **Resumen mensual y anual** ([feature 07](docs/features/07-resumen-mensual-anual.md)): `#/report/2026-11`
  y `#/report/2026`. Totales contra el periodo anterior, días entrenados, constancia, récords, ejercicios
  más hechos, progreso por ejercicio, series por músculo, mejor semana y estancados al cierre; el anual
  suma meses, racha más larga, mejora de los más hechos, ejercicios nuevos y "como levantar N autos".
  Entrada desde Perfil → Progreso y desde cada mes del Historial. Botón "Compartir" con vista previa de
  una imagen del resumen (se crea en el teléfono) para compartirla o descargarla.
- **Regiones por músculo y grupo editable** ([feature 08](docs/features/08-mapa-muscular.md), completa
  la primera versión de v0.0.7): cada ejercicio puede tener 1–2 regiones (pecho superior, deltoide
  lateral, braquial…) y la hoja de cada músculo muestra las series por región, marca "sin trabajar esta
  semana" y lista los ejercicios sin región para asignarla en 2 toques. El grupo de un ejercicio del
  catálogo ahora se puede corregir (ficha → Músculo). Mini mapa "Músculos trabajados" en el resumen de
  cada entrenamiento. Dibujo del cuerpo nuevo, anatómico (MIT, ver arriba), cargado aparte.
- **Meta de constancia y racha reparable** ([feature 09](docs/features/09-constancia-racha.md)): modos
  "Sin meta" (semanas con al menos uno, como antes), "Cada N días" (día por medio con tolerancia: la
  racha cuenta entrenamientos seguidos) y "N por semana". Tarjeta en Entrenar ("Hoy toca", "Mañana toca",
  "Último día para no cortar la racha"), franja de 30 días y mejor racha en el Perfil, pausas de hasta 14
  días (una cada 6 semanas) y registrar un entrenamiento en un día pasado desde el Calendario (repara la
  racha). Un solo cálculo (`src/lib/streak.js`) para Entrenar, Calendario, Perfil y el resumen.
- **Reemplazar un ejercicio** ([feature 10](docs/features/10-reemplazar-ejercicio.md)): menú del
  ejercicio → "Reemplazar" (en curso y en el editor de plantilla). Sugiere 6 del mismo músculo y equipo
  primero, luego del mismo músculo y luego del mismo grupo; en cada grupo, primero los que ya hiciste con
  tu última serie ("La última vez: 63 × 7"); debajo, el buscador. Las series pendientes pasan vacías al
  nuevo (sin traspasar el peso); si ya había hechas, el original se queda con ellas y el nuevo va debajo.
  "Solo hoy" o "También en la plantilla", deshacer por 5 s, y "No sugerir más" (se revierte en la ficha).
- **Aviso de fin de descanso con la app cerrada** ([feature 11](docs/features/11-aviso-descanso-push.md)):
  Perfil → Ajustes → "Aviso con la app cerrada". Al empezar un descanso, el servidor queda esperando
  y a la hora de término manda un push: llega la notificación "Descanso terminado" con sonido aunque la
  pantalla esté bloqueada. Sumar/restar 15 s la mueve; saltar, terminar o descartar la cancela; tocarla
  abre el entrenamiento. Con la app abierta suena como siempre y la notificación se cierra sola. En iPhone
  requiere la app instalada en la pantalla de inicio. Botón "Probar aviso (10 s)". Necesita las claves
  VAPID (ver Deploy) y las tablas `push_subscriptions` y `rest_alerts` de `schema.sql`.
- Corrección: faltaba `api/user_settings.js`, así que en Vercel la meta de constancia (09) no se guardaba
  en el servidor (quedaba como cambio pendiente). Ahora sí.
- Tabla nueva `user_settings` (meta y pausas sincronizadas): correr su bloque de `schema.sql` en
  Supabase. Mientras no exista, la app funciona y la meta queda como cambio pendiente de sincronizar.

### v0.0.8
- **Peso corporal y medidas** ([feature 03](docs/features/03-peso-corporal-medidas.md)): Perfil →
  Cuerpo muestra el **peso de tendencia** (media móvil ponderada por días, no salta con el agua y la
  comida), el último registro y el ritmo en kg/semana. Pantalla `#/body` con gráfico de registros y
  tendencia, medidas (cintura, cuello, brazos…), grasa estimada (Marina de EE. UU., si indicas sexo y
  estatura), lista editable y exportar CSV. Un registro por día.
- Tabla nueva `body_metrics`: correr su bloque de `schema.sql` en Supabase.
- Los diálogos de confirmación se abren por encima de las hojas inferiores.

### v0.0.7
- **Calentamiento sugerido** ([feature 02](docs/features/02-calentamiento.md)): una línea en el
  primer ejercicio de cada músculo ("Calentamiento: 20 × 10 · 45 × 5 · 65 × 5") con pesos que se
  pueden armar (discos, pesos que ya usaste o mínimo aumento), y "Agregar" para sumarlas como series de
  calentamiento. También en el menú del ejercicio y automático por plantilla. Esquema y descanso
  editables en Perfil.
- "Anterior" se alinea por tipo de serie: agregar calentamientos ya no corre la comparación.
- **Espalda** se separa en Dorsales y Espalda alta (y Lumbar para ejercicios de zona lumbar), y
  Abductores pasa a ser su propio grupo (antes contaba como Glúteos).
- **Mapa del cuerpo** en Perfil (frente y espalda, 2D): cada músculo se colorea según sus series
  **directas** por semana (últimas 4 semanas o 7 días). Rojo = rezagado, sube el volumen; amarillo =
  mejorable; verde = bien. Mucho volumen nunca se marca como problema. Meta editable (8 por defecto).
  Tocar un músculo muestra qué ejercicios lo trabajan.

### v0.0.6
- **Objetivo para superar** ([feature 01](docs/features/01-sugerencia-progresion.md)): en el
  entrenamiento, cada ejercicio muestra cuántas reps necesitas con el mismo peso para superar tu
  1RM estimado de la vez anterior, y con el siguiente peso posible ("Para superar: 63 × 8 · o 65 × 7").
  El ✓ en vacío guarda la propuesta. Respeta el mínimo aumento y el tope de cada máquina (Ajustes del
  ejercicio) y prefiere los pesos que ya usaste. Se puede apagar en Perfil.
- **Grupos por músculo:** "Brazos" y "Piernas" se separan en bíceps, tríceps, antebrazo, cuádriceps,
  isquiotibiales, glúteos, aductores y pantorrillas, para que las series por grupo se comparen parejo.
- Tabla nueva `exercise_prefs` (preferencias por ejercicio): correr su bloque de `schema.sql` en Supabase.

### v0.0.5
- **Lectura del día** (pestaña nueva): un cron diario toma el último video largo del canal
  configurado, lo transcribe y genera una lectura en español. Ver [Lectura del día](#lectura-del-día).
- **Contra la última vez** compara por fuerza (1RM estimado de la mejor serie) en vez de por
  volumen: subir de peso con menos series ya no aparece como retroceso.

### v0.0.4
- **Interfaz rediseñada desde cero** con React + Mantine, pensada primero para el teléfono:
  navegación inferior con íconos, encabezados fijos, hojas inferiores (selector de ejercicios,
  discos, descanso), diálogos y notificaciones propios en vez de los del navegador.
- **Gráficos nuevos** (`@mantine/charts`): área con gradiente y animación, tooltip táctil,
  línea de mejor marca, barras semanales con promedio y semana en curso, series por grupo muscular.
- **Temporizador de descanso** flotante con barra de progreso; barra del entrenamiento en curso
  visible en todas las pestañas.
- **Tema claro / oscuro / automático** (en Perfil) y tipografía Inter incluida (funciona sin conexión).
- Service worker generado por Workbox (`vite-plugin-pwa`), con íconos para instalar la app.
- Prueba end-to-end reescrita en JS: `npm run test:e2e` compila, levanta su propio servidor y
  recorre todos los flujos.

### v0.0.3
- **Gráficos rehechos con d3** (incluido en `public/vendor/`, funciona sin conexión): línea con área
  tenue, eje y grilla limpios, etiqueta del último valor y de la mejor marca, tooltip con crosshair
  al tocar o arrastrar, variación en el periodo y tabla "Ver datos" en cada gráfico.
- **Filtros de periodo:** 1M / 3M / 6M / 1A / Todo en cada ejercicio; 12 semanas / 6 meses / 1 año en Perfil.
- **Ejercicio:** 1RM estimado, peso máximo y volumen por sesión. Se quitó "repeticiones totales"
  (redundante con el 1RM); en ejercicios sin peso se muestra "máx. repeticiones en una serie".
- **Perfil:** entrenamientos y volumen por semana con promedio, semana en curso marcada aparte.

### v0.0.2
- **Funciona sin señal:** un service worker guarda la app, el catálogo y las imágenes vistas,
  así que abre aunque el gimnasio no tenga internet.
- **Comparación en vivo:** al marcar una serie se compara con la misma serie de la vez anterior
  (borde verde = mejor, gris = igual, naranjo = menos) y avisa si es récord personal.
- **Resumen al terminar:** duración, series efectivas, volumen con % frente a la última vez
  (misma plantilla o mismo nombre), lista de récords y comparación por ejercicio.
- **Calculadora de discos** en ejercicios con barra (barra y discos configurables en Perfil).
- **RPE opcional** por serie (se activa en Perfil; se exporta en el CSV estilo Strong).
- **Deshacer** al quitar un ejercicio del entrenamiento.
- **Pantalla encendida** mientras entrenas (se puede apagar en Perfil).

## Deploy (gratis, unos 15 minutos)

### 1. Base de datos en Supabase
1. Crea un proyecto en <https://supabase.com> (plan Free). Región: **South America (São Paulo)**,
   la misma donde corren las funciones de Vercel (`gru1` en `vercel.json`). Deja **Enable Data API**
   activado; "Automatically expose new tables" puede ir desactivado (`schema.sql` da los permisos).
2. **SQL Editor → New query**: pega el contenido de `schema.sql` y presiona **Run**.
3. En **Project Settings → API Keys** copia la **Project URL** y una **secret key**
   (`sb_secret_...`). La llave antigua `service_role` también funciona.

### 2. Código en GitHub
```bash
cd gymlog
git remote add origin https://github.com/TU_USUARIO/gymlog.git
git push -u origin main
```
(El repo ya viene inicializado con un commit. Puede ser privado.)

### 3. Hosting en Vercel
1. En <https://vercel.com>: **Add New → Project** → importa el repo. Preset: **Other**
   (`vercel.json` ya define `npm run build` y la carpeta `dist`).
2. En **Environment Variables** agrega:
   | Variable | Valor |
   |---|---|
   | `SUPABASE_URL` | la Project URL |
   | `SUPABASE_SECRET_KEY` | la secret key |
   | `APP_PASSWORD` | una clave tuya (te la pedirá la app una vez por dispositivo) |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | opcional, para el aviso de fin de descanso: `node scripts/vapid-keys.mjs` |
   | `VAPID_SUBJECT` | opcional: `mailto:` o `https://` (por defecto, la URL de la app) |
3. **Deploy**. Cada `git push` vuelve a desplegar automáticamente.

### 4. En el teléfono
Abre la URL de Vercel, ingresa tu clave y en Safari usa **Compartir → Agregar a inicio**:
queda como una app a pantalla completa.

Para traer tu historial: en Strong, **Ajustes → Exportar datos** (si falla, cambia Strong
a inglés antes de exportar) y luego en GymLog **Perfil → Importar CSV de Strong**.

> Supabase pausa los proyectos Free que pasan una semana sin actividad. Si entrenas varias
> veces por semana no te va a pasar; si ocurre, se reactiva con "Resume project" en el panel.

## Lectura del día

Una vez al día (Vercel Cron, `0 9 * * *` UTC: ~6:00 en Chile en verano, ~5:00 en invierno):

1. Lee el feed RSS público del canal (`YOUTUBE_CHANNEL_ID`) y toma el último video largo (sin Shorts).
2. Si ese video ya está resumido, termina sin gastar nada.
3. Si es nuevo: transcripción con [Supadata](https://supadata.ai) (siempre `mode=native`,
   1 crédito por video; el plan Free trae 100 al mes) → resumen con OpenAI (`OPENAI_MODEL`,
   por defecto `gpt-5-mini`, ~1 centavo de dólar) → tabla `video_summaries`.

Si el video todavía no tiene subtítulos, se reintenta al día siguiente; después de 3 intentos
fallidos se deja de gastar créditos en ese video. La app solo lee lo guardado: abrir la pestaña
**Lectura** nunca gasta tokens, y el último resumen queda en el teléfono para leerlo sin señal.

**Variables** (Vercel → Settings → Environment Variables, entorno Production; ver `.env.example`):
`YOUTUBE_CHANNEL_ID` (empieza con `UC`), `SUPADATA_API_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`
(`openssl rand -hex 24`; Vercel la manda sola al cron) y, opcional, `OPENAI_MODEL`.
Además hay que crear la tabla: correr en Supabase el bloque `video_summaries` de `schema.sql`.

**Forzar un refresco** (por ejemplo, después de ajustar `SUMMARY_PROMPT` en `lib/summary.js`):

```bash
# buscar video nuevo (lo mismo que el botón "Buscar video nuevo" de la app)
curl -s -X POST -H "x-app-key: $APP_PASSWORD" https://TU-APP.vercel.app/api/summary-refresh
# regenerar aunque ya esté resumido (force solo funciona con x-app-key, no con el CRON_SECRET)
curl -s -X POST -H "x-app-key: $APP_PASSWORD" "https://TU-APP.vercel.app/api/summary-refresh?force=1"
# lo mismo que hace el cron
curl -s -H "Authorization: Bearer $CRON_SECRET" https://TU-APP.vercel.app/api/summary-refresh
```

Respuesta: `{"action":"created"|"skipped"|"error", ...}`. Cada ejecución queda en Vercel →
Logs (buscar `summary-refresh`). Efecto secundario: el cron toca Supabase a diario, así que el
proyecto Free no debería pausarse por inactividad.

## Desarrollo local

```bash
npm install
npm run dev                 # http://localhost:3000 (Vite con recarga en caliente + /api), datos en ./data/dev-db.json
npm run build               # compila a ./dist (es lo que publica Vercel)
npm run preview             # compila y sirve ./dist (con service worker) en :3000
npm test                    # pruebas del backend
npx playwright install chromium   # una vez, para la prueba end-to-end
npm run test:e2e            # compila y recorre la app completa en un navegador
# datos de ejemplo (6 meses de Push/Pull/Legs) para probar la interfaz:
APP_PASSWORD=test DATA_FILE=/tmp/demo.json node dev-server.js &
BASE=http://localhost:3000 KEY=test node scripts/seed.mjs
```
Copia `.env.example` a `.env` si quieres que el servidor local use tu Supabase.

## Arquitectura

```
api/*.js              Funciones de Vercel (una por recurso), todas delegan en lib/router.js
lib/router.js         Validación, auth por clave (header x-app-key) y CRUD genérico
lib/store.js          Supabase vía REST (fetch, sin SDK) o archivo JSON en local
lib/summary.js        Lectura del día: RSS de YouTube, Supadata, OpenAI y refreshSummary
lib/webpush.js        Web Push sin contenido: JWT VAPID (ES256) con node:crypto, sin dependencias
lib/push-api.js       /api/push-subscribe y /api/rest-alert: esperar hasta el fin del descanso y avisar
public/push-sw.js     Service worker del aviso (lo importa el de Workbox): muestra "Descanso terminado"
schema.sql            10 tablas: workouts, templates, exercises (series en JSONB), programs,
                      exercise_prefs (ajustes por ejercicio, id = exercise_id),
                      body_metrics (peso y medidas, id = fecha), user_settings (meta),
                      push_subscriptions y rest_alerts (aviso de descanso) y
                      video_summaries (resúmenes de YouTube, id = video_id)
api/                  Una función por recurso más api/[resource].js para el resto (el plan
                      Hobby de Vercel admite 12 funciones; hoy son 12).
dev-server.js         /api + Vite en desarrollo (o ./dist con --dist)
index.html            Entrada de Vite
public/               Íconos de la app (los PNG se generan con scripts/make-icons.mjs)
src/
  main.jsx, App.jsx   Arranque, proveedores de Mantine y enrutador por hash
  theme.js            Tema de Mantine (colores, tipografía, componentes)
  lib/                Lógica sin interfaz:
    data.js           Estado + caché local + cola de sincronización (offline-first)
    hooks.js          Hooks de React sobre los stores (useData, useActiveWorkout, …)
    catalog.js        Catálogo free-exercise-db + ejercicios propios
    stats.js          1RM (Brzycki), volumen, récords, historial por ejercicio
    workout.js        Empezar entrenamientos, plantillas, comparación en vivo
    progression.js    Objetivo para superar el 1RM estimado de la vez anterior
    loads.js          Cargas posibles: mínimo aumento, pesos conocidos, tope de la máquina
    warmup.js         Series de calentamiento por porcentaje del peso de trabajo
    muscles.js        Estímulo directo por grupo muscular (mapa del cuerpo)
    regions.js        Regiones dentro de cada grupo muscular (feature 08)
    body.js           Peso de tendencia, ritmo, peso a una fecha, grasa estimada
    kinds.js          Tipos de ejercicio, carga efectiva con peso corporal, tiempo mm:ss
    effective.js      Entrenamientos con carga efectiva (cacheado) para mostrar y analizar
    set-timer.js      Cronómetro de series por tiempo (guarda la hora de inicio)
    stalls.js         Ejercicios estancados (feature 06), cacheado
    report.js         Resumen mensual y anual (feature 07)
    streak.js         Meta de constancia y racha (feature 09)
    programs.js       5/3/1 y GZCLP: plan de cada día, progresión, máximo sugerido (feature 12, puro)
    program-runtime.js  Programas en la app: guardar, generar sus plantillas, procesar cada día
    tm.js             Máximo de entrenamiento por ejercicio, su historial y pesos armables
    push.js           Aviso de fin de descanso por push: suscripción y alertas (feature 11)
    substitutes.js    Sugerencias para reemplazar un ejercicio y traspaso de series (feature 10)
    strong-csv.js     Importar/exportar CSV de Strong
    rest-timer.js, plates.js, format.js, router.js, api.js
  components/         Layout (navegación, descanso), encabezados, hojas, diálogos, selector de ejercicios
  charts/             Gráficos (línea/área y barras) sobre @mantine/charts
  views/              Pantallas: Entrenar, editor, Historial, Ejercicios, Perfil, Lectura
```

**API:** `GET /api/bootstrap` (todo), `GET|POST|DELETE /api/{workouts|templates|exercises|exercise_prefs|body_metrics|user_settings}`,
`GET|POST|DELETE /api/programs` (feature 12), `GET|POST|DELETE /api/push-subscribe`,
`POST|PUT|DELETE /api/rest-alert` (feature 11)
(`POST` acepta un objeto o una lista y hace upsert por `id`; `DELETE ?id=`), `GET /api/health`,
`GET /api/summary` (último resumen; `?id=` uno concreto; `?list=1` los últimos 20 sin el texto) y
`GET|POST /api/summary-refresh` (cron con `Authorization: Bearer $CRON_SECRET`, o `x-app-key`; `?force=1`).

Las estadísticas se calculan en el cliente: con miles de entrenamientos sigue siendo instantáneo
y el backend se mantiene mínimo.

## Pendiente (ideas)
- Rachas y regiones dentro de cada músculo (ver `docs/features/`).
- Unir ejercicios duplicados.
- Buscador en español para el catálogo.
