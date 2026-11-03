-- Disposable PostgreSQL invariants; never execute against a hosted project.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000121','ranked-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000122','ranked-b@example.invalid');

do $tests$
declare relation_name text;
begin
  foreach relation_name in array array['ranked_receipts','ranked_action_audit'] loop
    if has_table_privilege('anon','cpi_private.'||relation_name,'select')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'select')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'insert')
       or has_table_privilege('service_role','cpi_private.'||relation_name,'update')
       or not has_table_privilege('service_role','cpi_private.'||relation_name,'insert')
       or not exists (
         select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='cpi_private' and c.relname=relation_name
           and c.relrowsecurity and c.relforcerowsecurity
       ) then
      raise exception 'Ranked ledger role boundary failed: %',relation_name;
    end if;
  end loop;
end
$tests$;

set role service_role;
select cpi_private.save_profile('00000000-0000-4000-8000-000000000121','Ranked_A','BG','keep',null);
select cpi_private.save_profile('00000000-0000-4000-8000-000000000122','Ranked_B','CA','keep',null);
select user_id from cpi_private.profile_owners where user_id='00000000-0000-4000-8000-000000000121' for update;
select cpi_private.snapshot_profile_region('00000000-0000-4000-8000-000000000121');

insert into cpi_private.ranked_runs
 (id,user_id,ruleset_version,checkpoint_private,server_validated,country_snapshot,
  continent_snapshot,mapping_version,region_snapshotted_at)
values
 ('00000000-0000-4000-8000-000000000221','00000000-0000-4000-8000-000000000121',
  'infinity-v1','{"state":{"privateKey":"secret-fixture-only"}}',true,'BG','EU','cpi-regions-2026-11-v1',clock_timestamp());

do $tests$
begin
  begin
    insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
    values ('00000000-0000-4000-8000-000000000222','00000000-0000-4000-8000-000000000121','infinity-v1','{}');
    raise exception 'Multiple active runs were accepted';
  exception when unique_violation then null; end;
  begin
    insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private,server_validated)
    values ('00000000-0000-4000-8000-000000000223','00000000-0000-4000-8000-000000000122','infinity-v1','{}',true);
    raise exception 'Authoritative run without region was accepted';
  exception when check_violation then null; end;
  begin
    update cpi_private.ranked_runs set last_cleared_row='351',current_row='352'
    where id='00000000-0000-4000-8000-000000000221';
    raise exception 'Positive authoritative score without timestamp was accepted';
  exception when check_violation then null; end;
  begin
    update cpi_private.ranked_runs set achieved_at=created_at-interval '1 second'
    where id='00000000-0000-4000-8000-000000000221';
    raise exception 'Score timestamp before run was accepted';
  exception when check_violation then null; end;
  begin
    update cpi_private.ranked_runs set country_snapshot='CA',continent_snapshot='NA'
    where id='00000000-0000-4000-8000-000000000221';
    raise exception 'Region mutation was accepted';
  exception when sqlstate '22023' then null; end;
end
$tests$;

insert into cpi_private.ranked_receipts(user_id,idempotency_key,run_id,request_fingerprint,response_private)
values ('00000000-0000-4000-8000-000000000121','00000000-0000-4000-8000-000000000321',
 '00000000-0000-4000-8000-000000000221',repeat('a',64),'{"snapshot":{"lastClearedRow":"9007199254740993"}}');
insert into cpi_private.ranked_action_audit(run_id,user_id,command_sequence,idempotency_key,command_private,result_private)
values
 ('00000000-0000-4000-8000-000000000221','00000000-0000-4000-8000-000000000121','9007199254740992',
  '00000000-0000-4000-8000-000000000322','{"type":"heartbeat"}','{}'),
 ('00000000-0000-4000-8000-000000000221','00000000-0000-4000-8000-000000000121','9007199254740993',
  '00000000-0000-4000-8000-000000000323','{"type":"heartbeat"}','{}');

do $tests$
begin
  if (select count(*) from cpi_private.ranked_action_audit where run_id='00000000-0000-4000-8000-000000000221')<>2
    or (select response_private->'snapshot'->>'lastClearedRow' from cpi_private.ranked_receipts
        where idempotency_key='00000000-0000-4000-8000-000000000321')<>'9007199254740993' then
    raise exception 'Decimal wire values lost precision';
  end if;
  begin
    insert into cpi_private.ranked_receipts(user_id,idempotency_key,run_id,request_fingerprint,response_private)
    values ('00000000-0000-4000-8000-000000000121','00000000-0000-4000-8000-000000000321',
      '00000000-0000-4000-8000-000000000221',repeat('b',64),'{}');
    raise exception 'Receipt overwrite was accepted';
  exception when unique_violation then null; end;
  begin
    insert into cpi_private.ranked_receipts(user_id,idempotency_key,run_id,request_fingerprint,response_private)
    values ('00000000-0000-4000-8000-000000000122','00000000-0000-4000-8000-000000000324',
      '00000000-0000-4000-8000-000000000221',repeat('b',64),'{}');
    raise exception 'Foreign owner receipt was accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into cpi_private.ranked_action_audit(run_id,user_id,command_sequence,idempotency_key,command_private,result_private)
    values ('00000000-0000-4000-8000-000000000221','00000000-0000-4000-8000-000000000121','9007199254740993',
      '00000000-0000-4000-8000-000000000325','{}','{}');
    raise exception 'Duplicate sequence was accepted';
  exception when unique_violation then null; end;
  begin
    insert into cpi_private.ranked_action_audit(run_id,user_id,command_sequence,idempotency_key,command_private,result_private)
    values ('00000000-0000-4000-8000-000000000221','00000000-0000-4000-8000-000000000121','01',
      '00000000-0000-4000-8000-000000000326','{}','{}');
    raise exception 'Noncanonical sequence was accepted';
  exception when check_violation then null; end;
  begin
    update cpi_private.ranked_receipts set response_private='{}';
    raise exception 'Receipt update was allowed';
  exception when insufficient_privilege then null; end;
end
$tests$;

update cpi_private.ranked_runs set status='finished',finalized_at=clock_timestamp(),updated_at=clock_timestamp()
where id='00000000-0000-4000-8000-000000000221';
insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
values ('00000000-0000-4000-8000-000000000222','00000000-0000-4000-8000-000000000121','infinity-v1','{}');
reset role;
delete from auth.users where id='00000000-0000-4000-8000-000000000121';
do $tests$
begin
  if exists (select 1 from cpi_private.ranked_runs where user_id='00000000-0000-4000-8000-000000000121')
    or exists (select 1 from cpi_private.ranked_receipts where user_id='00000000-0000-4000-8000-000000000121')
    or exists (select 1 from cpi_private.ranked_action_audit where user_id='00000000-0000-4000-8000-000000000121') then
    raise exception 'Account cascade retained ranked private state';
  end if;
end
$tests$;
rollback;
