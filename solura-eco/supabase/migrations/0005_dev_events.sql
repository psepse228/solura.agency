-- Solura Eco — dev_events: generic activity feed, GitHub commits first.
-- Deliberately source-agnostic (not a github_commits table) -- Vercel
-- deploys and Claude Code Remote sessions land here too, later.
-- See docs/superpowers/specs/2026-09-03-dev-activity-roles-colors-design.md.

create table solura_eco.dev_events (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references solura_eco.projects(id) on delete cascade,
  source        text not null,              -- 'github' (only value used so far)
  external_id   text not null,               -- commit SHA, for dedup
  actor         text,                        -- committer name
  message       text not null,
  url           text,
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (project_id, source, external_id)
);

create index dev_events_project_id_idx on solura_eco.dev_events(project_id, occurred_at desc);

alter table solura_eco.dev_events enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
