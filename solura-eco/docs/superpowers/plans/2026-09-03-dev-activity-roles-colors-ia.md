# Dev-Activity, Roles, Colors & Projects-First IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "what happened while I was asleep" from a manual GitHub check into an automatic timeline, show who's building vs. selling each project, give every project its real brand color, give the team a shared place to leave thoughts per project, and restructure the home screen so projects — not clients — are the primary thing you click into.

**Architecture:** A GitHub webhook (signature-verified) writes commits into a generic `dev_events` table. A new `project_roles` table tracks 0-3 people per (project, dev|client_work) pair. A new `project_notes` table is a timestamped, attributed log any of the 3 can append to. `projects` gains nullable `accent_start`/`accent_end` hex columns. A new `GET /projects` family of read endpoints replaces the home page's use of `GET /clients`; the frontend gets a `(app)` route group so the sidebar/auth-check layout wraps every page except `/login`, plus a new `/projects/[id]` detail page with an interactive notepad panel.

**Tech Stack:** FastAPI + supabase-py (backend, unchanged from item #1), Next.js 16 App Router + Tailwind v4 (frontend, unchanged), `gh` CLI for webhook registration (already authenticated, `repo` scope).

---

## Before you start

Same secrets discipline as the previous plan: `SUPABASE_DB_PASSWORD` for applying migrations goes in your shell env, never in a file. This plan also introduces one new secret, `GITHUB_WEBHOOK_SECRET` — generate it the same way as `SESSION_SECRET` was (`python -c "import secrets; print(secrets.token_hex(32))"`), never commit it, and it must be set identically on both the backend (`.env`/Railway) and passed to `gh api ... -f config[secret]=...` when registering each webhook (Task 10).

## Task 1: Migrations — dev_events, project_roles, project colors, project notes

**Files:**
- Create: `solura-eco/supabase/migrations/0005_dev_events.sql`
- Create: `solura-eco/supabase/migrations/0006_project_roles.sql`
- Create: `solura-eco/supabase/migrations/0007_project_colors.sql`
- Create: `solura-eco/supabase/migrations/0008_project_notes.sql`

- [ ] **Step 1: Write `0005_dev_events.sql`**

```sql
-- Solura Eco — dev_events: generic activity feed, GitHub commits first.
-- Deliberately source-agnostic (not a github_commits table) -- Vercel
-- deploys and Claude Code Remote sessions land here too, later.
-- See docs/superpowers/specs/2026-09-03-dev-activity-roles-colors-design.md.

create table solura_eco.dev_events (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references solura_eco.projects(id) on delete cascade,
  source        text not null,              -- 'github' (only value used so far)
  external_id   text not null,               -- commit SHA, for dedup
  actor         text,                        -- committer name
  message       text not null,
  url           text,
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (project_id, source, external_id)
);

create index dev_events_project_id_idx on solura_eco.dev_events(project_id, occurred_at desc);

alter table solura_eco.dev_events enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
```

- [ ] **Step 2: Write `0006_project_roles.sql`**

```sql
-- Solura Eco — project_roles: who's building vs. who's selling, per project.
-- A member can hold both roles on the same project; each role independently
-- ranges from 0 to 3 members (the whole team, forever, per architecture.md).

create table solura_eco.project_roles (
  project_id  uuid not null references solura_eco.projects(id) on delete cascade,
  member_id   uuid not null references solura_eco.members(id) on delete cascade,
  role_type   text not null check (role_type in ('dev', 'client_work')),
  primary key (project_id, member_id, role_type)
);

alter table solura_eco.project_roles enable row level security;
```

- [ ] **Step 3: Write `0007_project_colors.sql`**

```sql
-- Solura Eco — real per-project accent colors, sampled from each product's
-- actual code (see the design spec's Part C table for sources). Nullable:
-- a project with no colors set falls back to the platform's own gradient.

alter table solura_eco.projects
  add column if not exists accent_start text,
  add column if not exists accent_end text;
```

- [ ] **Step 4: Write `0008_project_notes.sql`**

```sql
-- Solura Eco — project_notes: a running, shared notepad per project.
-- Distinct from projects.notes (a short, single-editor "about this
-- project" blurb, e.g. set by seed_project_details.py) -- this is a
-- timestamped, attributed log any of the 3 can add to, never edited
-- or deleted by anyone but its author-in-spirit (no ownership check
-- enforced -- flat 3-person access, same as everything else).

create table solura_eco.project_notes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references solura_eco.projects(id) on delete cascade,
  member_id   uuid not null references solura_eco.members(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index project_notes_project_id_idx on solura_eco.project_notes(project_id, created_at desc);

alter table solura_eco.project_notes enable row level security;
```

- [ ] **Step 5: Apply all 4, in order, using the reusable script from the last plan**

Run (with `SUPABASE_DB_HOST`/`SUPABASE_DB_PASSWORD` exported in your shell, not written to any file):

```bash
cd solura-eco
python scripts/apply_migration.py supabase/migrations/0005_dev_events.sql
python scripts/apply_migration.py supabase/migrations/0006_project_roles.sql
python scripts/apply_migration.py supabase/migrations/0007_project_colors.sql
python scripts/apply_migration.py supabase/migrations/0008_project_notes.sql
```

Expected: `Applied: ...` four times. No separate grants migration needed —
`0003_grants.sql`'s `alter default privileges` already covers tables
created later by the same role.

- [ ] **Step 6: Commit**

```bash
git add solura-eco/supabase/migrations/0005_dev_events.sql solura-eco/supabase/migrations/0006_project_roles.sql solura-eco/supabase/migrations/0007_project_colors.sql solura-eco/supabase/migrations/0008_project_notes.sql
git commit -m "Solura Eco: migrations for dev_events, project_roles, project colors, project notes"
```

## Task 2: `GITHUB_WEBHOOK_SECRET` config

**Files:**
- Modify: `solura-eco/backend/app/config.py`
- Modify: `solura-eco/backend/.env.example`
- Modify: `solura-eco/backend/.env` (local only, not committed)

- [ ] **Step 1: Add the setting**

In `solura-eco/backend/app/config.py`, add inside the `Settings` class, alongside `session_secret`:

```python
    github_webhook_secret: str = os.getenv("GITHUB_WEBHOOK_SECRET", "")
```

- [ ] **Step 2: Document it**

Append to `solura-eco/backend/.env.example`:

```text

# GitHub webhook signature verification (POST /webhooks/github). Generate
# the same way as SESSION_SECRET. Must match exactly what's registered on
# each repo's webhook (see scripts/register_github_webhook.py, Task 10).
GITHUB_WEBHOOK_SECRET=
```

- [ ] **Step 3: Generate a real one, append to the local `.env`**

Run: `python -c "import secrets; print(secrets.token_hex(32))"`, append
`GITHUB_WEBHOOK_SECRET=<value>` to `solura-eco/backend/.env`. Do not print
the value in any tool output or report — same discipline as `SESSION_SECRET`
in the previous plan.

- [ ] **Step 4: Commit (config.py and .env.example only)**

```bash
git add solura-eco/backend/app/config.py solura-eco/backend/.env.example
git commit -m "Solura Eco: add GITHUB_WEBHOOK_SECRET config"
```

## Task 3: GitHub signature verification (TDD)

**Files:**
- Create: `solura-eco/backend/app/webhooks/__init__.py`
- Create: `solura-eco/backend/app/webhooks/github.py`
- Test: `solura-eco/backend/tests/webhooks/test_github_signature.py`

- [ ] **Step 1: Write the failing test**

Create `solura-eco/backend/tests/webhooks/__init__.py` (empty), then:

```python
# solura-eco/backend/tests/webhooks/test_github_signature.py
import hashlib
import hmac

from app.webhooks.github import verify_github_signature

SECRET = "test-webhook-secret"


def _sign(body: bytes) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


def test_accepts_a_correctly_signed_payload():
    body = b'{"foo": "bar"}'
    assert verify_github_signature(body, _sign(body), SECRET) is True


def test_rejects_a_payload_signed_with_the_wrong_secret():
    body = b'{"foo": "bar"}'
    wrong_sig = "sha256=" + hmac.new(b"wrong-secret", body, hashlib.sha256).hexdigest()
    assert verify_github_signature(body, wrong_sig, SECRET) is False


def test_rejects_a_tampered_body():
    body = b'{"foo": "bar"}'
    sig = _sign(body)
    tampered = b'{"foo": "baz"}'
    assert verify_github_signature(tampered, sig, SECRET) is False


def test_rejects_missing_signature_header():
    assert verify_github_signature(b"{}", "", SECRET) is False


def test_rejects_malformed_signature_header():
    assert verify_github_signature(b"{}", "not-sha256-prefixed", SECRET) is False
```

- [ ] **Step 2: Run it, confirm ModuleNotFoundError**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/webhooks/test_github_signature.py -v`

- [ ] **Step 3: Implement**

Create `solura-eco/backend/app/webhooks/__init__.py` (empty).

```python
# solura-eco/backend/app/webhooks/github.py
"""GitHub webhook signature verification (X-Hub-Signature-256).

Must run before the payload is touched -- an unverified endpoint would let
anyone POST fake commits for any linked project.
"""
import hashlib
import hmac


def verify_github_signature(payload_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected = "sha256=" + hmac.new(secret.encode("utf-8"), payload_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

- [ ] **Step 4: Run it, confirm 5 passed**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/webhooks/test_github_signature.py -v`

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/webhooks/ solura-eco/backend/tests/webhooks/
git commit -m "Solura Eco: GitHub webhook signature verification + tests"
```

## Task 4: `POST /webhooks/github`

**Files:**
- Create: `solura-eco/backend/app/routers/webhooks.py`
- Modify: `solura-eco/backend/app/main.py`

- [ ] **Step 1: Write the router**

```python
# solura-eco/backend/app/routers/webhooks.py
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
```

- [ ] **Step 2: Wire it into `main.py`**

Change the router import line:

```python
from app.routers import auth, canvas, clients, tasks
```

to:

```python
from app.routers import auth, canvas, clients, tasks, webhooks
```

Add the include, alongside the existing ones:

```python
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
```

- [ ] **Step 3: Verify the app imports and lists the new route**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -c "import app.main; print('/webhooks/github' in [r.path for r in app.main.app.routes])"`
Expected: `True`

- [ ] **Step 4: Commit**

```bash
git add solura-eco/backend/app/routers/webhooks.py solura-eco/backend/app/main.py
git commit -m "Solura Eco: POST /webhooks/github"
```

## Task 5: `PUT /clients/projects/{id}/roles`

**Files:**
- Modify: `solura-eco/backend/app/routers/clients.py`

- [ ] **Step 1: Add the endpoint**

Add this import alongside the existing ones in `solura-eco/backend/app/routers/clients.py`:

```python
from typing import List
```

(If `List` isn't already imported — check the existing `from typing import Optional` line and extend it to `from typing import List, Optional` instead of adding a separate import line.)

Add this model and route at the end of the file:

```python
class RolesUpdate(BaseModel):
    dev_member_ids: List[str] = Field(default_factory=list)
    client_work_member_ids: List[str] = Field(default_factory=list)


@router.put("/projects/{project_id}/roles")
async def update_project_roles(
    project_id: str, payload: RolesUpdate, _: dict = Depends(require_session)
):
    db = get_client()

    all_ids = set(payload.dev_member_ids) | set(payload.client_work_member_ids)
    if all_ids:
        existing = db.table("members").select("id").in_("id", list(all_ids)).execute().data
        existing_ids = {row["id"] for row in existing}
        missing = all_ids - existing_ids
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown member_id(s): {sorted(missing)}")

    # Not wrapped in a single DB transaction -- supabase-py/PostgREST calls
    # are separate HTTP requests, no multi-statement transaction available
    # without a stored procedure. A failure between delete and insert could
    # leave roles cleared but not re-set. Accepted risk for a 3-person
    # internal tool -- trivially re-set by hand if it ever happens -- not
    # worth a stored-proc for this.
    db.table("project_roles").delete().eq("project_id", project_id).execute()

    rows = [
        {"project_id": project_id, "member_id": mid, "role_type": "dev"}
        for mid in payload.dev_member_ids
    ] + [
        {"project_id": project_id, "member_id": mid, "role_type": "client_work"}
        for mid in payload.client_work_member_ids
    ]
    if rows:
        db.table("project_roles").insert(rows).execute()

    return {"ok": True}
```

- [ ] **Step 2: Verify the app still imports cleanly**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -c "import app.main; print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add solura-eco/backend/app/routers/clients.py
git commit -m "Solura Eco: PUT /clients/projects/{id}/roles"
```

## Task 6: `GET /projects`, `GET /projects/{id}`, `GET /projects/stats`, project notes API (TDD for stats)

**Files:**
- Create: `solura-eco/backend/app/routers/projects.py`
- Modify: `solura-eco/backend/app/main.py`
- Test: `solura-eco/backend/tests/routers/test_projects_stats.py`

This task's stats math is the one piece of real logic worth a unit test —
everything else in this router is straight Supabase queries, better
verified by the manual curl checks in Task 11 than by mocking the DB client.

- [ ] **Step 1: Write the failing test for the stats math**

Create `solura-eco/backend/tests/routers/__init__.py` (empty), then:

```python
# solura-eco/backend/tests/routers/test_projects_stats.py
from app.routers.projects import _compute_stats


def test_compute_stats_counts_active_projects_and_clients():
    projects = [
        {"status": "active", "progress": 60},
        {"status": "active", "progress": 80},
        {"status": "completed", "progress": 100},
    ]
    clients = [{"status": "active"}, {"status": "active"}, {"status": "churned"}]
    events_count = 5

    stats = _compute_stats(projects, clients, events_count)

    assert stats == {
        "active_projects": 2,
        "active_clients": 2,
        "commits_this_week": 5,
        "avg_progress": 70,  # (60 + 80) / 2, only active projects
    }


def test_compute_stats_handles_zero_active_projects():
    stats = _compute_stats([], [], 0)
    assert stats["avg_progress"] == 0
    assert stats["active_projects"] == 0
```

- [ ] **Step 2: Run it, confirm ModuleNotFoundError / ImportError**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/routers/test_projects_stats.py -v`

- [ ] **Step 3: Implement the router**

```python
# solura-eco/backend/app/routers/projects.py
"""GET /projects (list), GET /projects/{id} (detail), GET /projects/stats,
GET/POST /projects/{id}/notes (the shared notepad). Project/role writes
still go through clients.py (POST /clients/{id}/projects, PATCH
/clients/projects/{id}, PUT .../roles) -- notes live here since they're
read alongside the rest of a project's detail, not part of that CRUD set.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()


def _attach_roles(db, projects: list) -> None:
    project_ids = [p["id"] for p in projects]
    if not project_ids:
        return
    roles = (
        db.table("project_roles")
        .select("project_id,role_type,members(id,full_name)")
        .in_("project_id", project_ids)
        .execute()
        .data
    )
    by_project: dict = {}
    for r in roles:
        entry = by_project.setdefault(r["project_id"], {"dev": [], "client_work": []})
        entry[r["role_type"]].append(r["members"])
    for p in projects:
        entry = by_project.get(p["id"], {"dev": [], "client_work": []})
        p["dev_members"] = entry["dev"]
        p["client_work_members"] = entry["client_work"]


def _attach_last_activity(db, projects: list) -> None:
    project_ids = [p["id"] for p in projects]
    if not project_ids:
        return
    events = (
        db.table("dev_events")
        .select("project_id,occurred_at")
        .in_("project_id", project_ids)
        .order("occurred_at", desc=True)
        .execute()
        .data
    )
    latest: dict = {}
    for e in events:
        if e["project_id"] not in latest:
            latest[e["project_id"]] = e["occurred_at"]
    for p in projects:
        p["last_activity_at"] = latest.get(p["id"])


def _flatten_client(p: dict) -> None:
    client = p.pop("clients", None)
    p["client_name"] = client["name"] if client else None


@router.get("")
async def list_projects(_: dict = Depends(require_session)):
    db = get_client()
    projects = (
        db.table("projects")
        .select("id,name,client_id,status,progress,github_repo,accent_start,accent_end,clients(name)")
        .order("name")
        .execute()
        .data
    )
    for p in projects:
        _flatten_client(p)

    _attach_roles(db, projects)
    _attach_last_activity(db, projects)
    return projects


def _compute_stats(projects: list, clients: list, events_count: int) -> dict:
    active_projects = [p for p in projects if p["status"] == "active"]
    active_clients = [c for c in clients if c.get("status") == "active"]
    avg_progress = (
        round(sum(p["progress"] for p in active_projects) / len(active_projects))
        if active_projects
        else 0
    )
    return {
        "active_projects": len(active_projects),
        "active_clients": len(active_clients),
        "commits_this_week": events_count,
        "avg_progress": avg_progress,
    }


@router.get("/stats")
async def project_stats(_: dict = Depends(require_session)):
    db = get_client()
    projects = db.table("projects").select("status,progress").execute().data
    clients = db.table("clients").select("status").execute().data

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent_events = db.table("dev_events").select("id").gte("occurred_at", week_ago).execute().data

    return _compute_stats(projects, clients, len(recent_events))


@router.get("/{project_id}")
async def get_project(project_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = (
        db.table("projects")
        .select(
            "id,name,client_id,status,progress,github_repo,accent_start,accent_end,notes,clients(name)"
        )
        .eq("id", project_id)
        .execute()
        .data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")

    project = result[0]
    _flatten_client(project)

    _attach_roles(db, [project])
    _attach_last_activity(db, [project])

    events = (
        db.table("dev_events")
        .select("id,actor,message,url,occurred_at")
        .eq("project_id", project_id)
        .order("occurred_at", desc=True)
        .limit(20)
        .execute()
        .data
    )
    project["recent_events"] = events

    return project


class NoteIn(BaseModel):
    body: str


@router.get("/{project_id}/notes")
async def list_project_notes(project_id: str, _: dict = Depends(require_session)):
    db = get_client()
    notes = (
        db.table("project_notes")
        .select("id,body,created_at,members(id,full_name)")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    for n in notes:
        author = n.pop("members", None)
        n["author"] = author["full_name"] if author else "Unknown"
    return notes


@router.post("/{project_id}/notes")
async def create_project_note(
    project_id: str, payload: NoteIn, session: dict = Depends(require_session)
):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Note body cannot be empty")

    db = get_client()
    row = {
        "project_id": project_id,
        "member_id": session["member_id"],
        "body": payload.body.strip(),
    }
    result = db.table("project_notes").insert(row).execute().data[0]

    # Attach the author's name the same shape as the GET response, rather
    # than making the frontend do a second round-trip to find out who
    # "session['member_id']" resolves to.
    member = db.table("members").select("full_name").eq("id", session["member_id"]).execute().data
    result["author"] = member[0]["full_name"] if member else session["username"]
    return result
```

- [ ] **Step 4: Run the stats test, confirm 2 passed**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/routers/test_projects_stats.py -v`

- [ ] **Step 5: Wire the router into `main.py`**

Change the import line:

```python
from app.routers import auth, canvas, clients, tasks, webhooks
```

to:

```python
from app.routers import auth, canvas, clients, projects, tasks, webhooks
```

Add the include:

```python
app.include_router(projects.router, prefix="/projects", tags=["projects"])
```

- [ ] **Step 6: Verify the app imports and lists all 5 new routes**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -c "
import app.main
paths = [r.path for r in app.main.app.routes]
for p in ['/projects', '/projects/{project_id}', '/projects/stats', '/projects/{project_id}/notes']:
    print(p, p in paths)
"`
Expected: all four print `True` (`/projects/{project_id}/notes` covers both GET and POST — same path, different methods)

- [ ] **Step 7: Commit**

```bash
git add solura-eco/backend/app/routers/projects.py solura-eco/backend/app/main.py solura-eco/backend/tests/routers/
git commit -m "Solura Eco: GET /projects, /projects/{id}, /projects/stats, notepad endpoints + stats tests"
```

## Task 7: Frontend theme token — `--color-silver-dim`

**Files:**
- Modify: `solura-eco/frontend/src/app/globals.css`

- [ ] **Step 1: Add the token**

In `solura-eco/frontend/src/app/globals.css`, add to the `:root` block (alongside the existing `--silver`):

```css
  --silver-dim: #5b6b82;
```

And to the `@theme inline` block (alongside `--color-silver`):

```css
  --color-silver-dim: var(--silver-dim);
```

- [ ] **Step 2: Commit**

```bash
git add solura-eco/frontend/src/app/globals.css
git commit -m "Solura Eco frontend: add silver-dim theme token"
```

## Task 8: `Sidebar` component

**Files:**
- Create: `solura-eco/frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Write it**

```tsx
// solura-eco/frontend/src/components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";

// "Projects" is the only live route this pass -- the rest are the real,
// named upcoming build-order sections (architecture.md), rendered as
// visible-but-inert so the platform's intended shape is honest, not
// decorative filler.
const NAV_ITEMS = [
  { href: "/", label: "Projects", live: true },
  { href: "/clients", label: "Clients", live: false },
  { href: "/uni-load", label: "Uni load", live: false },
  { href: "/docs", label: "Docs & КП", live: false },
  { href: "/leads", label: "Leads", live: false },
];

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col gap-7 border-r border-border bg-bg2 p-4">
      <div className="flex items-center gap-2.5 px-1">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[image:var(--grad)] font-display text-[13px] font-extrabold text-bg">
          S
        </div>
        <span className="font-display text-base font-extrabold tracking-tight">Solura Eco</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.live && pathname === item.href;
          const className = `block rounded-lg px-2.5 py-2 text-[13.5px] font-medium ${
            active ? "bg-bg3 text-white" : "text-silver-dim"
          }`;
          return item.live ? (
            <Link key={item.href} href={item.href} className={className}>
              {item.label}
            </Link>
          ) : (
            <span key={item.href} className={`${className} cursor-default opacity-50`} title="Coming soon">
              {item.label}
            </span>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-white/5 pt-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg3 text-[11px] font-bold uppercase">
          {username.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1 truncate text-xs font-semibold capitalize text-white">{username}</div>
        <SignOutButton />
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd solura-eco/frontend && npx tsc --noEmit` — only acceptable error is the known pre-existing `LayoutProps` one.

- [ ] **Step 3: Commit**

```bash
git add solura-eco/frontend/src/components/Sidebar.tsx
git commit -m "Solura Eco frontend: Sidebar component"
```

## Task 9: `(app)` route group — layout with auth check + sidebar

**Files:**
- Create: `solura-eco/frontend/src/app/(app)/layout.tsx`
- Move: `solura-eco/frontend/src/app/page.tsx` → `solura-eco/frontend/src/app/(app)/page.tsx` (content rewritten in Task 10 — this task just relocates the file so the route group takes effect; `/login` and `/api/*` stay outside the group, untouched)

- [ ] **Step 1: Create the `(app)` directory and move `page.tsx` into it**

Run: `cd solura-eco/frontend/src/app && mkdir "(app)" && git mv page.tsx "(app)/page.tsx"`

(Route groups — a folder name in parens — don't appear in the URL. `src/app/(app)/page.tsx` still serves `/`, exactly as `src/app/page.tsx` did.)

- [ ] **Step 2: Write the layout**

```tsx
// solura-eco/frontend/src/app/(app)/layout.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/Sidebar";
import { verifySessionToken } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get("session")?.value;
  const secret = process.env.SESSION_SECRET;
  const session = secret ? await verifySessionToken(token, secret) : null;

  // proxy.ts already redirects unauthenticated requests before this layout
  // ever renders -- this is a defensive fallback (e.g. SESSION_SECRET
  // misconfigured differently between proxy and here), not the primary
  // auth gate.
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar username={session.username} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build still finds the route (content is stale until Task 10, that's expected)**

Run: `cd solura-eco/frontend && npm run build`
Expected: `✓ Compiled successfully`, route table still lists `/`

- [ ] **Step 4: Commit**

```bash
git add "solura-eco/frontend/src/app/(app)"
git commit -m "Solura Eco frontend: (app) route group with auth-checked sidebar layout"
```

## Task 10: Rewrite the home page — project grid + KPIs

**Files:**
- Modify: `solura-eco/frontend/src/app/(app)/page.tsx` (full rewrite)

- [ ] **Step 1: Replace its contents**

```tsx
// solura-eco/frontend/src/app/(app)/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";

type Member = { id: string; full_name: string };
type Project = {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  progress: number;
  accent_start: string | null;
  accent_end: string | null;
  dev_members: Member[];
  client_work_members: Member[];
  last_activity_at: string | null;
};
type Stats = {
  active_projects: number;
  active_clients: number;
  commits_this_week: number;
  avg_progress: number;
};

const DEFAULT_GRADIENT: [string, string] = ["#38bdf8", "#818cf8"];

async function fetchJSON<T>(path: string, token: string | undefined): Promise<T | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  try {
    const res = await fetch(`${apiUrl}${path}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "no activity";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Avatar({ member }: { member: Member }) {
  return (
    <div
      className="-ml-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-bg2 bg-bg3 text-[9px] font-bold text-white outline outline-1 outline-border first:ml-0"
      title={member.full_name}
    >
      {member.full_name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default async function Home() {
  const token = (await cookies()).get("session")?.value;
  const [projects, stats] = await Promise.all([
    fetchJSON<Project[]>("/projects", token),
    fetchJSON<Stats>("/projects/stats", token),
  ]);

  return (
    <div className="px-8 py-8">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Projects</h1>
      <p className="mt-1 text-sm text-silver">
        Every project Solura&apos;s running, at a glance — click one for the full picture.
      </p>

      {!projects || !stats ? (
        <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          Could not reach the backend — showing nothing until it&apos;s reachable.
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Active projects", stats.active_projects],
                ["Active clients", stats.active_clients],
                ["Commits this week", stats.commits_this_week],
                ["Avg. progress", `${stats.avg_progress}%`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-bg2 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-silver-dim">{label}</div>
                <div className="mt-1 font-display text-2xl font-extrabold">{value}</div>
              </div>
            ))}
          </div>

          {projects.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-silver">
              No projects yet.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const [start, end] =
                  p.accent_start && p.accent_end ? [p.accent_start, p.accent_end] : DEFAULT_GRADIENT;
                const gradient = `linear-gradient(135deg, ${start}, ${end})`;
                const people = [...p.dev_members, ...p.client_work_members].slice(0, 3);
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-bg2 p-4 transition hover:border-white/15"
                  >
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: gradient }} />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-base font-bold">{p.name}</div>
                        <div className="mt-0.5 text-xs text-silver-dim">{p.client_name ?? "—"}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                          p.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${p.progress}%`, backgroundImage: gradient }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-silver">
                        {p.progress}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex">
                        {people.map((m) => (
                          <Avatar key={m.id} member={m} />
                        ))}
                      </div>
                      <span className="text-[11px] text-silver-dim">{timeAgo(p.last_activity_at)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `cd solura-eco/frontend && npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add "solura-eco/frontend/src/app/(app)/page.tsx"
git commit -m "Solura Eco frontend: project grid + KPI home page"
```

## Task 11: Project detail page + collaborative notepad

**Files:**
- Create: `solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx`
- Create: `solura-eco/frontend/src/components/NotesPanel.tsx`
- Create: `solura-eco/frontend/src/app/api/projects/[id]/notes/route.ts`

- [ ] **Step 1: Write the detail page**

```tsx
// solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

type Member = { id: string; full_name: string };
type DevEvent = { id: string; actor: string | null; message: string; url: string | null; occurred_at: string };
type ProjectDetail = {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  progress: number;
  github_repo: string | null;
  accent_start: string | null;
  accent_end: string | null;
  notes: string | null;
  dev_members: Member[];
  client_work_members: Member[];
  recent_events: DevEvent[];
};

const DEFAULT_GRADIENT: [string, string] = ["#38bdf8", "#818cf8"];

async function getProject(id: string, token: string | undefined): Promise<ProjectDetail | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  const res = await fetch(`${apiUrl}/projects/${id}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return (await res.json()) as ProjectDetail;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RoleList({ title, members }: { title: string; members: Member[] }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 text-[11px] font-semibold text-silver-dim">{title}</div>
      {members.length === 0 ? (
        <p className="text-xs italic text-silver-dim">Unassigned</p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg3 text-[10px] font-bold">
                {m.full_name.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-xs font-medium">{m.full_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const project = await getProject(id, token);

  if (!project) notFound();

  const [start, end] =
    project.accent_start && project.accent_end ? [project.accent_start, project.accent_end] : DEFAULT_GRADIENT;
  const gradient = `linear-gradient(135deg, ${start}, ${end})`;

  let lastDay = "";

  return (
    <div className="px-8 py-8">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-xs text-silver hover:text-white">
        ← All projects
      </Link>

      <div className="mb-6 flex items-start gap-3.5">
        <div className="h-11 w-11 shrink-0 rounded-xl" style={{ backgroundImage: gradient }} />
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">{project.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-silver">
            <span>{project.client_name ?? "—"}</span>
            {project.github_repo && (
              <>
                <span>·</span>
                <a
                  href={`https://github.com/${project.github_repo}`}
                  target="_blank"
                  className="text-silver-dim hover:text-white"
                >
                  {project.github_repo} ↗
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-4 text-xs font-bold uppercase tracking-wide text-silver-dim">Progress</div>
            <div className="flex items-center gap-3.5">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg3">
                <div className="h-full rounded-full" style={{ width: `${project.progress}%`, backgroundImage: gradient }} />
              </div>
              <div className="font-display text-xl font-extrabold tabular-nums">{project.progress}%</div>
            </div>
            <div className="mt-3.5 flex gap-6 border-t border-white/5 pt-3.5">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Status</div>
                <div className="mt-0.5 font-display text-sm font-bold capitalize">{project.status}</div>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Recent commits</div>
                <div className="mt-0.5 font-display text-sm font-bold">{project.recent_events.length}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Activity</div>
            {project.recent_events.length === 0 ? (
              <p className="text-sm text-silver">{project.github_repo ? "No commits yet." : "No repo linked."}</p>
            ) : (
              <div className="flex flex-col">
                {project.recent_events.map((e) => {
                  const day = formatDay(e.occurred_at);
                  const showDay = day !== lastDay;
                  lastDay = day;
                  return (
                    <div key={e.id}>
                      {showDay && (
                        <div className="mb-2 mt-3.5 text-[11px] font-bold uppercase tracking-wide text-silver-dim first:mt-0">
                          {day}
                        </div>
                      )}
                      <div className="flex gap-3 border-b border-white/5 py-2 last:border-0">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundImage: gradient }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-white">
                            {e.url ? (
                              <a href={e.url} target="_blank" className="hover:underline">
                                {e.message}
                              </a>
                            ) : (
                              e.message
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-silver-dim">
                            {e.actor && <b className="font-medium text-silver">{e.actor}</b>}
                            {e.actor && " · "}
                            {new Date(e.occurred_at).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-4 text-xs font-bold uppercase tracking-wide text-silver-dim">Roles</div>
            <RoleList title="Development" members={project.dev_members} />
            <RoleList title="Client work" members={project.client_work_members} />
          </div>

          {project.notes && (
            <div className="rounded-2xl border border-border bg-bg2 p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">About</div>
              <p className="text-[12.5px] leading-relaxed text-silver">{project.notes}</p>
            </div>
          )}

          <NotesPanel projectId={project.id} initialNotes={notes ?? []} />
        </div>
      </div>
    </div>
  );
}
```

Two things this references that aren't written yet, both added in this
same task: the `<NotesPanel>` component (Step 2 below) and a `notes`
variable — add this fetch to the top of the file, alongside the existing
imports and the `getProject` function:

```tsx
type Note = { id: string; body: string; author: string; created_at: string };
```

Add this type next to the other `type` declarations near the top of the
file (after `ProjectDetail`), and add this function next to `getProject`:

```tsx
async function getProjectNotes(id: string, token: string | undefined): Promise<Note[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/projects/${id}/notes`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Note[];
}
```

Then, inside the `ProjectPage` component, change:

```tsx
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const project = await getProject(id, token);

  if (!project) notFound();
```

to fetch notes in parallel with the project:

```tsx
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const [project, notes] = await Promise.all([getProject(id, token), getProjectNotes(id, token)]);

  if (!project) notFound();
```

Finally, add the import at the top of the file, alongside the existing ones:

```tsx
import { NotesPanel } from "@/components/NotesPanel";
```

- [ ] **Step 2: Create the `NotesPanel` client component**

```tsx
// solura-eco/frontend/src/components/NotesPanel.tsx
"use client";

import { useState, type FormEvent } from "react";

type Note = { id: string; body: string; author: string; created_at: string };

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotesPanel({ projectId, initialNotes }: { projectId: string; initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || submitting) return;

    setSubmitting(true);
    const res = await fetch(`/api/projects/${projectId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    setSubmitting(false);

    if (res.ok) {
      const note = (await res.json()) as Note;
      setNotes([note, ...notes]);
      setDraft("");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg2 p-5">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Notepad</div>

      <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Leave a thought, an idea, a heads-up for the others…"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-silver-dim focus:border-cyan"
        />
        <button
          type="submit"
          disabled={!draft.trim() || submitting}
          className="self-end rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {submitting ? "Adding…" : "Add note"}
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="text-xs italic text-silver-dim">No notes yet — be the first.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <div key={n.id} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-white">{n.body}</p>
              <p className="mt-1 text-[11px] text-silver-dim">
                <b className="font-medium text-silver">{n.author}</b> · {timeAgo(n.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

This posts to `/api/projects/[id]/notes`, a Next.js route handler — not
directly to the backend — for the same reason `/api/login` proxies rather
than the browser calling the backend directly: the browser has no way to
attach the `Authorization: Bearer` header the backend requires (that token
lives in an httpOnly cookie, unreadable from client JS by design). Step 3
adds that route handler.

- [ ] **Step 3: Create the route handler that proxies the POST to the backend**

```tsx
// solura-eco/frontend/src/app/api/projects/[id]/notes/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const body = await request.json();

  const res = await fetch(`${apiUrl}/projects/${id}/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return NextResponse.json({ error: detail.detail ?? "Failed to add note" }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
```

- [ ] **Step 4: Build to verify**

Run: `cd solura-eco/frontend && npm run build`
Expected: `✓ Compiled successfully`, route table now lists `/projects/[id]` and `/api/projects/[id]/notes`

- [ ] **Step 5: Commit**

```bash
git add "solura-eco/frontend/src/app/(app)/projects" solura-eco/frontend/src/components/NotesPanel.tsx solura-eco/frontend/src/app/api/projects
git commit -m "Solura Eco frontend: project detail page + collaborative notepad"
```

## Task 12: Seed real project details — colors, github_repo backfill, Athena AI

**Files:**
- Create: `solura-eco/backend/scripts/seed_project_details.py`

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""One-time backfill: real accent colors (sampled from each product's actual
code -- see the design spec's Part C table for exact sources) and github_repo
values for the projects seed_clients.py already created, plus adds Athena AI
(cano-ai-tutor) which didn't exist yet. Safe to re-run: upserts by name.
"""
from app.services.supabase_client import get_client

# name -> (github_repo, accent_start, accent_end)
PROJECT_DETAILS = {
    "Argus": ("psepse228/Argus", "#f01c52", "#c11249"),
    "Tender Agent": ("psepse228/tender-agent-app", "#38bdf8", "#818cf8"),
    "Cortège": (None, "#34d399", "#059669"),  # inferred, not sampled -- see spec Part C
    "solura-agency.com": ("psepse228/solura.agency", "#38bdf8", "#818cf8"),
}

ATHENA_AI = {
    "name": "Athena AI",
    "status": "active",
    "progress": 45,
    "github_repo": "psepse228/cano-ai-tutor",
    "accent_start": "#1e3a78",
    "accent_end": "#f5941d",
    "notes": "Formerly CANA AI Tutor. Current code branded for IHL (Interhouse Lyceum) -- colors sampled from that live branding.",
}


def main():
    db = get_client()

    for name, (github_repo, start, end) in PROJECT_DETAILS.items():
        existing = db.table("projects").select("id").eq("name", name).execute().data
        if not existing:
            print(f"skip (not found): {name}")
            continue
        project_id = existing[0]["id"]
        update = {"accent_start": start, "accent_end": end}
        if github_repo:
            update["github_repo"] = github_repo
        db.table("projects").update(update).eq("id", project_id).execute()
        print(f"updated: {name}")

    solura = db.table("clients").select("id").eq("name", "Solura").execute().data
    if not solura:
        print("ERROR: 'Solura' client not found -- run seed_clients.py first")
        return
    client_id = solura[0]["id"]

    existing_athena = (
        db.table("projects")
        .select("id")
        .eq("client_id", client_id)
        .eq("name", ATHENA_AI["name"])
        .execute()
        .data
    )
    if existing_athena:
        print("skip (already exists): Athena AI")
    else:
        db.table("projects").insert({**ATHENA_AI, "client_id": client_id}).execute()
        print("created: Athena AI")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe scripts/seed_project_details.py`
Expected: 4 `updated:` lines (Argus, Tender Agent, Cortège, solura-agency.com) and `created: Athena AI`

- [ ] **Step 3: Verify**

Run:
```bash
cd solura-eco/backend && .venv/Scripts/python.exe -c "
from app.services.supabase_client import get_client
db = get_client()
rows = db.table('projects').select('name,github_repo,accent_start,accent_end').execute().data
for r in rows:
    print(r)
"
```
Expected: 5 rows, each with `accent_start`/`accent_end` set, 4 of 5 with `github_repo` set (Cortège's stays `null`).

- [ ] **Step 4: Commit**

```bash
git add solura-eco/backend/scripts/seed_project_details.py
git commit -m "Solura Eco: seed real project colors, github_repo, Athena AI"
```

## Task 13: Register GitHub webhooks

**Files:**
- Create: `solura-eco/scripts/register_github_webhook.py`

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Register a GitHub webhook for push events, pointed at the deployed
backend's /webhooks/github. Uses the gh CLI (already authenticated) rather
than a raw token, so no GitHub credential needs to touch this script.

Usage: python scripts/register_github_webhook.py <owner/repo> <webhook-url> <secret>
Example:
  python scripts/register_github_webhook.py psepse228/Argus \
    https://backend-production-7694a.up.railway.app/webhooks/github \
    <same value as GITHUB_WEBHOOK_SECRET>
"""
import json
import subprocess
import sys


def main():
    if len(sys.argv) != 4:
        print(
            "Usage: python scripts/register_github_webhook.py <owner/repo> <webhook-url> <secret>",
            file=sys.stderr,
        )
        sys.exit(1)

    repo, webhook_url, secret = sys.argv[1], sys.argv[2], sys.argv[3]

    result = subprocess.run(
        [
            "gh", "api", f"repos/{repo}/hooks",
            "-f", "name=web",
            "-f", "active=true",
            "-f", "events[]=push",
            "-f", f"config[url]={webhook_url}",
            "-f", "config[content_type]=json",
            "-f", f"config[secret]={secret}",
        ],
        capture_output=True, text=True,
    )

    if result.returncode != 0:
        print(f"FAILED for {repo}: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    hook = json.loads(result.stdout)
    print(f"Registered webhook {hook['id']} on {repo} -> {webhook_url}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Register it for all 4 repos**

Run (substituting the real `GITHUB_WEBHOOK_SECRET` value from `solura-eco/backend/.env` — do not print it, just paste it into the command):

```bash
cd solura-eco
python scripts/register_github_webhook.py psepse228/Argus https://backend-production-7694a.up.railway.app/webhooks/github <secret>
python scripts/register_github_webhook.py psepse228/tender-agent-app https://backend-production-7694a.up.railway.app/webhooks/github <secret>
python scripts/register_github_webhook.py psepse228/cano-ai-tutor https://backend-production-7694a.up.railway.app/webhooks/github <secret>
python scripts/register_github_webhook.py psepse228/solura.agency https://backend-production-7694a.up.railway.app/webhooks/github <secret>
```

Expected: 4 lines of `Registered webhook <id> on <repo> -> ...`

- [ ] **Step 3: Commit (the script only)**

```bash
git add solura-eco/scripts/register_github_webhook.py
git commit -m "Solura Eco: script to register GitHub webhooks + register all 4 repos"
```

## Task 14: Manual verification — backend

**Files:** none (verification checkpoint)

- [ ] **Step 1: Confirm the deployed webhook endpoint rejects a bad signature**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://backend-production-7694a.up.railway.app/webhooks/github -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=wrong" -H "X-GitHub-Event: push" -d '{}'`
Expected: `401`

- [ ] **Step 2: Push a real commit to solura.agency and confirm it lands**

Push any small commit to `main` on this repo (e.g. this plan file's own commit from Task 13 counts). Then, using a real session token (from a real login, same pattern as the previous plan's Task 11):

```bash
curl -s https://backend-production-7694a.up.railway.app/projects -H "Authorization: Bearer <token>" | python -c "import sys,json; d=json.load(sys.stdin); print([p['name'] for p in d if p['last_activity_at']])"
```

Expected: includes `solura-agency.com` (or whichever project's repo you pushed to).

- [ ] **Step 3: Confirm `/projects/stats` returns real numbers**

Run: `curl -s https://backend-production-7694a.up.railway.app/projects/stats -H "Authorization: Bearer <token>"`
Expected: JSON with `active_projects`, `active_clients`, `commits_this_week`, `avg_progress` — not all zeros (given the seed data + the commit just pushed).

## Task 15: Deploy and end-to-end verify

**Files:** none (deployment + verification checkpoint)

- [ ] **Step 1: Push to main, confirm Railway auto-deploys**

The backend's Railway service is connected to `main` — pushing Task 1-14's commits triggers an automatic deploy. Check its status the same way as the previous plan's Task 19 (`mcp__railway__list_deployments`, `mcp__railway__get_logs`), or just re-run Task 14's curl checks against the live URL once the deploy shows `SUCCESS`.

- [ ] **Step 2: Confirm the frontend deploy picked up the changes**

Vercel auto-deploys on push to `main` too (already connected from the previous plan). Visit `https://solura-eco.vercel.app`, log in, confirm: the sidebar renders, the home page shows a project grid (not the old client-grouped list) with real accent colors, and clicking a project opens its detail page with real roles/activity/notes.

- [ ] **Step 3: Confirm the notepad actually works, from all 3 accounts**

On any project's detail page, add a note while logged in as each of the 3
real accounts in turn (log out, log back in as the next one). Confirm:
each note shows the correct author name (not "Unknown" or the wrong
person), newest note appears at the top, and a page refresh still shows
all of them (proving they persisted, not just local state).

- [ ] **Step 4: Assign real roles**

Using a real session token, set roles for at least Argus (matching what's actually true — ask Rizo/Jonik/Dior who's actually doing what if it's not already obvious):

```bash
curl -s -X PUT https://backend-production-7694a.up.railway.app/clients/projects/<argus-project-id>/roles \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"dev_member_ids": ["<member-id>"], "client_work_member_ids": ["<member-id>"]}'
```

(Get project/member IDs from `GET /projects` and the members table — no admin UI for this yet, direct API call is expected for v1.)

- [ ] **Step 5: Update the build plan**

In `solura-eco/docs/build-plan.md`, add a completed entry for this pass under item #2 (dev-activity — GitHub commits done, Vercel/Claude Code Remote still open) and note the roles/colors/notepad/IA additions to item #1. Commit:

```bash
git add solura-eco/docs/build-plan.md
git commit -m "Solura Eco: dev-activity (GitHub), roles, colors, projects-first IA shipped"
```
