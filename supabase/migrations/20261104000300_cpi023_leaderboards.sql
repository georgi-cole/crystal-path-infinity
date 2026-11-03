-- CPI-023: trusted finalization and lossless scoped leaderboard snapshots.
-- Source preparation only. Deployment is a separate reviewed operation.
begin;

alter table cpi_private.verified_results
  add column continent_snapshot text,
  add column mapping_version text,
  add column published_at timestamptz,
  add constraint verified_results_region_pair check (
    published_at is null or ((country_snapshot is null) = (continent_snapshot is null)
    and (continent_snapshot is null or continent_snapshot in ('AF','AS','EU','NA','SA','OC','AN')))
  );

-- Legacy foundation fixtures do not acquire authority by existing. Only the
-- publisher below sets published_at after validating the server-owned run.
create index verified_results_lossless_order
  on cpi_private.verified_results
  (ruleset_version, (last_cleared_row::numeric) desc,
   revives_to_reach_score, achieved_at, run_id)
  where published_at is not null and last_cleared_row <> '0';
create index verified_results_region_order
  on cpi_private.verified_results
  (ruleset_version, mapping_version, country_snapshot, continent_snapshot)
  where published_at is not null;

-- Final results are immutable. Deletion remains possible through account/run
-- cascades; an administrative visibility change never rewrites gameplay.
create function cpi_private.reject_result_update() returns trigger
language plpgsql set search_path = pg_catalog as $function$
begin
  raise exception 'Final results are immutable' using errcode = '55000';
end
$function$;
create trigger verified_results_immutable
  before update on cpi_private.verified_results
  for each row execute function cpi_private.reject_result_update();

