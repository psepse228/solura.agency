-- Solura Eco — Leads pipeline. Manual for now (source = 'manual'); once
-- the Telegram Business connection lands, inbound messages from unknown
-- contacts can create rows here too (source = 'telegram') without any
-- schema change.
create table solura_eco.leads (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,           -- contact person or company name
  company_name   text,
  contact_email  text,
  contact_phone  text,
  status         text not null default 'new',  -- new / contacted / qualified / converted / lost
  source         text not null default 'manual',
  notes          text,
  member_id      uuid references solura_eco.members(id) on delete set null,  -- owner, null = unassigned
  converted_project_id uuid references solura_eco.projects(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index leads_status_idx on solura_eco.leads(status);

alter table solura_eco.leads enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
