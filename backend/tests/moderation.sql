-- Disposable database fixture only. No accounts or moderation survive rollback.
begin;
create function pg_temp.cpi025_assert(ok boolean,message text) returns void
language plpgsql as $function$
begin
  if ok is distinct from true then raise exception 'CPI025: %',message; end if;
end
$function$;
insert into auth.users(id,email) select
  ('25000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'moderation-'||i::text||'@example.invalid'
  from generate_series(1,8) i;
insert into cpi_private.profile_owners(user_id,public_id) select
  ('25000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  ('25100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,8) i;
insert into public.profiles_public(public_id,username,country_code) select
  ('25100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'mod_player_'||i::text,'BG'
  from generate_series(1,8) i;
insert into cpi_private.profiles_private(user_id,privacy_context)
  values('25000000-0000-4000-8000-000000000002','child');
insert into cpi_private.ranked_runs
  (id,user_id,ruleset_version,status,checkpoint_private,last_cleared_row,current_row,
   created_at,finalized_at,achieved_at,server_validated,country_snapshot,continent_snapshot,mapping_version,region_snapshotted_at)
select ('25200000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  case when i=3 then '25000000-0000-4000-8000-000000000003'::uuid
    else '25000000-0000-4000-8000-000000000002'::uuid end,
  'cpi025-tests','finished','{}',case i when 1 then '100' when 2 then '200' else '50' end,
  case i when 1 then '101' when 2 then '201' else '51' end,
  '2020-01-01 00:00+00','2020-01-01 02:00+00','2020-01-01 01:00+00',true,
  case when i=2 then 'GB' else 'BG' end,'EU','cpi-regions-2026-11-v1','2020-01-01 00:00+00'
from generate_series(1,3) i;
select cpi_private.publish_ranked_result(id) from cpi_private.ranked_runs where ruleset_version='cpi025-tests';

do $tests$
declare
  reporter uuid := '25000000-0000-4000-8000-000000000001';
  target uuid := '25100000-0000-4000-8000-000000000002';
  case_key uuid;
  other_case uuid;
  queue jsonb;
  board jsonb;
  reply jsonb;
  i integer;
begin
  reply := cpi_private.submit_name_report(reporter,target,'hate_or_harassment');
  perform pg_temp.cpi025_assert(reply='{"status":"accepted"}'::jsonb,'neutral report acknowledgment');
  perform cpi_private.submit_name_report(reporter,target,'spam');
  perform pg_temp.cpi025_assert((select count(*)=1 from cpi_private.name_reports
    where reporter_user_id=reporter and target_public_id=target),'pending duplicate has no extra report');
  perform cpi_private.submit_name_report('25000000-0000-4000-8000-000000000003',target,'impersonation');
  select id into case_key from cpi_private.moderation_cases where target_public_id=target;
  queue := cpi_private.read_moderation_queue();
  perform pg_temp.cpi025_assert(jsonb_array_length(queue->'cases')=1,'reports group into one private case');
  perform pg_temp.cpi025_assert(queue->'cases'->0->'reasons'->>'hate_or_harassment'='1'
    and queue->'cases'->0->'reasons'->>'impersonation'='1','queue reason counts are lossless and minimal');
  perform pg_temp.cpi025_assert(queue::text !~ 'reporter|email|privacy_context|analytics|25000000',
    'queue never exposes reporter or private profile identity');
  board := cpi_private.read_leaderboard('cpi025-tests');
  perform pg_temp.cpi025_assert(board->>'count'='2' and board->'top100'->0->>'lastClearedRow'='200',
    'reports and a high score do not automatically hide or ban');

  perform cpi_private.review_moderation_case(case_key,'25300000-0000-4000-8000-000000000001',
    'hide_player',null,'staff:reviewer-one');
  perform cpi_private.review_moderation_case(case_key,'25300000-0000-4000-8000-000000000001',
    'hide_player',null,'staff:reviewer-one');
  perform pg_temp.cpi025_assert((select count(*)=1 from cpi_private.moderation_decisions),
    'staff retry is exactly one immutable decision');
  begin
    perform cpi_private.review_moderation_case(case_key,'25300000-0000-4000-8000-000000000001',
      'restore_player',null,'staff:reviewer-one');
    raise exception 'CPI025: changed retry accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_MODERATION_CONFLICT' then raise; end if;
  end;
  perform pg_temp.cpi025_assert(cpi_private.read_leaderboard('cpi025-tests')->>'count'='1','hide affects World');
  perform pg_temp.cpi025_assert(cpi_private.read_leaderboard('cpi025-tests','country','BG','cpi-regions-2026-11-v1')->>'count'='1',
    'hide affects historical country');
  perform pg_temp.cpi025_assert(cpi_private.read_leaderboard('cpi025-tests','country','GB','cpi-regions-2026-11-v1')->>'count'='0',
    'hide affects new country');
  perform pg_temp.cpi025_assert(cpi_private.read_leaderboard('cpi025-tests','continent','EU','cpi-regions-2026-11-v1')->>'count'='1',
    'hide affects continent');
  perform cpi_private.review_moderation_case(case_key,'25300000-0000-4000-8000-000000000002',
    'restore_player',null,'staff:reviewer-two');
  perform pg_temp.cpi025_assert(cpi_private.read_leaderboard('cpi025-tests')->>'count'='2','mistaken hide is reversible');
  perform cpi_private.review_moderation_case(case_key,'25300000-0000-4000-8000-000000000003',
    'disqualify_run','25200000-0000-4000-8000-000000000002','staff:reviewer-two');
  board := cpi_private.read_leaderboard('cpi025-tests');
  perform pg_temp.cpi025_assert(board->'top100'->0->>'lastClearedRow'='100','disqualified best falls back to old run');
  perform cpi_private.review_moderation_case(case_key,'25300000-0000-4000-8000-000000000004',
    'restore_run','25200000-0000-4000-8000-000000000002','staff:reviewer-two');
  perform pg_temp.cpi025_assert(cpi_private.read_leaderboard('cpi025-tests')->'top100'->0->>'lastClearedRow'='200',
    'restoration preserves original run history');
  perform pg_temp.cpi025_assert((select privacy_context='child' and analytics_age_band is null
    from cpi_private.profiles_private where user_id='25000000-0000-4000-8000-000000000002'),
    'moderation cannot relax private child or analytics state');

  for i in 3..6 loop
    perform cpi_private.submit_name_report(reporter,
      ('25100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'spam');
  end loop;
  begin
    perform cpi_private.submit_name_report(reporter,'25100000-0000-4000-8000-000000000007','spam');
    raise exception 'CPI025: hourly durable limit bypassed';
  exception when sqlstate '54000' then
    if sqlerrm<>'CPI_REPORT_RATE_LIMITED' then raise; end if;
  end;
  -- Independent fixture clock movement proves the separate per-target window.
  update cpi_private.name_reports set created_at=clock_timestamp()-interval '2 hours'
    where reporter_user_id=reporter;
  begin
    perform cpi_private.submit_name_report(reporter,target,'sexual_content');
    raise exception 'CPI025: target durable limit bypassed';
  exception when sqlstate '54000' then null; end;
  reply := cpi_private.export_own_name_reports(reporter);
  perform pg_temp.cpi025_assert(jsonb_array_length(reply->'reports')=5 and reply->'next'='null'::jsonb,
    'own report export includes all own report data');
  perform pg_temp.cpi025_assert(reply::text !~ 'reporter_user_id|privacy_context|email',
    'own export excludes other private account data');
  perform pg_temp.cpi025_assert(jsonb_array_length(cpi_private.export_own_name_reports(
    '25000000-0000-4000-8000-000000000008')->'reports')=0,'export is scoped to verified caller');

  select id into other_case from cpi_private.moderation_cases
    where target_public_id='25100000-0000-4000-8000-000000000003';
  begin
    perform cpi_private.review_moderation_case(other_case,'25300000-0000-4000-8000-000000000005',
      'disqualify_run','25200000-0000-4000-8000-000000000002','staff:reviewer-two');
    raise exception 'CPI025: foreign target run accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform cpi_private.submit_name_report(reporter,target,'a free text accusation');
    raise exception 'CPI025: free text retained';
  exception when sqlstate '22023' then null; end;

  -- Reporter deletion removes reports but does not prevent correcting a prior
  -- staff decision; the case has no reporter identity link of its own.
  delete from auth.users where id=reporter;
  perform pg_temp.cpi025_assert(not exists(select 1 from cpi_private.name_reports
    where reporter_user_id=reporter),'reporter deletion cascades own reports');
  perform cpi_private.review_moderation_case(case_key,'25300000-0000-4000-8000-000000000006',
    'hide_player',null,'staff:reviewer-three');
  perform cpi_private.review_moderation_case(case_key,'25300000-0000-4000-8000-000000000007',
    'restore_player',null,'staff:reviewer-three');
  perform cpi_private.prepare_account_deletion('25000000-0000-4000-8000-000000000002');
  begin
    perform cpi_private.submit_name_report('25000000-0000-4000-8000-000000000003',target,'spam');
    raise exception 'CPI025: deleting target accepted a new report';
  exception when sqlstate '55000' then null; end;
  begin
    perform cpi_private.review_moderation_case(case_key,'25300000-0000-4000-8000-000000000008',
      'hide_player',null,'staff:reviewer-three');
    raise exception 'CPI025: deleting target accepted moderation';
  exception when sqlstate '55000' then null; end;
  delete from auth.users where id='25000000-0000-4000-8000-000000000002';
  perform pg_temp.cpi025_assert(not exists(select 1 from cpi_private.moderation_cases where id=case_key)
    and not exists(select 1 from cpi_private.moderation_decisions where case_id=case_key)
    and not exists(select 1 from cpi_private.name_reports where target_public_id=target),
    'target deletion removes report, case and audit identity links');
end
$tests$;

do $privileges$
begin
  perform pg_temp.cpi025_assert(not has_function_privilege('authenticated',
    'cpi_private.submit_name_report(uuid,uuid,text)','execute'),'mobile cannot impersonate a reporter');
  perform pg_temp.cpi025_assert(not has_function_privilege('authenticated',
    'cpi_private.review_moderation_case(uuid,uuid,text,uuid,text)','execute'),'mobile cannot moderate');
  perform pg_temp.cpi025_assert(not has_function_privilege('anon',
    'cpi_private.read_moderation_queue(timestamptz,uuid)','execute'),'guest cannot read queue');
  perform pg_temp.cpi025_assert(not has_table_privilege('service_role','cpi_private.name_reports','insert')
    and not has_table_privilege('authenticated','cpi_private.name_reports','select'),
    'report writes go through durable guards and private data stays inaccessible');
end
$privileges$;
set local role service_role;
select cpi_private.submit_name_report('25000000-0000-4000-8000-000000000008',
  '25100000-0000-4000-8000-000000000007','spam')->>'status' as cpi025_service_report;
select cpi_private.read_moderation_queue()->>'schemaVersion' as cpi025_service_queue;
reset role;
set local role authenticated;
do $negative$
begin
  begin
    perform cpi_private.read_moderation_queue();
    raise exception 'CPI025: mobile read staff queue';
  exception when insufficient_privilege then null; end;
end
$negative$;
reset role;
rollback;
