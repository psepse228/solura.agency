# Dev-activity auto-pull, project roles, colors, and projects-first IA — design

Status: approved, ready for implementation plan.
Scope: build order item #2 (dev-activity), plus three additions to the
already-shipped item #1 that surfaced naturally while scoping item #2 and
reviewing the mockup: roles, colors, and a real information-architecture
shift (projects become the primary navigable unit, each with its own full
detail page, rather than everything flattened onto one client-grouped
list). See `../architecture.md`, `../build-plan.md`.
Explicitly out of scope: Vercel deployment events and Claude Code Remote
sessions (later passes of item #2), docs library (#3), Canvas sync (#4),
Telegram lead capture (#5). Mockup approved during this brainstorm:
https://claude.ai/code/artifact/ed1b8b91-02fd-4e47-82ee-d30d3e8d98ad

## Part A — Dev-activity auto-pull (GitHub commits)

### Why

Right now "what happened on Argus while I was asleep" means opening GitHub
directly per project. The whole point of Solura Eco is one shared place —
this closes that gap for the one source that matters most day to day:
commits.

### Data model

New `solura_eco.dev_events` table, deliberately generic across future
sources (Vercel deploys, Claude Code Remote sessions — both later, not this
pass) rather than GitHub-specific:

```sql
create table solura_eco.dev_events (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references solura_eco.projects(id) on delete cascade,
  source        text not null,              -- 'github' (only value used this pass)
  external_id   text not null,               -- commit SHA, for dedup
  actor         text,                        -- committer name
  message       text not null,
  url           text,
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (project_id, source, external_id)
);
create index dev_events_project_id_idx on solura_eco.dev_events(project_id, occurred_at desc);
```

The unique constraint on `(project_id, source, external_id)` is the dedup
mechanism — a GitHub webhook redelivery (GitHub retries on non-2xx, and can
occasionally redeliver even on success) upserts onto the same row instead of
duplicating.

### Ingestion — webhook, not polling

`POST /webhooks/github` on the backend. GitHub signs every webhook payload
with `X-Hub-Signature-256` (HMAC-SHA256 over the raw request body, keyed by
a per-repo secret) — this must be verified **before** the payload is
touched, using `hmac.compare_digest`, matching the same constant-time
comparison discipline already used for session tokens
(`app/auth/session.py`). An unverified endpoint would let anyone POST fake
commits for any linked project.

On a valid `push` event: match `repository.full_name` (e.g.
`psepse228/Argus`) against `projects.github_repo`; if a match exists, upsert
each commit in the payload's `commits` array into `dev_events` (`external_id
= commit.id`, `actor = commit.author.name`, `message = commit.message`
(first line only — commit bodies can be long and multi-line; the timeline
shows one line per event), `url = commit.url`, `occurred_at =
commit.timestamp`).

Repos wired up this pass (real names, pulled from Railway service configs,
not guessed): `psepse228/Argus`, `psepse228/tender-agent-app`,
`psepse228/cano-ai-tutor`, `psepse228/solura.agency`. Webhooks registered
directly via `gh api repos/{repo}/hooks` (the `gh` CLI is already
authenticated with `repo` scope) — no manual GitHub UI steps needed.
`cano-ai-tutor`'s default branch is `master`, not `main` — the webhook
still fires on push to any branch; only `main`/`master` distinction matters
if this ever needs branch filtering, which it doesn't for v1.

### Read side

New `GET /projects/{id}/events` (session-protected like every other route),
returns the 20 most recent `dev_events` rows for that project, newest
first. **Not** embedded in the `GET /clients` response — that would grow
unbounded as events accumulate and slow down the page every visitor loads
first. Frontend fetches a project's events on demand when its card is
expanded (client component, `useState` for expanded/collapsed + a fetch on
first expand).

### Error handling

- Bad/missing signature → `401`, no DB write, no processing of the payload.
- Valid signature, but `repository.full_name` matches no `projects` row →
  `200` (GitHub will retry non-2xx responses indefinitely; a webhook firing
  for a repo Solura Eco doesn't track yet is an expected, not exceptional,
  case) — log it and skip, don't error.
- Malformed payload (missing expected fields) → `400`.
- Non-`push` event types (GitHub sends whatever events the webhook is
  subscribed to) → `200`, no-op. The webhook registration only subscribes
  to `push` events, so this is defensive, not expected to fire.

## Part B — Project roles

### Why

Two genuinely different kinds of work happen per project — building it, and
finding/managing the client relationship — and right now the home screen
can't show who's doing which.

### Data model

```sql
create table solura_eco.project_roles (
  project_id  uuid not null references solura_eco.projects(id) on delete cascade,
  member_id   uuid not null references solura_eco.members(id) on delete cascade,
  role_type   text not null check (role_type in ('dev', 'client_work')),
  primary key (project_id, member_id, role_type)
);
```

A member can hold both roles on the same project (the primary key allows
`(project_id, member_id, 'dev')` and `(project_id, member_id,
'client_work')` to coexist), and each role independently ranges from 0 to 3
members.

### API

`PUT /clients/projects/{id}/roles` — body `{dev_member_ids: [...],
client_work_member_ids: [...]}`. Replaces the full role set for that project
atomically (delete all existing rows for the project, insert the new set,
in one transaction) — simpler mental model than incremental add/remove
calls, and matches how the UI will actually edit it (a small multi-select
per role, not one-at-a-time toggles).

`GET /clients` extended: each project in the response gains `dev_members:
[{id, full_name}]` and `client_work_members: [{id, full_name}]`, joined
from `project_roles` + `members`.

### UI

Two small avatar rows per project card (initials in a circle, matching the
mockup) — dev on the left, client-work on the right. A role with nobody
assigned shows a muted "unassigned" label rather than an empty space, so
it's visibly a gap, not a loading state.

## Part C — Project accent colors

### Why

The home screen currently renders every project in the same neutral tone.
Each Solura product already has a real, established visual identity — this
surfaces it instead of flattening it away.

### Data model

```sql
alter table solura_eco.projects
  add column if not exists accent_start text,  -- hex, e.g. '#f01c52'
  add column if not exists accent_end   text;   -- hex, e.g. '#c11249'
```

Both nullable — a project with no colors set (e.g. a brand-new one) falls
back to the platform's own default gradient (`#38bdf8` → `#818cf8`, same as
solura-agency.com and Solura Eco's own chrome) rather than erroring or
rendering blank.

### Real colors, sampled from each product's actual code — not invented

| Project | accent_start | accent_end | Source |
|---|---|---|---|
| Argus | `#f01c52` | `#c11249` | Already documented in this repo's own `index.html` (portfolio section): "Argus's real crimson accent, not literal gold" |
| Tender Agent | `#38bdf8` | `#818cf8` | Tender Agent's own marketing (`presentation.html`) uses this exact gradient — it shares Solura's own brand rather than having a distinct one |
| Cortège | `#34d399` | `#059669` | Wiki: "the current live palette is dark/emerald" (exact hex not independently verified against Cortège's own code this pass — closest standard emerald, flagged as inferred, not sampled) |
| Athena AI (`cano-ai-tutor`) | `#1e3a78` | `#f5941d` | Pulled directly from the live repo's `frontend/src/app/globals.css` — navy/orange, explicitly the IHL (Interhouse Lyceum) client's real brand, sampled from their actual site per that file's own comment |
| solura-agency.com | `#38bdf8` | `#818cf8` | This platform's own brand |

Cortège's color is the one exception to "sampled, not invented" — flagged
in the table above rather than silently presented as fact. Fine to correct
later with a direct look at Cortège's own repo; not blocking this pass.

### UI

A 3px left-edge accent stripe per project card (visible in the mockup) plus
a small color dot next to the project name — enough to make each product
instantly recognizable by color without turning the page into a rainbow.

## Part D — Projects-first information architecture

### Why

Reviewing the mockup surfaced that grouping by client and showing only a
3-line activity accordion doesn't give projects — the actual unit of daily
work — enough room. Approved direction (mockup:
https://claude.ai/code/artifact/ed1b8b91-02fd-4e47-82ee-d30d3e8d98ad):
projects become the primary navigable unit, client becomes metadata on a
project rather than the top-level grouping, and each project gets a real
detail page instead of an inline expand.

### API

Two new endpoints, additive — `GET /clients` (existing) is untouched, still
used wherever client-grouped data is genuinely useful later (e.g. a future
"Clients" nav section):

- **`GET /projects`** — flat list, one row per project, each with:
  `id, name, client_id, client_name, status, progress, github_repo,
  accent_start, accent_end, dev_members, client_work_members,
  last_activity_at`. This becomes the home page's data source, replacing
  its current use of `GET /clients`. `last_activity_at` is the `occurred_at`
  of that project's most recent `dev_events` row (or `null` if none/no repo
  linked) — a single indexed query
  (`select project_id, max(occurred_at) ... group by project_id`), not N+1.
- **`GET /projects/{id}`** — everything `GET /projects` has for one project,
  plus `notes` and the 20 most recent `dev_events` rows inline (the detail
  page is the primary destination now, not a collapsed accordion — no
  reason to make it round-trip for its own activity feed the way the
  list-page expand in Part A's original design would have).
- **`GET /projects/stats`** — `{active_projects, active_clients,
  commits_this_week, avg_progress}` for the KPI row. `commits_this_week` =
  count of `dev_events` where `occurred_at >= now() - interval '7 days'`.
  `avg_progress` = average `progress` across projects where `status =
  'active'`.

Part A's originally-planned `GET /projects/{id}/events` is superseded by
folding recent events directly into `GET /projects/{id}` — not built
separately, since the list page no longer has an inline expand to feed.

### Frontend routing

- `src/app/page.tsx` (home) — rewritten from the current client-grouped
  list to the project grid + KPI row shown in the mockup. Server Component,
  fetches `GET /projects` and `GET /projects/stats` in parallel.
- `src/app/projects/[id]/page.tsx` — **new**. Server Component, fetches
  `GET /projects/{id}`. Renders the detail layout from the mockup: header
  (name, client, repo link), a progress+stats panel, a day-grouped activity
  timeline, a roles panel (Dev / Client work, real names), a notes panel.
- Both routes stay behind the existing `proxy.ts` auth check and forward
  the session as a Bearer header exactly like the current home page does —
  no change to the auth mechanism itself, this is purely a data-shape and
  routing change.
- Sidebar nav (from the mockup) added to the root layout — "Projects" is
  the only live link this pass; "Clients", "Uni load", "Docs & КП", "Leads"
  render but are inert placeholders (no route yet) — the mockup shows the
  platform's real intended shape without implying features 3-5 are also
  shipping now. Deliberate: matches "structure is information," not
  decoration — these are real, named upcoming sections from
  architecture.md, not invented chrome.

## Part E — Collaborative notepad per project

### Why

Requested directly against the detail-page mockup: the static "About" blurb
(`projects.notes`, one field, effectively one author) doesn't give the team
a place to leave ongoing thoughts and ideas as work progresses. Distinct
concept, not a rename of the existing field.

### Data model

```sql
create table solura_eco.project_notes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references solura_eco.projects(id) on delete cascade,
  member_id   uuid not null references solura_eco.members(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
```

No edit/delete this pass — a note, once posted, stays (matches the flat,
no-ownership-enforcement pattern the rest of this app uses for a 3-person
team; add edit/delete later only if it turns out to matter in practice).

### API

`GET /projects/{id}/notes` — newest first, each row includes the author's
name (joined from `members`). `POST /projects/{id}/notes` — body `{body:
string}`, author is taken from the session (`member_id` in the verified
token), not a client-supplied field — a client can't post a note as someone
else.

### UI

A "Notepad" panel on the project detail page (below "About", not replacing
it): a small always-visible textarea + "Add note" button, and the existing
notes newest-first below it, each showing author + relative time. Posts via
a `/api/projects/[id]/notes` Next.js route handler (same cross-domain-cookie
reasoning as `/api/login`) rather than the browser calling the backend
directly.

## Testing

- Backend: `test_verify_github_signature` (valid/invalid/missing signature
  cases, mirroring the existing `test_session.py` structure), plus a test
  that a `push` payload for a known repo upserts the right number of
  `dev_events` rows and a redelivery doesn't duplicate them.
- `PUT /clients/projects/{id}/roles` — test that it replaces cleanly (old
  roles gone, new roles present) and handles an empty list (unassigning
  everyone from a role).
- `GET /projects/stats` — test `commits_this_week` and `avg_progress` against
  known seeded data (exact expected numbers, not just "returns 200").
- Manual: real webhook delivery on `solura.agency` itself (this repo) after
  registration — push a commit, confirm it lands in `dev_events` and shows
  up on both `GET /projects` (`last_activity_at`) and the detail page.
- No frontend test suite exists yet (matches item #1's precedent) — manual
  verification of the grid, detail page, roles, and color rendering.

## Error handling summary

Already covered inline per part above (webhook signature/unknown-repo/
malformed-payload cases in Part A). Roles: `PUT` with an unknown
`member_id` → `400` (don't silently drop it). Colors: no validation beyond
"is it a string" — a malformed hex just renders as invalid CSS, which is a
cosmetic failure, not a data-integrity one; not worth a strict hex-format
check for 3 people entering their own known colors.
