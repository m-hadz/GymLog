-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar todo > Run.

create table if not exists workouts (
  id          text primary key,
  name        text not null default '',
  started_at  timestamptz not null,
  ended_at    timestamptz,
  notes       text not null default '',
  template_id text,
  exercises   jsonb not null default '[]'::jsonb,  -- [{exercise_id, name, rest, notes, sets:[{type, weight, reps, done}]}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists workouts_started_at_idx on workouts (started_at desc);

create table if not exists templates (
  id         text primary key,
  name       text not null,
  folder     text not null default '',
  notes      text not null default '',
  position   int  not null default 0,
  exercises  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Solo ejercicios propios. El catálogo con imágenes viene de free-exercise-db (CDN).
create table if not exists exercises (
  id           text primary key,
  name         text not null,
  body_part    text not null default 'Otro',
  category     text not null default 'Otro',
  catalog_id   text,            -- ejercicio del catálogo del que toma imagen e instrucciones
  instructions text not null default '',
  rest_seconds int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Seguridad:
-- 1) Solo el backend (rol service_role, que usa la llave secreta) puede usar las tablas
--    por la Data API. Es necesario en proyectos creados con "Automatically expose new
--    tables" desactivado (lo recomendado); si estaba activado, no hace daño.
-- 2) Se le quita el acceso a anon/authenticated por si el proyecto los otorga por defecto.
-- 3) RLS activado y sin políticas, como segunda barrera.
grant select, insert, update, delete on table workouts, templates, exercises to service_role;
revoke all on table workouts, templates, exercises from anon, authenticated;

alter table workouts  enable row level security;
alter table templates enable row level security;
alter table exercises enable row level security;

-- Resúmenes de videos de YouTube (feature "Lectura del día"). Se puede correr solo este bloque.
-- id = video_id de YouTube, así el upsert por id del store funciona tal cual.
create table if not exists video_summaries (
  id            text primary key,           -- video_id de YouTube
  channel_id    text not null,
  title         text not null default '',
  video_url     text not null default '',
  published_at  timestamptz,
  status        text not null default 'ok', -- 'ok' | 'error'
  error         text not null default '',
  attempts      int  not null default 0,    -- intentos fallidos (para no gastar créditos para siempre)
  summary       text not null default '',   -- markdown
  word_count    int  not null default 0,
  model         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists video_summaries_published_idx on video_summaries (published_at desc);

grant select, insert, update, delete on table video_summaries to service_role;
revoke all on table video_summaries from anon, authenticated;
alter table video_summaries enable row level security;
