-- Solura Eco — real per-project accent colors, sampled from each product's
-- actual code (see the design spec's Part C table for sources). Nullable:
-- a project with no colors set falls back to the platform's own gradient.

alter table solura_eco.projects
  add column if not exists accent_start text,
  add column if not exists accent_end text;
