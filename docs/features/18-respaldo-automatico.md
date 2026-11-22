# 18 · Respaldo automático y recuperación

**Estado:** propuesta (ronda 2, 2026-11-22) · **Esfuerzo:** S–M · **Depende de:** —
· **Relacionada con:** 19 (sincronización), 21 (seguridad), 22 (respaldo a iCloud con Atajos)

## Problema y objetivo

Todo el historial está en un solo lugar, un proyecto Supabase Free, y se puede perder sin forma de
recuperarlo:
- **Supabase Free no tiene respaldos que puedas descargar ni recuperación a un punto en el tiempo.** Su
  documentación recomienda exportar con `db dump` y guardar la copia fuera de Supabase. Además, pausa
  los proyectos inactivos.
- **Borrar en el servidor es definitivo**, y **el upsert reemplaza la fila completa**: gana el último
  que escribe. Un teléfono con caché vieja, un error en una rama o una restauración pueden pisar datos
  buenos.
- El único respaldo hoy es **manual** (Perfil → Datos) y sale del estado del teléfono.

Objetivo: una copia **diaria y automática fuera de Supabase**, un **historial de cambios** para
recuperar una fila borrada o pisada, y un aviso en la app de cuándo fue el último respaldo.

## Evidencia

- **Supabase, Database Backups:** recomienda que los proyectos Free exporten con `db dump` y guarden la
  copia fuera de Supabase.
  - https://supabase.com/docs/guides/platform/backups
  - https://supabase.com/pricing
- **Código:**
  - `lib/store.js`: el upsert hace `merge-duplicates` sobre la fila entera y el borrado es definitivo.
  - `src/views/profile/DataSection.jsx`: respaldo manual.
- **Límite de Vercel Hobby:** ya hay 12 funciones. El respaldo no debe agregar ninguna.

## Qué hay hoy en el código

- **Respaldo manual:**
  - Descarga JSON con todas las tablas desde `state` (`DataSection.jsx`).
  - "Restaurar" sube lo que falta, sin duplicar.
- **`schema.sql`:** 10 tablas con `updated_at` (trigger) y RLS sin políticas.
- **Cron diario:** `summary-refresh` (`vercel.json`).

## Alcance

### A. Copia diaria fuera de Supabase (GitHub Actions)

- Archivo `.github/workflows/backup.yml`, con cron diario a las 06:00 UTC y ejecución manual.
- Pasos:
  1. Un `curl` a PostgREST por cada tabla (`select=*`, paginado) con `SUPABASE_URL` y
     `SUPABASE_SECRET_KEY` desde **GitHub Secrets**, o `supabase db dump --data-only`.
  2. Junta todo en un JSON con **el mismo formato del respaldo de la app**, así se puede restaurar con
     "Restaurar respaldo".
  3. Lo cifra con `age` usando una clave pública guardada en el repo. La privada solo la tiene el
     usuario.
  4. Lo sube como **artifact con 90 días de retención**.
- Si el repo es público, el artifact cifrado no expone nada. Igual se recomienda repo privado.
- No usa funciones de Vercel ni dependencias nuevas en la app.
- Un script local `scripts/restore-backup.mjs` descifra (con la clave privada) y deja el JSON listo para
  "Restaurar respaldo".

### B. Historial de cambios en Postgres

- Tabla `row_history(id bigserial, tbl text, row_id text, op text, data jsonb, at timestamptz default now())`.
- Trigger `BEFORE UPDATE OR DELETE` en cada tabla de datos, que copia `OLD` a `row_history`.
- Se podan las filas de más de 90 días con `pg_cron`, si está disponible en Free; si no, lo hace el mismo
  workflow con un `DELETE`.
- Mismos `grant`/`revoke`/RLS que el resto: no se expone por la API.
- **Recuperar** es una consulta SQL documentada en el README (por ejemplo, "volver el entrenamiento X a
  como estaba ayer"). La interfaz en la app queda fuera de alcance.

### C. Aviso en la app

- Perfil → Datos: "Último respaldo automático: hace 1 día".
  - El workflow, al terminar, escribe en `user_settings.data.last_backup` (una sola fila) mediante
    `POST /api/user_settings` con la clave de la app guardada en un Secret.
  - Ojo: `user_settings` se reemplaza completa; ver 19 (envío parcial). Hasta entonces, el workflow
    lee la fila y la reescribe con el campo nuevo.
- Si pasan más de 3 días sin respaldo, se muestra un aviso amarillo en Perfil.

### Datos

```sql
create table if not exists row_history (
  id bigserial primary key, tbl text not null, row_id text not null,
  op text not null, data jsonb not null, at timestamptz not null default now()
);
create or replace function keep_history() returns trigger language plpgsql as $$
begin
  insert into row_history(tbl, row_id, op, data) values (TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD));
  return coalesce(NEW, OLD);
end $$;
-- un trigger por tabla: workouts, templates, exercises, exercise_prefs, body_metrics, user_settings, programs
-- + mismos grant/revoke/RLS que el resto
```

## Casos borde

- **Tablas que no se respaldan:** `rest_alerts` y `push_subscriptions` (son temporales).
- **Tamaño de `row_history`:** con ~3 entrenamientos por semana y unas pocas ediciones, menos de 5 MB al
  año. La poda la mantiene acotada.
- **Clave de Supabase rotada:** el workflow falla y GitHub avisa por correo. En la app, el aviso de
  "hace N días" se pone amarillo.
- **Restaurar un respaldo viejo:** "Restaurar" solo agrega lo que falta, no pisa (como hoy).

## Fuera de alcance

- Interfaz en la app para navegar `row_history`.
- Respaldos de los archivos del resumen diario (se regeneran).

## Criterios de aceptación

- [ ] El workflow corre a mano y genera un artifact cifrado. Descifrado con el script, se restaura en
      una base vacía con "Restaurar respaldo" y quedan los mismos conteos por tabla.
- [ ] Editar un entrenamiento y borrarlo deja dos filas en `row_history` con el estado anterior. La
      consulta del README lo recupera.
- [ ] Perfil → Datos muestra la fecha del último respaldo automático y avisa si pasaron más de 3 días.
- [ ] La clave secreta de Supabase solo está en GitHub Secrets (no en el repo ni en los logs del
      workflow).
- [ ] No se agregan funciones de Vercel.

## Pruebas

- **Unitaria:** el script que arma el JSON del respaldo, con un fetch simulado de PostgREST y paginado,
  produce el mismo formato que `DataSection`.
- **Manual:** ejecución del workflow y restauración en un proyecto Supabase de prueba.
