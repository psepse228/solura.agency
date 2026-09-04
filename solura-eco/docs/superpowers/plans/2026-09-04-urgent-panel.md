# Sidebar Urgent Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sidebar's empty space below the nav shows an at-a-glance list of what needs attention: the viewer's own soon-due/overdue Canvas work, projects gone quiet, and clients with a fresh message.

**Architecture:** One new pure function (`is_stale`/`days_since_activity`, TDD'd) backs the stale-project computation. One new backend endpoint, `GET /me/urgent`, merges three DB-only queries (no live Canvas calls) into one capped, sorted response. `AppLayout` (already a Server Component fetching the session) fetches it once and passes it down to `Sidebar` as a prop; a new `UrgentPanel` client-free component renders the list.

**Tech Stack:** Same as the rest of this session — FastAPI, supabase-py, Next.js 16 Server Components.

---

## File Structure

- Create: `solura-eco/backend/app/services/staleness.py`
- Create: `solura-eco/backend/tests/services/test_staleness.py`
- Create: `solura-eco/backend/app/routers/me.py`
- Modify: `solura-eco/backend/app/main.py` — mount the new router.
- Create: `solura-eco/frontend/src/components/UrgentPanel.tsx`
- Modify: `solura-eco/frontend/src/components/Sidebar.tsx` — accept and render the urgent list.
- Modify: `solura-eco/frontend/src/app/(app)/layout.tsx` — fetch `/me/urgent`, pass to `Sidebar`.

---

### Task 1: Staleness computation — TDD

**Files:**
- Create: `solura-eco/backend/app/services/staleness.py`
- Test: `solura-eco/backend/tests/services/test_staleness.py`

- [ ] **Step 1: Write the failing tests**

Create `solura-eco/backend/tests/services/test_staleness.py`:

```python
from datetime import datetime, timedelta, timezone

from app.services.staleness import days_since_activity, is_stale

NOW = datetime(2026, 9, 4, 12, 0, 0, tzinfo=timezone.utc)


def test_days_since_activity_is_none_when_never_active():
    assert days_since_activity(None, NOW) is None


def test_days_since_activity_computes_whole_days():
    three_days_ago = NOW - timedelta(days=3)
    assert days_since_activity(three_days_ago, NOW) == 3


def test_days_since_activity_rounds_down_for_partial_days():
    almost_two_days = NOW - timedelta(days=1, hours=23)
    assert days_since_activity(almost_two_days, NOW) == 1


def test_is_stale_true_when_never_active():
    assert is_stale(None) is True


def test_is_stale_false_below_threshold():
    assert is_stale(6) is False


def test_is_stale_true_at_threshold():
    assert is_stale(7) is True


def test_is_stale_respects_custom_threshold():
    assert is_stale(3, threshold_days=3) is True
    assert is_stale(2, threshold_days=3) is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `solura-eco/backend`):
```bash
.venv/Scripts/python.exe -m pytest tests/services/test_staleness.py -v
```
Expected: FAIL/ERROR — `ModuleNotFoundError: No module named 'app.services.staleness'`.

- [ ] **Step 3: Write the implementation**

Create `solura-eco/backend/app/services/staleness.py`:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
.venv/Scripts/python.exe -m pytest tests/services/test_staleness.py -v
```
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/services/staleness.py solura-eco/backend/tests/services/test_staleness.py
git commit -m "urgent-panel: staleness computation, TDD"
```

(Append `\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` to the commit message.)

---

### Task 2: GET /me/urgent

**Files:**
- Create: `solura-eco/backend/app/routers/me.py`
- Modify: `solura-eco/backend/app/main.py`

No unit test this task -- integration-level router code (three DB queries
merged into one response), same reasoning as every other router this
session; verified manually in Task 4.

- [ ] **Step 1: Write the router**

Create `solura-eco/backend/app/routers/me.py`:

```python
"""Cross-cutting "what needs attention" endpoint for the sidebar urgent
panel. Merges three DB-only sources (no live Canvas calls) into one
capped, sorted response. See
docs/superpowers/specs/2026-09-04-urgent-panel-design.md.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.auth.deps import require_session
from app.services.staleness import days_since_activity, is_stale
from app.services.supabase_client import get_client

router = APIRouter()

CANVAS_DUE_SOON_HOURS = 48
STALE_PROJECT_DAYS = 7
FRESH_MESSAGE_HOURS = 24
MAX_ITEMS_PER_SOURCE = 5


def _canvas_deadlines(db, member_id: str, now: datetime) -> list[dict]:
    """The calling member's own assignments due within CANVAS_DUE_SOON_HOURS
    or already overdue, excluding anything already submitted/graded."""
    courses = db.table("courses").select("id,name").eq("member_id", member_id).execute().data
    course_ids = [c["id"] for c in courses]
    if not course_ids:
        return []
    course_names = {c["id"]: c["name"] for c in courses}

    cutoff = (now + timedelta(hours=CANVAS_DUE_SOON_HOURS)).isoformat()
    assignments = (
        db.table("assignments")
        .select("id,course_id,name,due_at,html_url")
        .in_("course_id", course_ids)
        .not_.is_("due_at", "null")
        .lte("due_at", cutoff)
        .order("due_at")
        .execute()
        .data
    )
    if not assignments:
        return []
    assignment_ids = [a["id"] for a in assignments]

    submissions = (
        db.table("submissions")
        .select("assignment_id,workflow_state")
        .eq("member_id", member_id)
        .in_("assignment_id", assignment_ids)
        .execute()
        .data
    )
    status_by_assignment = {s["assignment_id"]: s["workflow_state"] for s in submissions}

    out = []
    for a in assignments:
        status = status_by_assignment.get(a["id"]) or "no submission yet"
        if status in ("graded", "submitted"):
            continue
        due_dt = datetime.fromisoformat(a["due_at"])
        out.append(
            {
                "id": a["id"],
                "name": a["name"],
                "course_name": course_names.get(a["course_id"]),
                "due_at": a["due_at"],
                "html_url": a["html_url"],
                "overdue": due_dt < now,
            }
        )
    return out[:MAX_ITEMS_PER_SOURCE]


def _stale_projects(db, now: datetime) -> list[dict]:
    """Active, repo-linked projects with no commit in STALE_PROJECT_DAYS
    days, or none ever -- team-wide, not per-member."""
    projects = (
        db.table("projects")
        .select("id,name")
        .eq("status", "active")
        .not_.is_("github_repo", "null")
        .execute()
        .data
    )
    if not projects:
        return []
    project_ids = [p["id"] for p in projects]

    events = (
        db.table("dev_events")
        .select("project_id,occurred_at")
        .in_("project_id", project_ids)
        .order("occurred_at", desc=True)
        .execute()
        .data
    )
    # events is already newest-first, so the first row seen per project_id
    # is that project's most recent activity.
    latest_by_project: dict[str, str] = {}
    for e in events:
        latest_by_project.setdefault(e["project_id"], e["occurred_at"])

    out = []
    for p in projects:
        last_iso = latest_by_project.get(p["id"])
        last_dt = datetime.fromisoformat(last_iso) if last_iso else None
        days = days_since_activity(last_dt, now)
        if is_stale(days, STALE_PROJECT_DAYS):
            out.append({"id": p["id"], "name": p["name"], "days_since_activity": days})

    # None (never active) sorts as the most-stale, ahead of any real number.
    out.sort(key=lambda x: x["days_since_activity"] if x["days_since_activity"] is not None else 10**9, reverse=True)
    return out[:MAX_ITEMS_PER_SOURCE]


def _client_messages(db, now: datetime) -> list[dict]:
    """Conversations with a new inbound message in the last
    FRESH_MESSAGE_HOURS hours -- an honest "something new here" signal, not
    a claim about whether anyone replied (this integration never tracks a
    reply event at all, see the design doc). Team-wide."""
    cutoff = (now - timedelta(hours=FRESH_MESSAGE_HOURS)).isoformat()
    rows = (
        db.table("telegram_conversations")
        .select("id,client_id,last_message_at,clients!inner(name)")
        .not_.is_("last_message_at", "null")
        .gte("last_message_at", cutoff)
        .order("last_message_at", desc=True)
        .limit(MAX_ITEMS_PER_SOURCE)
        .execute()
        .data
    )
    out = []
    for r in rows:
        client = r.get("clients") or {}
        out.append(
            {
                "id": r["id"],
                "client_id": r["client_id"],
                "client_name": client.get("name"),
                "last_message_at": r["last_message_at"],
            }
        )
    return out


@router.get("/urgent")
async def urgent(session: dict = Depends(require_session)):
    db = get_client()
    now = datetime.now(timezone.utc)
    return {
        "canvas_deadlines": _canvas_deadlines(db, session["member_id"], now),
        "stale_projects": _stale_projects(db, now),
        "client_messages": _client_messages(db, now),
    }
```

- [ ] **Step 2: Mount the router**

In `solura-eco/backend/app/main.py`, change the import line:

```python
from app.routers import auth, canvas, clients, documents, members, projects, tasks, telegram_business, webhooks
```

to:

```python
from app.routers import auth, canvas, clients, documents, me, members, projects, tasks, telegram_business, webhooks
```

and after the `app.include_router(auth.router, ...)` line, add:

```python
app.include_router(me.router, prefix="/me", tags=["me"])
```

- [ ] **Step 3: Verify the app still imports cleanly**

Run (from `solura-eco/backend`):
```bash
.venv/Scripts/python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add solura-eco/backend/app/routers/me.py solura-eco/backend/app/main.py
git commit -m "urgent-panel: GET /me/urgent"
```

(Append `\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` to the commit message.)

---

### Task 3: Frontend — UrgentPanel + wire into layout

**Files:**
- Create: `solura-eco/frontend/src/components/UrgentPanel.tsx`
- Modify: `solura-eco/frontend/src/components/Sidebar.tsx`
- Modify: `solura-eco/frontend/src/app/(app)/layout.tsx`

- [ ] **Step 1: Create the panel component**

Read `solura-eco/frontend/src/components/Sidebar.tsx` first (its current
contents are also shown in full in Step 2 below) to match its exact
styling conventions, then create
`solura-eco/frontend/src/components/UrgentPanel.tsx`:

```typescript
// solura-eco/frontend/src/components/UrgentPanel.tsx
type CanvasDeadline = {
  id: string;
  name: string;
  course_name: string | null;
  due_at: string;
  html_url: string | null;
  overdue: boolean;
};
type StaleProject = {
  id: string;
  name: string;
  days_since_activity: number | null;
};
type ClientMessage = {
  id: string;
  client_id: string;
  client_name: string | null;
  last_message_at: string;
};
export type UrgentData = {
  canvas_deadlines: CanvasDeadline[];
  stale_projects: StaleProject[];
  client_messages: ClientMessage[];
};

type Row = {
  key: string;
  label: string;
  sub: string;
  href: string;
  external: boolean;
  dot: string; // tailwind bg-* class
  sortAt: number; // epoch ms, most-urgent-first
};

function formatRelativeDue(iso: string, overdue: boolean): string {
  const diffMs = Math.abs(new Date(iso).getTime() - Date.now());
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  const unit = hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
  return overdue ? `${unit} overdue` : `due in ${unit}`;
}

function formatRelativePast(iso: string): string {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60));
  return hours < 1 ? "just now" : hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function UrgentPanel({ data }: { data: UrgentData }) {
  const rows: Row[] = [];

  for (const a of data.canvas_deadlines) {
    rows.push({
      key: `canvas-${a.id}`,
      label: a.name,
      sub: `${a.course_name ?? "Canvas"} · ${formatRelativeDue(a.due_at, a.overdue)}`,
      href: a.html_url ?? "/uni-load",
      external: !!a.html_url,
      dot: a.overdue ? "bg-red-400" : "bg-amber-400",
      sortAt: a.overdue ? -Infinity : new Date(a.due_at).getTime(),
    });
  }

  for (const p of data.stale_projects) {
    const days = p.days_since_activity;
    rows.push({
      key: `project-${p.id}`,
      label: p.name,
      sub: days === null ? "no activity yet" : `${days}d quiet`,
      href: `/projects/${p.id}`,
      external: false,
      dot: days === null || days >= 14 ? "bg-red-400" : "bg-amber-400",
      sortAt: -(days ?? 999999),
    });
  }

  for (const m of data.client_messages) {
    rows.push({
      key: `client-${m.id}`,
      label: m.client_name ?? "Unknown client",
      sub: `new message · ${formatRelativePast(m.last_message_at)}`,
      href: `/clients/${m.client_id}`,
      external: false,
      dot: "bg-amber-400",
      sortAt: new Date(m.last_message_at).getTime(),
    });
  }

  if (rows.length === 0) return null;

  rows.sort((a, b) => a.sortAt - b.sortAt);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2.5 text-[10.5px] font-bold uppercase tracking-wide text-silver-dim">Urgent</div>
      {rows.map((r) => (
        <a
          key={r.key}
          href={r.href}
          target={r.external ? "_blank" : undefined}
          className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12px] hover:bg-bg3"
        >
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${r.dot}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-white">{r.label}</span>
            <span className="block truncate text-[10.5px] text-silver-dim">{r.sub}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire into Sidebar**

Read `solura-eco/frontend/src/components/Sidebar.tsx` in full before
editing (needed to place the new panel correctly between the nav and the
footer). Replace its full contents with:

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { UrgentPanel, type UrgentData } from "@/components/UrgentPanel";

// "Projects" and "Uni load" are the only live routes this pass -- the rest
// are the real, named upcoming build-order sections (architecture.md),
// rendered as visible-but-inert so the platform's intended shape is honest,
// not decorative filler.
const NAV_ITEMS = [
  { href: "/", label: "Projects", live: true },
  { href: "/clients", label: "Clients", live: false },
  { href: "/uni-load", label: "Uni load", live: true },
  { href: "/docs", label: "Docs & КП", live: false },
  { href: "/leads", label: "Leads", live: false },
];

export function Sidebar({ username, urgent }: { username: string; urgent: UrgentData | null }) {
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

      {urgent && <UrgentPanel data={urgent} />}

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

- [ ] **Step 3: Fetch urgent data in the layout**

Replace `solura-eco/frontend/src/app/(app)/layout.tsx` with:

```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/Sidebar";
import type { UrgentData } from "@/components/UrgentPanel";
import { verifySessionToken } from "@/lib/session";

async function getUrgent(token: string | undefined): Promise<UrgentData | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl || !token) return null;
  try {
    const res = await fetch(`${apiUrl}/me/urgent`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as UrgentData;
  } catch {
    // A network hiccup here should never block the whole app shell from
    // rendering -- the panel just silently doesn't show, same as the
    // empty-state case.
    return null;
  }
}

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

  const urgent = await getUrgent(token);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar username={session.username} urgent={urgent} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run (from `solura-eco/frontend`):
```bash
npx tsc --noEmit
```
Expected: no output, no errors.

- [ ] **Step 5: Commit**

```bash
git add solura-eco/frontend/src/components/UrgentPanel.tsx solura-eco/frontend/src/components/Sidebar.tsx "solura-eco/frontend/src/app/(app)/layout.tsx"
git commit -m "urgent-panel: sidebar UrgentPanel, wired through layout"
```

(Append `\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` to the commit message.)

---

### Task 4: Deploy + real verification (orchestrator only, not a subagent task)

- [ ] **Step 1: Push, wait for Railway/Vercel auto-deploy, confirm health**

```bash
curl -s https://backend-production-7694a.up.railway.app/health
```
Expected: `{"status":"ok"}`.

- [ ] **Step 2: Confirm the endpoint returns real data**

Hit `GET /me/urgent` with a real session token (Bearer header) and
confirm it returns `200` with the three-key shape, populated with real
Canvas deadlines (if any are due soon) and/or real stale projects --
`client_messages` will be empty until Telegram is connected, which is
expected, not a bug.

- [ ] **Step 3: Visual check**

Load any page in the app while logged in and confirm the sidebar shows
the Urgent section when there's real urgent data, and shows nothing extra
(no empty placeholder) when there isn't.

- [ ] **Step 4: Update the build plan**

Add a short new bullet/section to `solura-eco/docs/build-plan.md` noting
the sidebar urgent panel shipped -- this isn't one of the five numbered
build-order items, so add it as a small standalone note near the top or
bottom of the file (read the file first to pick a natural spot,
consistent with its existing structure) rather than force-fitting it into
one of the five sections.

- [ ] **Step 5: Commit**

```bash
git add solura-eco/docs/build-plan.md
git commit -m "docs: note sidebar urgent panel shipped"
```

(Append `\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` to the commit message.)

---

## Self-Review Notes

- **Spec coverage:** three sources (Canvas deadlines, stale projects,
  fresh client messages) ✓; capped at 5 each, sorted urgency-first ✓;
  team-wide vs per-member scoping matches the spec exactly (Canvas is
  per-member via `session["member_id"]`, the other two ignore it) ✓;
  panel hides entirely when empty (both the "no urgent items" case in
  `UrgentPanel` and the "/me/urgent fails" case in `layout.tsx`, both
  return/render nothing rather than a placeholder) ✓; inner join (not
  left join) on `clients` so a conversation whose client was deleted is
  excluded, not shown as "Unknown client" from a null join -- implemented
  via `clients!inner(name)` ✓.
- **Placeholder scan:** no TBD/TODO markers; the row-building code
  computes each row's full sub-label upfront (`formatRelativeDue`/
  `formatRelativePast`) rather than trying to reconstruct it at render
  time, avoiding the kind of unreachable-branch bug the original Canvas
  plan's `AssignmentList` had before its review caught it.
- **Type consistency:** `UrgentData`/`CanvasDeadline`/`StaleProject`/
  `ClientMessage` types in `UrgentPanel.tsx` match `GET /me/urgent`'s
  response shape from `me.py` field-for-field. `Sidebar`'s new `urgent`
  prop type (`UrgentData | null`) matches what `layout.tsx`'s `getUrgent`
  returns.
