"""FastAPI dependency that requires a valid session -- Bearer header first
(what the frontend's Server Components use, since Vercel and Railway are
different domains and cookies don't cross that boundary), cookie as a
fallback (useful for hitting the backend directly, e.g. via /docs).
"""
from fastapi import HTTPException, Request

from app.auth.session import verify_session_token
from app.config import settings


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

    return payload
