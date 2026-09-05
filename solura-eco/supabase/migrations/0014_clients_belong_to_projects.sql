-- Solura Eco — reverse the clients/projects relationship.
--
-- Solura builds platforms and subscribes companies to them -- not
-- one-off bespoke work per client. So: a project (platform) has many
-- client companies subscribed to it, not the other way around.
--
-- Data migration (run once, values specific to this deploy):
--   - "Ulkan Development" becomes a client of the Argus project (it was
--     a real client that commissioned Argus).
--   - The "Solura" client row was a placeholder grouping Solura's own
--     products (Tender Agent, Cortège, Athena AI, solura-agency.com) --
--     not a real subscriber company. Deleted; those 4 projects start
--     with zero real clients under the new model, same as when they
--     were first seeded.

alter table solura_eco.clients
  add column project_id uuid references solura_eco.projects(id) on delete cascade;

update solura_eco.clients
  set project_id = (select id from solura_eco.projects where name = 'Argus')
  where name = 'Ulkan Development';

delete from solura_eco.clients where name = 'Solura';

alter table solura_eco.clients
  alter column project_id set not null;

create index clients_project_id_idx on solura_eco.clients(project_id);

alter table solura_eco.projects
  drop column client_id;
