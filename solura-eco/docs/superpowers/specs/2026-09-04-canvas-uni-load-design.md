# Canvas uni-load sync — design

Status: approved, ready for implementation plan.
Scope: build order item #4 (Canvas sync — uni load). See
`../architecture.md`, `../build-plan.md`, `../canvas-api-notes.md` (real
Canvas LMS REST API details: auth, endpoints, pagination, timezone
gotchas — already documented, this spec doesn't repeat it).
Explicitly out of scope: cross-member visibility (a dropdown/switcher to
view another member's load) — deliberately decided against; a Railway
Cron service is new infrastructure this introduces, but its setup (create
the service, point it at this repo, schedule) is an operational step in
the implementation plan, not a design decision left open.

## Why

The three of you are all at Webster University Tashkent; work gets
assigned without knowing who's buried in coursework this week. This
surfaces each person's own Canvas load inside the same platform, so a
"can you take this" ask starts from real information.

## Token entry — self-service, verified before storing

New `POST /me/canvas-token` — session-protected, no `member_id` in the
body (always the caller's own, from the session, same discipline as every
other write in this app). Body: `{token: string}` (base URL is fixed —
`CANVAS_BASE_URL`, already configured, all three of you are on the same
Webster Canvas instance, no per-member override needed).

Before storing: call Canvas's `GET /users/self` with the submitted token.
If it fails (401/network error), return `400` with Canvas's own error
detail — never silently store a token that doesn't work. On success,
store the token **encrypted** (see below) plus the `canvas_user_id` Canvas
just confirmed, on the caller's `members` row.

**Encryption**: Python-side Fernet (symmetric, `cryptography` package —
new dependency), keyed by a new `CANVAS_TOKEN_ENCRYPTION_KEY` secret
(generated once, `Fernet.generate_key()`, stored the same way every other
secret in this app is — env var, never committed). Not Postgres's
`pgcrypto`: this app's existing pattern encrypts nothing at the DB layer
anywhere else, and `pgcrypto`'s `pgp_sym_encrypt`/`decrypt` aren't directly
callable through supabase-py's PostgREST interface without a stored
procedure — Fernet in Python is simpler and consistent with everything
else here. Stored in the existing `members.canvas_api_token_enc` (`bytea`)
column — no migration needed, that column already exists from `0001_init.sql`.

## Sync — Railway Cron, every 30 minutes

A new Railway service (Cron type, same project — "Solura eco"), no code
of its own: it just calls `POST /canvas/sync` on the existing backend
service on a schedule. That endpoint (already scaffolded as a stub in
`app/routers/canvas.py`) becomes real: loop over every `members` row with
a non-null `canvas_api_token_enc`, decrypt, use the existing `CanvasClient`
(`app/services/canvas_client.py` — already has `list_active_courses`,
`list_assignments`; needs one addition, listing a submission's status) to
pull courses → assignments → this member's submission status per
assignment, upsert into `courses`/`assignments`/`submissions` (all three
tables already exist, `0001_init.sql`).

**Per-member isolation**: one member's sync failing (expired token, Canvas
down) is caught, logged, and skipped — never aborts the other two members'
sync in the same run. This endpoint isn't session-protected the way the
rest of the API is (nothing in a session token identifies "the cron job");
it's protected by a shared secret instead — new `CANVAS_SYNC_SECRET`,
checked via a header, same `hmac.compare_digest` discipline as every other
secret comparison in this app.

## Read side

`GET /canvas/my-assignments` — session-protected, returns the *calling*
member's own upcoming assignments only (no `member_id` parameter — always
derived from the session, structurally impossible to query someone else's
via this endpoint). Reads from the already-synced `assignments` +
`submissions` tables (not a live Canvas call) — sorted by `due_at`
ascending, nulls (no due date) last. Each row: assignment name, course
name, `due_at`, submission status (`submitted`/`graded`/`unsubmitted`, or
`"no submission yet"` if the sync never found one), a link to the real
Canvas assignment page.

## Frontend

`/uni-load` (sidebar link goes from inert to live). Two states:

- **No token saved yet**: a short form — paste your Canvas personal access
  token (a link to Canvas's own token-generation page, `Account → Settings
  → New Access Token`, matching `canvas-api-notes.md`'s own instructions),
  submits to the verify-and-save endpoint, shows Canvas's real error
  inline if verification fails.
- **Token saved**: assignment list, same status-pill visual language as
  everywhere else in this app (`bg-cyan/15 text-cyan` for on-track, a
  distinct warning color for overdue-and-unsubmitted), grouped or at least
  visually separated for overdue vs. upcoming.

## Error handling

- Token save: Canvas verification failure → `400` with the real reason.
- Sync: per-member try/except, failures logged (not raised), never block
  other members. A member with zero courses (unlikely but possible, e.g.
  between semesters) → their sync succeeds with zero rows, not an error.
- `GET /canvas/my-assignments` for a member with no token saved yet →
  `200` with an empty list (the frontend's "no token" state handles the
  UI for that case, not a `404`/`403` from this endpoint).

## Testing

- Backend: no new pure-logic function worth a unit test this pass (the
  meaningful logic — pagination, HTTP calls — already lives in
  `CanvasClient`, which is thin HTTP plumbing, not business logic; Fernet
  encrypt/decrypt is a well-tested library, not something this app's tests
  should re-verify). Manual verification against a real Canvas token in
  the implementation plan's final task.
- Manual: real token saved via the UI, real sync run (triggered manually
  once, not waiting for the cron schedule), confirm real assignments show
  up with correct due dates and submission status.
