-- Solura Eco — Telegram Business lead monitoring. Ported architecture
-- from Argus's real implementation (psepse228/Argus,
-- app/routers/telegram_business.py), deliberately smaller: no
-- reply-from-app, so no outbound-message-sending fields are needed beyond
-- what's here for read-only history. See
-- docs/superpowers/specs/2026-09-04-telegram-lead-monitoring-design.md.

create table solura_eco.telegram_connections (
  id                     uuid primary key default gen_random_uuid(),
  business_connection_id text unique not null,
  telegram_user_id       bigint not null,
  is_enabled             boolean not null default true,
  connected_at           timestamptz not null default now(),
  disconnected_at        timestamptz
);

create table solura_eco.telegram_conversations (
  id                    uuid primary key default gen_random_uuid(),
  connection_id         uuid not null references solura_eco.telegram_connections(id) on delete cascade,
  client_id             uuid not null references solura_eco.clients(id) on delete cascade,
  telegram_chat_id      bigint not null,
  telegram_first_name   text,
  telegram_username     text,
  last_message_at       timestamptz,
  summary               text,
  next_step_suggestion  text,
  summary_generated_at  timestamptz,
  created_at            timestamptz not null default now(),
  unique (connection_id, telegram_chat_id)
);

create table solura_eco.telegram_messages (
  id                   uuid primary key default gen_random_uuid(),
  conversation_id      uuid not null references solura_eco.telegram_conversations(id) on delete cascade,
  direction            text not null check (direction in ('inbound', 'outbound')),
  content              text not null,
  telegram_message_id  bigint,
  created_at           timestamptz not null default now()
);

create index telegram_messages_conversation_id_idx on solura_eco.telegram_messages(conversation_id, created_at);

alter table solura_eco.telegram_connections enable row level security;
alter table solura_eco.telegram_conversations enable row level security;
alter table solura_eco.telegram_messages enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
