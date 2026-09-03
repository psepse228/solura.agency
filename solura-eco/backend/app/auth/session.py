"""Signed session tokens -- format matches Cortege's session.ts / Tender
Agent's session.py: base64url(payload).hex(hmac). Ported here, not
reinvented, per the multi-tenant SaaS playbook (see the Solura wiki).

The HMAC is computed over the raw base64url-decoded payload bytes, not a
re-serialized JSON string -- this is what lets the Next.js frontend verify
the same token without needing byte-identical JSON serialization between
Python and JS (it never re-encodes the payload, only decodes+verifies it).
"""
import base64
import hashlib
import hmac
import json
import time
from typing import Optional

DEFAULT_MAX_AGE_SECONDS = 30 * 24 * 3600  # 30 days


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def create_session_token(member_id: str, username: str, secret: str) -> str:
    payload = {
        "member_id": member_id,
        "username": username,
        "issued_at": int(time.time()),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def verify_session_token(
    token: Optional[str], secret: str, max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS
) -> Optional[dict]:
    if not token or "." not in token:
        return None

    payload_b64, sig = token.split(".", 1)

    try:
        payload_bytes = _b64url_decode(payload_b64)
    except Exception:
        return None

    expected_sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None

    try:
        payload = json.loads(payload_bytes)
    except Exception:
        return None

    if time.time() - payload.get("issued_at", 0) > max_age_seconds:
        return None

    return payload
