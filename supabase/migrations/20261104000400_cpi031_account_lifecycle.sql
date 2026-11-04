-- CPI-031: trusted reauthentication, bounded self export and durable deletion.
-- Proposed migration; no hosted deployment or public account activation.
begin;

-- Only fingerprints of already server-verified, short-lived proofs are retained.
-- Their identity link is erased by Auth deletion; expired rows are purged hourly.
create table cpi_private.account_reauth_uses (
  proof_hash text primary key check (proof_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid references auth.users(id) on delete set null,
  purpose text not null check (purpose in ('export','delete')),
  consumed_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at > consumed_at and expires_at <= consumed_at + interval '5 minutes')
);

-- A committed request freezes account writes while external issuer revocation
-- is retried. It never falsely claims that either revocation or deletion finished.
create table cpi_private.account_deletion_requests (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  requested_at timestamptz not null default clock_timestamp()
);

-- Completed receipts contain no account/public ID or recoverable identity map.
-- The random capability supports status-only recovery after tokens are revoked.
create table cpi_private.account_deletion_receipts (
  request_id uuid primary key,
  requested_at timestamptz not null,
  revocation_confirmed_at timestamptz not null,
  completed_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '168 hours',
  check (requested_at <= revocation_confirmed_at and revocation_confirmed_at <= completed_at),
  check (expires_at > completed_at and expires_at <= completed_at + interval '168 hours 1 minute')
);

create function cpi_private.lifecycle_lock_owner(p_user_id uuid) returns void
language plpgsql security invoker set search_path = pg_catalog as $function$
begin
  insert into cpi_private.profile_owners(user_id) values(p_user_id)
    on conflict(user_id) do nothing;
  perform 1 from cpi_private.profile_owners where user_id=p_user_id for update;
  if not found then
    raise exception 'CPI_ACCOUNT_UNAVAILABLE' using errcode='22023';
  end if;
end
$function$;

create function cpi_private.consume_account_reauthentication(
  p_user_id uuid,p_proof_hash text,p_purpose text,p_expires_at timestamptz
) returns void language plpgsql security invoker set search_path = pg_catalog as $function$
begin
  if p_user_id is null or p_proof_hash is null or p_proof_hash !~ '^[a-f0-9]{64}$'
     or p_purpose is null or p_purpose not in ('export','delete')
     or p_expires_at is null or p_expires_at <= clock_timestamp()
     or p_expires_at > clock_timestamp()+interval '5 minutes' then
    raise exception 'CPI_ACCOUNT_REAUTH_REQUIRED' using errcode='22023';
  end if;
  perform cpi_private.lifecycle_lock_owner(p_user_id);
  begin
    insert into cpi_private.account_reauth_uses(proof_hash,user_id,purpose,expires_at)
      values(p_proof_hash,p_user_id,p_purpose,p_expires_at);
  exception when unique_violation then
    raise exception 'CPI_ACCOUNT_REAUTH_REPLAY' using errcode='22023';
  end;
end
$function$;

-- Each collection is keyset-paginated independently with a fixed 100-row page.
-- The trusted adapter issues one-time subproofs from one fresh reauth ceremony;
-- cursors grant no identity or authority and cannot select another account.
create function cpi_private.export_account_page(
  p_user_id uuid,p_after_consent uuid default null,p_after_parental uuid default null,
  p_after_run uuid default null,p_after_result uuid default null
) returns jsonb language plpgsql security invoker set search_path = pg_catalog as $function$
declare
  result jsonb;
