"""Brain/Database -- read-only browsing of the real Solura Obsidian Vault,
mirrored into solura_eco.wiki_pages by scripts/sync_vault_to_db.py (the
vault lives on a local machine, Railway/Vercel have no direct access to
it). No write endpoints here -- the vault itself is the source of truth,
edited in Obsidian, not through this app.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()


@router.get("")
async def list_pages(_: dict = Depends(require_session)):
    db = get_client()
    return (
        db.table("wiki_pages")
        .select("id,path,title,category,tags,summary,tier,wiki_updated_at")
        .order("category")
        .order("title")
        .execute()
        .data
    )


@router.get("/{page_id}")
async def get_page(page_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("wiki_pages").select("*").eq("id", page_id).execute().data
    if not result:
        raise HTTPException(status_code=404, detail="Page not found")
    return result[0]
