# Webster TD

Internal platform for the three of us at Webster University Tashkent — one place
for uni (Canvas) and Solura work to live together instead of split across
Canvas, Notion, group chats, and memory.

Live: https://vercel.com/muhammadrizomirzaahmedov-7014s-projects/webster-td
Stack mirrors our other Railway-deployed apps (`cana-ai-tutor`, `lead-assistant`):
FastAPI backend + Supabase (Postgres) + Telegram bot, OpenAI where it earns its
keep. Frontend on Vercel talks to the backend for anything that needs the
Canvas token or a background job.

## Why this exists

Three Webster students who also run an automation agency, juggling:
- Canvas: courses, assignments, due dates, grades — per person, no shared view.
- Solura work: client tasks, delivery deadlines — currently nowhere structured.
- Coordination: who's doing what, what's due when, across both.

One unified task view, synced from Canvas automatically, with work tasks
sitting next to it — and a Telegram bot that nags before things are due.

## Repo layout

```
webster-td/
  backend/            FastAPI service — Canvas sync, unified task API, bot webhook
    app/
      main.py          entrypoint
      routers/         API routes (canvas, tasks, members)
      services/        canvas_client, sync logic, telegram
    requirements.txt
    .env.example
  supabase/
    migrations/        SQL migrations, applied via `supabase db push` or the SQL editor
  docs/
    architecture.md     how the pieces fit together, open questions
    canvas-api-notes.md what we know about the Canvas API + our tokens
```

Frontend (Next.js on Vercel, project `webster-td`) is not in this repo yet —
add it as `webster-td/frontend/` or its own repo once we decide (see
`docs/architecture.md`).

## Status

Scaffolded, not wired up. Schema and folder structure are a starting point for
brainstorming — nothing here has run against real Canvas data yet. See
`docs/architecture.md` for the open questions to settle first.
