"""In-app notifications for the signed-in member -- per-member reads,
unlike the rest of this app's flat "everyone sees everything" model,
since a notification only means something to the person it's for.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()

MAX_ITEMS = 30


@router.get("")
async def list_notifications(session: dict = Depends(require_session)):
    db = get_client()
    notifications = (
        db.table("notifications")
        .select("id,type,title,body,href,read_at,created_at")
        .eq("member_id", session["member_id"])
        .order("created_at", desc=True)
        .limit(MAX_ITEMS)
        .execute()
        .data
    )
    unread_count = sum(1 for n in notifications if not n["read_at"])
    return {"notifications": notifications, "unread_count": unread_count}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, session: dict = Depends(require_session)):
    db = get_client()
    result = (
        db.table("notifications")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", notification_id)
        .eq("member_id", session["member_id"])  # never let one member mark another's notification read
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Notification not found")
    return result.data[0]


@router.post("/read-all")
async def mark_all_read(session: dict = Depends(require_session)):
    db = get_client()
    db.table("notifications").update({"read_at": datetime.now(timezone.utc).isoformat()}).eq(
        "member_id", session["member_id"]
    ).is_("read_at", "null").execute()
    return {"ok": True}
