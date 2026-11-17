# GymLog — v0.0.2

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
- **Tus datos:** importar el CSV de Strong (sin duplicar si lo reimportas; convierte libras a
  kg), exportar en formato Strong, descargar y restaurar un respaldo JSON (se combina, no borra).

### Nuevo en v0.0.2
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
public/sw.js        Service worker (app sin conexión)
public/js/
  main.js           Arranque y enrutador por hash
  data.js           Estado + caché local + cola de sincronización (offline-first)
  catalog.js        Catálogo free-exercise-db + ejercicios propios
  stats.js          1RM (Brzycki), volumen, récords, historial por ejercicio
  strong-csv.js     Importar/exportar CSV de Strong
  rest-timer.js     Temporizador de descanso
  plates.js         Calculadora de discos
  charts.js         Gráficos SVG sin librerías
  views/            Pantallas: train, editor, history, exercises, picker, profile
```

**API:** `GET /api/bootstrap` (todo), `GET|POST|DELETE /api/{workouts|templates|exercises}`
(`POST` acepta un objeto o una lista y hace upsert por `id`; `DELETE ?id=`), `GET /api/health`.

Las estadísticas se calculan en el cliente: con miles de entrenamientos sigue siendo instantáneo
y el backend se mantiene mínimo.

## Pendiente (ideas)
- Peso corporal y ejercicios con lastre o asistidos (carga real).
- Volumen semanal por músculo y rachas.
- Ejercicios por tiempo con cronómetro; superseries.
- Nota fija por ejercicio (asiento, agarre) y unir ejercicios duplicados.
- Buscador en español para el catálogo; tema claro.
