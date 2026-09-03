"""GitHub webhook receiver -- push events only, ingests commits into
dev_events. See docs/superpowers/specs/2026-09-03-dev-activity-roles-colors-design.md,
Part A, for the error-handling contract (why unknown repos return 200).
"""
import json

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.services.supabase_client import get_client
from app.webhooks.github import verify_github_signature

router = APIRouter()


@router.post("/github")
async def github_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")

    if not verify_github_signature(body, signature, settings.github_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    event_type = request.headers.get("x-github-event", "")
    if event_type != "push":
        return {"ok": True, "skipped": "not a push event"}

    try:
        payload = json.loads(body)
        repo_full_name = payload["repository"]["full_name"]
        commits = payload["commits"]
    except (KeyError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Malformed payload")

    db = get_client()
    matches = db.table("projects").select("id").eq("github_repo", repo_full_name).execute().data
    if not matches:
        # Expected, not exceptional -- GitHub retries non-2xx responses
        # indefinitely, and a webhook firing for a repo Solura Eco doesn't
        # track yet is a normal state, not an error.
        return {"ok": True, "skipped": f"no project linked to {repo_full_name}"}

    project_id = matches[0]["id"]
    for commit in commits:
        row = {
            "project_id": project_id,
            "source": "github",
            "external_id": commit["id"],
            "actor": commit.get("author", {}).get("name"),
            "message": commit["message"].split("\n")[0],
            "url": commit.get("url"),
            "occurred_at": commit["timestamp"],
        }
        db.table("dev_events").upsert(row, on_conflict="project_id,source,external_id").execute()

    return {"ok": True, "commits_ingested": len(commits)}
