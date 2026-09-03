"""Unified task API — reads from the `tasks_unified` view
(supabase/migrations/0001_init.sql). Not implemented yet.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_tasks():
    """Return upcoming uni + work tasks, unified. Not yet implemented —
    will query the `tasks_unified` view via app.services.supabase_client.
    """
    return {"status": "not_implemented"}
