# Finish the Clients/Projects view — design

Status: approved, ready for implementation plan.
Scope: closes out build order item #1 (see `../architecture.md`, `../build-plan.md`).
Explicitly out of scope: dev-activity auto-pull (item #2), docs library (item #3),
Canvas sync (item #4), Telegram lead capture (item #5) — those are separate,
later specs.

## Why

The Clients/Projects view works locally against real Supabase data, but three
things stand between that and actual daily use by Rizo, Jonik, and Dior:
nothing stops a stranger with the URL from reading or editing client data,
neither service is deployed anywhere, and the home screen is empty. This spec
closes all three, plus reskins the frontend to match the company's own brand
instead of the generic Next.js scaffold.

## Auth — three real logins, reusing Solura's existing session pattern

Not Supabase Auth/OAuth (overkill for 3 people who will never grow past 3
without revisiting this decision anyway), not a single shared password
(no attribution — can't tell who added what). Three individual username +
password logins, one per member, using the **exact session-cookie format
Cortège and Tender Agent already share** (`session.ts` / `session.py`:
`base64url(payload).hex(hmac)`), per
`projects/solura/concepts/multi-tenant-saas-playbook.md` in the wiki — this is
now genuinely shared, ported code across three Solura products, not just a
similar shape.

**Schema change** (new migration `0004_auth.sql`):
- `alter table solura_eco.members add column username text unique not null, add column password_hash text not null;`
- Backfill: seed Rizo, Jonik, and Dior as rows (if not already present from
  `0001_init.sql`'s Canvas-oriented `members` table — check first, this may
  already be the same three rows).

**Backend** (`app/auth/session.py`, mirrors Tender Agent's file 1:1):
- `POST /auth/login` — body `{username, password}`. Looks up `members` by
  username, verifies `password_hash` with bcrypt, on success issues a cookie:
  `session=<base64url(json payload)>.<hex hmac-sha256>`, payload is
  `{member_id, username, issued_at}`, secret is a new `SESSION_SECRET` env var
  (generate one, do not reuse cana-ai-tutor's).
- `POST /auth/logout` — clears the cookie.
- A FastAPI dependency (`require_session`) parses + verifies the cookie,
  raises 401 if missing/invalid/expired (expiry: 30 days, refreseshed on use).
  Applied to every route in `clients.py` (and future routers as they're
  added) except `/health` and `/auth/*`.

**Frontend** (`middleware.ts` at the Next.js root, mirrors the HMAC check —
not a round-trip to the backend):
- Runs on every request. No valid `session` cookie → redirect to `/login`.
- `/login` page: username + password form, posts to the backend's
  `/auth/login`, backend sets the cookie (frontend and backend share the
  same top-level domain in production so the cookie is visible to both —
  confirm this holds once the Vercel/Railway domains are known; if not,
  the login page proxies through a Next.js route handler instead of posting
  directly to the backend, so the cookie gets set as first-party).
- No per-role gating — matches architecture.md: flat, equal access, three
  admins.

**Passwords**: I generate 3 strong random passwords now, hash them into the
migration's seed data, and give you the plaintext once (out of band, this
conversation) — never written to a file that gets committed.

## Deployment

**Backend → Railway.** The "Solura eco" Railway project already exists
(created previously, currently empty). Connect it to this GitHub repo, root
directory `solura-eco/backend`, same Railway pattern as `cana-ai-tutor` /
`lead-assistant` (Python buildpack, `uvicorn app.main:app --host 0.0.0.0
--port $PORT`). Env vars: everything in `.env.example` plus the new
`SESSION_SECRET`. `FRONTEND_URL` set once the Vercel URL is known (for CORS).

**Frontend → Vercel.** New Vercel project under the
`muhammadrizomirzaahmedov-7014s-projects` scope (confirmed in architecture.md
as where all Solura's Vercel projects live, including this marketing site),
root directory `solura-eco/frontend`, Vercel-assigned subdomain
(`solura-eco-*.vercel.app` or similar — whatever Vercel assigns, no custom
domain work). Env var: `NEXT_PUBLIC_API_URL` set to the Railway backend's
public URL once it's deployed.

**Order**: backend first (frontend needs its URL), then frontend, then go
back and set `FRONTEND_URL` on the backend once the frontend URL exists
(chicken-and-egg, standard for this kind of pair).

## Seed data

Real rows in `clients` + `projects`, sourced from what the Solura wiki
(`Solura brain/Solura/projects/solura/`) actually documents as of today —
not invented status/progress numbers. Checked against the wiki directly
during this brainstorm: Tender Agent and Cortège are **not** single-client
builds the way Argus is — they're Solura's own multi-tenant SaaS products
(Tender Agent serves multiple tenant companies, e.g. Seventeam/Tashkent;
Cortège's only client-shaped data in the wiki is explicitly-flagged
*fictional* test data, no real venue confirmed yet). Modeling them as
`client: Solura` (internal product), not inventing an external client name
that isn't in the wiki:

| Client | Project | Status | Progress | Notes |
|---|---|---|---|---|
| Ulkan Development | Argus | active | ~60 | Pilot shipped, now expanding to full Macro CRM replacement per the wiki's 2026-08-01 update |
| Solura | Tender Agent | active | ~80 | Solura's flagship multi-tenant SaaS product, live in production |
| Solura | Cortège | active | ~70 | Multi-tenant SaaS for wedding venues, live in production, no confirmed real venue client yet |
| Solura | solura-agency.com | active | 100 | This marketing site — live, in this same repo |

## Reskin — match solura-agency.com's real design tokens

Pulled directly from this repo's `index.html`:

```css
--bg:      #080c12;   --bg2:  #0d1220;   --bg3: #111827;
--cyan:    #38bdf8;   --violet: #818cf8;
--grad:    linear-gradient(135deg, #38bdf8, #818cf8);
--white:   #f1f5f9;   --silver: #94a3b8;
--border:  rgba(255,255,255,0.08);
--fd (headings): 'Syne', sans-serif;
--fb (body):     'DM Sans', sans-serif;
--r:       16px;
```

Replace the frontend's current Geist-based Tailwind defaults with these —
`tailwind.config`/CSS variables carrying the same tokens, `next/font/google`
loading Syne + DM Sans (same mechanism the scaffold already uses for Geist,
just swapping font names). Home page redesigned within this palette: dark
background, cyan/violet gradient for the primary accent (status pills,
progress bar fill), Syne for the "Solura Eco" heading and client names, DM
Sans for body text — same visual language as the marketing site, not a
literal copy of its layout (this is a dashboard, not a landing page).

## Testing

- Backend: manual verification (as already done for the schema/API) — hit
  `/auth/login` with each seeded member's real credentials, confirm the
  cookie is set and `/clients` returns 200 with it, 401 without it.
- Frontend: manual — confirm `/` redirects to `/login` with no cookie, and
  renders real seeded data after logging in.
- No automated test suite exists yet for this project; not introducing one
  in this pass — flagging it as a gap, not silently skipping it.

## Error handling

- Wrong username/password → `401` with a generic "invalid credentials"
  (never reveal whether the username exists).
- Expired/tampered cookie → same as no cookie, redirect to `/login`.
- Backend unreachable from the frontend → existing graceful-degradation
  state (already built) still applies, now behind the login gate.
