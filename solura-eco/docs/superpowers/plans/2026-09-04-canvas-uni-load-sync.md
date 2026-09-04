# Canvas Uni-Load Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each member can paste their own Canvas personal access token, a Railway Cron job pulls their courses/assignments/submission-status every 30 minutes, and `/uni-load` shows the calling member their own upcoming assignments — no cross-member visibility.

**Architecture:** Three backend endpoints replace the `canvas.py` stub: `POST /canvas/token` (session-protected, verifies the token against Canvas before storing it Fernet-encrypted), `POST /canvas/sync` (shared-secret-protected, loops every member with a stored token, pulls courses → assignments → this member's submission status via the existing `CanvasClient`, upserts into the already-existing `courses`/`assignments`/`submissions` tables), `GET /canvas/my-assignments` (session-protected, reads the calling member's own synced rows only). Frontend gets one new page (`/uni-load`, two states: token form vs. assignment list) and one new proxy route (`POST /api/canvas/token`). No new migration — `0001_init.sql` already has every column and table this needs.

**Tech Stack:** FastAPI, supabase-py (PostgREST), `cryptography` (Fernet) — new dependency, httpx (already used by `CanvasClient`), Next.js 16 App Router Server Components + one client component, Railway Cron (new service, no code).

---

## File Structure

- Create: `solura-eco/backend/app/services/canvas_token_crypto.py` — pure Fernet encrypt/decrypt, key passed in (not read from settings internally) so it's unit-testable without touching real secrets.
- Create: `solura-eco/backend/tests/test_canvas_token_crypto.py` — TDD for the above.
- Modify: `solura-eco/backend/app/services/canvas_client.py` — add `get_submission(course_id, assignment_id)`.
- Modify: `solura-eco/backend/app/routers/canvas.py` — full rewrite: `POST /token`, `GET /my-assignments`, real `POST /sync`.
- Modify: `solura-eco/backend/app/config.py` — add `canvas_token_encryption_key`, `canvas_sync_secret`.
- Modify: `solura-eco/backend/requirements.txt` — add `cryptography`.
- Modify: `solura-eco/backend/.env.example` (if present) — document the two new env vars.
- Create: `solura-eco/frontend/src/app/api/canvas/token/route.ts` — proxy for the token-save form.
- Create: `solura-eco/frontend/src/components/CanvasTokenForm.tsx` — client component, the "no token yet" state.
- Create: `solura-eco/frontend/src/components/AssignmentList.tsx` — client-rendered-from-server-data list with status pills, the "token saved" state.
- Create: `solura-eco/frontend/src/app/(app)/uni-load/page.tsx` — server component, fetches `GET /canvas/my-assignments`, decides which state to render.
- Create: `solura-eco/frontend/src/app/(app)/uni-load/loading.tsx` — skeleton, matches `projects/[id]/loading.tsx`'s pattern.
- Modify: `solura-eco/frontend/src/components/Sidebar.tsx` — flip `/uni-load` from `live: false` to `live: true`.

---

### Task 1: Backend config + dependency

**Files:**
- Modify: `solura-eco/backend/requirements.txt`
- Modify: `solura-eco/backend/app/config.py`

- [ ] **Step 1: Add the new dependency**

Append to `solura-eco/backend/requirements.txt`:

```
cryptography==43.0.1
```

- [ ] **Step 2: Install it locally**

