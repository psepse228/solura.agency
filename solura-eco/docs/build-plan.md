# Solura Eco — Build Plan

Tracks progress against the build order in [architecture.md](./architecture.md).
Update the checkboxes as work lands; don't rewrite history above the divider.

## 1. Clients/Projects view — home screen

**Status: SHIPPED — live in production, projects-first, in daily-use shape.**

- [x] Schema: `clients` + `projects` tables (`0002_clients_projects.sql`),
      later extended with `project_roles`, `project_notes`, and
      `accent_start`/`accent_end` colors (`0006`-`0008`)
- [x] Grants for the newly-exposed `solura_eco` schema (`0003_grants.sql`)
- [x] Backend: `GET/POST /clients`, `PATCH /clients/{id}`,
      `POST /clients/{id}/projects`, `PATCH /clients/projects/{id}`,
      `PUT /clients/projects/{id}/roles`, plus the `GET /projects` family
      (list/detail/stats/notes) that now backs the actual UI
- [x] Auth resolved (architecture.md open question 2): 3 individual
      username/password logins (Rizo, Jonik, Dior), not Supabase Auth, not a
      shared password. Session tokens use the exact `base64url(payload).hex(hmac)`
      format Cortège/Tender Agent already share — ported, not reinvented (see
      `0004_auth.sql`, `app/auth/`, `frontend/src/proxy.ts`). Fails closed if
      `SESSION_SECRET` is ever unset in production.
- [x] Reskinned to match solura-agency.com's actual brand tokens (`#080c12`
      background, cyan/violet gradient, Syne + DM Sans) instead of the
      generic Next.js scaffold; each project also carries its own real
      accent color sampled from its actual product code (Argus crimson,
      Athena AI's IHL navy/orange, etc — see item #2's design spec Part C).
- [x] **Projects-first IA** (2026-09-04): home screen is a project grid, not
      a client-grouped list — client is metadata on a project, not the
      top-level grouping. Each project has a real detail page
      (`/projects/[id]`): progress, day-grouped commit timeline, dev/
      client-work roles, an "About" blurb, and a collaborative notepad
      anyone can post dated, attributed notes to.
- [x] **In-app role editor** (2026-09-04): the Roles panel is an interactive
      checkbox picker (`GET /members`, `PUT /clients/projects/{id}/roles`),
      auto-saves — no more setting roles via raw API calls.
- [x] **Client detail page** (2026-09-04): client name is a real link
      everywhere it appears (home grid tiles, project detail header) →
      `/clients/[id]` (`GET /clients/{id}`), showing that client's status
      and full project grid — reachable even for a client with zero
      projects yet.
- [x] **Loading/perf polish** (2026-09-04): instant loading skeletons on
      every navigation (`loading.tsx` for both routes), fade-in + hover
      transitions, progress bars that actually fill-in-animate on mount
      (`ProgressBar` client component) — no new dependencies.
- [x] Deployed: backend on Railway (`Solura eco` project,
      `backend-production-7694a.up.railway.app`), frontend on Vercel
      (`solura-eco.vercel.app`), cross-wired (`FRONTEND_URL` /
      `NEXT_PUBLIC_API_URL` / matching `SESSION_SECRET` on both sides).
- [x] Real data seeded: Ulkan Development (Argus), Solura (Tender Agent,
      Cortège, Athena AI, solura-agency.com) — sourced from the wiki and
      each product's real code, not invented.
- [x] Verified end-to-end in production: login → session cookie → real data
      renders for all 3 real logins.

## 2. Dev-activity auto-pull

**Status: GitHub commits SHIPPED. Vercel deployments and Claude Code Remote
sessions still open.**

- [x] Generic `dev_events` table (`0005_dev_events.sql`) — source-agnostic,
      not GitHub-specific, so Vercel/Claude Code Remote land in the same
      table later
- [x] `POST /webhooks/github` — signature-verified (HMAC-SHA256,
      constant-time compare), ingests `push` events, upserts commits keyed
      to whichever project's `github_repo` matches
- [x] Webhooks registered on all 4 tracked repos (Argus, tender-agent-app,
      cano-ai-tutor, solura.agency) via `scripts/register_github_webhook.py`
      (`gh` CLI, no raw token in the script)
- [x] Per-project detail page shows the real commit timeline, day-grouped
- [ ] **Not done:** Vercel deployment/build-status events — architecture.md
      notes the connector is "authorized, not yet used in code"
- **Dropped 2026-09-04:** Claude Code Remote sessions — explicit decision,
      GitHub commits are the dev-activity source going forward, not a
      merged multi-source feed. `dev_events.source` stays generic
      (`'github'` so far) in case this is revisited later, but no work is
      planned against it.

## 3. Internal docs (КП/presentations) library

**Status: not started.** Per-client document store — needs a decision on
storage (Supabase Storage vs. something else) before schema work starts.

## 4. Canvas sync — uni load

**Status: partially scaffolded from the original branch** — `canvas_client.py`
service stub and `courses`/`assignments`/`submissions` tables exist
(`0001_init.sql`), `/canvas` router is a placeholder. Not wired to real
Canvas tokens or tested against Webster's instance yet.

## 5. Telegram Business bot — lead monitoring

**Status: not started.** Rescoped 2026-09-03: **not** manual lead capture —
a bot integrated to read client conversations and keep client/lead records
updated automatically (self-updating, not a form for someone to fill in).
Explicitly last in the build order — genuinely new infrastructure, plus a
manual Business API connection step on the Solura Telegram account
regardless of when the code gets written. A token was mentioned as already
issued but shared in a chat transcript — **rotate it via BotFather before
it's used for anything real.**

---

## How the rest of this gets built

Solura's own established process (see the Solura brain vault,
`projects/solura/concepts/multi-tenant-saas-playbook.md` — same one Tender
Agent's rebuild used): **brainstorm → written spec → written implementation
plan → subagent-driven-development (fresh subagent per task, two-stage
review) → finishing-a-development-branch.**

I skipped straight to code for item #1 because it was small enough to hold
in one head (one table pair, one router, one page) — same judgment call
Argus's initial build made for a similar reason, though Argus's owner then
explicitly asked to switch back to the full rigorous process once things
stabilized. I should have said that plan out loud before writing code
instead of assuming it was obvious it was live in this document.

**Going forward:** before starting item #2 (dev-activity auto-pull) — the
next real chunk of work — I'll run it through `brainstorming` → a written
spec → a written plan you can see and react to, *then* execute (via
subagents for independent pieces where that actually helps, sequentially
where it doesn't). Say the word when you want that started.