create function cpi_private.publish_ranked_result(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $function$
declare
  source cpi_private.ranked_runs%rowtype;
  existing cpi_private.verified_results%rowtype;
  run_owner uuid;
begin
  -- The common lock order is owner -> run, including account deletion and
  -- ranked/reward writers. The first read discovers identity without a lock;
  -- the locked re-read below fences a concurrent deletion or missing run.
  select user_id into run_owner from cpi_private.ranked_runs where id = p_run_id;
  if not found then
    raise exception 'Run is unavailable' using errcode = '22023';
  end if;
  perform 1 from cpi_private.profile_owners where user_id = run_owner for update;
  if not found then
    raise exception 'Published profile is unavailable' using errcode = '55000';
  end if;
  select * into source from cpi_private.ranked_runs
    where id = p_run_id and user_id = run_owner for update;
  if not found then
    raise exception 'Run is unavailable' using errcode = '22023';
  end if;
  select * into existing from cpi_private.verified_results where run_id = p_run_id;
  if found and existing.published_at is not null then
    return jsonb_build_object('status','published','lastClearedRow',existing.last_cleared_row,
      'revivesToReachScore',existing.revives_to_reach_score,'achievedAt',existing.achieved_at);
  elsif found then
    raise exception 'Legacy result requires explicit review' using errcode = '55000';
  end if;
  if source.status <> 'finished' or source.finalized_at is null
     or not source.server_validated or source.mapping_version is null
     or source.region_snapshotted_at is null
     or (source.last_cleared_row <> '0' and source.achieved_at is null)
     or (source.achieved_at is not null and
         (source.achieved_at < source.created_at or source.achieved_at > source.finalized_at))
     or exists (select 1 from cpi_private.reward_intents where run_id = p_run_id and state = 'pending')
     or exists (select 1 from cpi_private.revive_grants where run_id = p_run_id and state = 'granted') then
    raise exception 'Run is not ready for publication' using errcode = '55000';
  end if;
  if not exists (
    select 1 from cpi_private.profile_owners o
      join public.profiles_public p on p.public_id = o.public_id
    where o.user_id = source.user_id
  ) then
    raise exception 'Published profile is unavailable' using errcode = '55000';
  end if;
  insert into cpi_private.verified_results
    (run_id,user_id,ruleset_version,last_cleared_row,revives_to_reach_score,
     achieved_at,country_snapshot,continent_snapshot,mapping_version,finalized_at,published_at)
  values (source.id,source.user_id,source.ruleset_version,source.last_cleared_row,
    source.revives_to_reach_score,source.achieved_at,source.country_snapshot,
    source.continent_snapshot,source.mapping_version,source.finalized_at,clock_timestamp());
  return jsonb_build_object('status','published','lastClearedRow',source.last_cleared_row,
    'revivesToReachScore',source.revives_to_reach_score,'achievedAt',source.achieved_at);
end
$function$;

-- Minimal private suppression hook for the future authenticated moderation
-- service. Both player-wide and run-specific suppression affect every scope
-- immediately. CPI-025 still owns reports, staff authorization and tooling.
create table cpi_private.leaderboard_suppressions (
  target_key text primary key,
  public_id uuid references public.profiles_public(public_id) on delete cascade,
  run_id uuid references cpi_private.verified_results(run_id) on delete cascade,
  reason_code text not null check (reason_code in ('name_review','account_review','confirmed_invalid')),
  changed_at timestamptz not null default clock_timestamp(),
  constraint leaderboard_suppression_target check (
    (public_id is not null and run_id is null and target_key = 'player:' || public_id::text)
    or (public_id is null and run_id is not null and target_key = 'run:' || run_id::text)
  )
);
create index leaderboard_suppressions_player on cpi_private.leaderboard_suppressions(public_id);
create index leaderboard_suppressions_run on cpi_private.leaderboard_suppressions(run_id);
create table cpi_private.leaderboard_moderation_events (
  id bigint generated always as identity primary key,
  target_key text not null,
  public_id uuid references public.profiles_public(public_id) on delete cascade,
  run_id uuid references cpi_private.verified_results(run_id) on delete cascade,
  suppressed boolean not null,
  reason_code text not null,
  actor_reference text not null check (char_length(actor_reference) between 1 and 80),
  recorded_at timestamptz not null default clock_timestamp(),
  constraint leaderboard_moderation_target check ((public_id is null) <> (run_id is null))
);
alter table cpi_private.leaderboard_suppressions enable row level security;
alter table cpi_private.leaderboard_suppressions force row level security;
alter table cpi_private.leaderboard_moderation_events enable row level security;
alter table cpi_private.leaderboard_moderation_events force row level security;
revoke all on cpi_private.leaderboard_suppressions,cpi_private.leaderboard_moderation_events
  from public,anon,authenticated,service_role;
grant select on cpi_private.leaderboard_suppressions,cpi_private.leaderboard_moderation_events to service_role;
revoke all on sequence cpi_private.leaderboard_moderation_events_id_seq
  from public,anon,authenticated,service_role;

create function cpi_private.set_leaderboard_suppression(
  p_public_id uuid, p_run_id uuid, p_suppressed boolean, p_actor_reference text,
  p_reason_code text
) returns void language plpgsql security definer set search_path = pg_catalog as $function$
declare
  target text;
begin
  if (p_public_id is null) = (p_run_id is null) or p_suppressed is null
     or p_actor_reference is null or char_length(p_actor_reference) not between 1 and 80
     or p_reason_code is null or p_reason_code not in ('name_review','account_review','confirmed_invalid') then
    raise exception 'Invalid moderation operation' using errcode = '22023';
  end if;
  target := case when p_public_id is not null then 'player:' || p_public_id::text else 'run:' || p_run_id::text end;
  -- Serialize a hide/restore pair even when the suppression row is absent.
  perform pg_advisory_xact_lock(hashtextextended('cpi023:' || target, 0));
  if p_suppressed then
    insert into cpi_private.leaderboard_suppressions(target_key,public_id,run_id,reason_code)
      values (target,p_public_id,p_run_id,p_reason_code)
      on conflict (target_key) do update set reason_code = excluded.reason_code, changed_at = clock_timestamp();
  else
    delete from cpi_private.leaderboard_suppressions where target_key = target;
  end if;
  insert into cpi_private.leaderboard_moderation_events
    (target_key,public_id,run_id,suppressed,reason_code,actor_reference)
    values (target,p_public_id,p_run_id,p_suppressed,p_reason_code,p_actor_reference);
end
$function$;

create function cpi_private.read_leaderboard(
  p_ruleset text, p_scope text default 'world', p_region text default null,
  p_mapping_version text default null, p_own_user uuid default null
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $function$
declare
  response jsonb;
begin
  if p_ruleset is null or char_length(p_ruleset) not between 1 and 80
     or p_scope is null or p_scope not in ('world','continent','country')
     or (p_scope = 'world' and (p_region is not null or p_mapping_version is not null))
     or (p_scope <> 'world' and (p_region is null or p_mapping_version is null
       or char_length(p_mapping_version) not between 1 and 80))
     or (p_scope = 'country' and p_region !~ '^[A-Z]{2}$')
     or (p_scope = 'continent' and p_region not in ('AF','AS','EU','NA','SA','OC','AN')) then
    raise exception 'Invalid leaderboard scope' using errcode = '22023';
  end if;
  -- One statement and one MVCC snapshot select bests, ranks and neighborhoods.
  -- No mutable best-pointer can lose a concurrent better finalization.
  with eligible as (
    select r.*, o.public_id, p.username
    from cpi_private.verified_results r
      join cpi_private.profile_owners o on o.user_id = r.user_id
      join public.profiles_public p on p.public_id = o.public_id
    where r.ruleset_version = p_ruleset and r.published_at is not null
      and r.last_cleared_row <> '0'
      and (p_scope = 'world' or (r.mapping_version = p_mapping_version and
        ((p_scope = 'country' and r.country_snapshot = p_region)
         or (p_scope = 'continent' and r.continent_snapshot = p_region))))
      and not exists (select 1 from cpi_private.leaderboard_suppressions s
        where s.public_id = o.public_id or s.run_id = r.run_id)
  ), bests as (
    select distinct on (user_id) * from eligible
    order by user_id,last_cleared_row::numeric desc,revives_to_reach_score,achieved_at,run_id
  ), ranked as (
    select b.*,row_number() over (
      order by last_cleared_row::numeric desc,revives_to_reach_score,achieved_at,public_id,run_id
    ) as position from bests b
  ), rendered as (
    select user_id,position,jsonb_build_object(
      'rank',position::text,'publicId',public_id,'username',username,
      'countryCode',country_snapshot,'continentCode',continent_snapshot,
      'mappingVersion',mapping_version,'lastClearedRow',last_cleared_row,
      'revivesToReachScore',revives_to_reach_score,'achievedAt',achieved_at
    ) as entry from ranked
  ), own as (select position,entry from rendered where user_id = p_own_user)
  select jsonb_build_object(
    'schemaVersion',1,'rulesetVersion',p_ruleset,'scope',p_scope,'region',p_region,
    'mappingVersion',p_mapping_version,'count',(select count(*)::text from rendered),
    'updatedAt',statement_timestamp(),
    'top100',coalesce((select jsonb_agg(entry order by position) from rendered where position <= 100),'[]'::jsonb),
    'own', (select entry from own),
    'neighbors',coalesce((select jsonb_agg(r.entry order by r.position) from rendered r
      where r.position between (select position - 2 from own) and (select position + 2 from own)), '[]'::jsonb)
  ) into response;
  return response;
end
$function$;

-- No app role can call private functions, even if exposure is misconfigured.
revoke all on function cpi_private.reject_result_update() from public,anon,authenticated,service_role;
revoke all on function cpi_private.publish_ranked_result(uuid) from public,anon,authenticated,service_role;
revoke all on function cpi_private.set_leaderboard_suppression(uuid,uuid,boolean,text,text)
  from public,anon,authenticated,service_role;
revoke all on function cpi_private.read_leaderboard(text,text,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function cpi_private.publish_ranked_result(uuid) to service_role;
grant execute on function cpi_private.set_leaderboard_suppression(uuid,uuid,boolean,text,text) to service_role;
grant execute on function cpi_private.read_leaderboard(text,text,text,text,uuid) to service_role;
revoke insert,update,delete,truncate on cpi_private.verified_results from service_role;

commit;
