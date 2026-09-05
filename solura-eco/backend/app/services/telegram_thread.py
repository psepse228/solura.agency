"""Shared lookup behind the read-only Telegram thread panel on a client's
or lead's own page -- same query shape either way (one conversation per
contact, its messages oldest-first), so this isn't duplicated between
clients.py and leads.py.
"""
from typing import Optional


def get_conversation_thread(db, *, client_id: Optional[str] = None, lead_id: Optional[str] = None) -> Optional[dict]:
    """Returns {"conversation": {...}, "messages": [...]} for the contact's
    Telegram conversation, or None if they've never messaged in. Exactly
    one of client_id/lead_id should be given -- mirrors the exclusivity
    telegram_conversations itself enforces (0018_telegram_conversations_leads.sql)."""
    query = db.table("telegram_conversations").select(
        "id,telegram_first_name,telegram_username,last_message_at,summary,next_step_suggestion,summary_generated_at"
    )
    query = query.eq("client_id", client_id) if client_id else query.eq("lead_id", lead_id)
    conversations = query.execute().data
    if not conversations:
        return None
    conversation = conversations[0]

    messages = (
        db.table("telegram_messages")
        .select("id,direction,content,created_at")
        .eq("conversation_id", conversation["id"])
        .order("created_at")
        .execute()
        .data
    )
    return {"conversation": conversation, "messages": messages}
