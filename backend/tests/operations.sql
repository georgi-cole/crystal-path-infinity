-- Disposable PostgreSQL only. The operational controls and all fixtures roll back.
begin;
insert into auth.users(id,email) values
 ('37000000-0000-4000-8000-000000000001','ops-a@example.invalid'),
 ('37000000-0000-4000-8000-000000000002','ops-b@example.invalid');
do $tests$
declare
  relation_name text;
begin
  foreach relation_name in array array['operations_control','operations_control_audit'] loop
    if has_table_privilege('anon','cpi_private.'||relation_name,'select')
      or has_table_privilege('authenticated','cpi_private.'||relation_name,'select')
      or has_table_privilege('service_role','cpi_private.'||relation_name,'update')
      or has_table_privilege('service_role','cpi_private.'||relation_name,'insert')
      or not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='cpi_private' and c.relname=relation_name and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'Unsafe operational-control privileges';
    end if;
  end loop;
  if has_function_privilege('service_role',
      'cpi_private.set_operations_policy(bigint,boolean,boolean,integer,integer,text,text[],text,text)','execute')
      or has_function_privilege('authenticated','cpi_private.authorize_operation_start(text,integer,text)','execute')
      or has_function_privilege('anon','cpi_private.get_operations_policy()','execute') then
    raise exception 'Application credentials can administer operations or read private policy';
  end if;
  if cpi_private.get_operations_policy()->>'rankedStartsEnabled'<>'false'
     or cpi_private.get_operations_policy()->>'adStartsEnabled'<>'false' then
    raise exception 'New operational starts must default disabled';
  end if;
end
$tests$;
set role service_role;
select cpi_private.save_profile('37000000-0000-4000-8000-000000000001','ops_a','BG','skip');
select cpi_private.save_profile('37000000-0000-4000-8000-000000000002','ops_b','US','skip');
do $tests$
begin
  begin
    perform cpi_private.authorize_operation_start('ranked',10,'infinity-v1');
    raise exception 'Default-disabled policy allowed a new ranked start';
  exception when sqlstate '55000' then
    if sqlerrm<>'CPI_OPERATIONS_MAINTENANCE' then raise; end if;
  end;
end
$tests$;
reset role;
select cpi_private.set_operations_policy(1,true,true,10,1,'infinity-v1',array['infinity-v1'],'none','CI:operator');
do $tests$
begin
  begin
    perform cpi_private.set_operations_policy(1,false,false,10,1,'infinity-v1',array['infinity-v1'],'none','CI:stale');
    raise exception 'Stale operator revision overwrote a concurrent control';
  exception when serialization_failure then
    if sqlerrm<>'CPI_OPERATIONS_REVISION_CONFLICT' then raise; end if;
  end;
end
$tests$;
set role service_role;
do $tests$
declare
  a constant uuid := '37000000-0000-4000-8000-000000000001';
  run_a constant uuid := '37100000-0000-4000-8000-000000000001';
begin
  begin
    perform cpi_private.authorize_operation_start('ranked',9,'infinity-v1');
    raise exception 'Old client started a new ranked run';
  exception when sqlstate '55000' then
    if sqlerrm<>'CPI_OPERATIONS_UPDATE_REQUIRED' then raise; end if;
  end;
  begin
    perform cpi_private.authorize_operation_start('ranked',10,'invented-rules');
    raise exception 'Unsupported public start ruleset was accepted';
  exception when sqlstate '55000' then
    if sqlerrm<>'CPI_OPERATIONS_RULESET_UNAVAILABLE' then raise; end if;
  end;
  perform set_config('cpi.start_ranked','',true);
  begin
    insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
      values(run_a,a,'infinity-v1','{}');
    raise exception 'Missing trusted build context bypassed the new-start guard';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_OPERATIONS_CONTEXT_REQUIRED' then raise; end if;
  end;
  perform cpi_private.authorize_operation_start('ranked',10,'infinity-v1');
  perform cpi_private.snapshot_profile_region(a);
  insert into cpi_private.ranked_runs
    (id,user_id,ruleset_version,status,checkpoint_private,sp,last_cleared_row,current_row,
     created_at,updated_at,achieved_at,server_validated,country_snapshot,continent_snapshot,mapping_version,region_snapshotted_at)
    values(run_a,a,'infinity-v1','dead','{}',0,'350','351','2020-01-01',
      '2020-01-01 02:00+00','2020-01-01 01:00+00',true,'BG','EU','cpi-regions-2026-11-v1','2020-01-01');
  perform cpi_private.authorize_operation_start('ad',10,'infinity-v1');
  insert into cpi_private.reward_intents(id,run_id,death_id,ordinal,promised_restore_sp,ruleset_version)
    values('37200000-0000-4000-8000-000000000001',run_a,'death-1',1,200,'infinity-v1');
end
$tests$;
reset role;
select cpi_private.set_operations_policy(2,false,false,11,1,'infinity-v1',array['infinity-v1'],
  'reward_verification_delayed','CI:operator');
