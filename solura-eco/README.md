# Solura Eco

Internal ecosystem platform for Solura — Rizo, Jonik, and Dior. One place for
active clients and their progress, dev activity across our projects, uni load
(Canvas, since all three of us are at Webster University Tashkent), and the
proposal/presentation docs we send clients. Built because Jonik is abroad for
~4 months and we're now running mostly async — this replaces "just ask in
person," not sits next to it.

Full plan, scope, and build order: **[`docs/architecture.md`](./docs/architecture.md)** — read that before writing more code.

No Vercel project exists for this yet — `webster-td` on Vercel is a separate,
unrelated project, not this one. See `docs/architecture.md` open questions.

Stack mirrors our other Railway-deployed apps (`cana-ai-tutor`, `lead-assistant`):
FastAPI backend + Supabase (Postgres) + Telegram bot, OpenAI where it earns its
keep.

## Repo layout

```
solura-eco/
  backend/            FastAPI service — Canvas sync, dev-activity API, Telegram webhook
    app/
      main.py          entrypoint
      routers/         API routes (canvas, tasks, clients)
      services/        canvas_client, supabase_client
    requirements.txt
    .env.example
  frontend/            Next.js (App Router) — Clients/Projects home screen
    src/app/page.tsx    fetches GET /clients from the backend
    .env.example
  supabase/
    migrations/        SQL migrations (schema: solura_eco, shared Supabase project)
      0001_init.sql      members, Canvas sync tables, tasks_unified view
      0002_clients_projects.sql   clients, projects — build order item #1
  docs/
    architecture.md     the actual plan — scope, roles, build order, open questions
    canvas-api-notes.md Canvas API specifics
```

## Status

Build order item #1 (Clients/Projects view) is scaffolded end to end: schema
(`0002_clients_projects.sql`), backend CRUD (`/clients`, `POST
/clients/{id}/projects`, `PATCH .../projects/{id}`), and a frontend home page
that renders them with status pills and progress bars. Backend deps install
and import cleanly; frontend builds clean. **Not yet wired to a real
Supabase project** — no `.env` exists on any machine yet (correctly
gitignored). Once `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are set and both
migrations applied, `uvicorn app.main:app --reload` + `npm run dev` should
show real data.

No Vercel project exists for this yet — `webster-td` on Vercel is a separate,
unrelated project, not this one. See `docs/architecture.md` open questions.

Next up per the build order: dev-activity auto-pull (GitHub + Vercel +
Claude Code Remote sessions merged into a per-project timeline).
