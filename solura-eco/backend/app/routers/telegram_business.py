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
    new solura_eco.clients row) if this is a brand-new chat.

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

    client_id = None
    if contact_phone:
        normalized = normalize_phone(contact_phone)
        matches = db.table("clients").select("id").eq("contact_phone", normalized).execute().data
        if matches:
            client_id = matches[0]["id"]

    created_client_id = None
    if not client_id:
        display_name = " ".join(
            part for part in [chat.get("first_name"), chat.get("last_name")] if part
        ) or chat.get("username") or f"Telegram user {chat_id}"
        new_client = db.table("clients").insert({"name": display_name, "status": "active"}).execute().data[0]
        client_id = new_client["id"]
        created_client_id = client_id

    try:
        conversation = (
            db.table("telegram_conversations")
            .insert(
                {
                    "connection_id": connection_id,
                    "client_id": client_id,
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
        # it instead of erroring, and clean up the client row we
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
        if created_client_id:
            db.table("clients").delete().eq("id", created_client_id).execute()
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
        db.table("client_notes").insert(
            {
                "client_id": conversation["client_id"],
                "member_id": None,
                "author_label": "Telegram bot",
                "body": note_body,
            }
        ).execute()

    return {"ok": True}
