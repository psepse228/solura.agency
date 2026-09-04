# Telegram Lead Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated Solura Telegram Business account's client conversations automatically create/attach clients and post AI-generated summaries to their notepad — read-only, no reply-from-app.

**Architecture:** A webhook (`POST /webhooks/telegram-business`, static-secret verified) resolves each inbound message to a client (phone match if a contact card was shared, otherwise auto-create), persists it, and calls GPT-4o once for a summary + next-step, posted as a `client_notes` row. The existing `NotesPanel` component (built for projects) is generalized to take an API path, so the same UI serves both projects and clients — no new UI built for this feature, just a new feed source.

**Tech Stack:** FastAPI + supabase-py + `openai` (new dependency, structured-output call) on the backend, unchanged Next.js frontend.

---

## Before you start

New secret this plan introduces: `TELEGRAM_WEBHOOK_SECRET` — generate the
same way as `SESSION_SECRET`/`GITHUB_WEBHOOK_SECRET`
(`python -c "import secrets; print(secrets.token_hex(32))"`), never commit
it, set identically on the backend and when registering the webhook with
Telegram (Task 9). `TELEGRAM_BOT_TOKEN` already has a config slot
(`app/config.py`) from earlier scaffolding, but is currently empty — it
must be a freshly-rotated token (see spec: the one mentioned earlier in
this project's history was shared in a chat transcript and must not be
reused). `OPENAI_API_KEY` also already has a config slot, currently empty —
needs a real key before Task 8's webhook can generate summaries (it
degrades gracefully without one per the spec's error handling, but summaries
just won't generate).

## Task 1: Migration — `client_notes` table

**Files:**
- Create: `solura-eco/supabase/migrations/0010_client_notes.sql`

- [ ] **Step 1: Write it**

```sql
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
```

- [ ] **Step 2: Apply it**

```bash
cd solura-eco
python scripts/apply_migration.py supabase/migrations/0010_client_notes.sql
```

- [ ] **Step 3: Commit**

```bash
git add solura-eco/supabase/migrations/0010_client_notes.sql
git commit -m "Solura Eco: migration for client_notes table"
```

## Task 2: Migration — Telegram tables

**Files:**
- Create: `solura-eco/supabase/migrations/0011_telegram.sql`

- [ ] **Step 1: Write it**

```sql
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
```

- [ ] **Step 2: Apply it**

```bash
cd solura-eco
python scripts/apply_migration.py supabase/migrations/0011_telegram.sql
```

- [ ] **Step 3: Commit**

```bash
git add solura-eco/supabase/migrations/0011_telegram.sql
git commit -m "Solura Eco: migrations for Telegram connections/conversations/messages"
```

## Task 3: Add `openai` dependency and `TELEGRAM_WEBHOOK_SECRET` config

**Files:**
- Modify: `solura-eco/backend/requirements.txt`
- Modify: `solura-eco/backend/app/config.py`
- Modify: `solura-eco/backend/.env.example`
- Modify: `solura-eco/backend/.env` (local only, not committed)

- [ ] **Step 1: Add the dependency**

Append to `solura-eco/backend/requirements.txt`:
```text
openai==1.51.0
```

- [ ] **Step 2: Add the config field**

In `solura-eco/backend/app/config.py`, add inside the `Settings` class, alongside `telegram_bot_token`:
```python
    telegram_webhook_secret: str = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
```

- [ ] **Step 3: Document it**

Append to `solura-eco/backend/.env.example`:
```text

# Telegram Business webhook signature verification (POST /webhooks/telegram-business).
# Generate the same way as SESSION_SECRET/GITHUB_WEBHOOK_SECRET. Must match
# exactly what's registered via scripts/register_telegram_webhook.py (Task 9).
TELEGRAM_WEBHOOK_SECRET=
```

- [ ] **Step 4: Generate a real one, append to the local `.env`**

Run: `python -c "import secrets; print(secrets.token_hex(32))"`, append
`TELEGRAM_WEBHOOK_SECRET=<value>` to `solura-eco/backend/.env`. Do not
print the value in any tool output or report — same discipline as every
other secret in this project.

