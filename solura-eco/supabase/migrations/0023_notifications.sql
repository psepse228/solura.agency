-- 0023_notifications.sql
-- In-app notifications -- assigned a task, someone commented on yours --
-- so the team doesn't need Telegram connected to know something needs
-- their attention.
create table solura_eco.notifications (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references solura_eco.members(id) on delete cascade,
  type        text not null,        -- task_assigned / task_commented
  title       text not null,
  body        text,
  href        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_member_id_idx on solura_eco.notifications(member_id, created_at desc);

alter table solura_eco.notifications enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
