-- 0021_member_access_enabled.sql
-- Session tokens here are stateless (signed, 30-day expiry, no DB check
-- per request -- see auth/session.py) -- disabling a member has to be
-- checked on every request, not just at login, or an already-issued
-- token keeps working for up to 30 days after "access closed."
alter table solura_eco.members
  add column access_enabled boolean not null default true;
