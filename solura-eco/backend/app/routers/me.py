"""Cross-cutting "what needs attention" endpoint for the sidebar urgent
panel. Merges three DB-only sources (no live Canvas calls) into one
capped, sorted response. See
docs/superpowers/specs/2026-09-04-urgent-panel-design.md.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.ai.digest import generate_digest
from app.auth.deps import require_session
from app.services.dev_activity import get_last_activity_by_project
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
    latest_by_project = get_last_activity_by_project(db, project_ids)

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
    reply event at all, see the design doc). Team-wide.

    A conversation's contact is either an existing client (phone matched)
    or a lead (no match) -- left joins on both, never `!inner`, since
    0018_telegram_conversations_leads.sql made client_id nullable and
    an inner join on either side would silently drop the other kind."""
    cutoff = (now - timedelta(hours=FRESH_MESSAGE_HOURS)).isoformat()
    rows = (
        db.table("telegram_conversations")
        .select("id,client_id,lead_id,last_message_at,clients(name),leads(name)")
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
        lead = r.get("leads") or {}
        out.append(
            {
                "id": r["id"],
                "client_id": r["client_id"],
                "lead_id": r["lead_id"],
                "client_name": client.get("name") or lead.get("name"),
                "last_message_at": r["last_message_at"],
            }
        )
    return out


MAX_ACTIVITY_ITEMS = 30


def _recent_activity(db, now: datetime) -> list[dict]:
    """One merged feed across every real event source in the app --
    commits/deploys, new tasks, new clients, new documents -- so the home
    page shows a real activity stream instead of static stat tiles that
    look empty with today's data volume. Team-wide, not per-member."""
    items: list[dict] = []

    events = (
        db.table("dev_events")
        .select("id,project_id,source,actor,message,url,occurred_at,projects(name)")
        .order("occurred_at", desc=True)
        .limit(MAX_ACTIVITY_ITEMS)
        .execute()
        .data
    )
    for e in events:
        project = e.get("projects") or {}
        items.append(
            {
                "type": "dev_event",
                "id": e["id"],
                "label": e["message"],
                "sub": f"{project.get('name') or 'Unknown project'}" + (f" · {e['actor']}" if e.get("actor") else ""),
                "href": e.get("url"),
                "at": e["occurred_at"],
            }
        )

    tasks = (
        db.table("work_tasks")
        .select("id,title,client_name,created_at")
        .order("created_at", desc=True)
        .limit(MAX_ACTIVITY_ITEMS)
        .execute()
        .data
    )
    for t in tasks:
        items.append(
            {
                "type": "task",
                "id": t["id"],
                "label": f"New task: {t['title']}",
                "sub": t.get("client_name") or "No client",
                "href": "/tasks",
                "at": t["created_at"],
            }
        )

    clients = (
        db.table("clients")
        .select("id,name,created_at,projects(id,name)")
        .order("created_at", desc=True)
        .limit(MAX_ACTIVITY_ITEMS)
        .execute()
        .data
    )
    for c in clients:
        project = c.get("projects") or {}
        items.append(
            {
                "type": "client",
                "id": c["id"],
                "label": f"New client: {c['name']}",
                "sub": project.get("name") or "Unknown platform",
                "href": f"/clients/{c['id']}",
                "at": c["created_at"],
            }
        )

    documents = (
        db.table("documents")
        .select("id,filename,project_id,created_at,projects(name)")
        .order("created_at", desc=True)
        .limit(MAX_ACTIVITY_ITEMS)
        .execute()
        .data
    )
    for d in documents:
        project = d.get("projects") or {}
        items.append(
            {
                "type": "document",
                "id": d["id"],
                "label": f"Uploaded: {d['filename']}",
                "sub": project.get("name") or "Unknown project",
                "href": f"/projects/{d['project_id']}",
                "at": d["created_at"],
            }
        )

    items.sort(key=lambda x: x["at"], reverse=True)
    return items[:MAX_ACTIVITY_ITEMS]


@router.get("/activity")
async def activity(_: dict = Depends(require_session)):
    db = get_client()
    now = datetime.now(timezone.utc)
    return _recent_activity(db, now)


@router.get("/urgent")
async def urgent(session: dict = Depends(require_session)):
    db = get_client()
    now = datetime.now(timezone.utc)
    return {
        "canvas_deadlines": _canvas_deadlines(db, session["member_id"], now),
        "stale_projects": _stale_projects(db, now),
        "client_messages": _client_messages(db, now),
    }


def _my_tasks(db, member_id: str) -> list[dict]:
    """This member's own open major tasks, each with its subtask
    checklist rolled up into a done/total count -- a personal work queue
    instead of the whole shared board."""
    major = (
        db.table("work_tasks")
        .select("id,title,status,priority,due_at,client_name")
        .eq("member_id", member_id)
        .neq("status", "done")
        .is_("parent_task_id", "null")
        .order("due_at", desc=False, nullsfirst=False)
        .execute()
        .data
    )
    if not major:
        return []

    task_ids = [t["id"] for t in major]
    subtasks = (
        db.table("work_tasks")
        .select("id,status,parent_task_id")
        .in_("parent_task_id", task_ids)
        .execute()
        .data
    )
    counts: dict = {}
    for s in subtasks:
        entry = counts.setdefault(s["parent_task_id"], {"done": 0, "total": 0})
        entry["total"] += 1
        if s["status"] == "done":
            entry["done"] += 1

    for t in major:
        entry = counts.get(t["id"], {"done": 0, "total": 0})
        t["subtasks_done"] = entry["done"]
        t["subtasks_total"] = entry["total"]

    return major


@router.get("/day")
async def my_day(session: dict = Depends(require_session)):
    """The personal landing view -- what this member should actually be
    doing today, not the whole team's activity. Separate from /urgent
    (team-wide alerts) and /activity (team-wide feed)."""
    db = get_client()
    now = datetime.now(timezone.utc)
    return {
        "tasks": _my_tasks(db, session["member_id"]),
        "canvas_deadlines": _canvas_deadlines(db, session["member_id"], now),
    }


@router.post("/summary")
async def team_summary(_: dict = Depends(require_session)):
    """AI сводка -- generated fresh on every call (a POST, not cached
    behind a GET, so no proxy/browser mistakes this for something safe
    to reuse). Team-wide, not per-member -- same platform snapshot
    everyone sees on the home page."""
    db = get_client()
    digest = generate_digest(db)
    if digest is None:
        raise HTTPException(status_code=503, detail="Couldn't generate a summary right now")
    return digest
