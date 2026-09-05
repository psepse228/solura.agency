"""FastAPI dependency that requires a valid session -- Bearer header first
(what the frontend's Server Components use, since Vercel and Railway are
different domains and cookies don't cross that boundary), cookie as a
fallback (useful for hitting the backend directly, e.g. via /docs).
"""
from fastapi import HTTPException, Request

from app.auth.session import verify_session_token
from app.config import settings
from app.services.supabase_client import get_client


def require_session(request: Request) -> dict:
    token = None

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer ") :]

    if not token:
        token = request.cookies.get("session")

    payload = verify_session_token(token, settings.session_secret) if token else None
    if payload is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Session tokens are stateless (signed, up to 30 days old) -- a
    # member disabled after their token was issued would otherwise keep
    # full access until it expires. One extra lookup per request is the
    # cost of a kill-switch actually working immediately.
    db = get_client()
    member = db.table("members").select("access_enabled").eq("id", payload["member_id"]).execute().data
    if not member or not member[0]["access_enabled"]:
        raise HTTPException(status_code=401, detail="Access disabled")

    return payload
