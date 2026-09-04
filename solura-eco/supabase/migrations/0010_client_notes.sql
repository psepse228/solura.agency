-- Solura Eco — client_notes: parallel to project_notes, for the same
-- reason: a freshly auto-created client (from Telegram lead monitoring)
-- may have zero projects yet, so there's nowhere on the per-project
-- notepad to post anything. member_id nullable + author_label: a
-- bot-authored note (Telegram summary) has no human author.

create table solura_eco.client_notes (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references solura_eco.clients(id) on delete cascade,
  member_id    uuid references solura_eco.members(id) on delete set null,
  author_label text,          -- 'Telegram bot' when member_id is null, else unused
  body         text not null,
  created_at   timestamptz not null default now()
);

create index client_notes_client_id_idx on solura_eco.client_notes(client_id, created_at desc);

alter table solura_eco.client_notes enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
