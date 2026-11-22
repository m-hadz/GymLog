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

-- Preferencias por ejercicio (v0.0.6: feature 01 y siguientes). Se puede correr solo este bloque.
-- id = exercise_id (del catálogo o propio). Columnas: ver docs/features/00-indice.md.
create table if not exists exercise_prefs (
  id                       text primary key,
  min_increment            numeric,             -- mínimo aumento posible en kg (null = según equipo)
  max_load                 numeric,             -- tope de la máquina en kg (null = sin tope)
  rep_max                  int,                 -- sobre estas reps se propone subir peso (null = 12)
  compare_same_template    boolean not null default false,
  stall_snooze_until       text,
  load_mode                text,
  kind                     text,
  note                     text not null default '',
  primary_muscles          text[],
  secondary_muscles        text[],
  regions                  text[],
  training_max             numeric,
  exclude_from_suggestions boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

grant select, insert, update, delete on table exercise_prefs to service_role;
revoke all on table exercise_prefs from anon, authenticated;
alter table exercise_prefs enable row level security;

-- Peso corporal y medidas (v0.0.8, feature 03). Se puede correr solo este bloque.
-- id = fecha local 'YYYY-MM-DD': un registro por día.
create table if not exists body_metrics (
  id           text primary key,
  date         date not null,
  weight       numeric,                         -- kg
  body_fat     numeric,                         -- %
  measurements jsonb not null default '{}'::jsonb, -- { cintura: 82, cuello: 38, ... } en cm
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists body_metrics_date_idx on body_metrics (date desc);

grant select, insert, update, delete on table body_metrics to service_role;
revoke all on table body_metrics from anon, authenticated;
alter table body_metrics enable row level security;

-- Ajustes sincronizados entre dispositivos (v0.0.9, feature 09: meta de constancia y pausas).
-- Una sola fila (id = 'me'). Se puede correr solo este bloque.
create table if not exists user_settings (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

grant select, insert, update, delete on table user_settings to service_role;
revoke all on table user_settings from anon, authenticated;
alter table user_settings enable row level security;
