-- 0022_document_task_attachments.sql
-- Documents were project-only (project_id not null) -- a task needed
-- somewhere to attach a file and had nowhere. Same pattern as
-- 0018_telegram_conversations_leads.sql: the owning column becomes
-- nullable, a new one is added for the other kind of owner, and a check
-- constraint requires at least one.
alter table solura_eco.documents
  alter column project_id drop not null;

alter table solura_eco.documents
  add column task_id uuid references solura_eco.work_tasks(id) on delete cascade;

alter table solura_eco.documents
  add constraint documents_owner_check
  check (project_id is not null or task_id is not null);

create index documents_task_id_idx on solura_eco.documents(task_id, created_at desc);
