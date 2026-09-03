-- Solura Eco — project_notes: a running, shared notepad per project.
-- Distinct from projects.notes (a short, single-editor "about this
-- project" blurb, e.g. set by seed_project_details.py) -- this is a
-- timestamped, attributed log any of the 3 can add to, never edited
-- or deleted by anyone but its author-in-spirit (no ownership check
-- enforced -- flat 3-person access, same as everything else).

create table solura_eco.project_notes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references solura_eco.projects(id) on delete cascade,
  member_id   uuid not null references solura_eco.members(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index project_notes_project_id_idx on solura_eco.project_notes(project_id, created_at desc);

alter table solura_eco.project_notes enable row level security;
