"""AI сводка -- the on-demand "what's actually going on" digest for the
home page. Same single-shot judgment shape as Argus's company_summary.py
(narrative + a few highlights, never invent a fact not in the input),
and reuses assistant.py's gather_context so this and the Solura
Assistant read the platform the same way. Read on click, not polled or
cached -- three people don't generate enough new activity per day for a
background job to be worth the OpenAI cost.
"""
import json
import logging

from openai import OpenAI

from app.ai.assistant import gather_context
from app.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are generating a short "state of the union" digest for the 3-person Solura team
(Rizo, Jonik, Dior), from a JSON snapshot of their ops platform (projects, clients, tasks, leads).

Write a short narrative (2-4 sentences, plain text) covering what's actually going on: which
projects are moving, what's stalled, anything that needs attention. Then give 2-5 short highlights
(a label like "3 overdue tasks" and a one-sentence detail explaining why it matters).

Rules:
- Use ONLY the data in the snapshot. Never invent a project, client, task, lead, or number that
  isn't there.
- If a lead has sat in the same stage a while or a task is overdue, that's worth a highlight.
- If the snapshot is mostly empty or uneventful, say so plainly instead of padding with filler."""

_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "team_digest",
        "schema": {
            "type": "object",
            "properties": {
                "narrative": {"type": "string"},
                "highlights": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string"},
                            "detail": {"type": "string"},
                        },
                        "required": ["label", "detail"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["narrative", "highlights"],
            "additionalProperties": False,
        },
        "strict": True,
    },
}


def generate_digest(db) -> dict | None:
    """Returns {"narrative": str, "highlights": [{"label", "detail"}]},
    or None if OpenAI isn't configured or the call fails -- same
    best-effort contract as the rest of app/ai (callers must handle a
    missed digest as non-fatal, not a 500)."""
    if not settings.openai_api_key:
        return None

    context = gather_context(db)
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False, default=str)},
    ]
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        resp = client.chat.completions.create(model="gpt-4o", messages=messages, response_format=_SCHEMA)
        return json.loads(resp.choices[0].message.content)
    except Exception:
        logger.exception("Team digest generation failed")
        return None
