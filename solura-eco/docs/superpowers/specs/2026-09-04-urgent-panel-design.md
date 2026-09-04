# Sidebar urgent panel — design

Status: approved, ready for implementation plan.

## Why

The sidebar has empty space below the nav items. Surface what actually
needs attention right now — due Canvas work, projects going quiet,
clients with fresh messages — instead of leaving it blank.

## What counts as urgent (three sources)

**1. Canvas deadlines** — the *viewing* member's own assignments, due
within 48 hours or already overdue and not yet submitted/graded. Reads
from the already-synced `assignments`/`submissions` tables (same data
`GET /canvas/my-assignments` already computes) — no new Canvas API calls.
Per-member: what Rizo sees here is Rizo's own deadlines, not Jonik's or
Dior's.

**2. Stale projects** — active projects (`status = 'active'`) with no
`dev_events` row in the last 7 days, or none ever. Team-wide, not
per-member — everyone sees the same list, matching how the Projects grid
itself is shared. A project with `github_repo` unset is excluded (nothing
to be stale about — it was never going to have commits).

**3. Clients with a fresh message** — **redefined from the original
proposal for accuracy.** The Telegram integration is read-only monitoring
only (see `2026-09-04-telegram-lead-monitoring-design.md`) — it ingests
inbound messages and never sends anything, so there is no "the team
replied" event anywhere in the data model to check against. Claiming to
detect "no reply yet" would be fabricating a signal this app doesn't
track. Instead: `telegram_conversations` with `last_message_at` inside the
last 24 hours — i.e. "here's a client conversation with something new in
it," an honest proxy for "you may want to look at this," not a claim
about whether anyone responded. Team-wide, same reasoning as stale
projects. Until Telegram is connected (build order item #5's remaining
manual step), this list is always empty — not an error, just no data yet.

## Backend

New `GET /me/urgent`, session-protected (member_id from session for the
Canvas-deadlines part; the other two sources are team-wide and ignore
member_id). Response:

```json
{
  "canvas_deadlines": [
    {"id": "...", "name": "...", "course_name": "...", "due_at": "...", "html_url": "...", "overdue": true}
  ],
  "stale_projects": [
    {"id": "...", "name": "...", "days_since_activity": 12}
  ],
  "client_messages": [
    {"id": "...", "client_id": "...", "client_name": "...", "last_message_at": "..."}
  ]
}
```

Each list capped at 5 items, soonest/most-urgent first (`canvas_deadlines`
sorted by `due_at` ascending; `stale_projects` by longest-stale first;
`client_messages` by most-recent first). Capped, not paginated — this is a
glance-at panel, not a full inbox; anyone wanting the full picture already
has `/uni-load`, the Projects grid, and (once built) a client conversation
view for that.

## Frontend

New `UrgentPanel` component in `Sidebar.tsx`'s empty space (below
`NAV_ITEMS`, above the user footer). Fetched once per page load
(Server Component `AppLayout` already fetches the session; add the
`/me/urgent` fetch there, pass down as a prop — matches how `Sidebar`
already receives `username` from `AppLayout` today).

Layout: a compact list, each row one line — a small colored dot (red for
overdue Canvas/stale 14+ days, amber for due-soon Canvas/stale 7-13
days/fresh client message), a short label, and a relative time
(`"2d overdue"`, `"14d quiet"`, `"3h ago"`). Clicking a row navigates to
the relevant page (`html_url` for Canvas items — external link;
`/projects/{id}` for stale projects; `/clients/{id}` for client messages).
Three sources render as one flat list sorted by urgency (overdue Canvas
first, then everything else by recency), not three separate labeled
sub-sections — keeps it a true at-a-glance panel instead of another
scrollable list of lists.

**Empty state**: if all three sources are empty, the panel doesn't render
at all — no "all caught up" placeholder taking up sidebar space, matching
this app's existing convention of hiding empty sections rather than
announcing emptiness (e.g. `AssignmentList`'s empty state is the
exception, not the rule, because that's a full-page view, not a compact
sidebar slot).

## Error handling

- `/me/urgent` failing (network error, backend down) → the panel silently
  doesn't render, same as the empty-state case. This is a nice-to-have
  glance panel, not a page whose absence should ever block navigation.
- A client conversation with a `client_id` whose `clients` row was somehow
  deleted → excluded from the list (an inner join, not a left join with a
  null fallback) rather than showing a broken "Unknown client" row.

## Testing

One real pure-logic piece worth testing: the "days since activity" /
"is this project stale" computation (a date-diff against `now()`, easy to
get an off-by-one-day wrong). TDD that as a small function in
`app/services/`. Everything else (the three DB queries, the merge-and-sort
into one response) is integration-level, verified manually against real
data in the implementation plan's final task — same pattern as every other
router this session.
