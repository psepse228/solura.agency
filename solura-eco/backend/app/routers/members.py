"""GET /members -- the flat list of the 3 Solura Eco users, for UI pickers
(e.g. assigning project roles). No write endpoints here -- members are
seeded via scripts/seed_members.py, not managed through the API.
"""
from fastapi import APIRouter, Depends

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()


@router.get("")
async def list_members(_: dict = Depends(require_session)):
    db = get_client()
    return db.table("members").select("id,full_name,username").order("full_name").execute().data
