"""Canvas sync endpoints. Not implemented yet — stubs to fill in once the
schema and sync trigger (n8n cron vs. Railway cron) are settled, see
docs/architecture.md.
"""
from fastapi import APIRouter

router = APIRouter()


@router.post("/sync")
async def sync_all_members():
    """Poll Canvas for every member with a stored token and upsert into
    courses/assignments/submissions. Called by n8n on a schedule (or a
    Railway cron) once wired up — not yet implemented.
    """
    return {"status": "not_implemented"}
