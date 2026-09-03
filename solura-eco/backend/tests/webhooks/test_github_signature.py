import hashlib
import hmac

from app.webhooks.github import verify_github_signature

SECRET = "test-webhook-secret"


def _sign(body: bytes) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


def test_accepts_a_correctly_signed_payload():
    body = b'{"foo": "bar"}'
    assert verify_github_signature(body, _sign(body), SECRET) is True


def test_rejects_a_payload_signed_with_the_wrong_secret():
    body = b'{"foo": "bar"}'
    wrong_sig = "sha256=" + hmac.new(b"wrong-secret", body, hashlib.sha256).hexdigest()
    assert verify_github_signature(body, wrong_sig, SECRET) is False


def test_rejects_a_tampered_body():
    body = b'{"foo": "bar"}'
    sig = _sign(body)
    tampered = b'{"foo": "baz"}'
    assert verify_github_signature(tampered, sig, SECRET) is False


def test_rejects_missing_signature_header():
    assert verify_github_signature(b"{}", "", SECRET) is False


def test_rejects_malformed_signature_header():
    assert verify_github_signature(b"{}", "not-sha256-prefixed", SECRET) is False
