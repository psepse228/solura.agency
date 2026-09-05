"""Brain/Database -- read-only browsing of the real Solura Obsidian Vault,
mirrored into solura_eco.wiki_pages by scripts/sync_vault_to_db.py (the
vault lives on a local machine, Railway/Vercel have no direct access to
it). No write endpoints here -- the vault itself is the source of truth,
edited in Obsidian, not through this app.
"""
import re

from fastapi import APIRouter, Depends, HTTPException

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)")


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


@router.get("/graph")
async def get_graph(_: dict = Depends(require_session)):
    """Nodes + edges for the Obsidian-style graph view -- edges are real
    [[wikilinks]] found in each page's own body, same as how Obsidian's
    own graph is built (not a separately-maintained relationship table)."""
    db = get_client()
    pages = db.table("wiki_pages").select("id,path,title,category,body_markdown").execute().data
    path_to_id = {p["path"]: p["id"] for p in pages}

    nodes = [{"id": p["id"], "label": p["title"], "category": p["category"]} for p in pages]

    edges = []
    seen = set()
    for p in pages:
        for match in WIKILINK_RE.finditer(p["body_markdown"]):
            target_path = match.group(1).strip()
            target_id = path_to_id.get(target_path)
            if not target_id or target_id == p["id"]:
                continue
            key = tuple(sorted((p["id"], target_id)))
            if key in seen:
                continue
            seen.add(key)
            edges.append({"source": p["id"], "target": target_id})

    return {"nodes": nodes, "edges": edges}


@router.get("/{page_id}")
async def get_page(page_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("wiki_pages").select("*").eq("id", page_id).execute().data
    if not result:
        raise HTTPException(status_code=404, detail="Page not found")
    return result[0]
