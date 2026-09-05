-- 0019_leads_converted_client.sql
-- Converting a lead was previously just a label + a project link --
-- nothing actually created the client, so "converted" leads and real
-- clients felt like the same thing tracked twice. Now converting a lead
-- (status -> 'converted' with a converted_project_id) creates the real
-- clients row and records it here, so the lead becomes a paper trail for
-- how that client was won, not a duplicate of the client itself.
alter table solura_eco.leads
  add column converted_client_id uuid references solura_eco.clients(id) on delete set null;