do $tests$
begin
  begin
    perform cpi_private.set_operations_policy(3,false,false,11,1,'infinity-v2',array['infinity-v2'],
      'ruleset_review','CI:operator');
    raise exception 'Policy update stranded an unresolved ranked ruleset';
  exception when sqlstate '55000' then
    if sqlerrm<>'CPI_OPERATIONS_ACTIVE_RULESET' then raise; end if;
  end;
end
$tests$;
set role service_role;
do $tests$
declare
  a constant uuid := '37000000-0000-4000-8000-000000000001';
  b constant uuid := '37000000-0000-4000-8000-000000000002';
  run_a constant uuid := '37100000-0000-4000-8000-000000000001';
begin
  -- Old transaction-local authorization does not defeat a committed kill.
  begin
    insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
      values('37100000-0000-4000-8000-000000000002',b,'infinity-v1','{}');
    raise exception 'Ranked kill switch accepted a new start';
  exception when sqlstate '55000' then
    if sqlerrm<>'CPI_OPERATIONS_MAINTENANCE' then raise; end if;
  end;
  begin
    insert into cpi_private.reward_intents(run_id,death_id,ordinal,promised_restore_sp,ruleset_version)
      values(run_a,'death-2',2,200,'infinity-v1');
    raise exception 'Ad kill switch accepted a new intent';
  exception when sqlstate '55000' then
    if sqlerrm<>'CPI_OPERATIONS_MAINTENANCE' then raise; end if;
  end;
  perform set_config('cpi.start_ranked','',true);
  perform set_config('cpi.start_ad','',true);
  -- The production adapter uses upsert: BEFORE INSERT must recognize an
  -- existing run/intent rather than block recovery on its conflict path.
  insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
    values(run_a,a,'infinity-v1','{}') on conflict(id) do update set updated_at=clock_timestamp();
  insert into cpi_private.reward_intents(id,run_id,death_id,ordinal,promised_restore_sp,ruleset_version)
    values('37200000-0000-4000-8000-000000000001',run_a,'death-1',1,200,'infinity-v1')
    on conflict(id) do nothing;
  perform cpi_private.check_operation_recovery(1,'infinity-v1');
  -- Verification and a genuinely earned grant are not new ad starts.
  insert into cpi_private.reward_transactions
    (provider_transaction_id,intent_id,run_id,signed_query_sha256,earned_at)
    values('ops-earned-transaction','37200000-0000-4000-8000-000000000001',run_a,repeat('a',64),clock_timestamp());
  update cpi_private.reward_intents set state='verified',resolved_at=clock_timestamp()
    where id='37200000-0000-4000-8000-000000000001';
  insert into cpi_private.revive_grants(intent_id,run_id,death_id,ordinal,restore_sp)
    values('37200000-0000-4000-8000-000000000001',run_a,'death-1',1,200);
  update cpi_private.revive_grants set state='applied',applied_at=clock_timestamp()
    where intent_id='37200000-0000-4000-8000-000000000001';
  update cpi_private.ranked_runs set revives_granted=1,revives_applied=1,sp=200,status='playing',updated_at=clock_timestamp()
    where id=run_a;
  if not exists(select 1 from cpi_private.ranked_runs where id=run_a and last_cleared_row='350'
      and revives_to_reach_score=0 and achieved_at='2020-01-01 01:00+00') then
    raise exception 'Operational stop rewrote score/tie or lost earned continuation';
  end if;
  update cpi_private.ranked_runs set status='finished',finalized_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=run_a;
  perform cpi_private.publish_ranked_result(run_a);
  if not exists(select 1 from cpi_private.verified_results where run_id=run_a and last_cleared_row='350'
      and country_snapshot='BG' and revives_to_reach_score=0 and published_at is not null) then
    raise exception 'Maintenance prevented earned finalization/publication';
  end if;
  if jsonb_array_length(cpi_private.read_leaderboard('infinity-v1')->'top100')<1 then
    raise exception 'Confirmed results disappeared when new starts were disabled';
  end if;
end
$tests$;
reset role;
select cpi_private.set_operations_policy(3,false,false,20,1,'infinity-v2',array['infinity-v1','infinity-v2'],
  'client_update_required','CI:operator');
set role service_role;
select cpi_private.check_operation_recovery(1,'infinity-v1');
do $tests$
begin
  if cpi_private.get_operations_policy()->>'revision'<>'4'
     or (select count(*) from cpi_private.operations_control_audit)<>3 then
    raise exception 'Operator decisions were not revisioned and audited';
  end if;
  begin
    perform cpi_private.set_operations_policy(4,true,true,20,1,'infinity-v2',array['infinity-v1','infinity-v2'],
      'none','forged:mobile');
    raise exception 'Normal server credential changed operational controls';
  exception when insufficient_privilege then null;
  end;
end
$tests$;
reset role;
rollback;
