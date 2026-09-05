"""Leads pipeline -- manual for now (0017_leads.sql), same flat 3-person
access as tasks/clients/projects. Converting a lead just links it to a
project (converted_project_id) -- it doesn't auto-create a client, since
a lead might convert into an existing project's client work rather than
a brand new platform.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import require_session
from app.services.supabase_client import get_client

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
            "converted_project_id,created_at,members(full_name),projects(id,name)"
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
