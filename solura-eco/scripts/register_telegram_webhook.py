#!/usr/bin/env python3
"""Registers the Telegram webhook URL + secret via the Bot API's
setWebhook call. Run once after the bot token is rotated and the backend
is deployed with the matching TELEGRAM_WEBHOOK_SECRET.

Usage: python scripts/register_telegram_webhook.py <bot-token> <webhook-url> <secret>
Example:
  python scripts/register_telegram_webhook.py <token> \
    https://backend-production-7694a.up.railway.app/webhooks/telegram-business \
    <same value as TELEGRAM_WEBHOOK_SECRET>
"""
import sys

import httpx


def main():
    if len(sys.argv) != 4:
        print(
            "Usage: python scripts/register_telegram_webhook.py <bot-token> <webhook-url> <secret>",
            file=sys.stderr,
        )
        sys.exit(1)

    token, webhook_url, secret = sys.argv[1], sys.argv[2], sys.argv[3]

    response = httpx.post(
        f"https://api.telegram.org/bot{token}/setWebhook",
        json={
            "url": webhook_url,
            "secret_token": secret,
            "allowed_updates": ["business_connection", "business_message", "edited_business_message"],
        },
        timeout=15.0,
    )
    result = response.json()
    if not result.get("ok"):
        print(f"FAILED: {result.get('description', 'unknown error')}", file=sys.stderr)
        sys.exit(1)

    print(f"Webhook registered -> {webhook_url}")


if __name__ == "__main__":
    main()
