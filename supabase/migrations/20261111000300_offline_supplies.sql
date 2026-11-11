-- Verified balances may be transferred once into a device's offline Infinity inventory.
begin;
create table cpi_private.offline_supply_allocations (
  id uuid primary key,
  wallet_id uuid not null references cpi_private.commerce_wallets(id),
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  sp integer not null check(sp between 0 and 10000),
  hints integer not null check(hints between 0 and 10000),
  credits integer not null check(credits between 0 and 10000),
  shields integer not null check(shields between 0 and 10000),
  season_changes integer not null check(season_changes between 0 and 10000),
  created_at timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz,
  check(sp+hints+credits+shields+season_changes > 0)
);
create index offline_supplies_pending on cpi_private.offline_supply_allocations(wallet_id) where acknowledged_at is null;
alter table cpi_private.offline_supply_allocations enable row level security;
alter table cpi_private.offline_supply_allocations force row level security;
revoke all on cpi_private.offline_supply_allocations from public,anon,authenticated,service_role;
grant select,insert on cpi_private.offline_supply_allocations to service_role;
grant update(acknowledged_at) on cpi_private.offline_supply_allocations to service_role;
create policy service_only on cpi_private.offline_supply_allocations for all to service_role using(true) with check(true);
create function cpi_private.export_own_offline_supplies(p_user uuid,p_cursor uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$
  with page as (
    select a.* from cpi_private.offline_supply_allocations a
      join cpi_private.commerce_wallets w on w.id=a.wallet_id
      where w.user_id=p_user and (p_cursor is null or a.id>p_cursor)
      order by a.id limit 101
  ) select jsonb_build_object(
    'allocations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sp',sp,'hints',hints,'continues',credits,'shields',shields,'seasonChanges',season_changes,'createdAt',created_at,'acknowledgedAt',acknowledged_at) order by id) from (select * from page order by id limit 100) exported),'[]'),
    'next',case when (select count(*) from page)>100 then (select id from page order by id offset 99 limit 1) else null end
  );
$$;
revoke all on function cpi_private.export_own_offline_supplies(uuid,uuid) from public,anon,authenticated;
grant execute on function cpi_private.export_own_offline_supplies(uuid,uuid) to service_role;
commit;
