-- Durable purchase completion, refund tombstones, and independent assisted results.
begin;
alter table cpi_private.purchase_deliveries
  add column product_kind text check(product_kind in ('sp','hints','credit','theme')),
  add column quantity integer check(quantity between 1 and 100000),
  add column theme text,
  add column revoked_at timestamptz;
-- Preserve immutable delivery details; workers may only change the revocation marker.
grant update(revoked_at) on cpi_private.purchase_deliveries to service_role;
create table cpi_private.purchase_refunds (
  fingerprint text primary key check(fingerprint ~ '^[a-f0-9]{64}$'),
  platform text not null check(platform in ('android','ios')),
  environment text not null check(environment in ('sandbox','production')),
  transaction_id text not null, event_id text not null,
  effective_at bigint not null,
  applied_quantity integer not null default 0,
  had_shortfall boolean not null default false,
  reversed_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(platform,environment,transaction_id)
);
create table cpi_private.purchase_completion_jobs (
  fingerprint text primary key references cpi_private.purchase_deliveries(fingerprint),
  payload_encrypted text, attempts integer not null default 0,
  next_attempt_at bigint not null, lease_until bigint not null default 0,
  completed_at bigint
);
create table cpi_private.provider_sync (
  name text primary key, cursor_private jsonb, lease_until bigint not null default 0,
  lease_token uuid,
  last_success_at bigint, last_failure_at bigint, caught_up_at bigint
);
-- The account issuer/profile owner lock also serializes purchasing with deletion.
create trigger commerce_deletion_guard before insert or update on cpi_private.commerce_wallets
  for each row execute function cpi_private.guard_deleting_account_write();
do $$ declare name text; begin
  foreach name in array array['purchase_refunds','purchase_completion_jobs','provider_sync'] loop
    execute format('alter table cpi_private.%I enable row level security',name);
    execute format('alter table cpi_private.%I force row level security',name);
    execute format('revoke all on cpi_private.%I from public,anon,authenticated',name);
    execute format('grant select,insert,update,delete on cpi_private.%I to service_role',name);
    execute format('create policy service_only on cpi_private.%I for all to service_role using(true) with check(true)',name);
  end loop;
end $$;
-- Refund/completion workers must continue after account deletion without retaining an identity map.
-- The random billing alias and transaction tombstone deliberately survive; no receipt or raw token in exports.
commit;
