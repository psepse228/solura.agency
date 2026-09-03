-- Solura Eco — auth columns on members.
-- Three real logins (not Supabase Auth/OAuth, not a shared password) --
-- see docs/superpowers/specs/2026-09-03-finish-clients-projects-view-design.md.
-- Nullable for now: seeding (0004 companion script) fills them in immediately
-- after this runs; NOT NULL would make this migration fail if members already
-- has rows from Canvas-only usage that predate login.

alter table solura_eco.members
  add column if not exists username text unique,
  add column if not exists password_hash text;
