# Finish the Clients/Projects View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working-but-open, empty, undeployed Clients/Projects view into something Rizo, Jonik, and Dior can actually use daily — gated by 3 real logins, deployed on Railway + Vercel, seeded with real client data, and reskinned to match solura-agency.com.

**Architecture:** Backend (FastAPI) issues a signed session token in the exact `base64url(payload).hex(hmac)` format Cortège/Tender Agent already share, and accepts it via `Authorization: Bearer` header (primary) or `session` cookie (fallback). The Next.js frontend's `proxy.ts` does an *optimistic* edge check (valid signature present → let the request through; real authorization stays server-side per Next's own guidance), a `/api/login` Route Handler proxies credentials to the backend and sets the token as a first-party cookie (required because Vercel and Railway are different domains — a `Set-Cookie` from the Railway response can't be stored as first-party on the Vercel domain), and Server Components read that cookie via `cookies()` and forward it as a Bearer header when calling the backend (works regardless of domain, sidesteps cross-site cookie rules entirely).

**Tech Stack:** FastAPI, Supabase (Postgres + supabase-py), bcrypt, pytest; Next.js 16 (App Router, `proxy.ts` — Next 16 renamed `middleware.ts`), Tailwind v4 (CSS-first `@theme`), Web Crypto (`crypto.subtle`) for edge-compatible HMAC verification; Railway + Vercel for deployment.

---

## Before you start

Two secrets this plan needs that must **never** be written into any file that gets committed:
- `SUPABASE_DB_PASSWORD` — the Postgres password for `djtdvxtfhqhbqsymzkyq` (Settings → Database on the Supabase dashboard). Export it as an env var in your shell before Task 2, don't paste it into a file.
- The 3 generated member passwords from Task 7 — printed to stdout only, given to Rizo/Jonik/Dior directly, never committed.

## Task 1: Reusable migration-apply script

Formalizes the ad-hoc approach already used for `0001`–`0003` so future migrations (and this plan's `0004`) don't need one-off scratchpad scripts.

**Files:**
- Create: `solura-eco/scripts/apply_migration.py`
- Create: `solura-eco/scripts/requirements.txt`

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Apply a Solura Eco SQL migration file directly against Postgres.

Usage: python scripts/apply_migration.py <path/to/migration.sql>

Reads DB-level connection info from env vars — separate from the backend's
own SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (those are for PostgREST/the
supabase-py client; this needs a real Postgres connection to run DDL,
which PostgREST can't do):
  SUPABASE_DB_HOST      e.g. db.djtdvxtfhqhbqsymzkyq.supabase.co
  SUPABASE_DB_PASSWORD  Postgres password (Settings -> Database on the
                         Supabase dashboard) -- NOT the service-role key
"""
import os
import sys

import psycopg2


def main():
    if len(sys.argv) != 2:
        print("Usage: python scripts/apply_migration.py <path/to/migration.sql>", file=sys.stderr)
        sys.exit(1)

    host = os.environ["SUPABASE_DB_HOST"]
    password = os.environ["SUPABASE_DB_PASSWORD"]
    path = sys.argv[1]

    conn = psycopg2.connect(
        host=host, port=5432, dbname="postgres", user="postgres",
        password=password, sslmode="require", connect_timeout=15,
    )
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            with open(path, "r", encoding="utf-8") as f:
                cur.execute(f.read())
        conn.commit()
        print(f"Applied: {path}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
```

```text
psycopg2-binary==2.9.10
```

- [ ] **Step 2: Install its one dependency into the backend venv (shared, avoids a second venv)**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pip install -r ../scripts/requirements.txt`
Expected: installs cleanly (already installed if Task 1 of the earlier session ran — `pip install` is idempotent either way)

- [ ] **Step 3: Commit**

```bash
git add solura-eco/scripts/apply_migration.py solura-eco/scripts/requirements.txt
git commit -m "Solura Eco: add reusable migration-apply script"
```

## Task 2: Migration 0004 — auth columns on members

**Files:**
- Create: `solura-eco/supabase/migrations/0004_auth.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Solura Eco — auth columns on members.
-- Three real logins (not Supabase Auth/OAuth, not a shared password) --
-- see docs/superpowers/specs/2026-09-03-finish-clients-projects-view-design.md.
-- Nullable for now: seeding (0004 companion script) fills them in immediately
-- after this runs; NOT NULL would make this migration fail if members already
-- has rows from Canvas-only usage that predate login.

alter table solura_eco.members
  add column if not exists username text unique,
  add column if not exists password_hash text;
```

- [ ] **Step 2: Apply it**

Run (with `SUPABASE_DB_HOST` and `SUPABASE_DB_PASSWORD` exported in your shell first, not written to any file):

```bash
cd solura-eco
python scripts/apply_migration.py supabase/migrations/0004_auth.sql
```

Expected: `Applied: supabase/migrations/0004_auth.sql`

- [ ] **Step 3: Commit**

```bash
git add solura-eco/supabase/migrations/0004_auth.sql
git commit -m "Solura Eco: migration 0004 - username/password_hash on members"
```

## Task 3: Backend auth dependencies

**Files:**
- Modify: `solura-eco/backend/requirements.txt`

- [ ] **Step 1: Add bcrypt**

Append to `solura-eco/backend/requirements.txt`:

```text
bcrypt==4.2.1
```

- [ ] **Step 2: Add a dev-only requirements file for tests**

Create `solura-eco/backend/requirements-dev.txt`:

```text
-r requirements.txt
pytest==8.3.3
```

- [ ] **Step 3: Install**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pip install -r requirements-dev.txt`
Expected: installs `bcrypt` and `pytest` with no errors

- [ ] **Step 4: Commit**

```bash
git add solura-eco/backend/requirements.txt solura-eco/backend/requirements-dev.txt
git commit -m "Solura Eco: add bcrypt + pytest to backend deps"
```

## Task 4: `passwords.py` — hash/verify

**Files:**
- Create: `solura-eco/backend/app/auth/__init__.py`
- Create: `solura-eco/backend/app/auth/passwords.py`
- Test: `solura-eco/backend/tests/auth/test_passwords.py`

- [ ] **Step 1: Write the failing test**

Create `solura-eco/backend/tests/__init__.py` (empty) and `solura-eco/backend/tests/auth/__init__.py` (empty), then:

```python
# solura-eco/backend/tests/auth/test_passwords.py
from app.auth.passwords import hash_password, verify_password


def test_verify_password_matches_correct_plaintext():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed)


def test_verify_password_rejects_wrong_plaintext():
    hashed = hash_password("correct horse battery staple")
    assert not verify_password("wrong password", hashed)


def test_hash_password_produces_different_hashes_for_same_input():
    # bcrypt salts each hash -- two hashes of the same password must differ
    assert hash_password("same") != hash_password("same")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/auth/test_passwords.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.auth.passwords'`

- [ ] **Step 3: Write the implementation**

Create `solura-eco/backend/app/auth/__init__.py` (empty file).

```python
# solura-eco/backend/app/auth/passwords.py
"""Password hashing for the 3 Solura Eco member logins. bcrypt, nothing fancy."""
import bcrypt


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/auth/test_passwords.py -v`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/auth/__init__.py solura-eco/backend/app/auth/passwords.py solura-eco/backend/tests/
git commit -m "Solura Eco: password hashing (bcrypt) + tests"
```

## Task 5: `session.py` — signed session tokens

**Files:**
- Create: `solura-eco/backend/app/auth/session.py`
- Test: `solura-eco/backend/tests/auth/test_session.py`

- [ ] **Step 1: Write the failing test**

```python
# solura-eco/backend/tests/auth/test_session.py
import time

from app.auth.session import create_session_token, verify_session_token

SECRET = "test-secret-do-not-use-in-real-env"


def test_verify_accepts_a_token_it_just_created():
    token = create_session_token(member_id="abc-123", username="rizo", secret=SECRET)
    payload = verify_session_token(token, SECRET)
    assert payload is not None
    assert payload["member_id"] == "abc-123"
    assert payload["username"] == "rizo"


def test_verify_rejects_a_token_signed_with_a_different_secret():
    token = create_session_token(member_id="abc-123", username="rizo", secret=SECRET)
    assert verify_session_token(token, "wrong-secret") is None


def test_verify_rejects_a_tampered_payload():
    token = create_session_token(member_id="abc-123", username="rizo", secret=SECRET)
    payload_b64, sig = token.split(".", 1)
    tampered = payload_b64 + "x." + sig  # corrupt the payload, keep the signature
    assert verify_session_token(tampered, SECRET) is None


def test_verify_rejects_an_expired_token():
    token = create_session_token(member_id="abc-123", username="rizo", secret=SECRET)
    # max_age_seconds=0 means "expired the instant it was issued"
    assert verify_session_token(token, SECRET, max_age_seconds=0) is None


def test_verify_rejects_malformed_tokens():
    assert verify_session_token("not-a-real-token", SECRET) is None
    assert verify_session_token("", SECRET) is None
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/auth/test_session.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.auth.session'`

- [ ] **Step 3: Write the implementation**

```python
# solura-eco/backend/app/auth/session.py
"""Signed session tokens -- format matches Cortege's session.ts / Tender
Agent's session.py: base64url(payload).hex(hmac). Ported here, not
reinvented, per the multi-tenant SaaS playbook (see the Solura wiki).

The HMAC is computed over the raw base64url-decoded payload bytes, not a
re-serialized JSON string -- this is what lets the Next.js frontend verify
the same token without needing byte-identical JSON serialization between
Python and JS (it never re-encodes the payload, only decodes+verifies it).
"""
import base64
import hashlib
import hmac
import json
import time
from typing import Optional

DEFAULT_MAX_AGE_SECONDS = 30 * 24 * 3600  # 30 days


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def create_session_token(member_id: str, username: str, secret: str) -> str:
    payload = {
        "member_id": member_id,
        "username": username,
        "issued_at": int(time.time()),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def verify_session_token(
    token: Optional[str], secret: str, max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS
) -> Optional[dict]:
    if not token or "." not in token:
        return None

    payload_b64, sig = token.split(".", 1)

    try:
        payload_bytes = _b64url_decode(payload_b64)
    except Exception:
        return None

    expected_sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None

    try:
        payload = json.loads(payload_bytes)
    except Exception:
        return None

    if time.time() - payload.get("issued_at", 0) > max_age_seconds:
        return None

    return payload
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/auth/test_session.py -v`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/auth/session.py solura-eco/backend/tests/auth/test_session.py
git commit -m "Solura Eco: signed session tokens (ported Cortege/Tender Agent format) + tests"
```

## Task 6: `config.py` — add `session_secret`

**Files:**
- Modify: `solura-eco/backend/app/config.py`
- Modify: `solura-eco/backend/.env.example`
- Modify: `solura-eco/backend/.env` (local only, not committed)

- [ ] **Step 1: Add the setting**

In `solura-eco/backend/app/config.py`, add inside the `Settings` class (anywhere alongside the other `os.getenv` lines):

```python
    session_secret: str = os.getenv("SESSION_SECRET", "")
```

- [ ] **Step 2: Document it**

In `solura-eco/backend/.env.example`, add a new section:

```text
# Session signing -- generate with:
#   python -c "import secrets; print(secrets.token_hex(32))"
# Do NOT reuse cana-ai-tutor's or any other product's secret.
SESSION_SECRET=
```

- [ ] **Step 3: Generate a real one and add it to the local `.env`**

Run: `python -c "import secrets; print(secrets.token_hex(32))"`

Append the output to `solura-eco/backend/.env` as `SESSION_SECRET=<generated value>`. This file is gitignored — verify with `git status` that it doesn't show up before continuing.

- [ ] **Step 4: Commit (the example file and config.py only — never `.env`)**

```bash
git add solura-eco/backend/app/config.py solura-eco/backend/.env.example
git commit -m "Solura Eco: add SESSION_SECRET config"
```

## Task 7: Seed the 3 members with real logins

**Files:**
- Create: `solura-eco/backend/scripts/seed_members.py`

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""One-time seed: create/update the 3 Solura Eco member logins.

Run from solura-eco/backend with the venv active:
    .venv/Scripts/python.exe scripts/seed_members.py

Prints each generated password ONCE to stdout. Copy them out to give to
Rizo/Jonik/Dior directly -- they are never written to any file.
Safe to re-run: upserts by username, regenerates password+hash each time
(so re-running rotates all 3 passwords -- intentional, not a bug).
"""
import secrets

from app.auth.passwords import hash_password
from app.services.supabase_client import get_client

MEMBERS = [
    {"username": "rizo", "full_name": "Rizo", "email": "rizo@solura.internal"},
    {"username": "jonik", "full_name": "Jonik", "email": "jonik@solura.internal"},
    {"username": "dior", "full_name": "Dior", "email": "dior@solura.internal"},
]


def main():
    db = get_client()
    print("Generated credentials (copy these out now, they will not be shown again):\n")
    for m in MEMBERS:
        password = secrets.token_urlsafe(12)
        row = {
            "username": m["username"],
            "full_name": m["full_name"],
            "email": m["email"],
            "password_hash": hash_password(password),
        }
        db.table("members").upsert(row, on_conflict="username").execute()
        print(f"  {m['username']:8s}  {password}")
    print("\nDone.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe scripts/seed_members.py`
Expected: prints 3 lines of `username  password`. **Save these out to give to Rizo/Jonik/Dior — they will not be recoverable from here after this step.**

- [ ] **Step 3: Verify the rows landed**

Run:
```bash
cd solura-eco/backend && .venv/Scripts/python.exe -c "
from app.services.supabase_client import get_client
db = get_client()
r = db.table('members').select('username,full_name,email').execute()
print(r.data)
"
```
Expected: a list of 3 dicts with `username` set to `rizo`, `jonik`, `dior`

- [ ] **Step 4: Commit (the script only — the printed passwords go to Rizo/Jonik/Dior directly, never to git)**

```bash
git add solura-eco/backend/scripts/seed_members.py
git commit -m "Solura Eco: seed script for the 3 member logins"
```

## Task 8: `require_session` dependency

**Files:**
- Create: `solura-eco/backend/app/auth/deps.py`

- [ ] **Step 1: Write the dependency**

```python
# solura-eco/backend/app/auth/deps.py
"""FastAPI dependency that requires a valid session -- Bearer header first
(what the frontend's Server Components use, since Vercel and Railway are
different domains and cookies don't cross that boundary), cookie as a
fallback (useful for hitting the backend directly, e.g. via /docs).
"""
from fastapi import HTTPException, Request

from app.auth.session import verify_session_token
from app.config import settings


def require_session(request: Request) -> dict:
    token = None

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer ") :]

    if not token:
        token = request.cookies.get("session")

    payload = verify_session_token(token, settings.session_secret) if token else None
    if payload is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return payload
```

- [ ] **Step 2: Commit**

```bash
git add solura-eco/backend/app/auth/deps.py
git commit -m "Solura Eco: require_session FastAPI dependency"
```

## Task 9: `POST /auth/login` and `/auth/logout`

**Files:**
- Create: `solura-eco/backend/app/routers/auth.py`
- Modify: `solura-eco/backend/app/main.py`

- [ ] **Step 1: Write the router**

```python
# solura-eco/backend/app/routers/auth.py
"""Login/logout for the 3 Solura Eco members. Generic error messages on
failure -- never reveal whether a username exists.
"""
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.auth.passwords import verify_password
from app.auth.session import create_session_token
from app.config import settings
from app.services.supabase_client import get_client

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(payload: LoginRequest, response: Response):
    db = get_client()
    result = (
        db.table("members")
        .select("id,username,password_hash")
        .eq("username", payload.username)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    member = result.data[0]
    if not member.get("password_hash") or not verify_password(
        payload.password, member["password_hash"]
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_session_token(
        member_id=member["id"], username=member["username"], secret=settings.session_secret
    )

    # Set a cookie too, for anyone hitting the backend directly (e.g. /docs) --
    # the frontend's own cookie is set separately by its /api/login route.
    response.set_cookie(
        "session", token, httponly=True, samesite="lax", max_age=30 * 24 * 3600
    )

    return {"token": token, "username": member["username"]}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("session")
    return {"ok": True}
```

- [ ] **Step 2: Wire it into `main.py` and enable credentialed CORS**

In `solura-eco/backend/app/main.py`, change the imports and CORS middleware:

```python
from app.config import settings
from app.routers import auth, canvas, clients, tasks
```

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url] if settings.frontend_url else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Add the router include alongside the existing ones:

```python
app.include_router(auth.router, prefix="/auth", tags=["auth"])
```

- [ ] **Step 3: Commit**

```bash
git add solura-eco/backend/app/routers/auth.py solura-eco/backend/app/main.py
git commit -m "Solura Eco: POST /auth/login and /auth/logout"
```

## Task 10: Protect the clients/projects routes

**Files:**
- Modify: `solura-eco/backend/app/routers/clients.py`

- [ ] **Step 1: Add the dependency to every route**

In `solura-eco/backend/app/routers/clients.py`, add the import:

```python
from app.auth.deps import require_session
```

Change the import line from:

```python
from fastapi import APIRouter, HTTPException
```

to:

```python
from fastapi import APIRouter, Depends, HTTPException
```

Then change all 5 route function signatures, each by adding `_: dict = Depends(require_session)` as the last parameter:

```python
async def list_clients():
```
→
```python
async def list_clients(_: dict = Depends(require_session)):
```

```python
async def create_client(payload: ClientIn):
```
→
```python
async def create_client(payload: ClientIn, _: dict = Depends(require_session)):
```

```python
async def update_client(client_id: str, payload: ClientUpdate):
```
→
```python
async def update_client(client_id: str, payload: ClientUpdate, _: dict = Depends(require_session)):
```

```python
async def create_project(client_id: str, payload: ProjectIn):
```
→
```python
async def create_project(client_id: str, payload: ProjectIn, _: dict = Depends(require_session)):
```

```python
async def update_project(project_id: str, payload: ProjectUpdate):
```
→
```python
async def update_project(project_id: str, payload: ProjectUpdate, _: dict = Depends(require_session)):
```

- [ ] **Step 2: Verify the app still imports cleanly**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -c "import app.main; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add solura-eco/backend/app/routers/clients.py
git commit -m "Solura Eco: require a valid session on all /clients routes"
```

## Task 11: Manual backend verification

No new files — this is a checkpoint before moving to the frontend.

- [ ] **Step 1: Start the backend**

Run (background): `cd solura-eco/backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`

- [ ] **Step 2: Confirm `/clients` is now locked down**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/clients`
Expected: `401`

- [ ] **Step 3: Log in with one of Task 7's real credentials and confirm access**

Run (substitute a real username/password from Task 7's output):
```bash
curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"rizo","password":"<the real password>"}'
```
Expected: a JSON body with `"token": "..."` and `"username":"rizo"`

Then, using that token:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/clients \
  -H "Authorization: Bearer <token from above>"
```
Expected: `200`

- [ ] **Step 4: Stop the backend**

Find and kill the uvicorn process (Windows: `tasklist //FI "IMAGENAME eq python.exe"` then `taskkill //PID <pid> //F`).

## Task 12: Frontend — `lib/session.ts` (edge-compatible token verification)

**Files:**
- Create: `solura-eco/frontend/src/lib/session.ts`

- [ ] **Step 1: Write it**

```ts
// solura-eco/frontend/src/lib/session.ts
//
// Verifies the same base64url(payload).hex(hmac) token format the backend
// issues (app/auth/session.py) -- using Web Crypto (crypto.subtle) so this
// runs in both the Edge runtime (proxy.ts) and Node (the /api/login route
// handler) without a native crypto dependency. Never re-serializes the
// payload to JSON before hashing -- it hashes the raw decoded bytes, which
// is what lets this match Python's HMAC without needing byte-identical
// JSON formatting between the two languages.

const MAX_AGE_SECONDS = 30 * 24 * 3600; // 30 days, matches the backend

export type SessionPayload = {
  member_id: string;
  username: string;
  issued_at: number;
};

function b64urlDecode(s: string): Uint8Array {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null;

  const [payloadB64, sig] = token.split(".");
  let payloadBytes: Uint8Array;
  try {
    payloadBytes = b64urlDecode(payloadB64);
  } catch {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedSigBuf = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const expectedSig = toHex(expectedSigBuf);

  if (expectedSig.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= expectedSig.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
  } catch {
    return null;
  }

  if (Date.now() / 1000 - payload.issued_at > MAX_AGE_SECONDS) return null;

  return payload;
}
```

- [ ] **Step 2: Commit**

```bash
git add solura-eco/frontend/src/lib/session.ts
git commit -m "Solura Eco frontend: edge-compatible session token verification"
```

## Task 13: Frontend — `proxy.ts` (optimistic edge check)

**Files:**
- Create: `solura-eco/frontend/src/proxy.ts`

- [ ] **Step 1: Write it**

```ts
// solura-eco/frontend/src/proxy.ts
//
// Next.js 16 renamed middleware.js -> proxy.ts (same mechanism, new name).
// This is an OPTIMISTIC check only, per Next's own guidance: it redirects
// obviously-unauthenticated requests before they render, but the backend's
// require_session dependency (app/auth/deps.py) is the real authorization
// boundary -- this file must never be the only thing standing between a
// request and real data.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session";

const PUBLIC_ROUTES = ["/login"];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Misconfigured deployment (env var not set) -- fail closed rather
    // than silently letting every request through.
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const token = req.cookies.get("session")?.value;
  const session = await verifySessionToken(token, secret);

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
```

- [ ] **Step 2: Add `SESSION_SECRET` to the frontend's env example**

Append to `solura-eco/frontend/.env.example`:

```text

# Same value as the backend's SESSION_SECRET (solura-eco/backend/.env) --
# used to verify session tokens at the edge in proxy.ts. Server-side only,
# deliberately not prefixed NEXT_PUBLIC_.
SESSION_SECRET=
```

- [ ] **Step 3: Add the same secret to the local `.env.local`**

Copy the exact value from `solura-eco/backend/.env`'s `SESSION_SECRET` into a new `solura-eco/frontend/.env.local` as `SESSION_SECRET=<same value>` and `NEXT_PUBLIC_API_URL=http://localhost:8000`. Confirmed already gitignored (frontend's `.gitignore` has `.env*` with `!.env.example`).

- [ ] **Step 4: Commit (the example file only)**

```bash
git add solura-eco/frontend/src/proxy.ts solura-eco/frontend/.env.example
git commit -m "Solura Eco frontend: proxy.ts optimistic auth check"
```

## Task 14: Frontend — `/api/login` route handler

**Files:**
- Create: `solura-eco/frontend/src/app/api/login/route.ts`
- Create: `solura-eco/frontend/src/app/api/logout/route.ts`

- [ ] **Step 1: Write the login route handler**

```ts
// solura-eco/frontend/src/app/api/login/route.ts
//
// Proxies credentials to the backend, then sets the returned token as a
// first-party cookie on THIS domain. Required because the frontend
// (Vercel) and backend (Railway) are different domains -- a Set-Cookie
// from the backend's response can't be stored as first-party here.
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { username, password } = await request.json();

  const backendRes = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!backendRes.ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const { token } = (await backendRes.json()) as { token: string };

  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return response;
}
```

- [ ] **Step 2: Write the logout route handler**

```ts
// solura-eco/frontend/src/app/api/logout/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("session");
  return response;
}
```

- [ ] **Step 3: Commit**

```bash
git add solura-eco/frontend/src/app/api/login/route.ts solura-eco/frontend/src/app/api/logout/route.ts
git commit -m "Solura Eco frontend: login/logout route handlers"
```

## Task 15: Frontend — `/login` page

**Files:**
- Create: `solura-eco/frontend/src/app/login/page.tsx`

- [ ] **Step 1: Write it**

```tsx
// solura-eco/frontend/src/app/login/page.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Invalid username or password.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-bg2 p-8"
      >
        <h1 className="font-display text-2xl font-bold text-white">Solura Eco</h1>
        <p className="mt-1 text-sm text-silver">Sign in to continue.</p>

        <label className="mt-6 block text-sm text-silver">
          Username
          <input
            className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-white outline-none focus:border-cyan"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="mt-4 block text-sm text-silver">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-white outline-none focus:border-cyan"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-[image:var(--grad)] px-4 py-2 font-display font-semibold text-bg disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add solura-eco/frontend/src/app/login/page.tsx
git commit -m "Solura Eco frontend: login page"
```

## Task 16: Frontend — sign-out control

**Files:**
- Create: `solura-eco/frontend/src/components/SignOutButton.tsx`
- Modify: `solura-eco/frontend/src/app/page.tsx`

- [ ] **Step 1: Write the client component**

```tsx
// solura-eco/frontend/src/components/SignOutButton.tsx
"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      className="text-xs text-silver hover:text-white"
    >
      Sign out
    </button>
  );
}
```

- [ ] **Step 2: Add it to the home page header**

This is folded into Task 17's full rewrite of `page.tsx` (the reskin touches the same header). No separate edit here — Task 17's file already includes `<SignOutButton />`.

- [ ] **Step 3: Commit**

```bash
git add solura-eco/frontend/src/components/SignOutButton.tsx
git commit -m "Solura Eco frontend: sign-out button"
```

## Task 17: Reskin — match solura-agency.com's tokens

**Files:**
- Modify: `solura-eco/frontend/src/app/globals.css`
- Modify: `solura-eco/frontend/src/app/layout.tsx`
- Modify: `solura-eco/frontend/src/app/page.tsx`

- [ ] **Step 1: Replace the theme tokens**

Replace the full contents of `solura-eco/frontend/src/app/globals.css`:

```css
@import "tailwindcss";

:root {
  --bg:      #080c12;
  --bg2:     #0d1220;
  --bg3:     #111827;
  --border:  rgba(255, 255, 255, 0.08);
  --cyan:    #38bdf8;
  --violet:  #818cf8;
  --white:   #f1f5f9;
  --silver:  #94a3b8;
  --grad:    linear-gradient(135deg, #38bdf8, #818cf8);
}

@theme inline {
  --color-bg: var(--bg);
  --color-bg2: var(--bg2);
  --color-bg3: var(--bg3);
  --color-border: var(--border);
  --color-cyan: var(--cyan);
  --color-violet: var(--violet);
  --color-white: var(--white);
  --color-silver: var(--silver);
  --font-sans: var(--font-dm-sans);
  --font-display: var(--font-syne);
}

body {
  background: var(--bg);
  color: var(--white);
  font-family: var(--font-sans);
}

h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 700;
}
```

- [ ] **Step 2: Load Syne + DM Sans instead of Geist**

Replace the full contents of `solura-eco/frontend/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Solura Eco",
  description: "Solura's internal ecosystem platform — clients, dev activity, uni load, docs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Reskin the home page onto the new tokens**

Replace the full contents of `solura-eco/frontend/src/app/page.tsx`:

```tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { SignOutButton } from "@/components/SignOutButton";

type Project = {
  id: string;
  name: string;
  status: string;
  progress: number;
  github_repo: string | null;
};

type Client = {
  id: string;
  name: string;
  status: string;
  projects: Project[];
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-cyan/15 text-cyan",
  paused: "bg-amber-500/15 text-amber-400",
  completed: "bg-silver/15 text-silver",
  dropped: "bg-silver/15 text-silver",
  churned: "bg-red-500/15 text-red-400",
};

async function getClients(): Promise<{ clients: Client[] | null; error: string | null }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return { clients: null, error: "NEXT_PUBLIC_API_URL is not set (see .env.example)." };
  }

  const token = (await cookies()).get("session")?.value;

  try {
    const res = await fetch(`${apiUrl}/clients`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      return { clients: null, error: `Backend returned ${res.status}` };
    }
    return { clients: await res.json(), error: null };
  } catch {
    return { clients: null, error: `Could not reach backend at ${apiUrl}` };
  }
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status] ?? "bg-silver/15 text-silver"
      }`}
    >
      {status}
    </span>
  );
}

export default async function Home() {
  const { clients, error } = await getClients();

  return (
    <div className="flex flex-1 flex-col bg-bg">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 sm:px-10">
        <header className="mb-10 flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">
              Solura Eco
            </h1>
            <p className="mt-1 text-sm text-silver">
              Every active client, at a glance — status and progress, no pinging required.
            </p>
          </div>
          <SignOutButton />
        </header>

        {error && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            {error} — showing nothing until the backend is reachable.
          </div>
        )}

        {clients && clients.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-silver">
            No clients yet. Add one via <code className="font-mono">POST /clients</code>.
          </div>
        )}

        {clients && clients.length > 0 && (
          <ul className="flex flex-col gap-4">
            {clients.map((client) => (
              <li
                key={client.id}
                className="rounded-xl border border-border bg-bg2 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display font-semibold text-white">{client.name}</h2>
                  <StatusPill status={client.status} />
                </div>

                {client.projects.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {client.projects.map((project) => (
                      <li
                        key={project.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-bg3 px-3 py-2 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-white">{project.name}</span>
                          {project.github_repo && (
                            <Link
                              href={`https://github.com/${project.github_repo}`}
                              target="_blank"
                              className="shrink-0 text-xs text-silver hover:text-white"
                            >
                              {project.github_repo}
                            </Link>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                            <div
                              className="h-full rounded-full bg-[image:var(--grad)]"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                          <StatusPill status={project.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-silver">No projects yet.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Delete the now-unused scaffold SVGs**

Run: `cd solura-eco/frontend && rm -f public/next.svg public/vercel.svg public/globe.svg public/file.svg public/window.svg`

- [ ] **Step 5: Build to verify**

Run: `cd solura-eco/frontend && npm run build`
Expected: `✓ Compiled successfully`, `/login` and `/` both listed in the route output

- [ ] **Step 6: Commit**

```bash
git add solura-eco/frontend/src/app/globals.css solura-eco/frontend/src/app/layout.tsx solura-eco/frontend/src/app/page.tsx solura-eco/frontend/public
git commit -m "Solura Eco frontend: reskin to match solura-agency.com's tokens"
```

## Task 18: Seed real client/project data

**Files:**
- Create: `solura-eco/backend/scripts/seed_clients.py`

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""One-time seed: real client/project rows for the home screen, sourced
from the Solura wiki as of 2026-09-03 (see the design spec's Seed Data
section for the reasoning behind each status/progress/client mapping).
Safe to re-run: upserts by (client name -> project name), doesn't duplicate.
"""
from app.services.supabase_client import get_client

CLIENTS = [
    {
        "name": "Ulkan Development",
        "status": "active",
        "projects": [
            {
                "name": "Argus",
                "status": "active",
                "progress": 60,
                "notes": "Pilot shipped; now expanding to a full Macro CRM replacement (per the wiki's 2026-08-01 update).",
            },
        ],
    },
    {
        "name": "Solura",
        "status": "active",
        "projects": [
            {
                "name": "Tender Agent",
                "status": "active",
                "progress": 80,
                "notes": "Solura's flagship multi-tenant SaaS product, live in production.",
            },
            {
                "name": "Cortège",
                "status": "active",
                "progress": 70,
                "notes": "Multi-tenant SaaS for wedding venues, live in production. No confirmed real venue client yet.",
            },
            {
                "name": "solura-agency.com",
                "status": "completed",
                "progress": 100,
                "github_repo": "psepse228/solura.agency",
                "notes": "This marketing site.",
            },
        ],
    },
]


def main():
    db = get_client()

    for client in CLIENTS:
        existing = db.table("clients").select("id").eq("name", client["name"]).execute().data
        if existing:
            client_id = existing[0]["id"]
        else:
            row = db.table("clients").insert(
                {"name": client["name"], "status": client["status"]}
            ).execute().data[0]
            client_id = row["id"]

        for project in client["projects"]:
            existing_project = (
                db.table("projects")
                .select("id")
                .eq("client_id", client_id)
                .eq("name", project["name"])
                .execute()
                .data
            )
            if existing_project:
                print(f"skip (already exists): {client['name']} / {project['name']}")
                continue

            data = {**project, "client_id": client_id}
            db.table("projects").insert(data).execute()
            print(f"created: {client['name']} / {project['name']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe scripts/seed_clients.py`
Expected: 4 `created:` lines (Argus, Tender Agent, Cortège, solura-agency.com)

- [ ] **Step 3: Verify via the API**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000` (background), then in another shell, using a real token from Task 7/11:
```bash
curl -s http://localhost:8000/clients -H "Authorization: Bearer <token>" | head -c 500
```
Expected: JSON with 2 clients (`Ulkan Development`, `Solura`), the latter holding 3 projects. Stop the server after (`taskkill //PID <pid> //F`).

- [ ] **Step 4: Commit**

```bash
git add solura-eco/backend/scripts/seed_clients.py
git commit -m "Solura Eco: seed real client/project data from the wiki"
```

## Task 19: Deploy backend to Railway

No new files — this is infrastructure work using the Railway MCP tools already connected in this session.

- [ ] **Step 1: Create the backend service in the existing "Solura eco" Railway project**

Use `mcp__railway__create_service` (or `connect_service_source` if a service already exists) with:
- `project_id`: `35aacb9d-62b6-4d09-b844-afe2ef9b0596` ("Solura eco")
- source: this GitHub repo (`psepse228/solura.agency`)
- root directory: `solura-eco/backend`

- [ ] **Step 2: Set environment variables**

Use `mcp__railway__set_variables` to set, on the new service's production environment:
- `ENVIRONMENT=production`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (same values as the local `.env`)
- `SESSION_SECRET` (same value as the local `.env` — must match the frontend's, or every login will fail signature verification)
- `CANVAS_BASE_URL=https://webster.instructure.com`
- `FRONTEND_URL` — leave blank for now, set in Task 21 once the Vercel URL exists

- [ ] **Step 3: Generate a public domain**

Use `mcp__railway__generate_domain` for the service. Note the resulting URL — needed for Task 20's `NEXT_PUBLIC_API_URL`.

- [ ] **Step 4: Deploy and verify**

Use `mcp__railway__deploy`, then `mcp__railway__get_logs` to confirm it started (look for `Uvicorn running on...`). Hit `<railway-url>/health` (via `curl` or `mcp__railway__http_requests`) and confirm `{"status":"ok"}`.

## Task 20: Deploy frontend to Vercel

No new files — infrastructure work using the Vercel MCP tools.

- [ ] **Step 1: Create the Vercel project**

Use `mcp__claude_ai_Vercel__create_git_project` (or `deploy_to_vercel`) with:
- Repo: `psepse228/solura.agency`
- Root directory: `solura-eco/frontend`
- Team scope: `muhammadrizomirzaahmedov-7014s-projects` (confirmed in architecture.md as where all Solura Vercel projects live)
- Project name: `solura-eco`

- [ ] **Step 2: Set environment variables**

Set on the new Vercel project (Production environment):
- `NEXT_PUBLIC_API_URL` = the Railway URL from Task 19 Step 3
- `SESSION_SECRET` = the exact same value set on Railway in Task 19 Step 2

- [ ] **Step 3: Deploy**

Trigger a deployment (via `deploy_to_vercel` or a push to `main`, since Vercel auto-deploys on push once the project is connected). Note the resulting `*.vercel.app` URL.

## Task 21: Cross-wire the two deployments

- [ ] **Step 1: Set `FRONTEND_URL` on Railway**

Use `mcp__railway__set_variables` to set `FRONTEND_URL` on the backend service to the Vercel URL from Task 20 Step 3 (needed so CORS allows the deployed frontend to call it).

- [ ] **Step 2: Redeploy the backend**

Use `mcp__railway__redeploy` so the CORS config picks up the new `FRONTEND_URL`.

## Task 22: End-to-end verification on the real deployment

- [ ] **Step 1: Confirm the login gate works**

Visit the Vercel URL in a browser (or `curl -I <vercel-url>/`) — expect a redirect to `/login`.

- [ ] **Step 2: Log in and confirm real data renders**

Log in with one of the 3 real credentials from Task 7. Confirm the home page shows Ulkan Development (Argus) and Solura (Tender Agent, Cortège, solura-agency.com) with status pills and progress bars.

- [ ] **Step 3: Confirm sign-out works**

Click "Sign out", confirm it redirects to `/login` and a subsequent visit to `/` also redirects (cookie actually cleared).

- [ ] **Step 4: Update the build plan**

In `solura-eco/docs/build-plan.md`, check off the "Not done" items under item #1 (auth, deployment, seeding) now that they're done, and commit:

```bash
git add solura-eco/docs/build-plan.md
git commit -m "Solura Eco: item #1 (Clients/Projects view) fully shipped"
```
