"""Global search -- projects/clients/tasks/leads/Brain pages used to be
four separate silos with no way to jump straight to something by name.
One endpoint, `ilike` per table (small data volume for a 3-person team,
no need for full-text search infrastructure), capped per type.
"""
from fastapi import APIRouter, Depends

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()

MAX_PER_TYPE = 5


@router.get("")
async def search(q: str = "", _: dict = Depends(require_session)):
    query = q.strip()
    if len(query) < 2:
        return []

    db = get_client()
    pattern = f"%{query}%"
    results = []

    projects = (
        db.table("projects")
        .select("id,name")
        .ilike("name", pattern)
        .limit(MAX_PER_TYPE)
        .execute()
        .data
    )
    for p in projects:
        results.append({"type": "project", "id": p["id"], "label": p["name"], "sub": "Project", "href": f"/projects/{p['id']}"})

    clients = (
        db.table("clients")
        .select("id,name,projects(name)")
        .ilike("name", pattern)
        .limit(MAX_PER_TYPE)
        .execute()
        .data
    )
    for c in clients:
        project = c.get("projects") or {}
        results.append(
            {
                "type": "client",
                "id": c["id"],
                "label": c["name"],
                "sub": project.get("name") or "Client",
                "href": f"/clients/{c['id']}",
            }
        )

    tasks = (
        db.table("work_tasks")
        .select("id,title,client_name")
        .ilike("title", pattern)
        .limit(MAX_PER_TYPE)
        .execute()
        .data
    )
    for t in tasks:
        results.append(
            {"type": "task", "id": t["id"], "label": t["title"], "sub": t.get("client_name") or "Task", "href": "/tasks"}
        )

    leads = (
        db.table("leads")
        .select("id,name,company_name")
        .or_(f"name.ilike.{pattern},company_name.ilike.{pattern}")
        .limit(MAX_PER_TYPE)
        .execute()
        .data
    )
    for l in leads:
        results.append(
            {"type": "lead", "id": l["id"], "label": l["name"], "sub": l.get("company_name") or "Lead", "href": "/leads"}
        )

    pages = (
        db.table("wiki_pages")
        .select("id,title,category")
        .ilike("title", pattern)
        .limit(MAX_PER_TYPE)
        .execute()
        .data
    )
    for p in pages:
        results.append(
            {
                "type": "brain_page",
                "id": p["id"],
                "label": p["title"],
                "sub": p.get("category") or "Brain",
                "href": f"/brain/{p['id']}",
            }
        )

    return results
