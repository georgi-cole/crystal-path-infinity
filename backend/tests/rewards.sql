-- Isolated SQL assertions, never hosted execution. Fixtures roll back.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000661','reward-boundary@example.invalid');
insert into cpi_private.profile_owners(user_id) values('00000000-0000-4000-8000-000000000661');
insert into cpi_private.profiles_private(user_id,privacy_context) values('00000000-0000-4000-8000-000000000661','unknown');

do $tests$
declare relation_name text;
begin
  foreach relation_name in array array['reward_sdk_configurations','reward_authorizations','reward_api_receipts','reward_audit_events'] loop
    if has_table_privilege('anon','cpi_private.'||relation_name,'select')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'insert')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'update')
       or not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='cpi_private' and c.relname=relation_name and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'Reward data boundary failed: %',relation_name;
    end if;
  end loop;
  if has_table_privilege('service_role','cpi_private.reward_authorizations','insert')
    or has_table_privilege('service_role','cpi_private.reward_sdk_configurations','update')
    or has_table_privilege('service_role','cpi_private.reward_api_receipts','update') then
    raise exception 'Runtime must not authorize its own privacy or rewrite receipts';
  end if;
  if has_function_privilege('anon','cpi_private.reward_authorization_for(uuid,text,text,timestamptz)','execute')
    or has_function_privilege('authenticated','cpi_private.reward_authorization_for(uuid,text,text,timestamptz)','execute')
    or not has_function_privilege('service_role','cpi_private.reward_authorization_for(uuid,text,text,timestamptz)','execute') then
    raise exception 'Reward policy lookup must remain server-only';
  end if;
end
$tests$;
insert into cpi_private.reward_sdk_configurations(id,environment,platform,sdk_version,ad_unit_id,ssv_ad_unit,reward_amount,reward_item,reviewed,closeability_reviewed,enabled)
values('00000000-0000-4000-8000-000000000761','development','android','synthetic-fixture','ca-app-pub-1111111111111111/9999999999','9999999999','1','continue',true,true,true);
do $tests$
begin
  begin
    insert into cpi_private.reward_sdk_configurations(environment,platform,sdk_version,ad_unit_id,ssv_ad_unit,reward_amount,reward_item)
    values('production','android','fixture','ca-app-pub-3940256099942544/5224354917','5224354917','1','continue');
    raise exception 'Google demo ad unit accepted for production';
  exception when check_violation then null;end;
  begin
    insert into cpi_private.reward_authorizations(user_id,configuration_id,privacy_context,policy_version,verification_reference,child_directed,under_age_of_consent,max_ad_content_rating,non_personalized,valid_until)
    values('00000000-0000-4000-8000-000000000661','00000000-0000-4000-8000-000000000761','unknown','fixture','fixture',false,false,'MA',false,clock_timestamp()+interval '10 minutes');
    raise exception 'Unknown context lost protective flags';
  exception when check_violation then null;end;
end
$tests$;
insert into cpi_private.reward_authorizations(id,user_id,configuration_id,privacy_context,policy_version,verification_reference,prerequisites_satisfied,child_directed,under_age_of_consent,max_ad_content_rating,non_personalized,valid_until)
values('00000000-0000-4000-8000-000000000861','00000000-0000-4000-8000-000000000661','00000000-0000-4000-8000-000000000761','unknown','fixture','fixture',true,true,true,'G',true,clock_timestamp()+interval '10 minutes');
set role service_role;
do $tests$
begin
  if exists(select 1 from cpi_private.reward_authorization_for('00000000-0000-4000-8000-000000000661','android','development',clock_timestamp())) then
    raise exception 'Unknown context accepted without Families review';
  end if;
