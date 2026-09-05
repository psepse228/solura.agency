"""Vercel webhook signature verification (x-vercel-signature) -- HMAC-SHA1
of the raw body, per Vercel's own docs. Must run before the payload is
touched, same discipline as the GitHub verifier.
"""
import hashlib
import hmac


def verify_vercel_signature(payload_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), payload_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(expected, signature_header)
