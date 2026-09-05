"""Outbound side of the Telegram Business integration -- replying to a
client/lead from inside the platform instead of switching to Telegram.
Deliberately its own file, separate from telegram_business.py's inbound
webhook: that one is read-only by design, this one exists specifically
to send. Always human-initiated (typed and clicked Send here) -- the AI
summary/next-step is a suggestion to read, never a draft that sends
itself.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import require_session
from app.services.supabase_client import get_client
from app.telegram.bot_client import TelegramSendError, send_message

router = APIRouter()


class ReplyIn(BaseModel):
    text: str


@router.post("/conversations/{conversation_id}/reply")
async def reply_to_conversation(conversation_id: str, payload: ReplyIn, _: dict = Depends(require_session)):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Reply cannot be empty")

    db = get_client()
    rows = (
        db.table("telegram_conversations")
        .select("id,telegram_chat_id,telegram_connections(business_connection_id)")
        .eq("id", conversation_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation = rows[0]
    connection = conversation.get("telegram_connections") or {}
    business_connection_id = connection.get("business_connection_id")
    if not business_connection_id:
        raise HTTPException(status_code=400, detail="No Telegram Business connection for this conversation")

    try:
        send_message(business_connection_id, conversation["telegram_chat_id"], text)
    except TelegramSendError as e:
        raise HTTPException(status_code=502, detail=f"Telegram rejected the message: {e}")

    now_iso = datetime.now(timezone.utc).isoformat()
    message = (
        db.table("telegram_messages")
        .insert({"conversation_id": conversation_id, "direction": "outbound", "content": text})
        .execute()
        .data[0]
    )
    db.table("telegram_conversations").update({"last_message_at": now_iso}).eq("id", conversation_id).execute()
    return message