begin
  perform cpi_private.lifecycle_lock_owner(p_user_id);
  with consent_page as (
    select id,purpose,decision,policy_version,jurisdiction,recorded_at
    from cpi_private.consent_events where user_id=p_user_id
      and (p_after_consent is null or id>p_after_consent) order by id limit 101
  ), parental_page as (
    select id,purpose,state,verified_at,revoked_at,created_at
    from cpi_private.parental_authorizations where user_id=p_user_id
      and (p_after_parental is null or id>p_after_parental) order by id limit 101
  ), run_page as (
    select id,ruleset_version,status,sp,hints,last_cleared_row,current_row,
      revives_granted,revives_applied,revives_to_reach_score,active_time_ms,
      country_snapshot,continent_snapshot,mapping_version,created_at,updated_at,finalized_at
    from cpi_private.ranked_runs where user_id=p_user_id
      and (p_after_run is null or id>p_after_run) order by id limit 101
  ), result_page as (
    select run_id,ruleset_version,last_cleared_row,revives_to_reach_score,achieved_at,
      country_snapshot,continent_snapshot,mapping_version,finalized_at,published_at
    from cpi_private.verified_results where user_id=p_user_id
      and (p_after_result is null or run_id>p_after_result) order by run_id limit 101
  )
  select jsonb_build_object(
    'schemaVersion',1,'exportedAt',statement_timestamp(),
    'profile',(select jsonb_build_object('publicId',p.public_id,'username',p.username,
      'countryCode',p.country_code,'createdAt',p.created_at,'updatedAt',p.updated_at)
      from public.profiles_public p join cpi_private.profile_owners o using(public_id)
      where o.user_id=p_user_id),
    'privateProfile',(select jsonb_build_object(
      'analyticsAgeBand',case when q.age_response_at>statement_timestamp()-interval '365 days'
        then q.analytics_age_band end,
      'ageResponseAt',case when q.age_response_at>statement_timestamp()-interval '365 days'
        then q.age_response_at end,
      'privacyContext',q.privacy_context,'contextUpdatedAt',q.context_updated_at)
      from cpi_private.profiles_private q where q.user_id=p_user_id),
    'consents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'purpose',purpose,
      'decision',decision,'policyVersion',policy_version,'jurisdiction',jurisdiction,
      'recordedAt',recorded_at) order by id) from (select * from consent_page order by id limit 100) q),'[]'::jsonb),
    'parentalAuthorizations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'purpose',purpose,
      'state',state,'verifiedAt',verified_at,'revokedAt',revoked_at,'createdAt',created_at) order by id)
      from (select * from parental_page order by id limit 100) q),'[]'::jsonb),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('runId',id,'rulesetVersion',ruleset_version,
      'status',status,'sp',sp,'hints',hints,'lastClearedRow',last_cleared_row,'currentRow',current_row,
      'revivesGranted',revives_granted,'revivesApplied',revives_applied,
      'revivesToReachScore',revives_to_reach_score,'activeTimeMs',active_time_ms::text,
      'countryCode',country_snapshot,'continentCode',continent_snapshot,'mappingVersion',mapping_version,
      'createdAt',created_at,'updatedAt',updated_at,'finalizedAt',finalized_at) order by id)
      from (select * from run_page order by id limit 100) q),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(jsonb_build_object('runId',run_id,'rulesetVersion',ruleset_version,
      'lastClearedRow',last_cleared_row,'revivesToReachScore',revives_to_reach_score,'achievedAt',achieved_at,
      'countryCode',country_snapshot,'continentCode',continent_snapshot,'mappingVersion',mapping_version,
      'finalizedAt',finalized_at,'publishedAt',published_at) order by run_id)
      from (select * from result_page order by run_id limit 100) q),'[]'::jsonb),
    'next',jsonb_build_object(
      'consent',case when (select count(*) from consent_page)>100 then
        (select id from consent_page order by id offset 99 limit 1) end,
      'parental',case when (select count(*) from parental_page)>100 then
        (select id from parental_page order by id offset 99 limit 1) end,
      'run',case when (select count(*) from run_page)>100 then
        (select id from run_page order by id offset 99 limit 1) end,
      'result',case when (select count(*) from result_page)>100 then
        (select run_id from result_page order by run_id offset 99 limit 1) end
    )
  ) into result;
  return result;
end
$function$;

