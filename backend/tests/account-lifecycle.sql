-- Disposable PostgreSQL integration assertions only; all fixtures roll back.
begin;
insert into auth.users(id,email) values
 ('31000000-0000-4000-8000-000000000001','lifecycle-a@example.invalid'),
 ('31000000-0000-4000-8000-000000000002','lifecycle-b@example.invalid');

do $tests$
declare
  routine regprocedure;
  relation_name text;
begin
  foreach routine in array array[
    'cpi_private.consume_account_reauthentication(uuid,text,text,timestamptz)'::regprocedure,
    'cpi_private.export_account_page(uuid,uuid,uuid,uuid,uuid)'::regprocedure,
    'cpi_private.prepare_account_deletion(uuid)'::regprocedure,
    'cpi_private.get_account_deletion_status(uuid)'::regprocedure,
    'cpi_private.get_account_deletion_work(uuid)'::regprocedure,
    'cpi_private.complete_account_deletion(uuid,uuid)'::regprocedure,
    'cpi_private.purge_account_lifecycle_receipts()'::regprocedure
  ] loop
    if has_function_privilege('anon',routine,'execute')
       or has_function_privilege('authenticated',routine,'execute')
       or not has_function_privilege('service_role',routine,'execute') then
      raise exception 'Unsafe lifecycle routine permissions: %',routine;
    end if;
  end loop;
  if has_table_privilege('service_role','auth.users','delete') then
    raise exception 'Lifecycle must not grant broad service Auth deletion';
  end if;
  foreach relation_name in array array[
    'account_reauth_uses','account_deletion_requests','account_deletion_receipts'
  ] loop
    if has_table_privilege('anon','cpi_private.'||relation_name,'select')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'select')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'insert')
       or not exists (
        select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='cpi_private' and c.relname=relation_name
          and c.relrowsecurity and c.relforcerowsecurity
       ) then
      raise exception 'Unsafe lifecycle table: %',relation_name;
    end if;
  end loop;
end
$tests$;

set role service_role;
select cpi_private.save_profile('31000000-0000-4000-8000-000000000001','lifecycle_a','BG','skip');
select cpi_private.save_profile('31000000-0000-4000-8000-000000000002','lifecycle_b','US','skip');
update cpi_private.profiles_private set analytics_age_band='under_13',age_response_at=clock_timestamp(),
  privacy_context='child',context_updated_at=clock_timestamp()
  where user_id='31000000-0000-4000-8000-000000000001';
insert into cpi_private.parental_authorizations
 (user_id,purpose,state,verification_reference,verified_at)
 values('31000000-0000-4000-8000-000000000001','analytics','approved',
   'secret-guardian-evidence-not-exportable',clock_timestamp());
insert into cpi_private.analytics_authorizations
 (user_id,privacy_context,policy_version,authorization_reference,valid_until)
 values('31000000-0000-4000-8000-000000000001','child','CI-only',
   'secret-private-eligibility-reference',clock_timestamp()+interval '1 hour');
insert into cpi_private.consent_events(user_id,purpose,decision,policy_version)
 select '31000000-0000-4000-8000-000000000001','analytics','granted','CI-page-'||i::text
 from generate_series(1,102) i;
insert into cpi_private.consent_events(user_id,purpose,decision,policy_version)
 values('31000000-0000-4000-8000-000000000002','analytics','declined','foreign-policy-never-export');