- [ ] **Step 5: Install**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pip install -r requirements.txt`

- [ ] **Step 6: Commit (config.py, requirements.txt, .env.example only — never `.env`)**

```bash
git add solura-eco/backend/requirements.txt solura-eco/backend/app/config.py solura-eco/backend/.env.example
git commit -m "Solura Eco: add openai dependency and TELEGRAM_WEBHOOK_SECRET config"
```

## Task 4: `normalize_phone` (TDD)

**Files:**
- Create: `solura-eco/backend/app/services/phone.py`
- Test: `solura-eco/backend/tests/services/test_phone.py`

- [ ] **Step 1: Write the failing test**

```python
# solura-eco/backend/tests/services/test_phone.py
from app.services.phone import normalize_phone


def test_strips_spaces_and_dashes():
    assert normalize_phone("+1 (555) 123-4567") == "+15551234567"


def test_adds_leading_plus_if_missing():
    assert normalize_phone("15551234567") == "+15551234567"


def test_keeps_existing_leading_plus():
    assert normalize_phone("+998901234567") == "+998901234567"


def test_strips_internal_parens_and_spaces_from_synced_contact():
    assert normalize_phone("+998 (90) 123 45 67") == "+998901234567"
```

- [ ] **Step 2: Run it, confirm ModuleNotFoundError**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/services/test_phone.py -v`

- [ ] **Step 3: Implement**

```python
# solura-eco/backend/app/services/phone.py
"""Phone number normalization -- ported from Argus's normalize_phone
(app/telegram/matching.py). Telegram's shared-contact phone_number can
come through with internal spaces/dashes/parens (common when synced from
a phone's own address book), so a real client can silently fail to match
against clients.contact_phone on formatting alone without this.
"""
import re


def normalize_phone(raw: str) -> str:
    cleaned = re.sub(r"[^\d+]", "", raw.strip())
    return cleaned if cleaned.startswith("+") else f"+{cleaned}"
```

- [ ] **Step 4: Run it, confirm 4 passed**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/services/test_phone.py -v`

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/services/phone.py solura-eco/backend/tests/services/test_phone.py
git commit -m "Solura Eco: phone number normalization (ported from Argus) + tests"
```

## Task 5: Telegram webhook signature verification (TDD)

**Files:**
- Create: `solura-eco/backend/app/telegram/__init__.py` (empty)
- Create: `solura-eco/backend/app/telegram/verify.py`
- Create: `solura-eco/backend/tests/telegram/__init__.py` (empty)
- Test: `solura-eco/backend/tests/telegram/test_verify.py`

- [ ] **Step 1: Write the failing test**

```python
# solura-eco/backend/tests/telegram/test_verify.py
from app.telegram.verify import verify_telegram_signature

SECRET = "test-telegram-secret"


def test_accepts_the_correct_secret():
    assert verify_telegram_signature(SECRET, SECRET) is True


def test_rejects_the_wrong_secret():
    assert verify_telegram_signature("wrong", SECRET) is False


def test_rejects_missing_header_value():
    assert verify_telegram_signature(None, SECRET) is False


def test_rejects_when_configured_secret_is_empty():
    # Fail closed if TELEGRAM_WEBHOOK_SECRET was never actually set --
    # never let an empty expected secret make every request "valid".
    assert verify_telegram_signature("anything", "") is False
```

- [ ] **Step 2: Run it, confirm ModuleNotFoundError**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/telegram/test_verify.py -v`

- [ ] **Step 3: Implement**

```python
# solura-eco/backend/app/telegram/verify.py
"""Telegram Business webhook signature verification -- ported from
Argus's verify_webhook_signature (app/telegram/bot_client.py). Simpler
than GitHub's HMAC-of-body scheme: Telegram just echoes back whatever
secret_token was configured via setWebhook as the
X-Telegram-Bot-Api-Secret-Token header on every request -- a static
shared-secret compare, not a signature over the payload.
"""
import hmac
from typing import Optional


def verify_telegram_signature(received_secret: Optional[str], expected_secret: str) -> bool:
    if not expected_secret:
        return False
    return hmac.compare_digest(received_secret or "", expected_secret)
