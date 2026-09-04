"""Telegram Business webhook signature verification -- ported from
Argus's verify_webhook_signature (app/telegram/bot_client.py). Simpler
than GitHub's HMAC-of-body scheme: Telegram just echoes back whatever
secret_token was configured via setWebhook as the
X-Telegram-Bot-Api-Secret-Token header on every request -- a static
shared-secret compare, not a signature over the payload.
"""
import hmac
from typing import Optional


def verify_telegram_signature(received_secret: Optional[str], expected_secret: str) -> bool:
    if not expected_secret:
        return False
    return hmac.compare_digest(received_secret or "", expected_secret)
