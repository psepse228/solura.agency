"""GET /projects (list), GET /projects/{id} (detail), GET /projects/stats,
GET/POST /projects/{id}/notes (the shared notepad). Project/role writes
still go through clients.py (POST /clients/{id}/projects, PATCH
/clients/projects/{id}, PUT .../roles) -- notes live here since they're
read alongside the rest of a project's detail, not part of that CRUD set.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()


def _attach_roles(db, projects: list) -> None:
    project_ids = [p["id"] for p in projects]
    if not project_ids:
        return
    roles = (
        db.table("project_roles")
        .select("project_id,role_type,members(id,full_name)")
        .in_("project_id", project_ids)
        .execute()
        .data
    )
    by_project: dict = {}
    for r in roles:
        entry = by_project.setdefault(r["project_id"], {"dev": [], "client_work": []})
        entry[r["role_type"]].append(r["members"])
    for p in projects:
        entry = by_project.get(p["id"], {"dev": [], "client_work": []})
        p["dev_members"] = entry["dev"]
        p["client_work_members"] = entry["client_work"]


def _attach_last_activity(db, projects: list) -> None:
    project_ids = [p["id"] for p in projects]
    if not project_ids:
        return
    events = (
        db.table("dev_events")
        .select("project_id,occurred_at")
        .in_("project_id", project_ids)
        .order("occurred_at", desc=True)
        .execute()
        .data
    )
    latest: dict = {}
    for e in events:
        if e["project_id"] not in latest:
            latest[e["project_id"]] = e["occurred_at"]
    for p in projects:
        p["last_activity_at"] = latest.get(p["id"])


def _flatten_client(p: dict) -> None:
    client = p.pop("clients", None)
    p["client_name"] = client["name"] if client else None


@router.get("")
async def list_projects(_: dict = Depends(require_session)):
    db = get_client()
    projects = (
        db.table("projects")
        .select("id,name,client_id,status,progress,github_repo,accent_start,accent_end,clients(name)")
        .order("name")
        .execute()
        .data
    )
    for p in projects:
        _flatten_client(p)

    _attach_roles(db, projects)
    _attach_last_activity(db, projects)
    return projects


def _compute_stats(projects: list, clients: list, events_count: int) -> dict:
    active_projects = [p for p in projects if p["status"] == "active"]
    active_clients = [c for c in clients if c.get("status") == "active"]
    avg_progress = (
        round(sum(p["progress"] for p in active_projects) / len(active_projects))
        if active_projects
        else 0
    )
    return {
        "active_projects": len(active_projects),
        "active_clients": len(active_clients),
        "commits_this_week": events_count,
        "avg_progress": avg_progress,
    }


@router.get("/stats")
async def project_stats(_: dict = Depends(require_session)):
    db = get_client()
    projects = db.table("projects").select("status,progress").execute().data
    clients = db.table("clients").select("status").execute().data

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent_events = db.table("dev_events").select("id").gte("occurred_at", week_ago).execute().data

    return _compute_stats(projects, clients, len(recent_events))


@router.get("/{project_id}")
async def get_project(project_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = (
        db.table("projects")
        .select(
            "id,name,client_id,status,progress,github_repo,accent_start,accent_end,notes,clients(name)"
        )
        .eq("id", project_id)
        .execute()
        .data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")

    project = result[0]
    _flatten_client(project)

    _attach_roles(db, [project])
    _attach_last_activity(db, [project])

    events = (
        db.table("dev_events")
        .select("id,actor,message,url,occurred_at")
        .eq("project_id", project_id)
        .order("occurred_at", desc=True)
        .limit(20)
        .execute()
        .data
    )
    project["recent_events"] = events

    return project


class NoteIn(BaseModel):
    body: str


@router.get("/{project_id}/notes")
async def list_project_notes(project_id: str, _: dict = Depends(require_session)):
    db = get_client()
    notes = (
        db.table("project_notes")
        .select("id,body,created_at,members(id,full_name)")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    for n in notes:
        author = n.pop("members", None)
        n["author"] = author["full_name"] if author else "Unknown"
    return notes


@router.post("/{project_id}/notes")
async def create_project_note(
    project_id: str, payload: NoteIn, session: dict = Depends(require_session)
):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Note body cannot be empty")

    db = get_client()
    row = {
        "project_id": project_id,
        "member_id": session["member_id"],
        "body": payload.body.strip(),
    }
    result = db.table("project_notes").insert(row).execute().data[0]

    # Attach the author's name the same shape as the GET response, rather
    # than making the frontend do a second round-trip to find out who
    # "session['member_id']" resolves to.
    member = db.table("members").select("full_name").eq("id", session["member_id"]).execute().data
    result["author"] = member[0]["full_name"] if member else session["username"]
    return result
