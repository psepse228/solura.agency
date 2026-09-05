"""Projects API -- list/detail/stats/notes, plus project CRUD and role
assignment (moved here from clients.py now that a project no longer
belongs to a single client -- see 0014_clients_belong_to_projects.sql;
projects own their own writes instead of being nested under a client's
routes that no longer make sense).
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

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


def _attach_clients(db, projects: list) -> None:
    """Each project's subscriber companies -- a project can have many,
    a client belongs to exactly one (the reverse of how this used to
    work, see 0014_clients_belong_to_projects.sql)."""
    project_ids = [p["id"] for p in projects]
    if not project_ids:
        return
    clients = (
        db.table("clients")
        .select("id,name,status,project_id")
        .in_("project_id", project_ids)
        .order("name")
        .execute()
        .data
    )
    by_project: dict = {}
    for c in clients:
        by_project.setdefault(c["project_id"], []).append(
            {"id": c["id"], "name": c["name"], "status": c["status"]}
        )
    for p in projects:
        p["clients"] = by_project.get(p["id"], [])


class ProjectIn(BaseModel):
    name: str
    status: str = "active"
    progress: int = Field(default=0, ge=0, le=100)
    github_repo: Optional[str] = None
    vercel_project: Optional[str] = None
    owner_member_id: Optional[str] = None
    notes: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    github_repo: Optional[str] = None
    vercel_project: Optional[str] = None
    owner_member_id: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
async def list_projects(_: dict = Depends(require_session)):
    db = get_client()
    projects = (
        db.table("projects")
        .select("id,name,status,progress,github_repo,accent_start,accent_end")
        .order("name")
        .execute()
        .data
    )
    _attach_clients(db, projects)
    _attach_roles(db, projects)
    _attach_last_activity(db, projects)
    return projects


@router.post("")
async def create_project(payload: ProjectIn, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("projects").insert(payload.model_dump(exclude_none=True)).execute()
    return result.data[0]


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
        .select("id,name,status,progress,github_repo,accent_start,accent_end,notes")
        .eq("id", project_id)
        .execute()
        .data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")

    project = result[0]
    _attach_clients(db, [project])
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


@router.patch("/{project_id}")
async def update_project(project_id: str, payload: ProjectUpdate, _: dict = Depends(require_session)):
    db = get_client()
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    result = db.table("projects").update(updates).eq("id", project_id).execute()
    if not result.data:
        raise HTTPException(404, "Project not found")
    return result.data[0]


class RolesUpdate(BaseModel):
    dev_member_ids: List[str] = Field(default_factory=list)
    client_work_member_ids: List[str] = Field(default_factory=list)


@router.put("/{project_id}/roles")
async def update_project_roles(
    project_id: str, payload: RolesUpdate, _: dict = Depends(require_session)
):
    db = get_client()

    all_ids = set(payload.dev_member_ids) | set(payload.client_work_member_ids)
    if all_ids:
        existing = db.table("members").select("id").in_("id", list(all_ids)).execute().data
        existing_ids = {row["id"] for row in existing}
        missing = all_ids - existing_ids
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown member_id(s): {sorted(missing)}")

    # Not wrapped in a single DB transaction -- supabase-py/PostgREST calls
    # are separate HTTP requests, no multi-statement transaction available
    # without a stored procedure. A failure between delete and insert could
    # leave roles cleared but not re-set. Accepted risk for a 3-person
    # internal tool -- trivially re-set by hand if it ever happens -- not
    # worth a stored-proc for this.
    db.table("project_roles").delete().eq("project_id", project_id).execute()

    rows = [
        {"project_id": project_id, "member_id": mid, "role_type": "dev"}
        for mid in payload.dev_member_ids
    ] + [
        {"project_id": project_id, "member_id": mid, "role_type": "client_work"}
        for mid in payload.client_work_member_ids
    ]
    if rows:
        db.table("project_roles").insert(rows).execute()

    return {"ok": True}


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
