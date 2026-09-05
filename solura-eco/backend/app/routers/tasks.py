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
    parent_task_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    client_name: Optional[str] = None
    member_id: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_at: Optional[str] = None
    parent_task_id: Optional[str] = None


@router.get("")
async def list_tasks(_: dict = Depends(require_session)):
    """Every open-or-recent task, not filtered by member -- a shared
    board, same visibility model as the rest of this app. Subtasks are
    returned flat alongside their parents (parent_task_id ties them
    together) -- the frontend nests them for the board/list views."""
    db = get_client()
    return (
        db.table("work_tasks")
        .select(
            "id,title,description,client_name,status,priority,due_at,member_id,parent_task_id,members(full_name)"
        )
        .order("due_at", desc=False, nullsfirst=False)
        .execute()
        .data
    )


@router.post("")
async def create_task(payload: TaskIn, _: dict = Depends(require_session)):
    if payload.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"priority must be one of: {', '.join(PRIORITIES)}")

    db = get_client()

    if payload.parent_task_id:
        # Keep the hierarchy exactly one level deep -- a subtask of a
        # subtask would need real tree UI, not just a board with a
        # nested list, and nobody's asked for that yet.
        parent = (
            db.table("work_tasks")
            .select("parent_task_id")
            .eq("id", payload.parent_task_id)
            .execute()
            .data
        )
        if not parent:
            raise HTTPException(status_code=400, detail="Parent task not found")
        if parent[0]["parent_task_id"]:
            raise HTTPException(status_code=400, detail="A subtask can't itself have subtasks")

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

    if updates.get("parent_task_id") == task_id:
        raise HTTPException(status_code=400, detail="A task can't be its own parent")
    if "parent_task_id" in updates and updates["parent_task_id"]:
        parent = (
            db.table("work_tasks")
            .select("parent_task_id")
            .eq("id", updates["parent_task_id"])
            .execute()
            .data
        )
        if not parent:
            raise HTTPException(status_code=400, detail="Parent task not found")
        if parent[0]["parent_task_id"]:
            raise HTTPException(status_code=400, detail="A subtask can't itself have subtasks")

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


class CommentIn(BaseModel):
    body: str


@router.get("/{task_id}/comments")
async def list_task_comments(task_id: str, _: dict = Depends(require_session)):
    db = get_client()
    comments = (
        db.table("task_comments")
        .select("id,body,created_at,members(id,full_name)")
        .eq("task_id", task_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    for c in comments:
        author = c.pop("members", None)
        c["author"] = author["full_name"] if author else "Unknown"
    return comments


@router.post("/{task_id}/comments")
async def create_task_comment(task_id: str, payload: CommentIn, session: dict = Depends(require_session)):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Comment body cannot be empty")

    db = get_client()
    row = {
        "task_id": task_id,
        "member_id": session["member_id"],
        "body": payload.body.strip(),
    }
    result = db.table("task_comments").insert(row).execute().data[0]

    # Attach the author's name the same shape as the GET response, rather
    # than making the frontend do a second round-trip to find out who
    # session['member_id'] resolves to (same reasoning as
    # create_project_note/create_client_note).
    member = db.table("members").select("full_name").eq("id", session["member_id"]).execute().data
    result["author"] = member[0]["full_name"] if member else session["username"]
    return result
