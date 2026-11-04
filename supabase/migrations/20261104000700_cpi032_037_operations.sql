-- CPI-032/037: explicit operational controls. No deployment or remote monitor.
begin;

create table cpi_private.operations_control (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 1 check(revision>0),
  ranked_starts_enabled boolean not null default false,
  ad_starts_enabled boolean not null default false,
  minimum_client_build integer not null default 1 check(minimum_client_build>0),
  recovery_minimum_client_build integer not null default 1 check(recovery_minimum_client_build>0),
  start_ruleset text not null default 'infinity-v1' check(start_ruleset ~ '^[A-Za-z0-9._-]{1,80}$'),
  recovery_rulesets text[] not null default array['infinity-v1']::text[],
  maintenance_code text not null default 'service_not_ready' check(maintenance_code in (
    'none','service_not_ready','scheduled_maintenance','backend_unavailable','reward_verification_delayed',
    'ruleset_review','client_update_required'
  )),
  updated_at timestamptz not null default clock_timestamp(),
  check(cardinality(recovery_rulesets) between 1 and 8),
  check(start_ruleset=any(recovery_rulesets)),
  check(recovery_minimum_client_build<=minimum_client_build)
);
insert into cpi_private.operations_control(singleton) values(true);

create table cpi_private.operations_control_audit (
  revision bigint primary key,
  actor_reference text not null check(actor_reference ~ '^[A-Za-z0-9:_-]{1,80}$'),
  policy jsonb not null check(jsonb_typeof(policy)='object'),
  changed_at timestamptz not null default clock_timestamp()
);

create function cpi_private.get_operations_policy() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $function$
  select jsonb_build_object('schemaVersion',1,'revision',revision::text,
    'rankedStartsEnabled',ranked_starts_enabled,'adStartsEnabled',ad_starts_enabled,
    'minimumClientBuild',minimum_client_build,'recoveryMinimumClientBuild',recovery_minimum_client_build,
    'startRuleset',start_ruleset,'recoveryRulesets',to_jsonb(recovery_rulesets),
    'maintenanceCode',maintenance_code,'updatedAt',updated_at)
  from cpi_private.operations_control where singleton
$function$;

