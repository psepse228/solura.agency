"""GitHub webhook signature verification (X-Hub-Signature-256).

Must run before the payload is touched -- an unverified endpoint would let
anyone POST fake commits for any linked project.
"""
import hashlib
import hmac


def verify_github_signature(payload_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected = "sha256=" + hmac.new(secret.encode("utf-8"), payload_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