Run (from `solura-eco/backend`, using the repo's venv):
```bash
.venv/Scripts/python.exe -m pip install cryptography==43.0.1
```
Expected: `Successfully installed cryptography-43.0.1` (or already-satisfied if present).

- [ ] **Step 3: Add the two new settings**

In `solura-eco/backend/app/config.py`, inside `class Settings`, right after the existing `canvas_base_url` line (line 15):

```python
    canvas_token_encryption_key: str = os.getenv("CANVAS_TOKEN_ENCRYPTION_KEY", "")
    canvas_sync_secret: str = os.getenv("CANVAS_SYNC_SECRET", "")
```

- [ ] **Step 4: Document the two new env vars**

In `solura-eco/backend/.env.example`, after the existing `CANVAS_BASE_URL` line, add:

```
# Canvas token encryption (Fernet) -- generate with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
CANVAS_TOKEN_ENCRYPTION_KEY=

# Shared secret the Railway Cron service sends via the x-canvas-sync-secret
# header when calling POST /canvas/sync. Generate the same way as
# SESSION_SECRET; must match exactly what the Cron service's command uses.
CANVAS_SYNC_SECRET=
```

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/requirements.txt solura-eco/backend/app/config.py solura-eco/backend/.env.example
git commit -m "canvas: add cryptography dependency and new settings"
```

---

### Task 2: Token encryption — TDD

**Files:**
- Create: `solura-eco/backend/app/services/canvas_token_crypto.py`
- Test: `solura-eco/backend/tests/test_canvas_token_crypto.py`

- [ ] **Step 1: Write the failing tests**

Create `solura-eco/backend/tests/test_canvas_token_crypto.py`:

```python
import pytest
from cryptography.fernet import Fernet, InvalidToken

from app.services.canvas_token_crypto import decrypt_token, encrypt_token

TEST_KEY = Fernet.generate_key()


def test_round_trips_a_token():
    original = "canvas-token-abc123"
    encrypted = encrypt_token(original, TEST_KEY)
    assert encrypted != original.encode()
    assert decrypt_token(encrypted, TEST_KEY) == original


def test_encrypting_twice_produces_different_ciphertext():
    # Fernet includes a random component per encryption -- two encryptions
    # of the same plaintext must not be byte-identical.
    a = encrypt_token("same-token", TEST_KEY)
    b = encrypt_token("same-token", TEST_KEY)
    assert a != b


def test_wrong_key_fails_to_decrypt():
    encrypted = encrypt_token("secret", TEST_KEY)
    wrong_key = Fernet.generate_key()
    with pytest.raises(InvalidToken):
        decrypt_token(encrypted, wrong_key)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `solura-eco/backend`):
```bash
.venv/Scripts/python.exe -m pytest tests/test_canvas_token_crypto.py -v
```
Expected: FAIL/ERROR — `ModuleNotFoundError: No module named 'app.services.canvas_token_crypto'`.

- [ ] **Step 3: Write the implementation**

Create `solura-eco/backend/app/services/canvas_token_crypto.py`:

```python
"""Encrypts/decrypts Canvas personal access tokens for storage in
members.canvas_api_token_enc. Python-side Fernet, not Postgres's pgcrypto --
consistent with how every other secret in this app is handled (env var +
application code, not a DB-side crypto function awkward to call through
PostgREST). See docs/superpowers/specs/2026-09-04-canvas-uni-load-design.md.

Key is passed in rather than read from settings here, so this module stays
pure and testable without touching real secrets -- callers pass
`settings.canvas_token_encryption_key.encode()`.
"""
from cryptography.fernet import Fernet


def encrypt_token(plain: str, key: bytes) -> bytes:
    return Fernet(key).encrypt(plain.encode())


def decrypt_token(encrypted: bytes, key: bytes) -> str:
    return Fernet(key).decrypt(encrypted).decode()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
.venv/Scripts/python.exe -m pytest tests/test_canvas_token_crypto.py -v
```
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/services/canvas_token_crypto.py solura-eco/backend/tests/test_canvas_token_crypto.py
git commit -m "canvas: add Fernet token encryption, TDD"
```

---

### Task 3: CanvasClient — submission status

**Files:**
- Modify: `solura-eco/backend/app/services/canvas_client.py`

No unit test this task — `CanvasClient` is thin HTTP plumbing (per the spec's Testing section), verified manually in Task 6 against a real Canvas token.

- [ ] **Step 1: Add `get_submission`**

In `solura-eco/backend/app/services/canvas_client.py`, after `list_assignments` (end of file):

```python

    async def get_submission(self, course_id: int, assignment_id: int) -> dict:
        """The calling token owner's own submission for one assignment --
        `/submissions/self` is Canvas's shortcut for "whoever this token
        belongs to", no separate user-id lookup needed."""
        async with httpx.AsyncClient(headers=self._headers, timeout=30) as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/self"
            )
            resp.raise_for_status()
            return resp.json()
