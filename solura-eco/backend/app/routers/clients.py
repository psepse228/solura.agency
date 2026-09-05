"""Client companies -- subscribers to a Solura platform (project). Solura
builds platforms and subscribes companies to them, not one-off bespoke
work per client, so a client always belongs to exactly one project, never
the reverse (see 0014_clients_belong_to_projects.sql). Project CRUD and
roles now live in projects.py -- this file is purely about clients and
their notes.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import require_session
from app.services.supabase_client import get_client
from app.services.telegram_thread import get_conversation_thread

router = APIRouter()


class ClientIn(BaseModel):
    project_id: str
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
    """Every client across every project -- backs the top-level 'Clients
    work' page, which groups these by project."""
    db = get_client()
    clients = (
        db.table("clients")
        .select("id,name,status,project_id,projects(name)")
        .order("name")
        .execute()
        .data
    )
    for c in clients:
        project = c.pop("projects", None)
        c["project_name"] = project["name"] if project else None
    return clients


@router.get("/{client_id}")
async def get_client_detail(client_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = (
        db.table("clients")
        .select(
            "id,name,status,contact_name,contact_email,contact_phone,notes,project_id,projects(id,name)"
        )
        .eq("id", client_id)
        .execute()
        .data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Client not found")

    client = result[0]
    project = client.pop("projects", None)
    client["project_name"] = project["name"] if project else None
    return client


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


@router.delete("/{client_id}")
async def delete_client(client_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("clients").delete().eq("id", client_id).execute()
    if not result.data:
        raise HTTPException(404, "Client not found")
    return {"ok": True}


class ClientNoteIn(BaseModel):
    body: str


@router.get("/{client_id}/notes")
async def list_client_notes(client_id: str, _: dict = Depends(require_session)):
    db = get_client()
    notes = (
        db.table("client_notes")
        .select("id,body,created_at,author_label,members(id,full_name)")
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    for n in notes:
        member = n.pop("members", None)
        n["author"] = member["full_name"] if member else (n.pop("author_label", None) or "Unknown")
    return notes


@router.post("/{client_id}/notes")
async def create_client_note(
    client_id: str, payload: ClientNoteIn, session: dict = Depends(require_session)
):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Note body cannot be empty")

    db = get_client()
    row = {
        "client_id": client_id,
        "member_id": session["member_id"],
        "body": payload.body.strip(),
    }
    result = db.table("client_notes").insert(row).execute().data[0]

    # Attach the author's name the same shape as the GET response, rather
    # than making the frontend do a second round-trip to find out who
    # "session['member_id']" resolves to (same reasoning as
    # create_project_note in projects.py).
    member = db.table("members").select("full_name").eq("id", session["member_id"]).execute().data
    result["author"] = member[0]["full_name"] if member else session["username"]
    return result


@router.get("/{client_id}/telegram")
async def get_client_telegram_thread(client_id: str, _: dict = Depends(require_session)):
    """Read-only -- the actual message thread, not just the AI summary
    already shown as a client note. Returns null if this client has never
    messaged in over Telegram (not a 404 -- most clients never will)."""
    db = get_client()
    return get_conversation_thread(db, client_id=client_id)
