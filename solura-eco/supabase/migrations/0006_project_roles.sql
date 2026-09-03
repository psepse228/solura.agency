-- Solura Eco — project_roles: who's building vs. who's selling, per project.
-- A member can hold both roles on the same project; each role independently
-- ranges from 0 to 3 members (the whole team, forever, per architecture.md).

create table solura_eco.project_roles (
  project_id  uuid not null references solura_eco.projects(id) on delete cascade,
  member_id   uuid not null references solura_eco.members(id) on delete cascade,
  role_type   text not null check (role_type in ('dev', 'client_work')),
  primary key (project_id, member_id, role_type)
);

alter table solura_eco.project_roles enable row level security;