insert into cpi_private.ranked_runs
 (id,user_id,ruleset_version,status,checkpoint_private,last_cleared_row,current_row,
  created_at,updated_at,finalized_at,achieved_at,server_validated,
  country_snapshot,continent_snapshot,mapping_version,region_snapshotted_at)
 values
 ('31200000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',
  'CI-only','finished','{"futureRoute":"secret-future-route","accessToken":"secret-test-token"}',
  '9007199254740993','9007199254740994','2020-01-01','2020-01-01 02:00+00',
  '2020-01-01 02:00+00','2020-01-01 01:00+00',true,'BG','EU','cpi-regions-2026-11-v1','2020-01-01'),
 ('31200000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002',
  'CI-only','finished','{"futureRoute":"secret-foreign-route"}',
  '777','778','2020-01-01','2020-01-01 02:00+00','2020-01-01 02:00+00',
  '2020-01-01 01:00+00',true,'US','NA','cpi-regions-2026-11-v1','2020-01-01'),
 ('31200000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001',
  'CI-only','finished','{}','10','11','2020-01-01','2020-01-01 02:00+00',
  '2020-01-01 02:00+00','2020-01-01 01:00+00',true,'BG','EU','cpi-regions-2026-11-v1','2020-01-01'),
 ('31200000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000001',
  'CI-only','verification_pending','{"futureRoute":"secret-pending-route"}',
  '350','351','2020-01-01','2020-01-01 02:00+00',null,
  '2020-01-01 01:00+00',true,'BG','EU','cpi-regions-2026-11-v1','2020-01-01');
select cpi_private.publish_ranked_result('31200000-0000-4000-8000-000000000001');
select cpi_private.publish_ranked_result('31200000-0000-4000-8000-000000000002');
select cpi_private.set_leaderboard_suppression(
 null,'31200000-0000-4000-8000-000000000001',true,'private-admin-reference','name_review');

insert into cpi_private.reward_intents(id,run_id,death_id,ordinal,promised_restore_sp,ruleset_version)
 values('31300000-0000-4000-8000-000000000001','31200000-0000-4000-8000-000000000004',
  'death-1',1,200,'CI-only');
insert into cpi_private.reward_transactions
 (provider_transaction_id,intent_id,run_id,signed_query_sha256,earned_at)
 values('lifecycle-provider-transaction','31300000-0000-4000-8000-000000000001',
  '31200000-0000-4000-8000-000000000004',repeat('a',64),clock_timestamp());
insert into cpi_private.revive_grants(intent_id,run_id,death_id,ordinal,restore_sp)
 values('31300000-0000-4000-8000-000000000001','31200000-0000-4000-8000-000000000004','death-1',1,200);
insert into cpi_private.run_actions(run_id,command_sequence,idempotency_key,command_private,result_private)
 values('31200000-0000-4000-8000-000000000004',1,'31400000-0000-4000-8000-000000000001',
  '{"secret":"private-command"}','{"secret":"private-result"}');
insert into cpi_private.ranked_receipts
 (user_id,idempotency_key,run_id,request_fingerprint,response_private)
 values('31000000-0000-4000-8000-000000000001','31400000-0000-4000-8000-000000000002',
  '31200000-0000-4000-8000-000000000004',repeat('b',64),'{"secret":"private-receipt"}');
insert into cpi_private.ranked_action_audit
 (run_id,user_id,command_sequence,idempotency_key,command_private,result_private)
 values('31200000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000001',
  '9007199254740993','31400000-0000-4000-8000-000000000003','{}','{"secret":"private-audit"}');

do $tests$
declare
  a constant uuid := '31000000-0000-4000-8000-000000000001';
  b constant uuid := '31000000-0000-4000-8000-000000000002';
  snapshot jsonb;
  next_snapshot jsonb;
  status jsonb;
  request_id uuid;
  repeated_id uuid;
  public_a uuid;
  guard_sql text;
