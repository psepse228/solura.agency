# Solura Eco — Build Plan

Tracks progress against the build order in [architecture.md](./architecture.md).
Update the checkboxes as work lands; don't rewrite history above the divider.

## 1. Clients/Projects view — home screen

**Status: scaffolded and verified live, not yet used with real data.**

- [x] Schema: `clients` + `projects` tables (`0002_clients_projects.sql`)
- [x] Grants for the newly-exposed `solura_eco` schema (`0003_grants.sql`)
- [x] Backend: `GET/POST /clients`, `PATCH /clients/{id}`,
      `POST /clients/{id}/projects`, `PATCH /clients/projects/{id}`
- [x] Frontend: home page renders clients with nested projects, status pills,
      progress bars; degrades gracefully with no backend configured
- [x] Verified end-to-end against the real Supabase instance
      (`djtdvxtfhqhbqsymzkyq`, `solura_eco` schema) — both servers boot,
      `/clients` returns `200` with real (currently empty) data
- [ ] **Not done:** auth/login — anyone who can reach the frontend can hit
      the API right now. Open question 2 in architecture.md (Supabase Auth
      email allowlist vs. something simpler) is still unresolved — needs a
      decision before this goes anywhere but localhost.
- [ ] **Not done:** deploying either service (Vercel project for the
      frontend, Railway service inside the already-created but empty
      "Solura eco" project for the backend)
- [ ] **Not done:** seeding real client/project rows (Argus, Tender Agent,
      Cortège, cana-ai-tutor, this marketing site, etc.) — currently 0 rows

## 2. Dev-activity auto-pull

**Status: not started.**

GitHub (commits/PRs per linked repo) + Vercel (deployments/build status) +
Claude Code Remote sessions, merged into a per-project timeline. Needs:
- A `dev_events` table (or similar) keyed to `projects.id`
- A GitHub App or PAT + webhook (or polling) per linked repo
- Vercel API integration — architecture.md notes the connector is
  "authorized, not yet used in code"
- Claude Code Remote's `list_sessions`/`get_session` — needs the actual API
  shape checked before schema design

## 3. Internal docs (КП/presentations) library

**Status: not started.** Per-client document store — needs a decision on
storage (Supabase Storage vs. something else) before schema work starts.

## 4. Canvas sync — uni load

**Status: partially scaffolded from the original branch** — `canvas_client.py`
service stub and `courses`/`assignments`/`submissions` tables exist
(`0001_init.sql`), `/canvas` router is a placeholder. Not wired to real
Canvas tokens or tested against Webster's instance yet.

## 5. Telegram Business bot — lead capture

**Status: not started.** Explicitly last in the build order — genuinely new
infrastructure, plus a manual Business API connection step on the Solura
Telegram account regardless of when the code gets written. A token was
mentioned as already issued but shared in a chat transcript — **rotate it
via BotFather before it's used for anything real.**

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
