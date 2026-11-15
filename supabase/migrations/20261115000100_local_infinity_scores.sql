-- CPI-025/CPI-044: device gameplay with end-of-run, account-scoped best scores.
-- Device reports are deliberately separate from server-verified results.
begin;
create table cpi_private.infinity_device_bests (
  user_id uuid primary key references cpi_private.profile_owners(user_id) on delete cascade,
  run_id uuid not null unique,
  last_cleared_row text not null check (last_cleared_row ~ '^[1-9][0-9]{0,19}$'),
  revives_to_reach_score integer not null check (revives_to_reach_score between 0 and 15),
  active_time_ms bigint not null check (active_time_ms between 0 and 9007199254740991),
  country_snapshot text,
  continent_snapshot text,
  mapping_version text not null,
  achieved_at timestamptz not null default clock_timestamp(),
  check (last_cleared_row::numeric <= active_time_ms::numeric + 1),
  check ((country_snapshot is null) = (continent_snapshot is null)),
  check (continent_snapshot is null or continent_snapshot in ('AF','AS','EU','NA','SA','OC','AN'))
);
alter table cpi_private.infinity_device_bests enable row level security;
alter table cpi_private.infinity_device_bests force row level security;
revoke all on cpi_private.infinity_device_bests from public,anon,authenticated,service_role;
create index infinity_device_best_order on cpi_private.infinity_device_bests
  ((last_cleared_row::numeric) desc,revives_to_reach_score,achieved_at);

create function cpi_private.submit_infinity_score(
  p_user uuid,p_run uuid,p_rows text,p_revives integer,p_active_ms bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare
  old cpi_private.infinity_device_bests%rowtype;
  region jsonb;
begin
  if p_user is null or p_run is null or p_rows is null or p_rows !~ '^[1-9][0-9]{0,19}$'
     or p_revives is null or p_revives not between 0 and 15 or p_active_ms is null
     or p_active_ms not between 0 and 9007199254740991
     or p_rows::numeric > p_active_ms::numeric + 1 then
    raise exception 'Invalid Infinity score' using errcode='22023';
  end if;
  -- Owner identity comes exclusively from the authenticated server handler.
  perform 1 from cpi_private.profile_owners o join public.profiles_public p
    on p.public_id=o.public_id where o.user_id=p_user for update of o;
  if not found then raise exception 'Profile required' using errcode='22023'; end if;
  if exists (select 1 from cpi_private.infinity_device_bests where run_id=p_run and user_id<>p_user) then
    raise exception 'Run belongs to another account' using errcode='22023';
  end if;
  select * into old from cpi_private.infinity_device_bests where user_id=p_user;
  if found then
    if old.run_id=p_run then
      if old.last_cleared_row<>p_rows or old.revives_to_reach_score<>p_revives or old.active_time_ms<>p_active_ms then
        raise exception 'Conflicting score retry' using errcode='22023';
      end if;
      return jsonb_build_object('status','saved','runId',p_run);
    end if;
    if old.last_cleared_row::numeric>p_rows::numeric or
       (old.last_cleared_row=p_rows and old.revives_to_reach_score<=p_revives) then
      return jsonb_build_object('status','saved','runId',p_run);
    end if;
  end if;
  region:=cpi_private.snapshot_profile_region(p_user);
  insert into cpi_private.infinity_device_bests
    (user_id,run_id,last_cleared_row,revives_to_reach_score,active_time_ms,country_snapshot,continent_snapshot,mapping_version)
    values(p_user,p_run,p_rows,p_revives,p_active_ms,region->>'countryCode',region->>'continent',region->>'mappingVersion')
    on conflict(user_id) do update set run_id=excluded.run_id,last_cleared_row=excluded.last_cleared_row,
      revives_to_reach_score=excluded.revives_to_reach_score,active_time_ms=excluded.active_time_ms,
      country_snapshot=excluded.country_snapshot,continent_snapshot=excluded.continent_snapshot,
      mapping_version=excluded.mapping_version,achieved_at=clock_timestamp();
  return jsonb_build_object('status','saved','runId',p_run);
end
$function$;

create function cpi_private.read_infinity_scores(
  p_ruleset text,p_scope text,p_region text,p_mapping_version text,p_own_user uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
declare response jsonb;
begin
  if p_ruleset is distinct from 'infinity-device-v1' or p_scope is null or
    p_scope not in ('world','country','continent') or
    (p_scope='world' and (p_region is not null or p_mapping_version is not null)) or
    (p_scope<>'world' and (p_region is null or p_mapping_version is distinct from 'cpi-regions-2026-11-v1')) or
    (p_scope='country' and p_region !~ '^[A-Z]{2}$') or
    (p_scope='continent' and p_region not in ('AF','AS','EU','NA','SA','OC','AN')) then
    raise exception 'Invalid score scope' using errcode='22023';
  end if;
  with eligible as (
    select b.*,o.public_id,p.username from cpi_private.infinity_device_bests b
      join cpi_private.profile_owners o on o.user_id=b.user_id
      join public.profiles_public p on p.public_id=o.public_id
    where (p_scope='world' or (b.mapping_version=p_mapping_version and
      ((p_scope='country' and b.country_snapshot=p_region) or (p_scope='continent' and b.continent_snapshot=p_region))))
      and not exists(select 1 from cpi_private.leaderboard_suppressions s where s.public_id=o.public_id)
  ), ranked as (
    select b.*,row_number() over(order by last_cleared_row::numeric desc,
      revives_to_reach_score,achieved_at,public_id) as position from eligible b
  ), rendered as (
    select user_id,position,jsonb_build_object('rank',position::text,'publicId',public_id,'username',username,
      'countryCode',country_snapshot,'continentCode',continent_snapshot,'mappingVersion',mapping_version,
      'lastClearedRow',last_cleared_row,'revivesToReachScore',revives_to_reach_score,'achievedAt',achieved_at) as entry
      from ranked
  ), own as (select entry from rendered where user_id=p_own_user)
  select jsonb_build_object('schemaVersion',1,'rulesetVersion',p_ruleset,'scope',p_scope,'region',p_region,
    'mappingVersion',p_mapping_version,'count',(select count(*)::text from rendered),'updatedAt',statement_timestamp(),
    'top100',coalesce((select jsonb_agg(entry order by position) from rendered where position<=10),'[]'::jsonb),
    'own',(select entry from own),'neighbors',coalesce((select jsonb_agg(entry) from own),'[]'::jsonb)) into response;
  return response;
end
$function$;
revoke all on function cpi_private.submit_infinity_score(uuid,uuid,text,integer,bigint) from public,anon,authenticated,service_role;
revoke all on function cpi_private.read_infinity_scores(text,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function cpi_private.submit_infinity_score(uuid,uuid,text,integer,bigint) to service_role;
grant execute on function cpi_private.read_infinity_scores(text,text,text,text,uuid) to service_role;
create function cpi_private.export_infinity_score(p_user uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $function$
  select jsonb_build_object('runId',run_id,'rows',last_cleared_row,'revives',revives_to_reach_score,
    'activeTimeMs',active_time_ms,'countryCode',country_snapshot,'continentCode',continent_snapshot,
    'mappingVersion',mapping_version,'receivedAt',achieved_at)
  from cpi_private.infinity_device_bests where user_id=p_user;
$function$;
revoke all on function cpi_private.export_infinity_score(uuid) from public,anon,authenticated,service_role;
grant execute on function cpi_private.export_infinity_score(uuid) to service_role;
commit;