```

Also update the file's module docstring (lines 1-6) since it's no longer accurate — replace:

```python
"""Canvas LMS API client. See docs/canvas-api-notes.md for endpoint notes,
pagination, and rate-limit behavior.

Not wired to real tokens yet — this is the shape to fill in once a member's
Canvas token is stored (encrypted) in the members table.
"""
```

with:

```python
"""Canvas LMS API client. See docs/canvas-api-notes.md for endpoint notes,
pagination, and rate-limit behavior. Used by app/routers/canvas.py for both
token verification (get_self) and the sync job (courses, assignments,
submissions).
"""
```

- [ ] **Step 2: Commit**

```bash
git add solura-eco/backend/app/services/canvas_client.py
git commit -m "canvas: add get_submission to CanvasClient"
```

---

### Task 4: Canvas router — token save, sync, read

**Files:**
- Modify: `solura-eco/backend/app/routers/canvas.py` (full rewrite)

No unit test this task — this router is the integration point between already-tested pieces (`canvas_token_crypto`, `CanvasClient`, PostgREST); its correctness is verified end-to-end in Task 6 against real Canvas + real Supabase, matching how `telegram_business.py` and `clients.py` were handled.

- [ ] **Step 1: Replace the whole file**

Replace all of `solura-eco/backend/app/routers/canvas.py` with:

```python
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

    canvas_courses = await client.list_active_courses()
    for cc in canvas_courses:
        term = cc.get("term")
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
```

- [ ] **Step 2: Verify the app still imports cleanly**

Run (from `solura-eco/backend`):
```bash
.venv/Scripts/python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add solura-eco/backend/app/routers/canvas.py
git commit -m "canvas: implement token save, sync, and my-assignments endpoints"
```

---

### Task 5: Frontend — token form + proxy route

**Files:**
- Create: `solura-eco/frontend/src/app/api/canvas/token/route.ts`
- Create: `solura-eco/frontend/src/components/CanvasTokenForm.tsx`

- [ ] **Step 1: Create the proxy route**

Create `solura-eco/frontend/src/app/api/canvas/token/route.ts`:

```typescript
// solura-eco/frontend/src/app/api/canvas/token/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const token = (await cookies()).get("session")?.value;
  const body = await request.json();

  const res = await fetch(`${apiUrl}/canvas/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return NextResponse.json({ error: detail.detail ?? "Token verification failed" }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
```

- [ ] **Step 2: Create the form component**

Create `solura-eco/frontend/src/components/CanvasTokenForm.tsx`:

```typescript
// solura-eco/frontend/src/components/CanvasTokenForm.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function CanvasTokenForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token.trim() || saving) return;

    setSaving(true);
    setError(null);

    const res = await fetch("/api/canvas/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not verify this token");
      return;
    }

    router.refresh();
  }

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-bg2 p-6">
      <h2 className="font-display text-lg font-bold text-white">Connect Canvas</h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-silver">
        Paste a Canvas personal access token to see your own assignments here. Generate one at{" "}
        <a
          href="https://webster.instructure.com/profile/settings"
          target="_blank"
          className="text-cyan hover:underline"
        >
          Account → Settings → New Access Token
        </a>
        .
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Canvas access token"
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-white placeholder:text-silver-dim"
        />
        <button
          type="submit"
          disabled={!token.trim() || saving}
          className="self-end rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {saving ? "Verifying…" : "Save token"}
        </button>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add solura-eco/frontend/src/app/api/canvas/token/route.ts solura-eco/frontend/src/components/CanvasTokenForm.tsx
git commit -m "canvas: token entry form + proxy route"
```

---

### Task 6: Frontend — assignment list, page, sidebar link

**Files:**
- Create: `solura-eco/frontend/src/components/AssignmentList.tsx`
- Create: `solura-eco/frontend/src/app/(app)/uni-load/page.tsx`
- Create: `solura-eco/frontend/src/app/(app)/uni-load/loading.tsx`
- Modify: `solura-eco/frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Create the assignment list component**

Create `solura-eco/frontend/src/components/AssignmentList.tsx`:

```typescript
// solura-eco/frontend/src/components/AssignmentList.tsx
type Assignment = {
  id: string;
  name: string;
  course_name: string | null;
  due_at: string | null;
  html_url: string | null;
  status: string;
};

function statusPill(status: string, overdue: boolean) {
  if (overdue) {
    return "bg-red-500/15 text-red-400";
  }
  if (status === "graded" || status === "submitted") {
    return "bg-cyan/15 text-cyan";
  }
  return "bg-white/10 text-silver";
}

function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AssignmentList({ assignments }: { assignments: Assignment[] }) {
  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg2 p-8 text-center">
        <p className="text-sm text-silver">No assignments synced yet — check back after the next sync.</p>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-2">
      {assignments.map((a) => {
        const overdue = a.status === "no submission yet" && !!a.due_at && new Date(a.due_at).getTime() < now;
        return (
          <div
            key={a.id}
            className="animate-fade-in-up flex items-center justify-between gap-3 rounded-lg border border-border bg-bg2 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-white">
                {a.html_url ? (
                  <a href={a.html_url} target="_blank" className="hover:underline">
                    {a.name}
                  </a>
                ) : (
                  a.name
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-silver-dim">
                {a.course_name ?? "—"} · {formatDue(a.due_at)}
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusPill(a.status, overdue)}`}>
              {overdue ? "overdue" : a.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `solura-eco/frontend/src/app/(app)/uni-load/page.tsx`:

```typescript
// solura-eco/frontend/src/app/(app)/uni-load/page.tsx
import { cookies } from "next/headers";

import { AssignmentList } from "@/components/AssignmentList";
import { CanvasTokenForm } from "@/components/CanvasTokenForm";

type Assignment = {
  id: string;
  name: string;
  course_name: string | null;
  due_at: string | null;
  html_url: string | null;
  status: string;
};
type MyAssignmentsResponse = { has_token: boolean; assignments: Assignment[] };

async function getMyAssignments(token: string | undefined): Promise<MyAssignmentsResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return { has_token: false, assignments: [] };
  const res = await fetch(`${apiUrl}/canvas/my-assignments`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return { has_token: false, assignments: [] };
  return (await res.json()) as MyAssignmentsResponse;
}

export default async function UniLoadPage() {
  const token = (await cookies()).get("session")?.value;
  const { has_token, assignments } = await getMyAssignments(token);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-5 font-display text-2xl font-extrabold tracking-tight text-white">Uni load</h1>

      {!has_token ? <CanvasTokenForm /> : <AssignmentList assignments={assignments} />}
    </div>
  );
}
```

- [ ] **Step 3: Create the loading skeleton**

Look at `solura-eco/frontend/src/app/(app)/projects/[id]/loading.tsx` first to match its style, then create `solura-eco/frontend/src/app/(app)/uni-load/loading.tsx`:

```typescript
// solura-eco/frontend/src/app/(app)/uni-load/loading.tsx
export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="mb-5 h-8 w-40 animate-pulse rounded-lg bg-bg2" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-lg border border-border bg-bg2" />
        ))}
      </div>
    </div>
  );
}
```

(If the existing `projects/[id]/loading.tsx` uses a different pulse/skeleton convention, match that convention instead of the above — consistency with the established pattern matters more than this exact markup.)

- [ ] **Step 4: Flip the sidebar link live**

In `solura-eco/frontend/src/components/Sidebar.tsx`, change:

```typescript
  { href: "/uni-load", label: "Uni load", live: false },
```

to:

```typescript
  { href: "/uni-load", label: "Uni load", live: true },
```

And update the comment above `NAV_ITEMS` (currently says `"Projects" is the only live route this pass`) to reflect that Uni load is now also live — read the current comment and adjust it to stay accurate, don't leave a stale claim.

- [ ] **Step 5: Commit**

```bash
git add solura-eco/frontend/src/components/AssignmentList.tsx solura-eco/frontend/src/app/(app)/uni-load solura-eco/frontend/src/components/Sidebar.tsx
git commit -m "canvas: uni-load page, assignment list, live sidebar link"
```

---

### Task 7: Secrets, Railway Cron, and live verification (orchestrator only — not a subagent task)

This task touches real secrets and real infrastructure — done directly, not delegated, per this project's established discipline (secrets are never printed or handed to a subagent).

- [ ] **Step 1: Generate `CANVAS_TOKEN_ENCRYPTION_KEY` and `CANVAS_SYNC_SECRET`**

Generate both locally without printing them to any subagent-visible output:
```bash
.venv/Scripts/python.exe -c "from cryptography.fernet import Fernet; import secrets; open('_canvas_secrets.txt','w').write(Fernet.generate_key().decode()+'\n'+secrets.token_urlsafe(32))"
```
Read the two lines from `_canvas_secrets.txt` directly (not via a tool call that echoes it into a transcript another agent could see), set them as Railway env vars on the backend service, then delete the scratch file:
```bash
rm _canvas_secrets.txt
```

- [ ] **Step 2: Deploy the backend, confirm it starts**

Push the merged branch, wait for Railway's auto-deploy, then:
```bash
curl -s https://backend-production-7694a.up.railway.app/health
```
Expected: `{"status":"ok"}`.

- [ ] **Step 3: Create the Railway Cron service**

New service in the same "Solura eco" Railway project, type Cron, schedule `*/30 * * * *`, command:
```bash
curl -s -X POST https://backend-production-7694a.up.railway.app/canvas/sync -H "x-canvas-sync-secret: $CANVAS_SYNC_SECRET"
```
with `CANVAS_SYNC_SECRET` set as that service's own env var (same value as the backend's).

- [ ] **Step 4: Real end-to-end verification**

Log in to the deployed frontend as one real member, go to `/uni-load`, paste a real Canvas personal access token, confirm it saves (no error shown). Manually trigger one sync (`curl -X POST .../canvas/sync -H "x-canvas-sync-secret: <secret>"`) rather than waiting for the schedule, then reload `/uni-load` and confirm real assignments appear with correct course names, due dates, and submission status matching what Canvas itself shows for that account.

- [ ] **Step 5: Update the build plan**

In `solura-eco/docs/build-plan.md`, replace the "## 4. Canvas sync — uni load" section's current "partially scaffolded" status with a shipped summary matching the style of sections 1/3/5 (what's built, what was verified, any known limitations e.g. Webster's Canvas instance-specific quirks from `canvas-api-notes.md` if any surfaced during verification).

- [ ] **Step 6: Commit**

```bash
git add solura-eco/docs/build-plan.md
git commit -m "docs: mark Canvas uni-load sync shipped"
```

---

## Self-Review Notes

- **Spec coverage:** self-service token entry + verify-before-store (Task 4, `/token`) ✓; Fernet encryption keyed by new env var (Task 2) ✓; Railway Cron every 30 min calling `/canvas/sync` (Task 7) ✓; shared-secret auth via header, `hmac.compare_digest` (Task 4, `_verify_sync_secret`) ✓; per-member try/except isolation (Task 4, `sync_all_members`) ✓; `/my-assignments` strictly own data, no `member_id` param (Task 4) ✓; frontend two-state page (Task 6) ✓; error handling — 400 with real Canvas error (Task 4 `/token`), empty list not 404 for no-token (Task 4 `/my-assignments` + Task 6 `has_token` flag) ✓.
- **Deviation from spec, deliberate:** the spec sketched `POST /me/canvas-token` as the route name; implemented as `POST /token` under the router's existing `/canvas` prefix (final path `POST /canvas/token`) to avoid a redundant `/canvas/me/canvas-token` path — same behavior, cleaner URL, noted here rather than silently diverging.
- **`has_token` flag:** the spec left open exactly how the frontend distinguishes "no token saved" from "token saved but zero courses synced yet" (both return an empty assignments list). Resolved by adding a `has_token` boolean to `GET /canvas/my-assignments`'s response — computed from the same row already being read, no extra query.
