"""Work tasks -- manual client-work tracking (`solura_eco.work_tasks`,
0001_init.sql), the piece of the original architecture that never got
built past its schema. Flat 3-person access, no per-member scoping on
reads -- same discipline as clients.py/projects.py, everyone sees
everything.

Deliberately not the tasks_unified view (which also merges in Canvas
assignments) -- uni-load already has its own dedicated page for that;
this is specifically the "who's doing what for a client" board.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()

STATUSES = ("todo", "in_progress", "done", "blocked")
PRIORITIES = ("low", "normal", "high")


class TaskIn(BaseModel):
    title: str
    description: Optional[str] = None
    client_name: Optional[str] = None
    member_id: Optional[str] = None
    priority: str = "normal"
    due_at: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    client_name: Optional[str] = None
    member_id: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_at: Optional[str] = None


@router.get("")
async def list_tasks(_: dict = Depends(require_session)):
    """Every open-or-recent task, not filtered by member -- a shared
    board, same visibility model as the rest of this app."""
    db = get_client()
    return (
        db.table("work_tasks")
        .select("id,title,description,client_name,status,priority,due_at,member_id,members(full_name)")
        .order("due_at", desc=False, nullsfirst=False)
        .execute()
        .data
    )


@router.post("")
async def create_task(payload: TaskIn, _: dict = Depends(require_session)):
    if payload.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"priority must be one of: {', '.join(PRIORITIES)}")

    db = get_client()
    row = payload.model_dump(exclude_none=True)
    result = (
        db.table("work_tasks")
        .insert(row)
        .execute()
        .data[0]
    )
    return result


@router.patch("/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, _: dict = Depends(require_session)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "status" in updates and updates["status"] not in STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(STATUSES)}")
    if "priority" in updates and updates["priority"] not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"priority must be one of: {', '.join(PRIORITIES)}")

    db = get_client()
    result = db.table("work_tasks").update(updates).eq("id", task_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    return result.data[0]


@router.delete("/{task_id}")
async def delete_task(task_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("work_tasks").delete().eq("id", task_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}
