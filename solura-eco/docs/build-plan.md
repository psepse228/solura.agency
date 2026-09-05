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

**Status: SHIPPED and verified end-to-end in production — real Canvas
token saved, real courses/grades/assignments confirmed pulling correctly.**

- [x] Self-service token entry: `POST /canvas/token` (session-protected),
      verifies the token against Canvas's real `GET /users/self` before
      storing anything — `400` with Canvas's own error on a bad token,
      never silently saves one that doesn't work.
- [x] Token encryption: Python-side Fernet (`app/services/canvas_token_crypto.py`,
      TDD'd), keyed by a new `CANVAS_TOKEN_ENCRYPTION_KEY` secret, stored in
      the existing `members.canvas_api_token_enc` (`bytea`) column — no
      migration needed. One real bug caught in review and fixed:
      `bytea` columns have no JSON representation, so both the write path
      (`save_canvas_token`) and the sync read path had to encode/decode
      through Postgres's own `\x<hex>` text format, not raw Python bytes.
- [x] Sync: new `canvas-sync-cron` Railway service (same "Solura eco"
      project), schedule `*/30 * * * *`, calls `POST /canvas/sync` with a
      shared secret (`CANVAS_SYNC_SECRET`, `hmac.compare_digest`, header-based
      — not session auth, nothing in a cron request identifies "this is the
      cron job" any other way). Loops every member with a stored token,
      pulls courses → assignments → that member's submission status via
      `CanvasClient` (now has `get_submission`), upserts into
      `courses`/`assignments`/`submissions`. Per-member try/except
      isolation — one member's expired token or a Canvas outage never
      blocks the others in the same run; verified live (`{"ok":true,"synced":0,"failed":[]}`
      against zero tokens saved so far).
- [x] `GET /canvas/my-assignments` — strictly the calling session's own
      data (`member_id` always from the session, never a request param),
      reads already-synced rows, `has_token` flag added (not in the
      original spec text) so the frontend can tell "no token saved yet"
      apart from "token saved, zero courses synced" — both return an empty
      list otherwise.
- [x] Frontend: `/uni-load` (sidebar link now live) — token-entry form when
      `has_token` is false, an assignment list with status pills otherwise.
      One real bug caught in review and fixed: overdue detection originally
      only matched the backend's internal "no submission yet" fallback
      string, which Canvas's real `unsubmitted` workflow_state never
      produces — so it would almost never have actually flagged anything
      overdue. Also fixed: due dates now render in Tashkent time explicitly
      (`timeZone: "Asia/Tashkent"`) instead of whatever timezone the
      Server Component happens to execute in.
- [x] `CANVAS_TOKEN_ENCRYPTION_KEY` and `CANVAS_SYNC_SECRET` generated and
      set on Railway; `canvas-sync-cron` created and deployed successfully.
- [x] **Verified with a real token** (2026-09-05): a real personal access
      token saved via `/uni-load`, manually-triggered sync pulled real
      courses/assignments/grades from Webster's actual Canvas instance —
      confirmed matching real percentages (e.g. 83.33%, 100%, 24.55%, 20%)
      against what the member's own Canvas account shows.
- [x] **Courses + grades grid** (2026-09-05): `/uni-load` now shows a
      "Courses" section above the assignment list — each course as a card
      with the member's real Canvas color (`GET /users/self/colors`, one
      call per sync) and current grade percentage
      (`include[]=total_scores` on the course-list call), "N/A" where
      ungraded. Migration `0012` adds `courses.current_score`/`.color`
      (nullable, no data loss). Matches the reference layout from TD
      Webster (a sibling Solura project) the user pointed to. Files/Modules
      access was explicitly scoped out for this pass — a Canvas token does
      carry access to both, a future addition if ever wanted.

## Sidebar urgent panel

Not one of the five numbered build-order items — a cross-cutting addition
to the app shell, requested after seeing item #4 in action.

**Status: SHIPPED, live in production (2026-09-05).**

- [x] `GET /me/urgent` merges three sources into one capped, sorted
      response: the viewer's own Canvas deadlines (due within 48h or
      overdue, per-member), stale active projects (no commit in 7+ days
      or none ever, team-wide), and clients with a fresh Telegram message
      in the last 24h (team-wide) — the last source is honestly scoped:
      the Telegram integration is read-only monitoring with no "team
      replied" event tracked anywhere, so this flags "something new here"
      rather than falsely claiming to detect an unanswered message.
      Always empty until Telegram is connected (item #5's remaining
      blocker), not an error.
- [x] Sidebar shows one merged, urgency-sorted list (not three separate
      sub-lists) below the nav, hides entirely when there's nothing
      urgent or the fetch fails — never blocks the rest of the app shell
      from rendering.
- [x] Two real bugs caught in review and fixed before shipping: the first
      pass's sort keys mixed incompatible scales (a small integer for
      stale-project "urgency" vs. real epoch-ms timestamps for the other
      two sources), so stale projects always outranked genuinely
      time-critical Canvas deadlines regardless of actual urgency — fixed
      by giving every row a real "deadline" on one shared clock (a stale
      project's deadline is when it crossed the 7-day threshold, a client
      message's is when its 24h freshness window closes), so the merged
      sort is driven by one consistent model instead of accidental scale
      collisions.

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
- [x] Bot token rotated and `TELEGRAM_BOT_TOKEN` set on Railway (2026-09-04);
      real `OPENAI_API_KEY` also set — summaries will generate once
      messages start flowing.
- [ ] **Blocked on you, not code:** connect Telegram Business on the
      dedicated Solura account (Premium + Settings → Telegram Business →
      Chatbots) — deliberately deferred until "the platform is finished."
      Once connected, run
      `python scripts/register_telegram_webhook.py <token> https://backend-production-7694a.up.railway.app/webhooks/telegram-business <TELEGRAM_WEBHOOK_SECRET>`
      and this item is fully live.
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
