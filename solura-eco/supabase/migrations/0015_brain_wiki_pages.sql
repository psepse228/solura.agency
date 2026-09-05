-- Solura Eco — Brain/Database: a read-only mirror of the Solura Obsidian
-- Vault's real pages. The vault lives on a local machine (Obsidian Sync,
-- not git), so this table is populated by a one-off/manually-re-run local
-- sync script (scripts/sync_vault_to_db.py), not a live connection --
-- Railway/Vercel have no access to the vault's filesystem.

create table solura_eco.wiki_pages (
  id             uuid primary key default gen_random_uuid(),
  path           text not null unique,     -- e.g. 'projects/solura/entities/solura-eco'
  title          text not null,
  category       text,                     -- entities / concepts / skills / project / references
  tags           text[],
  summary        text,
  tier           text,                     -- core / supporting / peripheral
  lifecycle      text,                     -- draft / active / stale etc
  body_markdown  text not null,
  wiki_updated_at timestamptz,             -- the page's own 'updated' frontmatter field
  synced_at      timestamptz not null default now()
);

create index wiki_pages_category_idx on solura_eco.wiki_pages(category);

alter table solura_eco.wiki_pages enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
