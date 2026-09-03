# Supabase

Schema lives in `migrations/`, plain SQL — no Supabase CLI project is
initialized here yet since there's no Supabase project to point it at.

## To stand this up

1. Create a Supabase project (or reuse one if we decide to share
   `cana-ai-tutor`'s — probably don't, keep client/university data separate).
2. `supabase login && supabase link --project-ref <ref>` from `solura-eco/`,
   or just paste `migrations/0001_init.sql` into the SQL editor for now.
3. Put the project's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into
   `backend/.env` (see `backend/.env.example`) and, once the Railway service
   exists, as Railway variables — same pattern as `cana-ai-tutor`.

## Migrations

One file per change, numbered (`0002_...sql`, `0003_...sql`). Nothing
generated — write them by hand and apply with `supabase db push` once linked.
