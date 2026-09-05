"""Thin HTTP client for the Telegram Bot API's two distinct send paths --
neither talks to Supabase or GPT, just Telegram over HTTP. Ported from
Argus's app/telegram/bot_client.py.
"""
import logging
import os

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


class TelegramSendError(Exception):
    """Raised when the Telegram Bot API call itself fails (bad HTTP status,
    timeout, connection error) -- distinct from a plain unhandled exception
    so callers can log/skip instead of raising a raw exception out of a
    webhook handler that Telegram would just retry."""


def send_message(business_connection_id: str, chat_id: int, text: str) -> dict:
    """Sends as the connected business account, not as the bot itself --
    business_connection_id is what makes the reply land in the team's own
    Telegram Business chat with the client, not from some generic bot.
    Always human-initiated (typed and clicked Send in the platform's own
    reply box) -- never called automatically, the AI summary/next-step is
    a suggestion to read, not a draft that sends itself."""
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    try:
        resp = httpx.post(
            f"{TELEGRAM_API_BASE}/bot{token}/sendMessage",
            json={"business_connection_id": business_connection_id, "chat_id": chat_id, "text": text},
            timeout=10.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.exception("Telegram sendMessage (business) call failed")
        raise TelegramSendError(str(e)) from e
    return resp.json()


def send_bot_message(chat_id: int, text: str, reply_to_message_id: int | None = None) -> dict:
    """Sends as the bot's own identity into any chat it's a member of
    (a group, or a DM with the bot) -- a normal Bot API sendMessage call,
    no business_connection_id involved."""
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    payload = {"chat_id": chat_id, "text": text}
    if reply_to_message_id is not None:
        payload["reply_to_message_id"] = reply_to_message_id
    try:
        resp = httpx.post(f"{TELEGRAM_API_BASE}/bot{token}/sendMessage", json=payload, timeout=10.0)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.exception("Telegram sendMessage (bot) call failed")
        raise TelegramSendError(str(e)) from e
    return resp.json()
