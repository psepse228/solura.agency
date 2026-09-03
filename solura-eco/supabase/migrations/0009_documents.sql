-- Solura Eco — documents: КП/presentation files per project. The bytes
-- live in the private Supabase Storage bucket "project-docs" (already
-- created), keyed "{project_id}/{filename}" -- this table is metadata
-- only. No versioning: a re-upload is a new row, nothing overwrites an
-- older one automatically (see app/services/document_paths.py for how
-- filename collisions are handled without silently clobbering a file).

create table solura_eco.documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references solura_eco.projects(id) on delete cascade,
  doc_type      text not null check (doc_type in ('kp', 'presentation', 'other')),
  filename      text not null,
  storage_path  text not null,
  size_bytes    bigint not null,
  uploaded_by   uuid references solura_eco.members(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index documents_project_id_idx on solura_eco.documents(project_id, created_at desc);

alter table solura_eco.documents enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