end
$tests$;
reset role;
update cpi_private.reward_sdk_configurations set families_reviewed=true where id='00000000-0000-4000-8000-000000000761';
set role service_role;
do $tests$
begin
  if not exists(select 1 from cpi_private.reward_authorization_for('00000000-0000-4000-8000-000000000661','android','development',clock_timestamp())) then
    raise exception 'Explicit reviewed child-safe unknown permit should be available';
  end if;
  if exists(select 1 from cpi_private.reward_authorization_for('00000000-0000-4000-8000-000000000661','ios','development',clock_timestamp())) then
    raise exception 'Wrong SDK platform accepted';
  end if;
  if exists(select 1 from cpi_private.reward_authorization_for('00000000-0000-4000-8000-000000000661','android','production',clock_timestamp())) then
    raise exception 'Wrong ad environment accepted';
  end if;
end
$tests$;
reset role;
update cpi_private.profiles_private set analytics_age_band='65_plus',age_response_at=clock_timestamp()
where user_id='00000000-0000-4000-8000-000000000661';
insert into cpi_private.consent_events(user_id,purpose,decision,policy_version,recorded_at)
values('00000000-0000-4000-8000-000000000661','ads','withdrawn','fixture',clock_timestamp());
set role service_role;
do $tests$
begin
  if exists(select 1 from cpi_private.reward_authorization_for('00000000-0000-4000-8000-000000000661','android','development',clock_timestamp())) then
    raise exception 'Analytics age must not override withdrawn ad consent';
  end if;
end
$tests$;
reset role;
-- Own export pagination is independent per collection and strips all proof data.
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000662','reward-export-other@example.invalid');
insert into cpi_private.profile_owners(user_id) values('00000000-0000-4000-8000-000000000662');
insert into cpi_private.ranked_runs(id,user_id,ruleset_version,status,checkpoint_private,finalized_at) values
 ('00000000-0000-4000-8000-000000000961','00000000-0000-4000-8000-000000000661','fixture-export','finished','{}',clock_timestamp()),
 ('00000000-0000-4000-8000-000000000962','00000000-0000-4000-8000-000000000662','fixture-export','finished','{}',clock_timestamp());
insert into cpi_private.reward_intents(id,run_id,death_id,ordinal,promised_restore_sp,ruleset_version)
select ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000000961','fixture-death-'||i,1,200,'fixture-export' from generate_series(1,101) i;
insert into cpi_private.reward_intents(id,run_id,death_id,ordinal,promised_restore_sp,ruleset_version)
values('99000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000962','foreign-private-death',1,200,'fixture-export');
insert into cpi_private.reward_authorizations(id,user_id,configuration_id,privacy_context,policy_version,verification_reference,child_directed,under_age_of_consent,max_ad_content_rating,non_personalized,valid_until)
select ('91000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000000661','00000000-0000-4000-8000-000000000761','unknown','fixture','private-reference',true,true,'G',true,clock_timestamp()+interval '10 minutes'
from generate_series(1,100) i;
set role service_role;
do $exports$
declare first_page jsonb;second_page jsonb;authorizations jsonb;
begin
  first_page:=cpi_private.export_own_rewards('00000000-0000-4000-8000-000000000661');
  second_page:=cpi_private.export_own_rewards('00000000-0000-4000-8000-000000000661',(first_page->>'next')::uuid);
  if jsonb_array_length(first_page->'rewards')<>100 or jsonb_array_length(second_page->'rewards')<>1
     or second_page->>'next' is not null or first_page::text like '%nonce%' or first_page::text like '%foreign-private%' then
    raise exception 'Own reward export pagination or privacy failed';
  end if;
  authorizations:=cpi_private.export_own_ad_authorizations('00000000-0000-4000-8000-000000000661');
  second_page:=cpi_private.export_own_ad_authorizations('00000000-0000-4000-8000-000000000661',(authorizations->>'next')::uuid);
  if jsonb_array_length(authorizations->'adAuthorizations')<>100 or jsonb_array_length(second_page->'adAuthorizations')<>1
     or authorizations::text like '%private-reference%' or authorizations::text like '%verification_reference%' then
    raise exception 'Own ad authorization export pagination or privacy failed';
  end if;
end
$exports$;
reset role;
rollback;
