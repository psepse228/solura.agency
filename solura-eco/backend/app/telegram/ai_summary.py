# solura-eco/backend/app/telegram/ai_summary.py
"""GPT-4o structured-output call: conversation history -> a short summary
+ next-step suggestion. Deliberately smaller than Argus's
telegram_evaluator.py (no draft reply, no inventory grounding, no coaching
tip) -- those existed there only to support a human replying from inside
Argus, which this integration doesn't do.
"""
import json
from typing import Optional

from openai import OpenAI

from app.config import settings

_SYSTEM_PROMPT = """You're helping a small team keep track of client conversations on Telegram.
Given the message history below, provide: a short summary (1-2 sentences -- what the
conversation is about and what the client wants), and a next-step suggestion (what
the team should do next). Never invent details not present in the conversation --
if something is unclear, say so in the next step rather than guessing."""

_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "conversation_summary",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "next_step": {"type": "string"},
            },
            "required": ["summary", "next_step"],
            "additionalProperties": False,
        },
    },
}


def summarize_conversation(messages: list[dict]) -> Optional[dict]:
    """messages: [{"role": "client"|"team", "content": str}, ...], oldest first.
    Returns {"summary": str, "next_step": str}, or None if the API call fails
    or OPENAI_API_KEY isn't configured -- callers must treat a missed summary
    as non-fatal (see the spec's error handling: a message still saves even
    if this returns None).
    """
    if not settings.openai_api_key:
        return None

    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in messages)

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": history_text},
            ],
            response_format=_SCHEMA,
        )
        return json.loads(response.choices[0].message.content)
    except Exception:
        return None
