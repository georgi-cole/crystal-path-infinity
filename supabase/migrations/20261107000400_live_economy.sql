-- New v11-live runs only. Earlier run rules and historical results are unchanged.
begin;
alter table cpi_private.ranked_runs drop constraint ranked_runs_sp_check;
alter table cpi_private.ranked_runs alter column sp type numeric(17,1);
alter table cpi_private.ranked_runs add constraint ranked_runs_sp_check check(
  case when ruleset_version='infinity-v11-live' then sp>=0 and sp<=4503599627370495.5 and mod(sp*2,1)=0
  else sp between 0 and 400 and mod(sp,1)=0 end
);
alter table cpi_private.ranked_runs drop constraint ranked_runs_revives_granted_check;
alter table cpi_private.ranked_runs add constraint ranked_runs_revives_granted_check check(revives_granted between 0 and case when ruleset_version='infinity-v11-live' then 15 else 10 end);
alter table cpi_private.verified_results drop constraint verified_results_revives_to_reach_score_check;
alter table cpi_private.verified_results add constraint verified_results_revives_to_reach_score_check check(revives_to_reach_score between 0 and case when ruleset_version='infinity-v11-live' then 15 else 10 end);
create table cpi_private.assisted_results (
  run_id uuid primary key references cpi_private.ranked_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ruleset_version text not null, last_cleared_row text not null,
  revives_to_reach_score smallint not null check(revives_to_reach_score between 0 and 15),
  achieved_at timestamptz, finalized_at timestamptz not null,
  country_snapshot text,continent_snapshot text,mapping_version text,
  published_at timestamptz not null default clock_timestamp()
);
create table cpi_private.resource_spends (
  id uuid primary key, user_id uuid references auth.users(id) on delete set null,
  wallet_id uuid not null references cpi_private.commerce_wallets(id),
  run_id uuid references cpi_private.ranked_runs(id) on delete set null,
  resource text not null check(resource in ('sp','hints','credit')), amount integer not null check(amount>0),
  created_at timestamptz not null default clock_timestamp()
);
create function cpi_private.publish_assisted_result(p_run uuid) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
declare source cpi_private.ranked_runs%rowtype;
begin
  select * into source from cpi_private.ranked_runs where id=p_run for update;
  if not found or source.status<>'finished' or source.finalized_at is null or not source.server_validated
     or source.ruleset_version<>'infinity-v11-live' or coalesce((source.checkpoint_private->'state'->'storeTest'->>'assisted')::boolean,false) is not true
     or exists(select 1 from cpi_private.reward_intents where run_id=p_run and state='pending')
     or exists(select 1 from cpi_private.revive_grants where run_id=p_run and state='granted') then raise exception 'Assisted run unavailable'; end if;
  insert into cpi_private.assisted_results(run_id,user_id,ruleset_version,last_cleared_row,revives_to_reach_score,achieved_at,finalized_at,country_snapshot,continent_snapshot,mapping_version)
    values(source.id,source.user_id,source.ruleset_version,source.last_cleared_row,source.revives_to_reach_score,source.achieved_at,source.finalized_at,source.country_snapshot,source.continent_snapshot,source.mapping_version)
    on conflict(run_id) do nothing;
end $$;
revoke all on function cpi_private.publish_assisted_result(uuid) from public,anon,authenticated;
grant execute on function cpi_private.publish_assisted_result(uuid) to service_role;
-- Defence in depth: an assisted checkpoint can never enter the official leaderboard table.
create function cpi_private.reject_assisted_official_result() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if exists(select 1 from cpi_private.ranked_runs where id=new.run_id and coalesce((checkpoint_private->'state'->'storeTest'->>'assisted')::boolean,false)) then raise exception 'Assisted score belongs to separate results'; end if;
  return new;
end $$;
revoke all on function cpi_private.reject_assisted_official_result() from public,anon,authenticated;
create trigger no_assisted_official_result before insert or update on cpi_private.verified_results for each row execute function cpi_private.reject_assisted_official_result();
create trigger assisted_deletion_guard before insert or update on cpi_private.assisted_results for each row execute function cpi_private.guard_deleting_account_write();
do $$ declare name text; begin
  foreach name in array array['assisted_results','resource_spends'] loop
    execute format('alter table cpi_private.%I enable row level security',name);
    execute format('alter table cpi_private.%I force row level security',name);
    execute format('revoke all on cpi_private.%I from public,anon,authenticated',name);
    execute format('grant select,insert on cpi_private.%I to service_role',name);
    execute format('create policy service_only on cpi_private.%I for all to service_role using(true) with check(true)',name);
  end loop;
end $$;
commit;