-- No application service execution grant: operators need a separate privileged
-- connection, not a mobile flag or the normal server request credential.
create function cpi_private.set_operations_policy(
  p_expected_revision bigint,p_ranked_starts boolean,p_ad_starts boolean,
  p_minimum_client_build integer,p_recovery_minimum_client_build integer,
  p_start_ruleset text,p_recovery_rulesets text[],p_maintenance_code text,p_actor_reference text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare
  current cpi_private.operations_control%rowtype;
  output jsonb;
begin
  if p_expected_revision is null or p_expected_revision<1 or p_ranked_starts is null or p_ad_starts is null
     or p_minimum_client_build is null or p_minimum_client_build<1
     or p_recovery_minimum_client_build is null or p_recovery_minimum_client_build<1
     or p_recovery_minimum_client_build>p_minimum_client_build
     or p_start_ruleset is null or p_start_ruleset !~ '^[A-Za-z0-9._-]{1,80}$'
     or p_recovery_rulesets is null or cardinality(p_recovery_rulesets) not between 1 and 8
     or exists(select 1 from unnest(p_recovery_rulesets) r where r is null or r !~ '^[A-Za-z0-9._-]{1,80}$')
     or (select count(distinct r) from unnest(p_recovery_rulesets) r)<>cardinality(p_recovery_rulesets)
     or not(p_start_ruleset=any(p_recovery_rulesets))
     or p_maintenance_code is null or p_maintenance_code not in (
       'none','service_not_ready','scheduled_maintenance','backend_unavailable','reward_verification_delayed',
       'ruleset_review','client_update_required'
     ) or p_actor_reference is null or p_actor_reference !~ '^[A-Za-z0-9:_-]{1,80}$' then
    raise exception 'CPI_OPERATIONS_INVALID_POLICY' using errcode='22023';
  end if;
  select * into strict current from cpi_private.operations_control where singleton for update;
  if current.revision<>p_expected_revision then
    raise exception 'CPI_OPERATIONS_REVISION_CONFLICT' using errcode='40001';
  end if;
  -- A minimum/start-version rollout must not strand any unresolved attempt.
  -- Keep its reducer available, stop new starts and use a forward fix instead.
  if exists(select 1 from cpi_private.ranked_runs
      where server_validated and status<>'finished' and not(ruleset_version=any(p_recovery_rulesets))) then
    raise exception 'CPI_OPERATIONS_ACTIVE_RULESET' using errcode='55000';
  end if;
  update cpi_private.operations_control set revision=revision+1,
    ranked_starts_enabled=p_ranked_starts,ad_starts_enabled=p_ad_starts,
    minimum_client_build=p_minimum_client_build,recovery_minimum_client_build=p_recovery_minimum_client_build,
    start_ruleset=p_start_ruleset,recovery_rulesets=p_recovery_rulesets,maintenance_code=p_maintenance_code,
    updated_at=clock_timestamp() where singleton;
  output := cpi_private.get_operations_policy();
  insert into cpi_private.operations_control_audit(revision,actor_reference,policy)
    values((output->>'revision')::bigint,p_actor_reference,output);
  return output;
end
$function$;

create function cpi_private.check_operation_start(p_operation text,p_client_build integer,p_ruleset text)
returns void language plpgsql security definer set search_path=pg_catalog as $function$
declare
  policy cpi_private.operations_control%rowtype;
begin
  if p_operation is null or p_operation not in ('ranked','ad')
     or p_client_build is null or p_client_build<1 or p_ruleset is null then
    raise exception 'CPI_OPERATIONS_CONTEXT_REQUIRED' using errcode='22023';
  end if;
  -- Shared lock is held through the owner transaction: a disable becomes
  -- effective when the operator change commits, never midway through a start.
  select * into strict policy from cpi_private.operations_control where singleton for share;
  if (p_operation='ranked' and not policy.ranked_starts_enabled)
     or (p_operation='ad' and not policy.ad_starts_enabled) then
    raise exception 'CPI_OPERATIONS_MAINTENANCE' using errcode='55000';
  end if;
  if p_client_build<policy.minimum_client_build then
    raise exception 'CPI_OPERATIONS_UPDATE_REQUIRED' using errcode='55000';
  end if;
  if p_ruleset<>policy.start_ruleset then
    raise exception 'CPI_OPERATIONS_RULESET_UNAVAILABLE' using errcode='55000';
  end if;
end
$function$;

-- Called by a trusted build/session verifier INSIDE the owner transaction,
-- immediately before a new start. Never derive these values from its body.
create function cpi_private.authorize_operation_start(p_operation text,p_client_build integer,p_ruleset text)
returns void language plpgsql security invoker set search_path=pg_catalog as $function$
begin
  perform cpi_private.check_operation_start(p_operation,p_client_build,p_ruleset);
  perform set_config('cpi.start_'||p_operation,
    jsonb_build_object('clientBuild',p_client_build,'rulesetVersion',p_ruleset)::text,true);
end
$function$;

create function cpi_private.check_operation_recovery(p_client_build integer,p_ruleset text)
returns void language plpgsql security definer set search_path=pg_catalog as $function$
declare
  policy cpi_private.operations_control%rowtype;
begin
  if p_client_build is null or p_client_build<1 or p_ruleset is null then
    raise exception 'CPI_OPERATIONS_CONTEXT_REQUIRED' using errcode='22023';
  end if;
  select * into strict policy from cpi_private.operations_control where singleton for share;
  if p_client_build<policy.recovery_minimum_client_build then
    raise exception 'CPI_OPERATIONS_UPDATE_REQUIRED' using errcode='55000';
  end if;
  if not(p_ruleset=any(policy.recovery_rulesets)) then
    raise exception 'CPI_OPERATIONS_RECOVERY_UNAVAILABLE' using errcode='55000';
  end if;
end
$function$;

create function cpi_private.guard_operation_start() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $function$
declare
  operation text := tg_argv[0];
  context jsonb;
  build integer;
begin
  -- PostgreSQL fires BEFORE INSERT even for INSERT .. ON CONFLICT DO UPDATE.
  -- Existing authoritative checkpoints and exact intent retries must remain
  -- recoverable after disabling NEW starts. Their normal immutable/owner/unique
  -- constraints still validate the actual conflict/update.
  if tg_table_name='ranked_runs' then
    if exists(select 1 from cpi_private.ranked_runs where id=new.id) then return new; end if;
  elsif tg_table_name='reward_intents' then
    if exists(select 1 from cpi_private.reward_intents where id=new.id
      or (run_id=new.run_id and death_id=new.death_id)) then return new; end if;
  end if;
  begin
    context := nullif(current_setting('cpi.start_'||operation,true),'')::jsonb;
    if context is null or jsonb_typeof(context)<>'object'
       or jsonb_typeof(context->'clientBuild')<>'number'
       or context->>'rulesetVersion' is distinct from new.ruleset_version then
      raise exception 'CPI_OPERATIONS_CONTEXT_REQUIRED' using errcode='22023';
    end if;
    build := (context->>'clientBuild')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'CPI_OPERATIONS_CONTEXT_REQUIRED' using errcode='22023';
  end;
  perform cpi_private.check_operation_start(operation,build,new.ruleset_version);
  return new;
end
$function$;
create trigger cpi037_ranked_start_control before insert on cpi_private.ranked_runs
  for each row execute function cpi_private.guard_operation_start('ranked');
create trigger cpi037_ad_start_control before insert on cpi_private.reward_intents
  for each row execute function cpi_private.guard_operation_start('ad');

-- Ninety-day operational decision audit; no account or demographic data.
create function cpi_private.purge_operations_audit() returns integer
language plpgsql security definer set search_path=pg_catalog as $function$
declare
  removed integer;
begin
  delete from cpi_private.operations_control_audit where changed_at<statement_timestamp()-interval '2160 hours';
  get diagnostics removed=row_count;
  return removed;
end
$function$;

alter table cpi_private.operations_control enable row level security;
alter table cpi_private.operations_control force row level security;
alter table cpi_private.operations_control_audit enable row level security;
alter table cpi_private.operations_control_audit force row level security;
revoke all on cpi_private.operations_control,cpi_private.operations_control_audit from public,anon,authenticated,service_role;
grant select on cpi_private.operations_control,cpi_private.operations_control_audit to service_role;
revoke all on function cpi_private.get_operations_policy() from public,anon,authenticated,service_role;
revoke all on function cpi_private.set_operations_policy(bigint,boolean,boolean,integer,integer,text,text[],text,text)
  from public,anon,authenticated,service_role;
revoke all on function cpi_private.check_operation_start(text,integer,text) from public,anon,authenticated,service_role;
revoke all on function cpi_private.authorize_operation_start(text,integer,text) from public,anon,authenticated,service_role;
revoke all on function cpi_private.check_operation_recovery(integer,text) from public,anon,authenticated,service_role;
revoke all on function cpi_private.guard_operation_start() from public,anon,authenticated,service_role;
revoke all on function cpi_private.purge_operations_audit() from public,anon,authenticated,service_role;
grant execute on function cpi_private.get_operations_policy() to service_role;
grant execute on function cpi_private.check_operation_start(text,integer,text) to service_role;
grant execute on function cpi_private.authorize_operation_start(text,integer,text) to service_role;
grant execute on function cpi_private.check_operation_recovery(integer,text) to service_role;
grant execute on function cpi_private.guard_operation_start() to service_role;

commit;