begin
  select public_id into public_a from cpi_private.profile_owners where user_id=a;
  perform cpi_private.consume_account_reauthentication(a,repeat('1',64),'export',clock_timestamp()+interval '4 minutes');
  begin
    perform cpi_private.consume_account_reauthentication(a,repeat('1',64),'delete',clock_timestamp()+interval '4 minutes');
    raise exception 'Proof replay crossed export/delete purposes';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_ACCOUNT_REAUTH_REPLAY' then raise; end if;
  end;
  begin
    perform cpi_private.consume_account_reauthentication(a,repeat('2',64),'export',clock_timestamp()-interval '1 second');
    raise exception 'Expired reauthentication proof accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_ACCOUNT_REAUTH_REQUIRED' then raise; end if;
  end;
  snapshot := cpi_private.export_account_page(a);
  if snapshot->'profile'->>'username'<>'lifecycle_a'
     or snapshot->'privateProfile'->>'analyticsAgeBand'<>'under_13'
     or snapshot->'privateProfile'->>'privacyContext'<>'child'
     or jsonb_array_length(snapshot->'consents')<>100
     or snapshot->'next'->>'consent' is null
     or jsonb_array_length(snapshot->'runs')<>3 then
    raise exception 'Own export fields/pagination are incomplete';
  end if;
  if snapshot::text ~ 'secret-|example.invalid|foreign-policy|lifecycle_b|accessToken|checkpoint|verification_reference'
     or snapshot::text like '%'||b::text||'%' then
    raise exception 'Export leaked secrets, credentials or another account';
  end if;
  if snapshot->'results'->0->>'lastClearedRow'<>'9007199254740993' then
    raise exception 'Export rounded a lossless score';
  end if;
  next_snapshot := cpi_private.export_account_page(a,(snapshot->'next'->>'consent')::uuid);
  if jsonb_array_length(next_snapshot->'consents')<>2
     or next_snapshot->'next'->>'consent' is not null then
    raise exception 'Export page continuation lost or duplicated consent rows';
  end if;
  perform cpi_private.consume_account_reauthentication(a,repeat('3',64),'delete',clock_timestamp()+interval '4 minutes');
  status := cpi_private.prepare_account_deletion(a);
  request_id := (status->>'requestId')::uuid;
  if status->>'status'<>'revocation_pending' then raise exception 'Deletion falsely completed before issuer ack'; end if;
  repeated_id := (cpi_private.prepare_account_deletion(a)->>'requestId')::uuid;
  if repeated_id<>request_id then raise exception 'Retry created a second deletion request'; end if;
  if cpi_private.get_account_deletion_status(request_id)->>'status'<>'revocation_pending'
     or cpi_private.get_account_deletion_work(request_id)->>'subject'<>a::text then
    raise exception 'Durable revocation-pending recovery is unavailable';
  end if;
  if cpi_private.get_account_deletion_status(request_id)::text like '%'||a::text||'%'
     or cpi_private.get_account_deletion_status(request_id)::text like '%'||public_a::text||'%' then
    raise exception 'Status capability leaked account identifiers';
  end if;
  foreach guard_sql in array array[
    format('update public.profiles_public set username=''changed'' where public_id=%L',public_a),
    format('update cpi_private.profiles_private set analytics_age_band=null,age_response_at=null where user_id=%L',a),
    format('update cpi_private.ranked_runs set sp=400 where id=%L','31200000-0000-4000-8000-000000000004'),
    format('insert into cpi_private.consent_events(user_id,purpose,decision,policy_version) values(%L,''analytics'',''granted'',''forbidden'')',a),
    'select cpi_private.publish_ranked_result(''31200000-0000-4000-8000-000000000003'')'
  ] loop
    begin
      execute guard_sql;
      raise exception 'Pending deletion failed to freeze a writer';
    exception when sqlstate '55000' then
      if sqlerrm<>'CPI_ACCOUNT_DELETION_PENDING' then raise; end if;
    end;
  end loop;
  -- Narrow trusted completion cannot use A's receipt to remove B.
  begin
    perform cpi_private.complete_account_deletion(b,request_id);
    raise exception 'Foreign deletion request removed another account';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_ACCOUNT_REQUEST_NOT_FOUND' then raise; end if;
  end;
  -- This invocation models an already verified issuer acknowledgment; actual
  -- server tests require that acknowledgment before this SQL call is reachable.
  status := cpi_private.complete_account_deletion(a,request_id);
  if status->>'status'<>'deleted' or status->>'completedAt' is null then
    raise exception 'Atomic deletion completion was not recorded';
  end if;
  if cpi_private.complete_account_deletion(a,request_id)->>'status'<>'deleted' then
    raise exception 'Completed deletion retry is not idempotent';
  end if;
  if exists(select 1 from cpi_private.profile_owners where user_id=a)
     or exists(select 1 from public.profiles_public where public_id=public_a)
     or exists(select 1 from cpi_private.profiles_private where user_id=a)
     or exists(select 1 from cpi_private.consent_events where user_id=a)
     or exists(select 1 from cpi_private.parental_authorizations where user_id=a)
     or exists(select 1 from cpi_private.analytics_authorizations where user_id=a)
     or exists(select 1 from cpi_private.profile_region_state where user_id=a)
     or exists(select 1 from cpi_private.ranked_runs where user_id=a)
     or exists(select 1 from cpi_private.verified_results where user_id=a)
     or exists(select 1 from cpi_private.ranked_receipts where user_id=a)
     or exists(select 1 from cpi_private.ranked_action_audit where user_id=a)
     or exists(select 1 from cpi_private.reward_intents where id='31300000-0000-4000-8000-000000000001')
     or exists(select 1 from cpi_private.reward_transactions where provider_transaction_id='lifecycle-provider-transaction')
     or exists(select 1 from cpi_private.revive_grants where intent_id='31300000-0000-4000-8000-000000000001')
     or exists(select 1 from cpi_private.run_actions where run_id='31200000-0000-4000-8000-000000000004')
     or exists(select 1 from cpi_private.account_deletion_requests where user_id=a)
     or exists(select 1 from cpi_private.account_reauth_uses where user_id=a)
     or exists(select 1 from cpi_private.leaderboard_suppressions where public_id=public_a
       or run_id='31200000-0000-4000-8000-000000000001')
     or exists(select 1 from cpi_private.leaderboard_moderation_events where public_id=public_a
       or run_id='31200000-0000-4000-8000-000000000001') then
    raise exception 'Deletion left linked profile/gameplay/reward/public data';
  end if;
  if not exists(select 1 from cpi_private.profile_owners where user_id=b)
     or not exists(select 1 from cpi_private.verified_results where user_id=b) then
    raise exception 'Deletion affected another account';
  end if;
  if cpi_private.read_leaderboard('CI-only','world',null,null,null)::text like '%lifecycle_a%' then
    raise exception 'Deleted account remained in leaderboard read model';
  end if;
  begin
    insert into cpi_private.reward_transactions
     (provider_transaction_id,intent_id,run_id,signed_query_sha256,earned_at)
     values('late-deleted-account-callback','31300000-0000-4000-8000-000000000001',
      '31200000-0000-4000-8000-000000000004',repeat('a',64),clock_timestamp());
    raise exception 'Late callback resurrected deleted reward target';
  exception when foreign_key_violation then null;
  end;
  if cpi_private.get_account_deletion_status('31900000-0000-4000-8000-000000000099')->>'status'<>'not_found' then
    raise exception 'Unknown receipt falsely claims deletion';
  end if;
end
$tests$;
reset role;

do $tests$
begin
  if exists(select 1 from auth.users where id='31000000-0000-4000-8000-000000000001')
     or not exists(select 1 from auth.users where id='31000000-0000-4000-8000-000000000002') then
    raise exception 'Auth identity cascade is incorrect';
  end if;
  if (select array_agg(column_name::text order by column_name)
      from information_schema.columns where table_schema='cpi_private'
      and table_name='account_deletion_receipts') is distinct from
      array['completed_at','expires_at','request_id','requested_at','revocation_confirmed_at']::text[] then
    raise exception 'Completed receipt retained an account identity';
  end if;
end
$tests$;
set role authenticated;
do $tests$
begin
  begin
    perform cpi_private.complete_account_deletion('31000000-0000-4000-8000-000000000002',
      '31900000-0000-4000-8000-000000000099');
    raise exception 'Mobile token could invoke Auth deletion';
  exception when insufficient_privilege then null;
  end;
  begin
    perform cpi_private.export_account_page('31000000-0000-4000-8000-000000000002');
    raise exception 'Mobile token could export a supplied owner UUID';
  exception when insufficient_privilege then null;
  end;
end
$tests$;
reset role;
rollback;
