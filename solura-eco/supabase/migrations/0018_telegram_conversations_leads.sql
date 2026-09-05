-- 0018_telegram_conversations_leads.sql
-- Bug found live: an inbound Telegram message from an unknown contact
-- used to auto-create a `clients` row, but 0014_clients_belong_to_projects.sql
-- made clients.project_id NOT NULL -- there's no way to know which
-- project a random Telegram contact belongs to, so that insert always
-- fails (23502 null value in column "project_id"). A conversation with
-- an unmatched contact now attaches to a lead instead (source =
-- 'telegram'), which needs no project. A conversation whose phone number
-- matches an existing client still attaches to that client as before.
alter table solura_eco.telegram_conversations
  alter column client_id drop not null;

alter table solura_eco.telegram_conversations
  add column lead_id uuid references solura_eco.leads(id) on delete cascade;

alter table solura_eco.telegram_conversations
  add constraint telegram_conversations_contact_check
  check (client_id is not null or lead_id is not null);
