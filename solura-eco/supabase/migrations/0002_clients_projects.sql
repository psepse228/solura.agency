-- Solura Eco — Clients & Projects
-- Build order item #1 (docs/architecture.md): the home screen — open it, see
-- every active Solura client, status, progress. Ships before any automation.
--
-- Apply via `supabase db push`, or paste into the Supabase SQL editor, after
-- 0001_init.sql.

-- ---------------------------------------------------------------------------
-- Clients — one row per company/person Solura works with.
-- ---------------------------------------------------------------------------
create table solura_eco.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text,
  contact_email text,
  contact_phone text,
  status        text not null default 'active',  -- active / paused / churned
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projects — one row per engagement/build for a client. A client can have
-- more than one (e.g. a pilot product + a separate marketing site).
-- ---------------------------------------------------------------------------
create table solura_eco.projects (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references solura_eco.clients(id) on delete cascade,
  name           text not null,
  status         text not null default 'active',   -- active / paused / completed / dropped
  progress       smallint not null default 0 check (progress between 0 and 100),
  github_repo    text,                               -- e.g. "psepse228/argus", for the dev-activity feed (build order #2)
  vercel_project text,
  owner_member_id uuid references solura_eco.members(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index projects_client_id_idx on solura_eco.projects(client_id);

-- Keep updated_at current on write — matches the pattern the tables above
-- don't have yet (0001 relies on the backend setting it manually); doing it
-- at the DB level here since this table gets edited straight from the
-- Clients/Projects view, not just synced by a backend job.
create or replace function solura_eco.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clients_set_updated_at
  before update on solura_eco.clients
  for each row execute function solura_eco.set_updated_at();

create trigger projects_set_updated_at
  before update on solura_eco.projects
  for each row execute function solura_eco.set_updated_at();

alter table solura_eco.clients enable row level security;
alter table solura_eco.projects enable row level security;

-- RLS: no policies yet, same as 0001 — service role (backend) bypasses RLS.
-- Revisit once frontend auth lands (docs/architecture.md, open question 2).
