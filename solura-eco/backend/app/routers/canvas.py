"""Canvas sync -- self-service token entry, a shared-secret-protected sync
endpoint (called by a Railway Cron service, not a real user session), and a
read endpoint returning only the calling member's own assignments.
See docs/superpowers/specs/2026-09-04-canvas-uni-load-design.md.
"""
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth.deps import require_session
from app.config import settings
from app.services.canvas_client import CanvasClient
from app.services.canvas_token_crypto import decrypt_token, encrypt_token
from app.services.supabase_client import get_client

logger = logging.getLogger(__name__)
router = APIRouter()


class CanvasTokenIn(BaseModel):
    token: str


@router.post("/token")
async def save_canvas_token(payload: CanvasTokenIn, session: dict = Depends(require_session)):
    """Verifies the token against Canvas before storing anything -- never
    save a token that doesn't actually work."""
    client = CanvasClient(settings.canvas_base_url, payload.token)
    try:
        canvas_user = await client.get_self()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Canvas rejected this token: {e}")

    key = settings.canvas_token_encryption_key.encode()
    encrypted = encrypt_token(payload.token, key)

    db = get_client()
    db.table("members").update(
        {
            "canvas_user_id": canvas_user["id"],
            "canvas_base_url": settings.canvas_base_url,
            # PostgREST/JSON has no bytes type -- bytea columns go over the
            # wire as Postgres's own hex text representation ("\x<hex>"),
            # both ways. Raw bytes here would fail JSON serialization.
            "canvas_api_token_enc": "\\x" + encrypted.hex(),
        }
    ).eq("id", session["member_id"]).execute()

    return {"ok": True, "canvas_user_id": canvas_user["id"]}


@router.get("/my-assignments")
async def my_assignments(session: dict = Depends(require_session)):
    """Strictly the calling member's own data -- member_id always comes
    from the session, never a request parameter. Reads already-synced rows,
    doesn't call Canvas live."""
    db = get_client()
    member_id = session["member_id"]

    member_row = db.table("members").select("canvas_api_token_enc").eq("id", member_id).execute().data
    has_token = bool(member_row and member_row[0].get("canvas_api_token_enc"))

    courses = db.table("courses").select("id,name").eq("member_id", member_id).execute().data
    course_ids = [c["id"] for c in courses]
    course_names = {c["id"]: c["name"] for c in courses}

    if not course_ids:
        return {"has_token": has_token, "assignments": []}

    assignments = (
        db.table("assignments")
        .select("id,course_id,name,due_at,html_url")
        .in_("course_id", course_ids)
        .order("due_at", desc=False, nullsfirst=False)
        .execute()
        .data
    )
    assignment_ids = [a["id"] for a in assignments]

    submissions = (
        db.table("submissions")
        .select("assignment_id,workflow_state")
        .eq("member_id", member_id)
        .in_("assignment_id", assignment_ids)
        .execute()
        .data
        if assignment_ids
        else []
    )
    status_by_assignment = {s["assignment_id"]: s["workflow_state"] for s in submissions}

    out = [
        {
            "id": a["id"],
            "name": a["name"],
            "course_name": course_names.get(a["course_id"]),
            "due_at": a["due_at"],
            "html_url": a["html_url"],
            "status": status_by_assignment.get(a["id"]) or "no submission yet",
        }
        for a in assignments
    ]
    return {"has_token": has_token, "assignments": out}


@router.get("/my-courses")
async def my_courses(session: dict = Depends(require_session)):
    """Strictly the calling member's own synced courses -- same
    own-data-only rule as my_assignments."""
    db = get_client()
    courses = (
        db.table("courses")
        .select("id,name,course_code,current_score,color")
        .eq("member_id", session["member_id"])
        .order("name")
        .execute()
        .data
    )
    return courses


def _verify_sync_secret(request: Request) -> None:
    provided = request.headers.get("x-canvas-sync-secret", "")
    if not settings.canvas_sync_secret or not hmac.compare_digest(provided, settings.canvas_sync_secret):
        raise HTTPException(status_code=401, detail="Invalid sync secret")


def _bytea_to_bytes(pg_hex: str) -> bytes:
    """Postgres/PostgREST hands back bytea columns as "\\x<hex>" text, not
    raw bytes -- undo that before decrypting."""
    return bytes.fromhex(pg_hex[2:] if pg_hex.startswith("\\x") else pg_hex)


