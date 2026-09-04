"""Pure staleness computation for the sidebar urgent panel's stale-projects
source. Kept separate from app/routers/me.py so the day-diff arithmetic
(easy to get an off-by-one wrong) is unit-tested in isolation from the DB
queries around it. See docs/superpowers/specs/2026-09-04-urgent-panel-design.md.
"""
from datetime import datetime


def days_since_activity(last_activity: datetime | None, now: datetime) -> int | None:
    """None means "no activity to measure from" (a project with no
    dev_events row ever), not zero -- the caller (is_stale) treats that as
    maximally stale, not as "just happened"."""
    if last_activity is None:
        return None
    return (now - last_activity).days


def is_stale(days: int | None, threshold_days: int = 7) -> bool:
    """No activity ever, or activity older than the threshold, both count
    as stale."""
    return days is None or days >= threshold_days
