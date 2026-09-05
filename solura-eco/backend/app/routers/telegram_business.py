# solura-eco/backend/app/routers/telegram_business.py
"""One webhook, two unrelated jobs (Telegram only allows one webhook URL
per bot, so both live behind the same route):

1. Business-message monitoring -- resolves each inbound client message to
   an existing client (phone match) or a new lead (no match -- a random
   Telegram contact isn't known to belong to any project, so it can't
   become a `clients` row; see 0018_telegram_conversations_leads.sql),
   persists it, and posts a GPT-4o summary (client note, or appended to
   the lead's own notes field). Read-only: never sends anything back.
2. Solura Assistant (_maybe_answer_assistant_question) -- a plain message
   (DM to the bot, or an @mention/reply in a group chat) gets answered
   from a live snapshot of projects/clients/tasks/leads. This is the one
   path that DOES send a message back, on its own initiative.

See docs/superpowers/specs/2026-09-04-telegram-lead-monitoring-design.md
(written before the Assistant existed -- covers job 1 only).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from app.ai.assistant import answer_question, gather_context
from app.config import settings
from app.services.phone import normalize_phone
from app.services.supabase_client import get_client
from app.telegram.ai_summary import summarize_conversation
from app.telegram.bot_client import TelegramSendError, send_bot_message
from app.telegram.verify import verify_telegram_signature

router = APIRouter()


def _maybe_answer_assistant_question(db, message: dict) -> bool:
    """Solura Assistant: a plain (non-business) message -- a DM to the
    bot, or a group message that @mentions it or replies to one of its
    own messages. Returns whether a question was actually answered, so
    the webhook can report it distinctly from the business-message path.

    This is the one place this integration sends anything back to
    Telegram on its own initiative -- the business-message monitoring
    path above is deliberately read-only.
    """
    chat = message.get("chat", {})
    chat_id = chat.get("id")
    text = message.get("text") or ""
    if chat_id is None or not text.strip():
        return False

    bot_username = settings.telegram_bot_username
    is_private = chat.get("type") == "private"
    mentioned = bool(bot_username) and f"@{bot_username}".lower() in text.lower()
    reply_to = message.get("reply_to_message") or {}
    replied_to_bot = bool(bot_username) and (reply_to.get("from") or {}).get("username") == bot_username

    if not (is_private or mentioned or replied_to_bot):
        return False

    question = text
    if bot_username:
        question = question.replace(f"@{bot_username}", "").strip()
    if not question:
        return False

    context = gather_context(db)
    answer = answer_question(question, context)
    if not answer:
        return False

    try:
        send_bot_message(chat_id, answer, reply_to_message_id=message.get("message_id"))
    except TelegramSendError:
        # Best-effort -- the answer was generated fine, Telegram delivery
        # failing shouldn't turn into a 500 that makes Telegram retry the
        # whole update (which would just regenerate the same answer).
        return False
    return True


def _get_or_create_conversation(db, connection_id: str, chat: dict, contact_phone: str | None):
    """Returns the telegram_conversations row, creating it (and possibly a
    new lead, or matching an existing client) if this is a brand-new chat.

    Uses `chat.get("id")`, not `chat["id"]` -- a malformed webhook payload
    (missing "chat" entirely, defaulting to {}) must never raise KeyError
    here; the caller already returns a 200/skip when chat_id ends up None.
    """
    chat_id = chat.get("id")
    if chat_id is None:
        return None

    existing = (
        db.table("telegram_conversations")
        .select("*")
        .eq("connection_id", connection_id)
        .eq("telegram_chat_id", chat_id)
        .execute()
        .data
    )
    if existing:
        return existing[0]

    normalized_phone = normalize_phone(contact_phone) if contact_phone else None
    client_id = None
    if normalized_phone:
        matches = db.table("clients").select("id").eq("contact_phone", normalized_phone).execute().data
        if matches:
            client_id = matches[0]["id"]

    # No phone match -> this Telegram contact isn't known to belong to any
    # project yet, so it becomes a lead (source='telegram'), not a client
    # (clients.project_id is NOT NULL, and there's no project to guess
    # here -- see 0018_telegram_conversations_leads.sql).
    lead_id = None
    created_lead_id = None
    if not client_id:
        display_name = " ".join(
            part for part in [chat.get("first_name"), chat.get("last_name")] if part
        ) or chat.get("username") or f"Telegram user {chat_id}"
        new_lead = (
            db.table("leads")
            .insert({"name": display_name, "contact_phone": normalized_phone, "source": "telegram"})
            .execute()
            .data[0]
        )
        lead_id = new_lead["id"]
        created_lead_id = lead_id

    try:
        conversation = (
            db.table("telegram_conversations")
            .insert(
                {
                    "connection_id": connection_id,
                    "client_id": client_id,
                    "lead_id": lead_id,
                    "telegram_chat_id": chat_id,
                    "telegram_first_name": chat.get("first_name"),
                    "telegram_username": chat.get("username"),
                }
            )
            .execute()
            .data[0]
        )
        return conversation
    except Exception:
        # A racing webhook delivery for the same brand-new chat (Telegram
        # redelivers on timeout/5xx) can beat us here -- the unique
        # constraint on (connection_id, telegram_chat_id) rejects our
        # insert. The winning request's conversation already exists; use
        # it instead of erroring, and clean up the lead row we
        # speculatively created (safe: it's brand new, created in this
        # same call, and no conversation references it -- nothing else
        # could have linked to it yet).
        existing_after_race = (
            db.table("telegram_conversations")
            .select("*")
            .eq("connection_id", connection_id)
            .eq("telegram_chat_id", chat_id)
            .execute()
            .data
        )
        if created_lead_id:
            db.table("leads").delete().eq("id", created_lead_id).execute()
        if existing_after_race:
            return existing_after_race[0]
        raise


@router.post("/telegram-business")
async def telegram_business_webhook(request: Request):
    secret = request.headers.get("x-telegram-bot-api-secret-token")
    if not verify_telegram_signature(secret, settings.telegram_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    body = await request.json()
    db = get_client()

    connection_update = body.get("business_connection")
    if connection_update:
        business_connection_id = connection_update.get("id")
        telegram_user_id = connection_update.get("user", {}).get("id")
        if not business_connection_id or telegram_user_id is None:
            # Malformed connection update -- skip, don't 500. Telegram
            # retries non-2xx responses; a payload shape we can't use is
            # expected traffic here, not a failure.
            return {"ok": True, "skipped": "malformed business_connection payload"}

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
                    "telegram_user_id": telegram_user_id,
                    "is_enabled": is_enabled,
                }
            ).execute()
        return {"ok": True}

    plain_message = body.get("message")
    if plain_message:
        handled = _maybe_answer_assistant_question(db, plain_message)
        return {"ok": True, "assistant_handled": handled}

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

    conversation = _get_or_create_conversation(db, connection_id, chat, contact_phone)
    if conversation is None:
        return {"ok": True, "skipped": "message has no usable chat id"}

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
        if conversation.get("client_id"):
            db.table("client_notes").insert(
                {
                    "client_id": conversation["client_id"],
                    "member_id": None,
                    "author_label": "Telegram bot",
                    "body": note_body,
                }
            ).execute()
        elif conversation.get("lead_id"):
            # Leads have no separate notes-log table (unlike clients) --
            # append to the single notes text field instead.
            lead = db.table("leads").select("notes").eq("id", conversation["lead_id"]).execute().data
            existing_notes = (lead[0]["notes"] if lead else None) or ""
            updated_notes = f"{existing_notes}\n\n{note_body}".strip()
            db.table("leads").update({"notes": updated_notes}).eq("id", conversation["lead_id"]).execute()

    return {"ok": True}
