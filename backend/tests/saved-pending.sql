-- Disposable PostgreSQL lease/index invariants, before operational migration007.
begin;
insert into auth.users(id,email) values('30000000-0000-4000-8000-000000000031','saved-pending@example.invalid');
set role service_role;
select cpi_private.save_profile('30000000-0000-4000-8000-000000000031','saved_pending','BG','skip');
insert into cpi_private.ranked_runs(id,user_id,ruleset_version,status,checkpoint_private,lease_active)
 values('30100000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000031',
  'infinity-v1','verification_pending','{"leaseActive":false,"privateRoute":"never-public"}',false);
insert into cpi_private.reward_intents(id,run_id,death_id,ordinal,promised_restore_sp,ruleset_version)
 values('30200000-0000-4000-8000-000000000031','30100000-0000-4000-8000-000000000031','saved-death',1,200,'infinity-v1');
insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
 values('30100000-0000-4000-8000-000000000032','30000000-0000-4000-8000-000000000031','infinity-v1','{}');
do $tests$
begin
  begin
    insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
      values('30100000-0000-4000-8000-000000000033','30000000-0000-4000-8000-000000000031','infinity-v1','{}');
    raise exception 'Two attached active leases were accepted';
  exception when unique_violation then null;
  end;
  begin
    update cpi_private.ranked_runs set lease_active=true where id='30100000-0000-4000-8000-000000000031';
    raise exception 'Saved pending run attached over another active run';
  exception when unique_violation then null;
  end;
  begin
    update cpi_private.ranked_runs set lease_active=false where id='30100000-0000-4000-8000-000000000032';
    raise exception 'A playing run could be detached as if pending';
  exception when check_violation then null;
  end;
end
$tests$;
-- A late callback can still bind the saved intent. It never reattaches a lease.
insert into cpi_private.reward_transactions(provider_transaction_id,intent_id,run_id,signed_query_sha256,earned_at)
 values('saved-late-earned','30200000-0000-4000-8000-000000000031','30100000-0000-4000-8000-000000000031',repeat('a',64),clock_timestamp());
update cpi_private.reward_intents set state='verified',resolved_at=clock_timestamp()
 where id='30200000-0000-4000-8000-000000000031';
insert into cpi_private.revive_grants(intent_id,run_id,death_id,ordinal,restore_sp)
 values('30200000-0000-4000-8000-000000000031','30100000-0000-4000-8000-000000000031','saved-death',1,200);
update cpi_private.ranked_runs set status='dead',revives_granted=1 where id='30100000-0000-4000-8000-000000000031';
do $tests$
begin
  if not exists(select 1 from cpi_private.ranked_runs where id='30100000-0000-4000-8000-000000000031'
      and not lease_active and status='dead' and revives_granted=1 and revives_applied=0)
    or not exists(select 1 from cpi_private.revive_grants where run_id='30100000-0000-4000-8000-000000000031' and state='granted')
    or exists(select 1 from cpi_private.verified_results where run_id='30100000-0000-4000-8000-000000000031') then
    raise exception 'Saved pending grant was lost, attached or published prematurely';
  end if;
end
$tests$;
-- Reattachment succeeds only after the current attempt explicitly finishes.
update cpi_private.ranked_runs set status='finished',finalized_at=clock_timestamp()
 where id='30100000-0000-4000-8000-000000000032';
update cpi_private.ranked_runs set lease_active=true where id='30100000-0000-4000-8000-000000000031';
do $tests$
begin
  if (select count(*) from cpi_private.ranked_runs where user_id='30000000-0000-4000-8000-000000000031'
      and lease_active and status<>'finished')<>1 then raise exception 'One attached lease invariant failed'; end if;
end
$tests$;
reset role;
rollback;
