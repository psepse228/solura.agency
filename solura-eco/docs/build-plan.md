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

**Status: SHIPPED — live in production.**

- [x] Storage decided and built: private Supabase Storage bucket
      `project-docs`, same Supabase project as everything else, keyed
      `{project_id}/{filename}`. Downloads only ever go through short-lived
      signed URLs, never a public link.
- [x] Per-project, not per-client (a КП/presentation attaches to the
      specific project it's for) — `documents` table (`0009_documents.sql`).
- [x] Backend: `POST/GET /projects/{id}/documents`,
      `GET /documents/{id}/download`, `DELETE /documents/{id}` — validates
      doc type (КП/presentation/other), file type (PDF/PPTX/DOCX/XLSX/PNG/
      JPEG), size (25MB cap); filename collisions get a random suffix
      instead of silently overwriting.
- [x] Frontend: a Documents panel on the project detail page — upload,
      list (uploader + size + type badge), download, delete.
- [x] Verified end-to-end against real Supabase Storage in production: real
      file uploaded, downloaded byte-for-byte identical via a real signed
      URL, deleted (both the Storage object and the DB row confirmed gone).
- **Deliberately deferred:** document *generation* (auto-filling a КП/
      presentation template for a client) — a meaningfully bigger feature,
      its own future brainstorm once there's a real need for it.

## 4. Canvas sync — uni load

**Status: partially scaffolded from the original branch** — `canvas_client.py`
service stub and `courses`/`assignments`/`submissions` tables exist
(`0001_init.sql`), `/canvas` router is a placeholder. Not wired to real
Canvas tokens or tested against Webster's instance yet.

## 5. Telegram Business bot — lead monitoring

**Status: code SHIPPED, live in production — blocked on manual setup only.**

Ported from Argus's real, working Telegram Business integration
(`psepse228/Argus`), deliberately smaller: read-only monitoring, no
reply-from-app, no chat UI. Rescoped 2026-09-03: not manual lead capture —
the bot reads conversations and updates client records automatically.

- [x] `client_notes` table (`0010`) — necessary since a freshly
      auto-created client may have zero projects yet, so there's nowhere on
      the per-project notepad to post anything.
- [x] `telegram_connections`/`telegram_conversations`/`telegram_messages`
      tables (`0011`).
- [x] Phone normalization + webhook signature verification ported from
      Argus, both TDD.
- [x] `POST /webhooks/telegram-business` — resolves each message to a
      client (phone match if a contact card was shared, otherwise
      auto-creates one from the Telegram profile), posts a GPT-4o summary +
      next-step as a `client_notes` row. Two real bugs caught in review and
      fixed: malformed-payload 500s (now graceful 200/skip) and a race
      where two redelivered webhooks for the same new chat could both
      create a client before the second's conversation insert conflicted
      (now recovers cleanly, no orphaned client).
- [x] `NotesPanel` generalized (was project-only) to serve both projects
      and clients — same component, an `apiPath` prop, no duplication.
      Client detail page now has a Notepad, fed by both manual notes and
      auto-posted Telegram summaries in one feed.
- [x] `TELEGRAM_WEBHOOK_SECRET` set on Railway.
- [ ] **Blocked on you, not code:** rotate the bot token via BotFather (the
      previous one was shared in a chat transcript — never reuse it), set
      the new `TELEGRAM_BOT_TOKEN` on Railway, connect Telegram Business on
      the dedicated Solura account (Premium + Settings → Telegram Business
      → Chatbots), then run
      `python scripts/register_telegram_webhook.py <token> https://backend-production-7694a.up.railway.app/webhooks/telegram-business <TELEGRAM_WEBHOOK_SECRET>`.
      A real `OPENAI_API_KEY` also isn't set yet — without one, messages
      still save but no summary gets posted (degrades gracefully, not a
      hard blocker).
- **Known limitation, carried over honestly from Argus's own code:**
      Telegram only exposes a phone number when a contact card is
      explicitly shared — rare in practice. Most new conversations will
      auto-create a client from just the Telegram profile name, not match
      an existing one.

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