create function cpi_private.prepare_account_deletion(p_user_id uuid) returns jsonb
language plpgsql security invoker set search_path = pg_catalog as $function$
declare
  pending cpi_private.account_deletion_requests%rowtype;
begin
  perform cpi_private.lifecycle_lock_owner(p_user_id);
  insert into cpi_private.account_deletion_requests(user_id) values(p_user_id)
    on conflict(user_id) do nothing;
  select * into strict pending from cpi_private.account_deletion_requests where user_id=p_user_id;
  return jsonb_build_object('requestId',pending.request_id,'status','revocation_pending',
    'requestedAt',pending.requested_at);
end
$function$;

create function cpi_private.get_account_deletion_status(p_request_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog as $function$
declare
  pending cpi_private.account_deletion_requests%rowtype;
  receipt cpi_private.account_deletion_receipts%rowtype;
begin
  select * into pending from cpi_private.account_deletion_requests where request_id=p_request_id;
  if found then
    return jsonb_build_object('requestId',p_request_id,'status','revocation_pending',
      'requestedAt',pending.requested_at);
  end if;
  select * into receipt from cpi_private.account_deletion_receipts
    where request_id=p_request_id and expires_at>statement_timestamp();
  if found then
    return jsonb_build_object('requestId',p_request_id,'status','deleted',
      'requestedAt',receipt.requested_at,'completedAt',receipt.completed_at);
  end if;
  return jsonb_build_object('requestId',p_request_id,'status','not_found');
end
$function$;

-- Worker-only projection. Never forward its subject to the public status route.
create function cpi_private.get_account_deletion_work(p_request_id uuid) returns jsonb
language sql stable security invoker set search_path = pg_catalog as $function$
  select jsonb_build_object('requestId',request_id,'subject',user_id)
  from cpi_private.account_deletion_requests where request_id=p_request_id
$function$;

-- The trusted issuer MUST acknowledge account-wide token-family revocation
-- before invoking this routine. SQL credentials alone cannot prove issuer state.
-- This narrow definer routine is the only newly granted Auth-delete operation.
create function cpi_private.complete_account_deletion(p_user_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare
  pending cpi_private.account_deletion_requests%rowtype;
  confirmed_at timestamptz;
begin
  if exists(select 1 from cpi_private.account_deletion_receipts where request_id=p_request_id) then
    return cpi_private.get_account_deletion_status(p_request_id);
  end if;
  -- A completed concurrent worker may have removed the owner while we waited.
  -- Never recreate a mapping (or hit an Auth FK) during idempotent completion.
  perform 1 from cpi_private.profile_owners where user_id=p_user_id for update;
  if not found then
    if exists(select 1 from cpi_private.account_deletion_receipts where request_id=p_request_id) then
      return cpi_private.get_account_deletion_status(p_request_id);
    end if;
    raise exception 'CPI_ACCOUNT_REQUEST_NOT_FOUND' using errcode='22023';
  end if;
  select * into pending from cpi_private.account_deletion_requests where request_id=p_request_id for update;
  if not found or pending.user_id is distinct from p_user_id then
    raise exception 'CPI_ACCOUNT_REQUEST_NOT_FOUND' using errcode='22023';
  end if;
  confirmed_at := clock_timestamp();
  -- CPI-017 intentionally restricted intent/grant foreign keys rather than
  -- cascading them. Remove those children first inside this same transaction.
  delete from cpi_private.revive_grants where run_id in (
    select id from cpi_private.ranked_runs where user_id=p_user_id
  );
  delete from cpi_private.reward_transactions where run_id in (
    select id from cpi_private.ranked_runs where user_id=p_user_id
  );
  delete from auth.users where id=p_user_id;
  if not found then
    raise exception 'CPI_ACCOUNT_UNAVAILABLE' using errcode='22023';
  end if;
  insert into cpi_private.account_deletion_receipts
    (request_id,requested_at,revocation_confirmed_at,completed_at,expires_at)
    values(p_request_id,pending.requested_at,confirmed_at,clock_timestamp(),
      clock_timestamp()+interval '168 hours');
  return cpi_private.get_account_deletion_status(p_request_id);
end
$function$;

create function cpi_private.guard_deleting_account_write() returns trigger
language plpgsql security definer set search_path = pg_catalog as $function$
declare
  subject_id uuid;
begin
  if tg_table_schema='public' and tg_table_name='profiles_public' then
    select user_id into subject_id from cpi_private.profile_owners where public_id=new.public_id;
  elsif tg_table_name in ('reward_intents','reward_transactions','revive_grants','run_actions') then
    select user_id into subject_id from cpi_private.ranked_runs where id=new.run_id;
  else
    subject_id := new.user_id;
  end if;
  if subject_id is not null then
    perform 1 from cpi_private.profile_owners where user_id=subject_id for update;
    if exists(select 1 from cpi_private.account_deletion_requests where user_id=subject_id) then
      raise exception 'CPI_ACCOUNT_DELETION_PENDING' using errcode='55000';
    end if;
  end if;
  return new;
end
$function$;

do $guards$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profiles_private','consent_events','parental_authorizations','analytics_authorizations',
    'profile_region_state','ranked_runs','ranked_receipts','ranked_action_audit','run_actions',
    'reward_intents','reward_transactions','revive_grants','verified_results'
  ] loop
    execute format('create trigger cpi031_account_write_guard before insert or update on cpi_private.%I '
      'for each row execute function cpi_private.guard_deleting_account_write()',relation_name);
  end loop;
end
$guards$;
create trigger cpi031_account_write_guard before insert or update on public.profiles_public
  for each row execute function cpi_private.guard_deleting_account_write();

create function cpi_private.purge_account_lifecycle_receipts() returns jsonb
language plpgsql security invoker set search_path = pg_catalog as $function$
declare
  proof_count integer;
  receipt_count integer;
begin
  delete from cpi_private.account_reauth_uses where expires_at<=statement_timestamp();
  get diagnostics proof_count = row_count;
  delete from cpi_private.account_deletion_receipts where expires_at<=statement_timestamp();
  get diagnostics receipt_count = row_count;
  return jsonb_build_object('reauthProofs',proof_count,'deletionReceipts',receipt_count);
end
$function$;

do $permissions$
declare
  relation_name text;
  routine regprocedure;
begin
  foreach relation_name in array array[
    'account_reauth_uses','account_deletion_requests','account_deletion_receipts'
  ] loop
    execute format('alter table cpi_private.%I enable row level security',relation_name);
    execute format('alter table cpi_private.%I force row level security',relation_name);
    execute format('revoke all on cpi_private.%I from public,anon,authenticated,service_role',relation_name);
  end loop;
  foreach routine in array array[
    'cpi_private.lifecycle_lock_owner(uuid)'::regprocedure,
    'cpi_private.consume_account_reauthentication(uuid,text,text,timestamptz)'::regprocedure,
    'cpi_private.export_account_page(uuid,uuid,uuid,uuid,uuid)'::regprocedure,
    'cpi_private.prepare_account_deletion(uuid)'::regprocedure,
    'cpi_private.get_account_deletion_status(uuid)'::regprocedure,
    'cpi_private.get_account_deletion_work(uuid)'::regprocedure,
    'cpi_private.complete_account_deletion(uuid,uuid)'::regprocedure,
    'cpi_private.guard_deleting_account_write()'::regprocedure,
    'cpi_private.purge_account_lifecycle_receipts()'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',routine);
    execute format('grant execute on function %s to service_role',routine);
  end loop;
end
$permissions$;
grant select,insert on cpi_private.account_reauth_uses,cpi_private.account_deletion_requests to service_role;
grant delete on cpi_private.account_reauth_uses to service_role;
grant select,delete on cpi_private.account_deletion_receipts to service_role;

commit;
