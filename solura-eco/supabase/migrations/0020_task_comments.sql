-- 0020_task_comments.sql
-- A discussion thread on each task -- same shape as client_notes/
-- project_notes (0001_init.sql / later migrations), so the existing
-- NotesPanel.tsx component works here unchanged.
create table solura_eco.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references solura_eco.work_tasks(id) on delete cascade,
  member_id   uuid references solura_eco.members(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index task_comments_task_id_idx on solura_eco.task_comments(task_id, created_at);

alter table solura_eco.task_comments enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
