-- CPI-030: detach an unresolved attempt without finishing it or losing a reward.
-- Proposed source only. No hosted migration or account activation.
begin;
alter table cpi_private.ranked_runs
  add column lease_active boolean not null default true,
  add constraint ranked_inactive_state check(lease_active or status in ('dead','verification_pending','finished'));
drop index cpi_private.ranked_runs_one_active_owner;
create unique index ranked_runs_one_active_owner on cpi_private.ranked_runs(user_id)
  where lease_active and status<>'finished';
create index ranked_runs_saved_owner_page on cpi_private.ranked_runs(user_id,created_at desc,id desc)
  where not lease_active and status<>'finished';
commit;
