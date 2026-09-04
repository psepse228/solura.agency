# Canvas courses + grades on /uni-load — design

Status: approved (user confirmed via screenshot reference + follow-up
questions), ready for implementation plan. Extends build order item #4
(already shipped: token entry, sync, assignments list).

## Why

TD Webster (a sibling Solura project) shows a "Courses" grid above its
assignment list — each course as a card with a color-coded header carrying
the current grade percentage. `/uni-load` currently only shows assignments;
this adds the courses view, matching that reference.

## What's pulled

Canvas personal access tokens carry the full permissions of the token
owner (same as browsing Canvas normally) — grades, files, and modules are
all technically reachable. This pass pulls only what the screenshot shows:
**course list + current grade + course color**. Files/Modules are
explicitly out of scope (user confirmed) — a future addition if ever
wanted.

Two new Canvas API calls, both documented in `docs/canvas-api-notes.md`
(to be added there in the implementation plan):
- `GET /courses?enrollment_state=active&include[]=total_scores` — same
  endpoint `list_active_courses` already calls, with one added `include[]`
  param. Each course's `enrollments` array (for a student token) carries
  `computed_current_score` (float, nullable — grading can be hidden/not
  started) and `computed_current_grade` (letter grade string, nullable).
- `GET /users/self/colors` — one call per sync (not per course), returns
  `{"custom_colors": {"course_<id>": "#hex", ...}}`. This is the color the
  member picked for that course in their own Canvas dashboard — using it
  (rather than inventing our own) is what makes the grid actually match
  what TD Webster shows, since TD Webster pulls the same real colors.

## Schema

`courses` gets two new nullable columns (migration, no data loss):
- `current_score numeric` — e.g. `83.45`
- `color text` — hex string from Canvas's `custom_colors`, e.g. `#824797`;
  `null` if the member never set one (Canvas assigns a default in its own
  UI, but doesn't expose that default via the colors endpoint — a course
  with no custom color falls back to a fixed neutral color band on our
  side, not an error state)

`current_grade` (the letter-grade string) is deliberately **not** stored —
`current_score` is what the card badge shows (`"83%"` style, matching the
screenshot), and a letter grade would be a second source of truth that can
disagree with the percentage (e.g. curved grades). One number, no
ambiguity.

## Sync

`_sync_member` (existing, in `app/routers/canvas.py`) gains: one
`get_course_colors()` call per member per sync run, and the
`include[]=total_scores` param on the existing `list_active_courses()`
call. Each course upsert now also writes `current_score` (from the
student enrollment's `computed_current_score`, `null` if not found/not
gradable yet) and `color` (looked up from the colors response by
`course_<canvas_course_id>`, `null` if not set).

## Read side

`GET /canvas/my-assignments` gets a sibling: `GET /canvas/my-courses`,
session-protected, same "strictly the calling member's own data" rule —
returns `[{id, name, course_code, current_score, color}]` for the calling
member's synced courses, no live Canvas call.

## Frontend

`/uni-load` gains a "Courses" section above the existing assignments list
(section order matches the screenshot: Courses, then Upcoming
Assignments). Each course is a card: colored header band (the real Canvas
color, or a neutral fallback if none set) with a badge showing
`"{current_score}%"` or `"N/A"` when `current_score` is null, course code
+ name below. Grid layout (2 columns on desktop, matching the screenshot's
proportions), reusing this app's existing card/border/radius conventions
(`rounded-2xl border border-border bg-bg2`), not TD Webster's literal
visual style beyond the color-badge-grid idea itself — stays consistent
with the rest of Solura Eco.

The assignment list's "Send to TD GhostWriting →" button (TD Webster's own
separate feature, not something Solura Eco has) is replaced with a real,
useful action: a link to the actual Canvas assignment page — `AssignmentList`
already does this today via `html_url` (the assignment name is already a
link when `html_url` is set) — no change needed there, called out here so
it isn't mistaken for a gap.

## Error handling

- `computed_current_score` missing/null (ungraded course, hidden grades) →
  `current_score: null`, frontend shows "N/A" badge, not an error.
- No custom color set for a course → `color: null`, frontend falls back to
  a fixed neutral badge color, not a crash or missing card.
- Colors endpoint call failing for one member during sync → same
  per-member try/except isolation already in place; that member's courses
  still sync with `color: null` for all of them rather than aborting.

## Testing

Same shape as the original Canvas plan: no new pure-logic function this
pass (course-color lookup is a dict `.get()` inside `_sync_member`, not
worth isolating for a unit test). Verified manually against real Canvas
data in the implementation plan's final task, using the same token already
saved and synced.
