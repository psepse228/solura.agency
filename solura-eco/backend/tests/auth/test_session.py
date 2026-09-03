import time

from app.auth.session import create_session_token, verify_session_token

SECRET = "test-secret-do-not-use-in-real-env"


def test_verify_accepts_a_token_it_just_created():
    token = create_session_token(member_id="abc-123", username="rizo", secret=SECRET)
    payload = verify_session_token(token, SECRET)
    assert payload is not None
    assert payload["member_id"] == "abc-123"
    assert payload["username"] == "rizo"


def test_verify_rejects_a_token_signed_with_a_different_secret():
    token = create_session_token(member_id="abc-123", username="rizo", secret=SECRET)
    assert verify_session_token(token, "wrong-secret") is None


def test_verify_rejects_a_tampered_payload():
    token = create_session_token(member_id="abc-123", username="rizo", secret=SECRET)
    payload_b64, sig = token.split(".", 1)
    tampered = payload_b64 + "x." + sig  # corrupt the payload, keep the signature
    assert verify_session_token(tampered, SECRET) is None


def test_verify_rejects_an_expired_token():
    token = create_session_token(member_id="abc-123", username="rizo", secret=SECRET)
    # max_age_seconds=0 means "expired the instant it was issued"
    assert verify_session_token(token, SECRET, max_age_seconds=0) is None


def test_verify_rejects_malformed_tokens():
    assert verify_session_token("not-a-real-token", SECRET) is None
    assert verify_session_token("", SECRET) is None
