-- Solura Eco — PostgREST grants for the newly-exposed solura_eco schema.
--
-- Adding a schema to Settings -> API -> Exposed schemas only lets PostgREST
-- *see* it; the underlying Postgres roles PostgREST authenticates as still
-- need explicit privileges, independent of RLS (RLS restricts rows a role
-- can see; GRANT controls whether the role can touch the table/schema at
-- all). Apply after 0001_init.sql and 0002_clients_projects.sql.

grant usage on schema solura_eco to anon, authenticated, service_role;

grant all on all tables in schema solura_eco to anon, authenticated, service_role;
grant all on all sequences in schema solura_eco to anon, authenticated, service_role;

-- So tables/sequences created by future migrations get the same grants
-- automatically, without a 0004_grants.sql every time.
alter default privileges in schema solura_eco
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema solura_eco
  grant all on sequences to anon, authenticated, service_role;
