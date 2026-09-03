# Architecture — working draft

## Pieces

- **Frontend** — Next.js on Vercel (`webster-td` project already exists there).
  Not scaffolded in this repo yet — decide: lives in `webster-td/frontend/`
  here, or its own repo connected straight to Vercel. Own repo is cleaner for
  Vercel's build pipeline; monorepo is easier to keep frontend/backend in sync
  while we're still shaping the schema. Lean towards own repo once the API
  shape stabilizes, monorepo for now.
- **Backend** — FastAPI on Railway, same pattern as `cana-ai-tutor` and
  `lead-assistant`. Owns: Canvas sync, the unified task API, the Telegram
  bot webhook. Frontend never talks to Canvas directly — token stays
  server-side.
- **Database** — Supabase (Postgres). Same as `cana-ai-tutor`. Gives us
  auth (if we want per-member login later), row-level security, and a
  hosted Postgres without standing up our own.
- **Canvas** — each member has their own Canvas API token (generated under
  Account → Settings → New Access Token in Canvas). Backend polls
  `/api/v1/users/self/courses` and `/api/v1/courses/:id/assignments` per
  member on a schedule (cron on Railway, or an n8n workflow hitting our
  `/sync` endpoint — n8n is probably simpler since that's where our other
  scheduled jobs already live).
- **Telegram bot** — reminders before due dates, maybe a `/tasks` command
  for "what's due this week" across uni + work.

## Open questions to brainstorm

1. **Sync trigger**: n8n cron hitting a `/internal/sync` endpoint vs. a
   Railway cron service vs. FastAPI's own background scheduler. n8n keeps it
   consistent with how we run everything else for clients — probably the
   move, but means webster-td's backend needs an authenticated internal
   endpoint n8n can call.
2. **Token storage**: Canvas tokens are long-lived and full-access. Store
   encrypted in `members.canvas_api_token` (pgcrypto) rather than plaintext,
   even though this is a 3-person private tool — cheap to do now, expensive
   to retrofit.
3. **Work tasks source of truth**: manual entry in our own UI, or pull from
   somewhere we already track client work (Airtable)? If Airtable's already
   the system of record for Solura delivery, sync it in rather than
   duplicating entry.
4. **Frontend repo**: see above — own repo vs. monorepo folder.
5. **Auth**: do we even need login, or is this three people behind a shared
   URL / Telegram-gated for now? Supabase Auth is there if we want it later;
   don't build it before it's needed.

## Data flow (once wired up)

```
Canvas API  --(poll, per member)-->  FastAPI /sync  --> Supabase (courses, assignments)
                                                              |
Airtable (work) --(poll or webhook)-->  FastAPI /sync  ------+--> tasks_unified view
                                                              |
                                                              v
                                                  Frontend (Vercel) reads unified tasks
                                                  Telegram bot reads upcoming due dates,
                                                  sends reminders
```
