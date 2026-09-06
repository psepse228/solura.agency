"""Solura Assistant -- the "ask it questions in the group chat" feature.
Single-shot GPT-4o call, same discipline as Argus's company_summary.py/
client_context.py (never invent a fact not in the input), deliberately
NOT the multi-turn function-calling loop Argus's app/ai/chat.py uses --
three people asking occasional "how's Argus doing" questions doesn't need
a tool-calling agent, just an honest read of the current DB state on
every question (no caching, no memory of past questions).
"""
import json
import logging
from datetime import datetime, timezone

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are the Solura Assistant, answering questions for the 3-person Solura team
(Rizo, Jonik, Dior) in their internal Telegram group chat. You're given a JSON snapshot of their
current ops platform: projects, clients, tasks, and leads.

Answer the team's question in 1-4 short sentences, plain text (this is a Telegram message, no
markdown headers or tables) -- direct and conversational, like a teammate who already knows the
data would answer.

Rules:
- Use ONLY the data in the JSON snapshot. Never invent a project, client, task, number, or name
  that isn't there.
- If the question needs data this snapshot doesn't have (e.g. financial figures, something outside
  projects/clients/tasks/leads), say so honestly instead of guessing.
- If the snapshot has nothing relevant to the question, say that plainly instead of padding with
  unrelated facts."""


def _get_client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


def gather_context(db) -> dict:
    """A read-only snapshot of the whole platform -- same shape a person
    would get skimming Projects/Clients/Tasks/Leads themselves. Small
    enough (3-person team, dozens of rows at most) that pulling
    everything on every question is simpler and more honest than trying
    to guess which tables the question needs."""
    projects = (
        db.table("projects")
        .select("id,name,status,progress,github_repo")
        .execute()
        .data
    )
    clients = (
        db.table("clients")
        .select("id,name,status,project_id,projects(name)")
        .execute()
        .data
    )
    for c in clients:
        project = c.pop("projects", None)
        c["project_name"] = project["name"] if project else None

    tasks = (
        db.table("work_tasks")
        .select("id,title,status,priority,due_at,client_name,parent_task_id,members(full_name)")
        .is_("parent_task_id", "null")
        .execute()
        .data
    )
    for t in tasks:
        member = t.pop("members", None)
        t["assigned_to"] = member["full_name"] if member else None

    leads = (
        db.table("leads")
        .select("id,name,company_name,status,source")
        .execute()
        .data
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "projects": projects,
        "clients": clients,
        "tasks": tasks,
        "leads": leads,
    }


def answer_question(question: str, context: dict, history: list[dict] | None = None) -> str | None:
    """Returns the assistant's plain-text reply, or None if OpenAI isn't
    configured or the call fails -- callers must treat this as
    best-effort (same contract as telegram/ai_summary.py's
    summarize_conversation), never let a failed answer crash the caller.

    `history`: [{"role": "user"|"assistant", "content": str}, ...], oldest
    first -- lets the floating widget (AssistantWidget.tsx) hold a real
    back-and-forth instead of every message starting from zero. Not
    persisted server-side; the frontend just replays what it already has
    on each turn. The platform snapshot is still re-gathered fresh every
    call (no caching), so a fact from 3 messages ago is never stale."""
    if not settings.openai_api_key:
        return None

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False, default=str)},
    ]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": question})
    try:
        client = _get_client()
        resp = client.chat.completions.create(model="gpt-4o", messages=messages)
        return resp.choices[0].message.content
    except Exception:
        logger.exception("Solura Assistant answer_question failed")
        return None
