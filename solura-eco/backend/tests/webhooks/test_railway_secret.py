from app.webhooks.railway import verify_railway_secret

SECRET = "test-railway-secret"


def test_accepts_the_correct_secret():
    assert verify_railway_secret(SECRET, SECRET) is True


def test_rejects_the_wrong_secret():
    assert verify_railway_secret("wrong", SECRET) is False


def test_rejects_empty_provided_secret():
    assert verify_railway_secret("", SECRET) is False


def test_rejects_when_configured_secret_is_empty():
    # Fail-closed: an empty configured secret must never mean "anything
    # in the URL matches" -- same discipline as every other secret check
    # in this app.
    assert verify_railway_secret("", "") is False
    assert verify_railway_secret("anything", "") is False
