import hashlib
import hmac

from app.webhooks.vercel import verify_vercel_signature

SECRET = "test-vercel-secret"


def _sign(body: bytes) -> str:
    return hmac.new(SECRET.encode(), body, hashlib.sha1).hexdigest()


def test_accepts_a_correctly_signed_payload():
    body = b'{"type": "deployment.succeeded"}'
    assert verify_vercel_signature(body, _sign(body), SECRET) is True


def test_rejects_a_payload_signed_with_the_wrong_secret():
    body = b'{"type": "deployment.succeeded"}'
    wrong_sig = hmac.new(b"wrong-secret", body, hashlib.sha1).hexdigest()
    assert verify_vercel_signature(body, wrong_sig, SECRET) is False


def test_rejects_a_tampered_body():
    body = b'{"type": "deployment.succeeded"}'
    sig = _sign(body)
    tampered = b'{"type": "deployment.error"}'
    assert verify_vercel_signature(tampered, sig, SECRET) is False


def test_rejects_missing_signature_header():
    assert verify_vercel_signature(b"{}", "", SECRET) is False


def test_rejects_when_configured_secret_is_empty():
    # Same fail-closed discipline as every other secret check in this app --
    # an empty configured secret must never mean "anything matches".
    body = b"{}"
    sig = hmac.new(b"", body, hashlib.sha1).hexdigest()
    assert verify_vercel_signature(body, sig, "") is False
