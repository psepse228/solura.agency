"""Phone number normalization -- ported from Argus's normalize_phone
(app/telegram/matching.py). Telegram's shared-contact phone_number can
come through with internal spaces/dashes/parens (common when synced from
a phone's own address book), so a real client can silently fail to match
against clients.contact_phone on formatting alone without this.
"""
import re


def normalize_phone(raw: str) -> str:
    cleaned = re.sub(r"[^\d+]", "", raw.strip())
    return cleaned if cleaned.startswith("+") else f"+{cleaned}"
