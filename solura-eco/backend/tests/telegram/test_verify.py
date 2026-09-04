from app.telegram.verify import verify_telegram_signature

SECRET = "test-telegram-secret"


def test_accepts_the_correct_secret():
    assert verify_telegram_signature(SECRET, SECRET) is True


def test_rejects_the_wrong_secret():
    assert verify_telegram_signature("wrong", SECRET) is False


def test_rejects_missing_header_value():
    assert verify_telegram_signature(None, SECRET) is False


def test_rejects_when_configured_secret_is_empty():
    # Fail closed if TELEGRAM_WEBHOOK_SECRET was never actually set --
    # never let an empty expected secret make every request "valid".
    assert verify_telegram_signature("anything", "") is False
