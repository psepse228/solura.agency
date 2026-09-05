-- Solura Eco — Vercel/Railway deploy events.
-- projects.vercel_project already exists (unused so far) -- will hold the
-- real Vercel project ID (prj_...). New railway_service_ids handles
-- projects with more than one Railway service worth tracking (Argus has
-- a frontend + backend service, most others have exactly one or zero).

alter table solura_eco.projects
  add column railway_service_ids text[];
