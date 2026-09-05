"""Vercel and Railway deploy events -- both ingest into the same generic
dev_events table the GitHub webhook already writes to, so the project
detail page's activity feed shows commits and deploys together with no
frontend changes needed.

Only "succeeded"/"failed" outcomes are recorded (not intermediate states
like building/queued) -- a glance-at feed, not a live build log.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.services.supabase_client import get_client
from app.webhooks.railway import verify_railway_secret
from app.webhooks.vercel import verify_vercel_signature

router = APIRouter()


@router.post("/vercel")
async def vercel_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("x-vercel-signature", "")

    if not verify_vercel_signature(body, signature, settings.vercel_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event_type = payload.get("type")
    if event_type not in ("deployment.succeeded", "deployment.error"):
        return {"ok": True, "skipped": "not a tracked deployment event"}

    event_payload = payload.get("payload") or {}
    project_id = (event_payload.get("project") or {}).get("id")
    deployment = event_payload.get("deployment") or {}
    deployment_id = deployment.get("id")
    if not project_id or not deployment_id:
        # Expected for event types/payload shapes we don't fully model --
        # skip, don't 500. Vercel doesn't retry on failure the way GitHub
        # does, but there's still no reason to error on a shape we can't use.
        return {"ok": True, "skipped": "missing project or deployment id"}

    db = get_client()
    matches = db.table("projects").select("id").eq("vercel_project", project_id).execute().data
    if not matches:
        return {"ok": True, "skipped": f"no project linked to Vercel project {project_id}"}

    succeeded = event_type == "deployment.succeeded"
    deployment_url = deployment.get("url")
    row = {
        "project_id": matches[0]["id"],
        "source": "vercel",
        "external_id": deployment_id,
        "actor": None,
        "message": "Deployed successfully" if succeeded else "Deployment failed",
        "url": f"https://{deployment_url}" if deployment_url else None,
        "occurred_at": datetime.fromtimestamp(payload["createdAt"] / 1000, tz=timezone.utc).isoformat()
        if payload.get("createdAt")
        else datetime.now(timezone.utc).isoformat(),
    }
    db.table("dev_events").upsert(row, on_conflict="project_id,source,external_id").execute()

    return {"ok": True}


@router.post("/railway/{secret}")
async def railway_webhook(secret: str, request: Request):
    if not verify_railway_secret(secret, settings.railway_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid secret")

    payload = await request.json()
    details = payload.get("details") or {}
    status = details.get("status")
    if status not in ("SUCCESS", "FAILED"):
        return {"ok": True, "skipped": "not a tracked deployment status"}

    resource = payload.get("resource") or {}
    service_id = (resource.get("service") or {}).get("id")
    deployment_id = (resource.get("deployment") or {}).get("id")
    if not service_id or not deployment_id:
        return {"ok": True, "skipped": "missing service or deployment id"}

    db = get_client()
    matches = db.table("projects").select("id").contains("railway_service_ids", [service_id]).execute().data
    if not matches:
        return {"ok": True, "skipped": f"no project linked to Railway service {service_id}"}

    succeeded = status == "SUCCESS"
    commit_message = details.get("commitMessage")
    message = "Deploy succeeded" if succeeded else "Deploy failed"
    if commit_message:
        message += f": {commit_message.splitlines()[0]}"

    project_link = resource.get("project") or {}
    service_link = resource.get("service") or {}
    url = None
    if project_link.get("id") and service_link.get("id"):
        url = f"https://railway.app/project/{project_link['id']}/service/{service_link['id']}"

    row = {
        "project_id": matches[0]["id"],
        "source": "railway",
        "external_id": deployment_id,
        "actor": details.get("commitAuthor"),
        "message": message,
        "url": url,
        "occurred_at": payload.get("timestamp") or datetime.now(timezone.utc).isoformat(),
    }
    db.table("dev_events").upsert(row, on_conflict="project_id,source,external_id").execute()

    return {"ok": True}
