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

-- RLS activado y sin políticas: la llave pública (anon) no puede leer nada.
-- El backend usa la llave secreta, que se salta RLS.
alter table workouts  enable row level security;
alter table templates enable row level security;
alter table exercises enable row level security;
