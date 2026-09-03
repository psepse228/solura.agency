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
      routers/         API routes (canvas, tasks, ...)
      services/        canvas_client, supabase_client
    requirements.txt
    .env.example
  supabase/
    migrations/        SQL migrations (schema: solura_eco, shared Supabase project)
  docs/
    architecture.md     the actual plan — scope, roles, build order, open questions
    canvas-api-notes.md Canvas API specifics
```

Frontend (Next.js on Vercel) is not built yet — will live at `solura-eco/frontend/`
in this same repo (monorepo, see `docs/architecture.md`).

## Status

Brainstormed, not built. This is a scaffold (schema drafted, backend skeleton,
Supabase credentials wired locally) waiting on the actual build — see
`docs/architecture.md` for what's decided and what's still open.
