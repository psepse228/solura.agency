"""Brain/Database -- browsing (and, now, light editing) of Solura's
knowledge base. Most pages are mirrored from the real Obsidian Vault by
scripts/sync_vault_to_db.py (the vault lives on a local machine,
Railway/Vercel have no direct access to it) -- editing one of THOSE
through the app is a stopgap: a future vault re-sync overwrites it, since
the vault file itself is still the long-term source of truth for its own
path. Pages created directly through the app live under a `platform/`
path the vault sync never touches, so they're safe from that.
"""
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)")


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug or "page"


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


class PageIn(BaseModel):
    title: str
    category: Optional[str] = None
    tags: List[str] = []
    summary: Optional[str] = None
    tier: Optional[str] = None
    body_markdown: str = ""


class PageUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    summary: Optional[str] = None
    tier: Optional[str] = None
    body_markdown: Optional[str] = None


@router.post("")
async def create_page(payload: PageIn, _: dict = Depends(require_session)):
    db = get_client()
    base_slug = _slugify(payload.title)
    path = f"platform/{base_slug}.md"

    existing_paths = {
        p["path"]
        for p in db.table("wiki_pages").select("path").like("path", "platform/%").execute().data
    }
    if path in existing_paths:
        suffix = 2
        while f"platform/{base_slug}-{suffix}.md" in existing_paths:
            suffix += 1
        path = f"platform/{base_slug}-{suffix}.md"

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "path": path,
        "title": payload.title,
        "category": payload.category,
        "tags": payload.tags,
        "summary": payload.summary,
        "tier": payload.tier,
        "body_markdown": payload.body_markdown,
        "wiki_updated_at": now,
        "synced_at": now,
    }
    result = db.table("wiki_pages").insert(row).execute()
    return result.data[0]


@router.patch("/{page_id}")
async def update_page(page_id: str, payload: PageUpdate, _: dict = Depends(require_session)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["wiki_updated_at"] = datetime.now(timezone.utc).isoformat()

    db = get_client()
    result = db.table("wiki_pages").update(updates).eq("id", page_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Page not found")
    return result.data[0]


@router.delete("/{page_id}")
async def delete_page(page_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("wiki_pages").delete().eq("id", page_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"ok": True}