async def _sync_member(db, member: dict) -> None:
    key = settings.canvas_token_encryption_key.encode()
    token = decrypt_token(_bytea_to_bytes(member["canvas_api_token_enc"]), key)
    base_url = member.get("canvas_base_url") or settings.canvas_base_url
    client = CanvasClient(base_url, token)
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        colors = await client.get_course_colors()
    except Exception:
        # One member's colors call failing (rare -- it's the same token
        # that just succeeded or is about to succeed on courses/
        # assignments) shouldn't block their course/assignment sync --
        # every course just gets color: null for this run.
        logger.warning("Canvas: could not fetch course colors for member %s", member["id"])
        colors = {}

    canvas_courses = await client.list_active_courses()
    for cc in canvas_courses:
        term = cc.get("term")

        current_score = None
        for enrollment in cc.get("enrollments") or []:
            # Canvas's own docs/instances aren't fully consistent on
            # whether this embedded (course-list) enrollment's "type" is
            # the short form ("student") or the full enrollment class name
            # ("StudentEnrollment") -- substring-match, case-insensitively,
            # rather than risk an exact-match that silently leaves every
            # grade null on the instance that uses the other form.
            if "student" in str(enrollment.get("type", "")).lower():
                current_score = enrollment.get("computed_current_score")
                break

        course_row = (
            db.table("courses")
            .upsert(
                {
                    "member_id": member["id"],
                    "canvas_course_id": cc["id"],
                    "name": cc.get("name") or "Untitled course",
                    "course_code": cc.get("course_code"),
                    "term": term.get("name") if term else None,
                    "start_at": cc.get("start_at"),
                    "end_at": cc.get("end_at"),
                    "current_score": current_score,
                    "color": colors.get(f"course_{cc['id']}"),
                    "synced_at": now_iso,
                },
                on_conflict="member_id,canvas_course_id",
            )
            .execute()
            .data[0]
        )

        canvas_assignments = await client.list_assignments(cc["id"])
        for ca in canvas_assignments:
            assignment_row = (
                db.table("assignments")
                .upsert(
                    {
                        "course_id": course_row["id"],
                        "canvas_assignment_id": ca["id"],
                        "name": ca.get("name") or "Untitled assignment",
                        "description_html": ca.get("description"),
                        "due_at": ca.get("due_at"),
                        "points_possible": ca.get("points_possible"),
                        "submission_types": ca.get("submission_types"),
                        "html_url": ca.get("html_url"),
                        "workflow_state": ca.get("workflow_state"),
                        "synced_at": now_iso,
                    },
                    on_conflict="course_id,canvas_assignment_id",
                )
                .execute()
                .data[0]
            )

            try:
                submission = await client.get_submission(cc["id"], ca["id"])
            except Exception:
                # A single assignment's submission fetch failing (e.g. not
                # gradable yet) shouldn't abort the rest of this member's
                # sync -- the assignment row above is still saved.
                logger.warning("Canvas: could not fetch submission for assignment %s", ca["id"])
                continue

            db.table("submissions").upsert(
                {
                    "assignment_id": assignment_row["id"],
                    "member_id": member["id"],
                    "submitted_at": submission.get("submitted_at"),
                    "score": submission.get("score"),
                    "workflow_state": submission.get("workflow_state"),
                    "synced_at": now_iso,
                },
                on_conflict="assignment_id,member_id",
            ).execute()


@router.post("/sync")
async def sync_all_members(request: Request):
    """Called by Railway Cron every 30 minutes, not a real user session --
    shared-secret auth instead of require_session (nothing in a cron
    request identifies "this is the cron job" any other way)."""
    _verify_sync_secret(request)

    db = get_client()
    members = (
        db.table("members")
        .select("id,canvas_base_url,canvas_api_token_enc")
        .not_.is_("canvas_api_token_enc", "null")
        .execute()
        .data
    )

    synced = 0
    failed = []
    for member in members:
        try:
            await _sync_member(db, member)
            synced += 1
        except Exception as e:
            # One member's expired token or a Canvas outage must never
            # block the other members' sync in the same run.
            logger.exception("Canvas sync failed for member %s", member["id"])
            failed.append({"member_id": member["id"], "error": str(e)})

    return {"ok": True, "synced": synced, "failed": failed}
