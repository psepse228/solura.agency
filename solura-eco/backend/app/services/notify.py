"""Creates in-app notifications -- a thin insert helper so callers
(tasks.py, wherever else needs it later) don't hand-roll the row shape.
Never notifies the acting member about their own action (assigning
yourself, commenting on your own task isn't news).
"""
from typing import Optional


def notify(db, *, member_id: str, actor_member_id: Optional[str], type: str, title: str, body: Optional[str] = None, href: Optional[str] = None) -> None:
    if member_id == actor_member_id:
        return
    db.table("notifications").insert(
        {"member_id": member_id, "type": type, "title": title, "body": body, "href": href}
    ).execute()