```

- [ ] **Step 4: Run it, confirm 4 passed**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/telegram/test_verify.py -v`

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/telegram/ solura-eco/backend/tests/telegram/
git commit -m "Solura Eco: Telegram webhook signature verification (ported from Argus) + tests"
```

## Task 6: `GET/POST /clients/{id}/notes`

**Files:**
- Modify: `solura-eco/backend/app/routers/clients.py`

- [ ] **Step 1: Add the endpoints**

Add this import alongside the existing ones in `solura-eco/backend/app/routers/clients.py` (if `BaseModel` isn't already imported from `pydantic` — check first, it likely already is since `ClientIn` etc. use it).

Add these routes at the end of the file:

```python
class ClientNoteIn(BaseModel):
    body: str


@router.get("/{client_id}/notes")
async def list_client_notes(client_id: str, _: dict = Depends(require_session)):
    db = get_client()
    notes = (
        db.table("client_notes")
        .select("id,body,created_at,author_label,members(id,full_name)")
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    for n in notes:
        member = n.pop("members", None)
        n["author"] = member["full_name"] if member else (n.pop("author_label", None) or "Unknown")
    return notes


@router.post("/{client_id}/notes")
async def create_client_note(
    client_id: str, payload: ClientNoteIn, session: dict = Depends(require_session)
):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Note body cannot be empty")

    db = get_client()
    row = {
        "client_id": client_id,
        "member_id": session["member_id"],
        "body": payload.body.strip(),
    }
    result = db.table("client_notes").insert(row).execute().data[0]

    member = db.table("members").select("full_name").eq("id", session["member_id"]).execute().data
    result["author"] = member[0]["full_name"] if member else session["username"]
    return result
```

(This mirrors `list_project_notes`/`create_project_note` in `app/routers/projects.py` exactly, with one addition: `list_client_notes` falls back to `author_label` — e.g. `"Telegram bot"` — when `member_id` is null, since bot-authored notes have no member row to join. `create_client_note` always has a real session member, so it never touches `author_label`.)

- [ ] **Step 2: Verify the app still imports cleanly**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -c "import app.main; print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add solura-eco/backend/app/routers/clients.py
git commit -m "Solura Eco: GET/POST /clients/{id}/notes"
```

## Task 7: GPT-4o summary generation

**Files:**
- Create: `solura-eco/backend/app/telegram/ai_summary.py`

No TDD here — this is a live OpenAI API call, not pure logic; mocking the
API client to "test" it would only test the mock, not real behavior. Manual
verification happens in Task 10 against real conversation history once the
Business connection is live.

- [ ] **Step 1: Write it**

```python
# solura-eco/backend/app/telegram/ai_summary.py
"""GPT-4o structured-output call: conversation history -> a short summary
+ next-step suggestion. Deliberately smaller than Argus's
telegram_evaluator.py (no draft reply, no inventory grounding, no coaching
tip) -- those existed there only to support a human replying from inside
Argus, which this integration doesn't do.
"""
import json
from typing import Optional

from openai import OpenAI

from app.config import settings

_SYSTEM_PROMPT = """You're helping a small team keep track of client conversations on Telegram.
Given the message history below, provide: a short summary (1-2 sentences -- what the
conversation is about and what the client wants), and a next-step suggestion (what
the team should do next). Never invent details not present in the conversation --
if something is unclear, say so in the next step rather than guessing."""

_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "conversation_summary",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "next_step": {"type": "string"},
            },
            "required": ["summary", "next_step"],
            "additionalProperties": False,
        },
    },
}


def summarize_conversation(messages: list[dict]) -> Optional[dict]:
    """messages: [{"role": "client"|"team", "content": str}, ...], oldest first.
    Returns {"summary": str, "next_step": str}, or None if the API call fails
    or OPENAI_API_KEY isn't configured -- callers must treat a missed summary
    as non-fatal (see the spec's error handling: a message still saves even
    if this returns None).
    """
    if not settings.openai_api_key:
        return None

    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in messages)

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": history_text},
            ],
            response_format=_SCHEMA,
        )
        return json.loads(response.choices[0].message.content)
    except Exception:
        return None
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -c "from app.telegram.ai_summary import summarize_conversation; print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add solura-eco/backend/app/telegram/ai_summary.py
git commit -m "Solura Eco: GPT-4o conversation summary generation"
```

## Task 8: Telegram webhook handler

**Files:**
- Create: `solura-eco/backend/app/routers/telegram_business.py`
- Modify: `solura-eco/backend/app/main.py`

- [ ] **Step 1: Write the router**

```python
# solura-eco/backend/app/routers/telegram_business.py
"""Telegram Business webhook -- resolves each inbound message to a client
(matching or auto-creating), persists it, and posts a GPT-4o summary as a
client note. Read-only monitoring: never sends anything back to Telegram.
See docs/superpowers/specs/2026-09-04-telegram-lead-monitoring-design.md.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.services.phone import normalize_phone
from app.services.supabase_client import get_client
from app.telegram.ai_summary import summarize_conversation
from app.telegram.verify import verify_telegram_signature

router = APIRouter()


def _get_or_create_client_for_conversation(db, connection_id: str, chat: dict, contact_phone: str | None):
    """Returns the telegram_conversations row, creating it (and possibly a
    new solura_eco.clients row) if this is a brand-new chat."""
    existing = (
        db.table("telegram_conversations")
        .select("*")
        .eq("connection_id", connection_id)
        .eq("telegram_chat_id", chat["id"])
        .execute()
        .data
    )
    if existing:
        return existing[0]

    client_id = None
    if contact_phone:
        normalized = normalize_phone(contact_phone)
        matches = db.table("clients").select("id").eq("contact_phone", normalized).execute().data
        if matches:
            client_id = matches[0]["id"]

    if not client_id:
        display_name = " ".join(
            part for part in [chat.get("first_name"), chat.get("last_name")] if part
        ) or chat.get("username") or f"Telegram user {chat['id']}"
        new_client = db.table("clients").insert({"name": display_name, "status": "active"}).execute().data[0]
        client_id = new_client["id"]

    conversation = (
        db.table("telegram_conversations")
        .insert(
            {
                "connection_id": connection_id,
                "client_id": client_id,
                "telegram_chat_id": chat["id"],
                "telegram_first_name": chat.get("first_name"),
                "telegram_username": chat.get("username"),
            }
        )
        .execute()
        .data[0]
    )
    return conversation


@router.post("/telegram-business")
async def telegram_business_webhook(request: Request):
    secret = request.headers.get("x-telegram-bot-api-secret-token")
    if not verify_telegram_signature(secret, settings.telegram_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    body = await request.json()
    db = get_client()

    connection_update = body.get("business_connection")
    if connection_update:
        business_connection_id = connection_update["id"]
        is_enabled = connection_update.get("is_enabled", True)
        existing = (
            db.table("telegram_connections")
            .select("id")
            .eq("business_connection_id", business_connection_id)
            .execute()
            .data
        )
        if existing:
            db.table("telegram_connections").update({"is_enabled": is_enabled}).eq(
                "id", existing[0]["id"]
            ).execute()
        else:
            db.table("telegram_connections").insert(
                {
                    "business_connection_id": business_connection_id,
                    "telegram_user_id": connection_update["user"]["id"],
                    "is_enabled": is_enabled,
                }
            ).execute()
        return {"ok": True}

    message = body.get("business_message") or body.get("edited_business_message")
    if not message:
        # Expected, not exceptional -- Telegram sends many update types
        # (regular messages, edited messages, etc.) this integration
        # doesn't act on. 200 so Telegram doesn't retry.
        return {"ok": True, "skipped": "not a business message"}

    business_connection_id = message.get("business_connection_id")
    if not business_connection_id:
        return {"ok": True, "skipped": "no business_connection_id"}

    connection = (
        db.table("telegram_connections")
        .select("id")
        .eq("business_connection_id", business_connection_id)
        .execute()
        .data
    )
    if not connection:
        return {"ok": True, "skipped": "unknown business connection"}
    connection_id = connection[0]["id"]

    chat = message.get("chat", {})
    contact = message.get("contact")
    contact_phone = contact.get("phone_number") if contact else None

    conversation = _get_or_create_client_for_conversation(db, connection_id, chat, contact_phone)

    text = message.get("text") or message.get("caption") or ""
    if not text:
        return {"ok": True, "skipped": "no text content"}

    db.table("telegram_messages").insert(
        {
            "conversation_id": conversation["id"],
            "direction": "inbound",
            "content": text,
            "telegram_message_id": message.get("message_id"),
        }
    ).execute()

    now_iso = datetime.now(timezone.utc).isoformat()
    db.table("telegram_conversations").update(
        {"last_message_at": now_iso}
    ).eq("id", conversation["id"]).execute()

    history_rows = (
        db.table("telegram_messages")
        .select("direction,content")
        .eq("conversation_id", conversation["id"])
        .order("created_at")
        .execute()
        .data
    )
    history = [
        {"role": "client" if r["direction"] == "inbound" else "team", "content": r["content"]}
        for r in history_rows
    ]

    summary_result = summarize_conversation(history)
    if summary_result:
        db.table("telegram_conversations").update(
            {
                "summary": summary_result["summary"],
                "next_step_suggestion": summary_result["next_step"],
                "summary_generated_at": now_iso,
            }
        ).eq("id", conversation["id"]).execute()

        note_body = f"{summary_result['summary']}\n\nNext step: {summary_result['next_step']}"
        db.table("client_notes").insert(
            {
                "client_id": conversation["client_id"],
                "member_id": None,
                "author_label": "Telegram bot",
                "body": note_body,
            }
        ).execute()

    return {"ok": True}
```

- [ ] **Step 2: Wire it into `main.py`**

Change the import line (currently
`from app.routers import auth, canvas, clients, documents, members, projects, tasks, webhooks`)
to:

```python
from app.routers import auth, canvas, clients, documents, members, projects, tasks, telegram_business, webhooks
```

Add the include, alongside the existing `webhooks.router` one:

```python
app.include_router(telegram_business.router, prefix="/webhooks", tags=["telegram"])
```

- [ ] **Step 3: Verify the app imports and lists the route**

Run:
```bash
cd solura-eco/backend && .venv/Scripts/python.exe -c "
import app.main
print('/webhooks/telegram-business' in [r.path for r in app.main.app.routes])
"
```
Expected: `True`

- [ ] **Step 4: Manual verification against a hand-constructed payload**

The real Business connection isn't live yet (manual setup step, outside
this plan), so this verifies the handler's logic directly rather than via
a real Telegram delivery. Start the backend locally
(`cd solura-eco/backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`),
then, using the real `TELEGRAM_WEBHOOK_SECRET` from your local `.env`
(don't print it — paste it directly into the command):

```bash
curl -s -X POST http://localhost:8000/webhooks/telegram-business \
  -H "X-Telegram-Bot-Api-Secret-Token: <secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "business_message": {
      "message_id": 1,
      "business_connection_id": "does-not-exist-yet",
      "chat": {"id": 12345, "first_name": "Test", "username": "testuser"},
      "text": "Hello, this is a test message"
    }
  }'
```

Expected: `{"ok":true,"skipped":"unknown business connection"}` — confirms
signature verification passes and the "no matching connection yet" path
works cleanly (there's genuinely no connection row yet, since none has
been created via a real `business_connection` update). Stop the backend
after (find and kill the uvicorn process).

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/routers/telegram_business.py solura-eco/backend/app/main.py
git commit -m "Solura Eco: Telegram Business webhook handler"
```

## Task 9: Webhook registration script

**Files:**
- Create: `solura-eco/scripts/register_telegram_webhook.py`

- [ ] **Step 1: Write it**

```python
#!/usr/bin/env python3
"""Registers the Telegram webhook URL + secret via the Bot API's
setWebhook call. Run once after the bot token is rotated and the backend
is deployed with the matching TELEGRAM_WEBHOOK_SECRET.

Usage: python scripts/register_telegram_webhook.py <bot-token> <webhook-url> <secret>
Example:
  python scripts/register_telegram_webhook.py <token> \
    https://backend-production-7694a.up.railway.app/webhooks/telegram-business \
    <same value as TELEGRAM_WEBHOOK_SECRET>
"""
import sys

import httpx


def main():
    if len(sys.argv) != 4:
        print(
            "Usage: python scripts/register_telegram_webhook.py <bot-token> <webhook-url> <secret>",
            file=sys.stderr,
        )
        sys.exit(1)

    token, webhook_url, secret = sys.argv[1], sys.argv[2], sys.argv[3]

    response = httpx.post(
        f"https://api.telegram.org/bot{token}/setWebhook",
        json={
            "url": webhook_url,
            "secret_token": secret,
            "allowed_updates": ["business_connection", "business_message", "edited_business_message"],
        },
        timeout=15.0,
    )
    result = response.json()
    if not result.get("ok"):
        print(f"FAILED: {result.get('description', 'unknown error')}", file=sys.stderr)
        sys.exit(1)

    print(f"Webhook registered -> {webhook_url}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify syntax**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m py_compile ../scripts/register_telegram_webhook.py`

Do NOT run it against the real Bot API yet — it needs the freshly-rotated
bot token, which doesn't exist until the manual BotFather step happens
(Task 10).

- [ ] **Step 3: Commit**

```bash
git add solura-eco/scripts/register_telegram_webhook.py
git commit -m "Solura Eco: script to register the Telegram webhook"
```

## Task 10: Frontend — generalize `NotesPanel`, add it to the client page

**Files:**
- Modify: `solura-eco/frontend/src/components/NotesPanel.tsx`
- Modify: `solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx`
- Create: `solura-eco/frontend/src/app/api/clients/[id]/notes/route.ts`
- Modify: `solura-eco/frontend/src/app/(app)/clients/[id]/page.tsx`

### Step 1: generalize `NotesPanel` to take an API path instead of a project ID

Replace the full contents of `solura-eco/frontend/src/components/NotesPanel.tsx`:

```tsx
// solura-eco/frontend/src/components/NotesPanel.tsx
"use client";

import { useState, type FormEvent } from "react";

type Note = { id: string; body: string; author: string; created_at: string };

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotesPanel({ apiPath, initialNotes }: { apiPath: string; initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || submitting) return;

    setSubmitting(true);
    const res = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    setSubmitting(false);

    if (res.ok) {
      const note = (await res.json()) as Note;
      setNotes([note, ...notes]);
      setDraft("");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg2 p-5">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Notepad</div>

      <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Leave a thought, an idea, a heads-up for the others…"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-silver-dim focus:border-cyan"
        />
        <button
          type="submit"
          disabled={!draft.trim() || submitting}
          className="self-end rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {submitting ? "Adding…" : "Add note"}
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="text-xs italic text-silver-dim">No notes yet — be the first.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <div key={n.id} className="animate-fade-in-up border-t border-white/5 pt-3 first:border-0 first:pt-0">
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-white">{n.body}</p>
              <p className="mt-1 text-[11px] text-silver-dim">
                <b className="font-medium text-silver">{n.author}</b> · {timeAgo(n.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

(The only change from before: the prop `projectId: string` became
`apiPath: string`, and `fetch(`/api/projects/${projectId}/notes`, ...)`
became `fetch(apiPath, ...)`. Everything else is byte-identical.)

### Step 2: update the project detail page's existing usage

In `solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx`, find:

```tsx
          <NotesPanel projectId={project.id} initialNotes={notes ?? []} />
```

Change to:

```tsx
          <NotesPanel apiPath={`/api/projects/${project.id}/notes`} initialNotes={notes ?? []} />
```

### Step 3: create the client notes proxy route

```tsx
// solura-eco/frontend/src/app/api/clients/[id]/notes/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const body = await request.json();

  const res = await fetch(`${apiUrl}/clients/${id}/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return NextResponse.json({ error: detail.detail ?? "Failed to add note" }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
```

(Exact same pattern as `src/app/api/projects/[id]/notes/route.ts` — only
the backend path changes from `/projects/{id}/notes` to
`/clients/{id}/notes`.)

### Step 4: wire `NotesPanel` into the client detail page

Read `solura-eco/frontend/src/app/(app)/clients/[id]/page.tsx` fully first.

Add this type near the other type declarations:

```tsx
type Note = { id: string; body: string; author: string; created_at: string };
```

Add this import:

```tsx
import { cookies } from "next/headers";
import { NotesPanel } from "@/components/NotesPanel";
```

(If `cookies` is already imported, don't duplicate it — this page didn't
need it before since it had no auth-dependent fetch beyond the top-level
`getClient` call, which already uses `cookies()` — check the existing
`getClient` function; it likely already imports and uses `cookies()`, in
which case only add the `NotesPanel` import.)

Add a fetch function next to `getClient`:

```tsx
async function getClientNotes(id: string, token: string | undefined): Promise<Note[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/clients/${id}/notes`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Note[];
}
```

In the `ClientPage` component, find:

```tsx
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const client = await getClient(id, token);

  if (!client) notFound();
```

Change to fetch notes in parallel:

```tsx
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const [client, notes] = await Promise.all([getClient(id, token), getClientNotes(id, token)]);

  if (!client) notFound();
```

Finally, render the panel — add it after the closing `</div>` of the
project grid section (right before the final closing `</div>` of the
page's outer wrapper):

```tsx
      <div className="mt-6">
        <NotesPanel apiPath={`/api/clients/${client.id}/notes`} initialNotes={notes ?? []} />
      </div>
```

### Step 5: Build to verify

`cd solura-eco/frontend && npm run build`
Expected: `✓ Compiled successfully`, route table includes
`/api/clients/[id]/notes`

### Step 6: Commit

```bash
git add solura-eco/frontend/src/components/NotesPanel.tsx "solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx" solura-eco/frontend/src/app/api/clients "solura-eco/frontend/src/app/(app)/clients/[id]/page.tsx"
git commit -m "Solura Eco frontend: generalize NotesPanel, add it to the client page"
```

## Task 11: Deploy and manual end-to-end verification

**Files:** none (deployment + verification checkpoint)

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

Railway and Vercel auto-deploy on push (already connected).

- [ ] **Step 2: Set the real secrets on Railway**

Once deployed, set on the Railway backend service (same pattern as
`SESSION_SECRET`/`GITHUB_WEBHOOK_SECRET` earlier): `TELEGRAM_WEBHOOK_SECRET`
(same value as local `.env`), `TELEGRAM_BOT_TOKEN` (the freshly-rotated
one), `OPENAI_API_KEY` (a real key, if not already set from elsewhere).

- [ ] **Step 3: Manual, one-time operational setup (not code)**

On the dedicated Solura Telegram account: rotate the bot token via
BotFather (the old one was shared in a chat transcript — never reuse it),
update `TELEGRAM_BOT_TOKEN` on Railway with the new value, then connect
Telegram Business (requires Premium): Settings → Telegram Business →
Chatbots → connect the bot.

- [ ] **Step 4: Register the webhook**

```bash
cd solura-eco
python scripts/register_telegram_webhook.py <the-new-bot-token> https://backend-production-7694a.up.railway.app/webhooks/telegram-business <the-real-TELEGRAM_WEBHOOK_SECRET-value>
```

Expected: `Webhook registered -> https://...`

- [ ] **Step 5: Real end-to-end verification**

Send a real message to the connected Telegram account from a different
Telegram account (e.g. your own personal one, pretending to be a
prospect). Confirm: a new `clients` row appears (check via
`GET /clients` or the home page grid) named from that Telegram profile,
its detail page's Notepad shows a "Telegram bot"-authored note with a
real AI-generated summary and next step within a few seconds.

- [ ] **Step 6: Update the build plan**

In `solura-eco/docs/build-plan.md`, mark item #5 (Telegram lead
monitoring) as shipped, noting the read-only scope and the phone-matching
limitation from the spec. Commit:

```bash
git add solura-eco/docs/build-plan.md
git commit -m "Solura Eco: Telegram lead monitoring shipped"
```
