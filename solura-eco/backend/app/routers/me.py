"""Cross-cutting "what needs attention" endpoint for the sidebar urgent
panel. Merges three DB-only sources (no live Canvas calls) into one
capped, sorted response. See
docs/superpowers/specs/2026-09-04-urgent-panel-design.md.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.auth.deps import require_session
from app.services.staleness import days_since_activity, is_stale
from app.services.supabase_client import get_client

router = APIRouter()

CANVAS_DUE_SOON_HOURS = 48
STALE_PROJECT_DAYS = 7
FRESH_MESSAGE_HOURS = 24
MAX_ITEMS_PER_SOURCE = 5


def _canvas_deadlines(db, member_id: str, now: datetime) -> list[dict]:
    """The calling member's own assignments due within CANVAS_DUE_SOON_HOURS
    or already overdue, excluding anything already submitted/graded."""
    courses = db.table("courses").select("id,name").eq("member_id", member_id).execute().data
    course_ids = [c["id"] for c in courses]
    if not course_ids:
        return []
    course_names = {c["id"]: c["name"] for c in courses}

    cutoff = (now + timedelta(hours=CANVAS_DUE_SOON_HOURS)).isoformat()
    assignments = (
        db.table("assignments")
        .select("id,course_id,name,due_at,html_url")
        .in_("course_id", course_ids)
        .not_.is_("due_at", "null")
        .lte("due_at", cutoff)
        .order("due_at")
        .execute()
        .data
    )
    if not assignments:
        return []
    assignment_ids = [a["id"] for a in assignments]

    submissions = (
        db.table("submissions")
        .select("assignment_id,workflow_state")
        .eq("member_id", member_id)
        .in_("assignment_id", assignment_ids)
        .execute()
        .data
    )
    status_by_assignment = {s["assignment_id"]: s["workflow_state"] for s in submissions}

    out = []
    for a in assignments:
        status = status_by_assignment.get(a["id"]) or "no submission yet"
        if status in ("graded", "submitted"):
            continue
        due_dt = datetime.fromisoformat(a["due_at"])
        out.append(
            {
                "id": a["id"],
                "name": a["name"],
                "course_name": course_names.get(a["course_id"]),
                "due_at": a["due_at"],
                "html_url": a["html_url"],
                "overdue": due_dt < now,
            }
        )
    return out[:MAX_ITEMS_PER_SOURCE]


def _stale_projects(db, now: datetime) -> list[dict]:
    """Active, repo-linked projects with no commit in STALE_PROJECT_DAYS
    days, or none ever -- team-wide, not per-member."""
    projects = (
        db.table("projects")
        .select("id,name")
        .eq("status", "active")
        .not_.is_("github_repo", "null")
        .execute()
        .data
    )
    if not projects:
        return []
    project_ids = [p["id"] for p in projects]

    events = (
        db.table("dev_events")
        .select("project_id,occurred_at")
        .in_("project_id", project_ids)
        .order("occurred_at", desc=True)
        .execute()
        .data
    )
    # events is already newest-first, so the first row seen per project_id
    # is that project's most recent activity.
    latest_by_project: dict[str, str] = {}
    for e in events:
        latest_by_project.setdefault(e["project_id"], e["occurred_at"])

    out = []
    for p in projects:
        last_iso = latest_by_project.get(p["id"])
        last_dt = datetime.fromisoformat(last_iso) if last_iso else None
        days = days_since_activity(last_dt, now)
        if is_stale(days, STALE_PROJECT_DAYS):
            out.append({"id": p["id"], "name": p["name"], "days_since_activity": days})

    # None (never active) sorts as the most-stale, ahead of any real number.
    out.sort(key=lambda x: x["days_since_activity"] if x["days_since_activity"] is not None else 10**9, reverse=True)
    return out[:MAX_ITEMS_PER_SOURCE]


def _client_messages(db, now: datetime) -> list[dict]:
    """Conversations with a new inbound message in the last
    FRESH_MESSAGE_HOURS hours -- an honest "something new here" signal, not
    a claim about whether anyone replied (this integration never tracks a
    reply event at all, see the design doc). Team-wide."""
    cutoff = (now - timedelta(hours=FRESH_MESSAGE_HOURS)).isoformat()
    rows = (
        db.table("telegram_conversations")
        .select("id,client_id,last_message_at,clients!inner(name)")
        .not_.is_("last_message_at", "null")
        .gte("last_message_at", cutoff)
        .order("last_message_at", desc=True)
        .limit(MAX_ITEMS_PER_SOURCE)
        .execute()
        .data
    )
    out = []
    for r in rows:
        client = r.get("clients") or {}
        out.append(
            {
                "id": r["id"],
                "client_id": r["client_id"],
                "client_name": client.get("name"),
                "last_message_at": r["last_message_at"],
            }
        )
    return out


@router.get("/urgent")
async def urgent(session: dict = Depends(require_session)):
    db = get_client()
    now = datetime.now(timezone.utc)
    return {
        "canvas_deadlines": _canvas_deadlines(db, session["member_id"], now),
        "stale_projects": _stale_projects(db, now),
        "client_messages": _client_messages(db, now),
    }
