# Solura Eco — plan

Status: brainstormed, not built. This doc is the handoff — read this before writing
any more code, on whatever machine picks it up next.

## Why this exists

Jonik (co-owner/CEO) is abroad for ~4 months studying — Solura runs mostly async
now. This isn't a productivity nice-to-have, it's the replacement for "just ask
in person": one shared source of truth so nobody has to ping the other two to
find out what's going on. Telegram-group-style notifications were considered
and explicitly rejected — the platform IS the place things live, not one more
channel to keep in sync with it.

## Team

Flat, equal access, no role gating — three people, all admins:
- **Rizo** — co-owner, CTO
- **Jonik** — co-owner, CEO (based in Austria)
- **Dior** — works across all projects, same as the other two

Auth just needs to recognize these three; no permission tiers to design or build.

## Scope

**In (v1):**
1. **Clients/Projects** — open it, see every active Solura client, status, progress. The home screen.
2. **Dev activity log** — auto-pulled per project from GitHub commits, Vercel deployments, and Claude Code session summaries, merged into one timeline. No manual upkeep.
3. **Uni load** — Canvas courses/assignments per member, so work gets assigned with visibility into who's slammed academically.
4. **Lead capture** — Solura's Telegram account (business account) → structured client records. New pipeline, doesn't exist today.
5. **Internal docs** — proposal (КП) and presentation library, per client. Not a general wiki/SOPs system — specifically the sales/client-facing documents you produce.

**Explicitly out for v1** (revisit once client base is bigger):
- Invoicing / payment tracking
- Contracts (signed status, etc.)
- Scheduling / calendar — no dedicated calendar view needed yet

**Dropped entirely:**
- Internal team Telegram bot for notifications — redundant with the platform being the single source of truth. Telegram's only role in this system is ingesting client messages, not broadcasting internal state.

## Build order

Sequenced by what actually removes async pain fastest, not by technical ease:

1. **Clients/Projects view** — even with entries added manually at first, this alone kills most "what's the status of X" pings. Ship this before any automation.
2. **Dev activity auto-pull** — GitHub + Vercel + Claude Code Remote sessions merged into the per-project timeline. Answers "what happened while I was asleep."
3. **Internal docs (КП/presentations) library** — per-client document store.
4. **Canvas sync** — uni load per member. Nobody's blocked without it, but it's low-effort once the Canvas client exists (already scaffolded in `backend/app/services/canvas_client.py`).
5. **Telegram Business bot lead capture** — last, because it's genuinely new infrastructure (parsing live chat into structured leads), not a wrapper around something that already exists. Highest effort, and the manual Business API connection step (Premium + Settings → Telegram Business → Chatbots) has to happen on the Solura account regardless of build order.

## Architecture

- **Frontend** — Next.js on Vercel, as `solura-eco/frontend/` in this same repo (monorepo, matching the repo-location decision below) — no project exists yet, create one when frontend build starts.
- **Backend** — FastAPI on Railway, same pattern as `cana-ai-tutor` / `lead-assistant`. Owns Canvas sync, the unified data API, the Telegram bot webhook. Frontend never touches Canvas or Telegram credentials directly.
- **Database** — Supabase, reusing `cana-ai-tutor`'s project (ref `djtdvxtfhqhbqsymzkyq`), isolated in its own `solura_eco` schema (not `public`) — see `supabase/migrations/0001_init.sql`. Remember: `solura_eco` must be added to Settings → API → Exposed schemas in the Supabase dashboard, or PostgREST won't serve it.
- **Integrations wired in for the dev-activity feed:**
  - GitHub (commits/PRs per linked repo)
  - Vercel (deployments/build status) — connector authorized, not yet used in code
  - Claude Code Remote sessions (`list_sessions`/`get_session`) — dev session summaries
- **Telegram:**
  - Client-facing bot (`@`-handle TBD) connected via Telegram Business API to the Solura account — listens to client DMs, extracts into lead/client records. Token already issued — **rotate it via BotFather before going live**, since it was shared in a chat transcript.
  - No internal/team bot.
- **Canvas** — each member's personal API token, per Webster's Instructure instance. See `docs/canvas-api-notes.md`.

## Open questions (unresolved — decide before or during build)

1. **Lead extraction depth** — when the Telegram bot logs a client message, does it just surface the raw thread for manual triage, or use OpenAI to pull structured fields (name, what they want, urgency) automatically? Same automation-vs-manual tradeoff as the dev log, unresolved for leads specifically.
2. **Auth mechanism** — flat 3-person access confirmed, but not yet decided: Supabase Auth with an email allowlist, or something even simpler given it's only 3 people forever (or until Solura scales, which would reopen the role-gating question).
3. **Vercel project** — no Vercel project exists for Solura Eco yet. (`webster-td` on Vercel is a separate, unrelated project — not this one; it was only referenced early on for context, not as this platform's deployment.) Confirmed: all of Solura's Vercel projects, including the `solura-agency` marketing site this repo also contains, live under the `muhammadrizomirzaahmedov-7014s-projects` scope — create Solura Eco's project there once the frontend build starts, pointed at `solura-eco/frontend/` in this monorepo (see "Resolved" below), named to match.

## Resolved

- **Repo location** — `solura-eco/` stays in the `solura.agency` repo. This repo is no longer just the marketing-site repo — it's becoming the whole company repo (website + ecosystem platform together). Not splitting it out.
- **Naming** — **Solura Eco**, settled. Renamed from the working title "Webster TD" once scope was clear it's the whole agency's platform, not a uni side-project.

## Data flow (target state)

```
Canvas API  --(poll, per member)-->  backend /sync  --> Supabase (solura_eco)
GitHub + Vercel + Claude Code Remote --(poll/webhook)--> backend --> activity timeline
Telegram (Business API, client DMs) --> backend webhook --> lead/client records
                                                              |
                                                              v
                                                  Frontend (Vercel) — the one
                                                  place all three of you look
```
