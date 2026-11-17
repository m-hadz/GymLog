# GymLog — MVP v1

Registro de entrenamientos personal, inspirado en el flujo de Strong y escrito desde cero.
No necesita dependencias ni paso de build: JS puro en el frontend, funciones serverless en
Vercel y Postgres gratuito en Supabase.

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
- **Tus datos:** importar el CSV de Strong (sin duplicar si lo reimportas), exportar en
  formato Strong y respaldo JSON.

## Deploy (gratis, unos 15 minutos)

### 1. Base de datos en Supabase
1. Crea un proyecto en <https://supabase.com> (plan Free).
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
1. En <https://vercel.com>: **Add New → Project** → importa el repo. Preset: **Other**.
2. En **Environment Variables** agrega:
   | Variable | Valor |
   |---|---|
   | `SUPABASE_URL` | la Project URL |
   | `SUPABASE_SECRET_KEY` | la secret key |
   | `APP_PASSWORD` | una clave tuya (te la pedirá la app una vez por dispositivo) |
3. **Deploy**. Cada `git push` vuelve a desplegar automáticamente.

### 4. En el teléfono
Abre la URL de Vercel, ingresa tu clave y en Safari usa **Compartir → Agregar a inicio**:
queda como una app a pantalla completa.

Para traer tu historial: en Strong, **Ajustes → Exportar datos** (si falla, cambia Strong
a inglés antes de exportar) y luego en GymLog **Perfil → Importar CSV de Strong**.

> Supabase pausa los proyectos Free que pasan una semana sin actividad. Si entrenas varias
> veces por semana no te va a pasar; si ocurre, se reactiva con "Resume project" en el panel.

## Desarrollo local

```bash
node dev-server.js          # http://localhost:3000, datos en ./data/dev-db.json
npm test                    # pruebas del backend
# prueba end-to-end (requiere Playwright para Python):
APP_PASSWORD=test DATA_FILE=/tmp/gl.json node dev-server.js &
DATA_FILE=/tmp/gl.json python3 test/e2e.py
```
Copia `.env.example` a `.env` si quieres que el servidor local use tu Supabase.

## Arquitectura

```
api/*.js            Funciones de Vercel (una por recurso), todas delegan en lib/router.js
lib/router.js       Validación, auth por clave (header x-app-key) y CRUD genérico
lib/store.js        Supabase vía REST (fetch, sin SDK) o archivo JSON en local
schema.sql          3 tablas: workouts, templates, exercises (series en JSONB)
public/js/
  main.js           Arranque y enrutador por hash
  data.js           Estado + caché local + cola de sincronización (offline-first)
  catalog.js        Catálogo free-exercise-db + ejercicios propios
  stats.js          1RM (Brzycki), volumen, récords, historial por ejercicio
  strong-csv.js     Importar/exportar CSV de Strong
  rest-timer.js     Temporizador de descanso
  charts.js         Gráficos SVG sin librerías
  views/            Pantallas: train, editor, history, exercises, picker, profile
```

**API:** `GET /api/bootstrap` (todo), `GET|POST|DELETE /api/{workouts|templates|exercises}`
(`POST` acepta un objeto o una lista y hace upsert por `id`; `DELETE ?id=`), `GET /api/health`.

Las estadísticas se calculan en el cliente: con miles de entrenamientos sigue siendo instantáneo
y el backend se mantiene mínimo.

## Ideas para v2
- Superseries, RPE en el editor, ejercicios por tiempo/distancia (cardio).
- Progresión automática (ej. +2,5 kg cuando completas todas las reps) y deloads.
- Service worker para abrir la app sin conexión.
- Medidas corporales y peso.
- Carpetas y orden manual de plantillas.
