-- Webster TD — initial schema
-- Apply via `supabase db push`, or paste into the Supabase SQL editor.
-- Draft for brainstorming: names/shapes are expected to change.
--
-- Lives in its own `webster_td` schema, not `public` — this project's
-- Supabase instance is shared with cana-ai-tutor, so keep the two apps'
-- tables from colliding or getting mixed up in the table list.

create schema if not exists webster_td;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Members — the three of us. Not a generic "users" table, this is a closed set.
-- ---------------------------------------------------------------------------
create table webster_td.members (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  email           text unique not null,
  telegram_chat_id text unique,
  canvas_user_id  bigint,
  canvas_base_url text,               -- e.g. https://webster.instructure.com
  canvas_api_token_enc bytea,         -- pgp_sym_encrypt'd, never store plaintext
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Canvas: courses + assignments, synced per member.
-- ---------------------------------------------------------------------------
create table webster_td.courses (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references webster_td.members(id) on delete cascade,
  canvas_course_id  bigint not null,
  name              text not null,
  course_code       text,
  term              text,
  start_at          timestamptz,
  end_at            timestamptz,
  synced_at         timestamptz not null default now(),
  unique (member_id, canvas_course_id)
);

create table webster_td.assignments (
  id                    uuid primary key default gen_random_uuid(),
  course_id             uuid not null references webster_td.courses(id) on delete cascade,
  canvas_assignment_id  bigint not null,
  name                  text not null,
  description_html      text,
  due_at                timestamptz,           -- nullable, see docs/canvas-api-notes.md
  points_possible        numeric,
  submission_types       text[],
  html_url              text,
  workflow_state        text,                  -- canvas assignment state
  synced_at             timestamptz not null default now(),
  unique (course_id, canvas_assignment_id)
);

create table webster_td.submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references webster_td.assignments(id) on delete cascade,
  member_id      uuid not null references webster_td.members(id) on delete cascade,
  submitted_at   timestamptz,
  score          numeric,
  workflow_state text,                          -- e.g. submitted / graded / unsubmitted
  synced_at      timestamptz not null default now(),
  unique (assignment_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Work: Solura tasks, manually entered or synced from Airtable later
-- (see docs/architecture.md, open question 3).
-- ---------------------------------------------------------------------------
create table webster_td.work_tasks (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references webster_td.members(id) on delete set null,  -- null = unassigned
  title         text not null,
  description   text,
  client_name   text,
  status        text not null default 'todo',    -- todo / in_progress / done / blocked
  priority      text not null default 'normal',  -- low / normal / high
  due_at        timestamptz,
  source        text not null default 'manual',  -- manual / airtable
  external_id   text,                             -- airtable record id, once synced
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Unified view — what the frontend and the Telegram bot actually query.
-- ---------------------------------------------------------------------------
create view webster_td.tasks_unified as
  select
    'uni'::text                as task_type,
    a.id                       as source_id,
    c.member_id                as member_id,
    a.name                     as title,
    c.name                     as context,        -- course name
    a.due_at                   as due_at,
    coalesce(s.workflow_state, 'unsubmitted') as status,
    a.html_url                 as link
  from webster_td.assignments a
  join webster_td.courses c on c.id = a.course_id
  left join webster_td.submissions s on s.assignment_id = a.id and s.member_id = c.member_id

  union all

  select
    'work'::text                as task_type,
    w.id                        as source_id,
    w.member_id                 as member_id,
    w.title                     as title,
    w.client_name                as context,
    w.due_at                    as due_at,
    w.status                    as status,
    null::text                  as link
  from webster_td.work_tasks w;

-- ---------------------------------------------------------------------------
-- Reminder log — what the Telegram bot has already sent, so it doesn't repeat.
-- ---------------------------------------------------------------------------
create table webster_td.reminders_log (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references webster_td.members(id) on delete cascade,
  task_type   text not null,     -- 'uni' | 'work'
  source_id   uuid not null,     -- assignments.id or work_tasks.id
  channel     text not null default 'telegram',
  sent_at     timestamptz not null default now(),
  unique (member_id, task_type, source_id, sent_at)
);

-- ---------------------------------------------------------------------------
-- Sync log — one row per Canvas poll, for debugging when sync silently breaks.
-- ---------------------------------------------------------------------------
create table webster_td.sync_log (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references webster_td.members(id) on delete cascade,
  source        text not null default 'canvas', -- canvas / airtable
  status        text not null,                   -- ok / error
  detail        text,
  ran_at        timestamptz not null default now()
);

-- RLS: enabled, no policies yet — service role (used by the backend) bypasses
-- RLS by default, which is all we need until there's a per-member frontend
-- login. Revisit when auth lands (docs/architecture.md, open question 5).
alter table webster_td.members enable row level security;
alter table webster_td.courses enable row level security;
alter table webster_td.assignments enable row level security;
alter table webster_td.submissions enable row level security;
alter table webster_td.work_tasks enable row level security;
alter table webster_td.reminders_log enable row level security;
alter table webster_td.sync_log enable row level security;

-- PostgREST (Supabase's API layer) only exposes schemas listed in the
-- project's "Exposed schemas" setting (Settings → API). Add `webster_td`
-- there after running this migration, or the API won't see these tables —
-- the service-role key used by the backend bypasses PostgREST entirely via
-- postgrest-py's `.schema()`, but double-check if you ever query from the
-- Supabase dashboard's table editor / REST API directly.
