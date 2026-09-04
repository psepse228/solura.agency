# Telegram lead monitoring — design

Status: approved, ready for implementation plan.
Scope: build order item #5 (Telegram lead monitoring, rescoped from "lead
capture"). See `../architecture.md`, `../build-plan.md`.
Ported from Argus's real, working Telegram Business integration
(`psepse228/Argus`, `app/routers/telegram_business.py`, `app/telegram/`,
`docs/superpowers/specs/2026-07-28-telegram-business-integration-design.md`)
— pattern reused, not copied verbatim: Solura Eco's version is deliberately
smaller (read-only monitoring, no reply-from-app).
Explicitly out of scope: sending replies from inside Solura Eco (a human
replies from actual Telegram, same account); a live chat-thread UI (Argus's
two-column `TelegramBusinessThread.tsx` — not built here, summaries surface
via the client notepad instead); multi-agent/multiple Telegram connections
(schema allows one row, one is wired up); Instagram or any other channel.

## Why

Solura's real client conversations happen on a dedicated Telegram Business
account today, invisible to Solura Eco. This surfaces them automatically —
new conversation → new client record, every message → an AI summary posted
where the team already looks (a client's notepad).

## Connection

One dedicated Solura Telegram Business account (not a personal account of
any of the 3) connects via the Bot API's business-connection feature.
Manual, operational, one-time setup — not something code does: Telegram
Premium + Settings → Telegram Business → Chatbots on that account, pointed
at the bot. **The bot token referenced earlier in this project's docs as
having been shared in a chat transcript must be rotated via BotFather
before this goes live** — carried over from architecture.md's existing
warning, now actually actionable.

## Matching — honest about a real limitation

Ported directly from Argus's own code comment: Telegram never exposes a
phone number on a User/Chat object by itself — only when the client
explicitly shares their contact card, which is uncommon. So:

- If a shared contact card's phone number matches an existing client's
  `contact_phone` (normalized: strip everything but digits and a leading
  `+`, same as Argus's `normalize_phone`) — attach the conversation to that
  client.
- Otherwise (the common case) — auto-create a new client from the Telegram
  profile's `first_name`/`last_name` (or `username` if no name), status
  `active`. No manual-attach queue in this pass (Argus has one; deferred
  here since read-only monitoring has lower stakes than Argus's
  reply-sending context — a wrongly-named auto-created client is easy to
  rename, not a live conversation that got misrouted).

Once a `telegram_conversations` row exists for a `(connection, chat_id)`
pair, every later message in that chat reuses the same client link — no
re-matching per message.

## Data model

```sql
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
  telegram_chat_id       bigint not null,
  telegram_first_name    text,
  telegram_username      text,
  last_message_at        timestamptz,
  summary                text,
  next_step_suggestion   text,
  summary_generated_at   timestamptz,
  created_at              timestamptz not null default now(),
  unique (connection_id, telegram_chat_id)
);

create table solura_eco.telegram_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references solura_eco.telegram_conversations(id) on delete cascade,
  direction        text not null check (direction in ('inbound', 'outbound')),
  content          text not null,
  telegram_message_id bigint,
  created_at       timestamptz not null default now()
);

-- Parallel to project_notes -- necessary because a freshly auto-created
-- client may have zero projects yet, so there's nowhere on the existing
-- per-project notepad to post a summary. member_id nullable: a
-- bot-authored note has no human author.
create table solura_eco.client_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references solura_eco.clients(id) on delete cascade,
  member_id   uuid references solura_eco.members(id) on delete set null,
  author_label text,          -- 'Telegram bot' when member_id is null, else unused
  body        text not null,
  created_at  timestamptz not null default now()
);
```

## Webhook

`POST /webhooks/telegram-business`. Verifies
`X-Telegram-Bot-Api-Secret-Token` via `hmac.compare_digest` against
`TELEGRAM_WEBHOOK_SECRET` (a static shared secret Telegram echoes back on
every request — simpler than GitHub's HMAC-of-body scheme, ported directly
from Argus's `verify_webhook_signature`).

On a `business_connection` update: upsert `telegram_connections`
(enable/disable).

On a `business_message` (or `edited_business_message`): resolve or create
the conversation (and client, per the matching rules above); persist the
inbound message; call GPT-4o once for `{summary, next_step}` — a smaller
structured-output call than Argus's (no draft reply, no inventory
grounding, no coaching tip: all three existed there only to support a human
replying from inside the app, which this doesn't do); write the result onto
the conversation row; post it as a `client_notes` row (`member_id` null,
`author_label` `'Telegram bot'`) so it's visible in the same feed as manual
notes.

If the GPT-4o call fails: the message still saves, the conversation's
`last_message_at` still updates — degrades to "silently missed a summary
this once," never blocks message ingestion (same principle as Argus's own
"edge cases" section).

## Frontend

Client detail page (`/clients/[id]`) gets a Notepad panel — same component
pattern as the project detail page's, fed by `client_notes` instead of
`project_notes`. Manual notes from the 3 of you and auto-posted Telegram
summaries land in the same chronological feed, distinguished by author
(`"Telegram bot"` vs. a real name). No live chat-thread view, no
send-a-reply UI.

## API

`GET /clients/{id}/notes`, `POST /clients/{id}/notes` — same shape as the
existing `/projects/{id}/notes` pair, session-protected. The webhook writes
`client_notes` rows directly via the service-role client, not through this
API (it's not an authenticated user session).

## Error handling

- Bad/missing webhook secret → `401`, no processing.
- Malformed webhook payload (missing expected fields) → `200` with a
  logged skip, not an error — same reasoning as the GitHub webhook: Telegram
  retries non-2xx responses, and an unrecognized update shape is expected
  traffic (Telegram sends many update types this integration doesn't care
  about), not a failure.
- GPT-4o call failure → message still persists, no note posted this time,
  no error surfaced to Telegram (still returns `200`).

## Testing

- Backend: `normalize_phone` (Argus's own logic, ported) — unit test for
  stripping formatting, ensuring a leading `+`. Webhook signature
  verification — same test shape as `test_github_signature.py`.
- Manual: this cannot be fully verified without the real Business API
  connection being live (a manual, one-time setup step outside code) — the
  implementation plan's final verification task depends on that connection
  existing. Until then, verify the webhook handler logic against
  hand-constructed payloads matching Telegram's real `business_message`
  shape (documented in Telegram's Bot API docs).
