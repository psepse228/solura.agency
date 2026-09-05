"""Leads pipeline -- manual for now (0017_leads.sql), same flat 3-person
access as tasks/clients/projects. Setting status='converted' with a
converted_project_id actually creates the real `clients` row (0019_leads_
converted_client.sql) -- a lead is the pre-sale pipeline (no project
relationship yet), a client is the post-sale one; converting is the
bridge between them, not two copies of the same fact.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import require_session
from app.services.supabase_client import get_client
from app.services.telegram_thread import get_conversation_thread

router = APIRouter()

STATUSES = ("new", "contacted", "qualified", "converted", "lost")


class LeadIn(BaseModel):
    name: str
    company_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    member_id: Optional[str] = None


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    company_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    member_id: Optional[str] = None
    converted_project_id: Optional[str] = None


@router.get("")
async def list_leads(_: dict = Depends(require_session)):
    db = get_client()
    return (
        db.table("leads")
        .select("id,name,company_name,status,source,contact_email,contact_phone,member_id,members(full_name)")
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.post("")
async def create_lead(payload: LeadIn, _: dict = Depends(require_session)):
    db = get_client()
    row = payload.model_dump(exclude_none=True)
    result = db.table("leads").insert(row).execute()
    return result.data[0]


@router.get("/{lead_id}")
async def get_lead(lead_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = (
        db.table("leads")
        .select(
            "id,name,company_name,status,source,contact_email,contact_phone,notes,member_id,"
            "converted_project_id,converted_client_id,created_at,members(full_name),projects(id,name)"
        )
        .eq("id", lead_id)
        .execute()
        .data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Lead not found")
    return result[0]


@router.patch("/{lead_id}")
async def update_lead(lead_id: str, payload: LeadUpdate, _: dict = Depends(require_session)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "status" in updates and updates["status"] not in STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(STATUSES)}")

    db = get_client()

    if updates.get("status") == "converted":
        existing = db.table("leads").select("*").eq("id", lead_id).execute().data
        if not existing:
            raise HTTPException(status_code=404, detail="Lead not found")
        lead = existing[0]
        project_id = updates.get("converted_project_id") or lead.get("converted_project_id")
        if not project_id:
            raise HTTPException(status_code=400, detail="Pick a project to convert this lead into first")

        if not lead.get("converted_client_id"):
            # First time this lead is converted -- create the real client.
            # A later re-save while already converted (e.g. editing notes)
            # must not create a second client for the same lead.
            new_client = (
                db.table("clients")
                .insert(
                    {
                        "project_id": project_id,
                        "name": lead["company_name"] or lead["name"],
                        "contact_name": lead["name"],
                        "contact_email": lead.get("contact_email"),
                        "contact_phone": lead.get("contact_phone"),
                        "status": "active",
                        "notes": lead.get("notes"),
                    }
                )
                .execute()
                .data[0]
            )
            updates["converted_client_id"] = new_client["id"]

    result = db.table("leads").update(updates).eq("id", lead_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    return result.data[0]


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("leads").delete().eq("id", lead_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ok": True}


@router.get("/{lead_id}/telegram")
async def get_lead_telegram_thread(lead_id: str, _: dict = Depends(require_session)):
    """Read-only -- the actual message thread that created this lead
    (source='telegram' leads always have one), not just the AI summary
    already appended to the lead's notes field."""
    db = get_client()
    return get_conversation_thread(db, lead_id=lead_id)
