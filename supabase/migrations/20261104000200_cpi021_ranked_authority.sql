-- CPI-021/022: durable, private authority checkpoints and exact command receipts.
-- Source preparation only. Never automatically deploy alongside the CPI-017 gate.
begin;

alter table cpi_private.ranked_runs
  add column server_validated boolean not null default false,
  add column achieved_at timestamptz,
  add constraint ranked_authority_region_required check (
    not server_validated or (mapping_version is not null and region_snapshotted_at is not null)
  ),
  add constraint ranked_authority_progress_timestamp check (
    not server_validated or last_cleared_row='0' or achieved_at is not null
  ),
  add constraint ranked_authority_score_time check (
    achieved_at is null or (achieved_at >= created_at and achieved_at <= updated_at)
  );

-- No limit on route distance. Only one unresolved authoritative attempt can own
-- the account at once, including dead and pending-verification attempts.
create unique index ranked_runs_one_active_owner
  on cpi_private.ranked_runs(user_id) where status<>'finished';

-- Exact idempotency results live separately from bounded active checkpoints.
-- Account scope also binds start/recovery operations which have no command sequence.
create table cpi_private.ranked_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  run_id uuid not null references cpi_private.ranked_runs(id) on delete cascade,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  response_private jsonb not null check (jsonb_typeof(response_private)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id,idempotency_key)
);
create index ranked_receipts_run_time on cpi_private.ranked_receipts(run_id,created_at);

-- The foundation's legacy bigint ledger remains unchanged. The actual authority
-- uses canonical decimal strings through DB/API to avoid overflow and float loss.
create table cpi_private.ranked_action_audit (
  run_id uuid not null references cpi_private.ranked_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  command_sequence text not null check (
    command_sequence ~ '^[1-9][0-9]*$' and char_length(command_sequence)<=1000
  ),
  idempotency_key uuid not null,
  command_private jsonb not null check (jsonb_typeof(command_private)='object'),
  result_private jsonb not null check (jsonb_typeof(result_private)='object'),
  received_at timestamptz not null default clock_timestamp(),
  primary key (run_id,command_sequence),
  unique (user_id,idempotency_key)
);
create index ranked_action_audit_recent on cpi_private.ranked_action_audit(run_id,received_at);

-- Prevent mis-bound receipts/audit even if an adapter accidentally uses a foreign
-- run ID. The account lock and these composite references form distinct safeguards.
alter table cpi_private.ranked_runs add constraint ranked_runs_id_owner unique(id,user_id);
alter table cpi_private.ranked_receipts add constraint ranked_receipt_run_owner
  foreign key (run_id,user_id) references cpi_private.ranked_runs(id,user_id) on delete cascade;
alter table cpi_private.ranked_action_audit add constraint ranked_audit_run_owner
  foreign key (run_id,user_id) references cpi_private.ranked_runs(id,user_id) on delete cascade;

alter table cpi_private.ranked_receipts enable row level security;
alter table cpi_private.ranked_receipts force row level security;
alter table cpi_private.ranked_action_audit enable row level security;
alter table cpi_private.ranked_action_audit force row level security;
revoke all on cpi_private.ranked_receipts,cpi_private.ranked_action_audit
  from public,anon,authenticated,service_role;
grant select,insert,delete on cpi_private.ranked_receipts,cpi_private.ranked_action_audit to service_role;
-- Immutable receipts/audit cannot be overwritten by a retry. Cleanup is explicit;
-- active-run receipt deletion is forbidden by the deployment's retention policy.

commit;
