"""Shared 'most recent dev_events row per project' lookup -- was
duplicated identically in app/routers/projects.py and app/routers/me.py,
risking the two copies drifting (e.g. one gets a fix the other doesn't).
"""

# Bounds the worst case: without this, a project history with thousands
# of dev_events rows would transfer the entire table just to find each
# project's single most-recent timestamp. events are fetched newest-first,
# so capping still returns the true latest per project as long as no
# single project has more than this many events between the newest row
# overall and its own most recent one -- true today, revisit if this ever
# needs to be exact at much larger scale (a per-project window function
# would replace this entirely).
MAX_EVENTS_SCANNED = 500


def get_last_activity_by_project(db, project_ids: list[str]) -> dict[str, str]:
    if not project_ids:
        return {}

    events = (
        db.table("dev_events")
        .select("project_id,occurred_at")
        .in_("project_id", project_ids)
        .order("occurred_at", desc=True)
        .limit(MAX_EVENTS_SCANNED)
        .execute()
        .data
    )
    # events is newest-first, so the first row seen per project_id is that
    # project's most recent activity.
    latest: dict[str, str] = {}
    for e in events:
        latest.setdefault(e["project_id"], e["occurred_at"])
    return latest
