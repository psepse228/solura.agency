"""Clients & Projects API — the home screen (docs/architecture.md build order #1).

Reads/writes solura_eco.clients and solura_eco.projects
(supabase/migrations/0002_clients_projects.sql). Flat 3-person access, no
role gating — see architecture doc.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()


class ProjectIn(BaseModel):
    client_id: str
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


class ClientIn(BaseModel):
    name: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
async def list_clients(_: dict = Depends(require_session)):
    """Every client with its projects nested — this is the home-screen query."""
    db = get_client()
    clients = db.table("clients").select("*").order("name").execute().data
    projects = db.table("projects").select("*").order("name").execute().data

    by_client: dict[str, list] = {}
    for p in projects:
        by_client.setdefault(p["client_id"], []).append(p)

    for c in clients:
        c["projects"] = by_client.get(c["id"], [])

    return clients


@router.post("")
async def create_client(payload: ClientIn, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("clients").insert(payload.model_dump(exclude_none=True)).execute()
    return result.data[0]


@router.patch("/{client_id}")
async def update_client(client_id: str, payload: ClientUpdate, _: dict = Depends(require_session)):
    db = get_client()
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    result = db.table("clients").update(updates).eq("id", client_id).execute()
    if not result.data:
        raise HTTPException(404, "Client not found")
    return result.data[0]


@router.post("/{client_id}/projects")
async def create_project(client_id: str, payload: ProjectIn, _: dict = Depends(require_session)):
    db = get_client()
    data = payload.model_dump(exclude_none=True)
    data["client_id"] = client_id
    result = db.table("projects").insert(data).execute()
    return result.data[0]


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, payload: ProjectUpdate, _: dict = Depends(require_session)):
    db = get_client()
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    result = db.table("projects").update(updates).eq("id", project_id).execute()
    if not result.data:
        raise HTTPException(404, "Project not found")
    return result.data[0]
