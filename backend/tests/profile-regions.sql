-- Disposable PostgreSQL integration tests after CPI-017 assertions and CPI-019.
-- This file rolls all fixtures back. Never run against a hosted database.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000019','profile-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000020','profile-b@example.invalid'),
 ('00000000-0000-4000-8000-000000000021','profile-world@example.invalid');

do $tests$
declare
  routine regprocedure;
  relation_name text;
begin
  foreach routine in array array[
    'cpi_private.save_profile(uuid,text,text,text,text)'::regprocedure,
    'cpi_private.get_profile_owner(uuid)'::regprocedure,
    'cpi_private.get_profile_config()'::regprocedure,
    'cpi_private.profile_analytics_allowed(uuid)'::regprocedure,
    'cpi_private.snapshot_profile_region(uuid)'::regprocedure,
    'cpi_private.lock_run_region(uuid,uuid)'::regprocedure,
    'cpi_private.purge_profile_analytics()'::regprocedure
  ] loop
    if has_function_privilege('anon',routine,'execute')
       or has_function_privilege('authenticated',routine,'execute')
       or not has_function_privilege('service_role',routine,'execute') then
      raise exception 'Unsafe routine permissions: %',routine;
    end if;
    if (select prosecdef from pg_proc where oid=routine) then
      raise exception 'Profile routines must not elevate caller privileges';
    end if;
  end loop;
  foreach relation_name in array array['country_regions','profile_region_state','analytics_authorizations'] loop
    if has_table_privilege('anon','cpi_private.'||relation_name,'select')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'select')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'insert')
       or not exists (
         select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='cpi_private' and c.relname=relation_name
           and c.relrowsecurity and c.relforcerowsecurity
       ) then
      raise exception 'Unsafe private relation: %',relation_name;
    end if;
  end loop;
  if has_table_privilege('service_role','cpi_private.country_regions','update') then
    raise exception 'Mapping must remain frozen for application service';
  end if;
  if (select count(*) from cpi_private.country_regions
      where mapping_version='cpi-regions-2026-11-v1') <> 249 then
    raise exception 'Expected full 249-country ISO mapping';
  end if;
  if exists (
    select 1 from (values ('BG','EU'),('GB','EU'),('NO','EU'),('GL','NA'),
      ('GF','SA'),('RU','EU'),('TR','AS'),('CY','AS'),('KZ','AS'),('GE','AS'),
      ('EG','AF'),('TW','AS'),('AQ','AN'),('UM','OC')) fixture(country,continent)
    left join cpi_private.country_regions r on r.mapping_version='cpi-regions-2026-11-v1'
      and r.country_code=fixture.country
    where r.continent_code is distinct from fixture.continent
  ) then
    raise exception 'Territory/transcontinental mapping regression';
  end if;
end
$tests$;

set role service_role;
do $tests$
declare
  a constant uuid := '00000000-0000-4000-8000-000000000019';
  b constant uuid := '00000000-0000-4000-8000-000000000020';
  w constant uuid := '00000000-0000-4000-8000-000000000021';
  run_a constant uuid := '00000000-0000-4000-8000-000000000119';
  run_a2 constant uuid := '00000000-0000-4000-8000-000000000129';
  run_w constant uuid := '00000000-0000-4000-8000-000000000121';
  result jsonb;
  old_public_id text;
  old_response timestamptz;
  before_profile jsonb;
  unsupported_name text;
  purged integer;
begin
  result := cpi_private.get_profile_config();
  if jsonb_array_length(result->'countries')<>249
     or result->>'mappingVersion'<>'cpi-regions-2026-11-v1' then
    raise exception 'Incomplete profile configuration';
  end if;
  result := cpi_private.save_profile(a,'  Ｐｒｉｓｍ_Ａ  ','BG','skip');
  old_public_id := result->>'public_id';
  if result->>'username'<>'prism_a' or result->>'country_code'<>'BG'
     or (select array_agg(k order by k) from jsonb_object_keys(result) k)
       is distinct from array['country_code','created_at','public_id','updated_at','username'] then
    raise exception 'Normalization failed or public profile leaked private fields';
  end if;
  if (select analytics_age_band is not null or age_response_at is not null
      or privacy_context<>'unknown' from cpi_private.profiles_private where user_id=a) then
    raise exception 'Skip must not infer age or weaken unknown context';
  end if;
  before_profile := result;
  -- Reserved, invalid, control/bidi/confusable and too long names are rejected.
  foreach unsupported_name in array array['admin','Support_A','ab','a.b','a@b',
      '0123456789012345678901234',E'bad\nname','раураl',U&'bad\202Ename'] loop
    begin
      perform cpi_private.save_profile(a,unsupported_name,'BG');
      raise exception 'Invalid username accepted: %',unsupported_name;
    exception when sqlstate '22023' then
      if sqlerrm not in ('CPI_PROFILE_USERNAME_INVALID','CPI_PROFILE_USERNAME_RESERVED') then raise; end if;
    end;
  end loop;
  begin
    perform cpi_private.save_profile(a,'new_name','ZZ');
    raise exception 'Unsupported country accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_PROFILE_COUNTRY_UNSUPPORTED' then raise; end if;
  end;
  begin
    perform cpi_private.save_profile(b,'PRISM_A','DE');
    raise exception 'Duplicate normalized username accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_PROFILE_USERNAME_TAKEN' then raise; end if;
  end;
  if exists(select 1 from cpi_private.profile_owners where user_id=b) then
    raise exception 'Failed profile creation left a second owner/account side effect';
  end if;
  if cpi_private.get_profile_owner(a)->'profile' is distinct from before_profile then
    raise exception 'Rejected writes changed published profile';
  end if;
  begin
    perform cpi_private.save_profile(a,'prism_a','BG','set','18_24');
    raise exception 'Unknown analytics capture accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_PROFILE_ANALYTICS_NOT_ALLOWED' then raise; end if;
  end;
  -- Demographic age bands can never set privacy_context to adult.
  update cpi_private.profiles_private set privacy_context='child' where user_id=a;
  insert into cpi_private.analytics_authorizations
    (user_id,privacy_context,policy_version,authorization_reference,valid_until)
    values(a,'child','CI-only','opaque-ci-reference',clock_timestamp()+interval '1 hour');
  insert into cpi_private.consent_events(user_id,purpose,decision,policy_version)
    values(a,'analytics','granted','CI-only');
  begin
    perform cpi_private.save_profile(a,'prism_a','BG','set','65_plus');
    raise exception 'Child analytics without guardian authorization accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_PROFILE_ANALYTICS_NOT_ALLOWED' then raise; end if;
  end;
  insert into cpi_private.parental_authorizations
    (user_id,purpose,state,verification_reference,verified_at)
    values(a,'analytics','approved','opaque-ci-guardian',clock_timestamp());
  perform cpi_private.save_profile(a,'prism_a','BG','set','18_24');
  select age_response_at into old_response from cpi_private.profiles_private where user_id=a;
  if (select analytics_age_band<>'18_24' or age_response_at is null
       or privacy_context<>'child' from cpi_private.profiles_private where user_id=a) then
    raise exception 'Band storage changed independent child safeguards';
  end if;
  perform cpi_private.save_profile(a,'prism_a','BG','set','25_34');
  if (select analytics_age_band<>'25_34' or age_response_at<old_response
      from cpi_private.profiles_private where user_id=a) then
    raise exception 'Correction failed or response time was treated as birthday';
  end if;
  update cpi_private.analytics_authorizations
    set issued_at=clock_timestamp()-interval '2 hours',valid_until=clock_timestamp()-interval '1 hour'
    where user_id=a;
  if cpi_private.profile_analytics_allowed(a) then
    raise exception 'Expired privacy authorization remained usable';
  end if;
  update cpi_private.analytics_authorizations
    set issued_at=clock_timestamp(),valid_until=clock_timestamp()+interval '1 hour'
    where user_id=a;
  update cpi_private.parental_authorizations set state='revoked',revoked_at=clock_timestamp()
    where user_id=a and purpose='analytics';
  if cpi_private.profile_analytics_allowed(a) then
    raise exception 'Revoked guardian analytics permission remained usable';
  end if;
  update cpi_private.parental_authorizations set state='approved',revoked_at=null
    where user_id=a and purpose='analytics';
  insert into cpi_private.parental_authorizations(user_id,purpose,state)
    values(a,'analytics','denied');
  if cpi_private.profile_analytics_allowed(a) then
    raise exception 'Superseded guardian approval overrode a later/tied denial';
  end if;
  delete from cpi_private.parental_authorizations
    where user_id=a and purpose='analytics' and state='denied';
  update cpi_private.analytics_authorizations set policy_version='new-policy' where user_id=a;
  if cpi_private.profile_analytics_allowed(a) then
    raise exception 'Old-policy consent authorized a different policy permit';
  end if;
  update cpi_private.analytics_authorizations set policy_version='CI-only' where user_id=a;
  begin
    perform cpi_private.save_profile(a,'prism_a','BG','set','25');
    raise exception 'Raw age or unknown band accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_PROFILE_BAND_INVALID' then raise; end if;
  end;
  perform cpi_private.save_profile(a,'prism_a','BG','withdraw');
  if exists(select 1 from cpi_private.analytics_authorizations where user_id=a)
     or (select analytics_age_band is not null or age_response_at is not null
         or privacy_context<>'child' from cpi_private.profiles_private where user_id=a)
     or cpi_private.profile_analytics_allowed(a) then
    raise exception 'Withdrawal retained age/permit or weakened child context';
  end if;
  -- Equal-time records must fail closed rather than sort by random UUID.
  insert into cpi_private.analytics_authorizations
    (user_id,privacy_context,policy_version,authorization_reference,valid_until)
    values(a,'child','CI-only','opaque-ci-reference',clock_timestamp()+interval '1 hour');
  insert into cpi_private.consent_events(user_id,purpose,decision,policy_version,recorded_at)
    select a,'analytics','granted','CI-only',max(recorded_at)
    from cpi_private.consent_events where user_id=a and purpose='analytics';
  if cpi_private.profile_analytics_allowed(a) then
    raise exception 'Ambiguous consent timestamp overrode withdrawal';
  end if;
  delete from cpi_private.analytics_authorizations where user_id=a;
  begin
    perform cpi_private.save_profile(a,'prism_a','BG','set','25_34');
    raise exception 'Withdrawn authorization reused';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_PROFILE_ANALYTICS_NOT_ALLOWED' then raise; end if;
  end;

  -- Country corrections are free before ranked start; never infer IP/locale.
  perform cpi_private.save_profile(a,'prism_a','GB');
  perform cpi_private.save_profile(a,'prism_a','BG');
  if cpi_private.get_profile_owner(a)->>'countryChangeAvailableAt' is not null then
    raise exception 'Pre-ranked country edit incorrectly started cooldown';
  end if;
  insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
    values(run_a,a,'CI-only','{}');
  result := cpi_private.lock_run_region(a,run_a);
  if result is distinct from '{"countryCode":"BG","continent":"EU","mappingVersion":"cpi-regions-2026-11-v1"}'::jsonb then
    raise exception 'First ranked snapshot differs from declared profile';
  end if;
  if cpi_private.lock_run_region(a,run_a) is distinct from result then
    raise exception 'Repeated lock changed snapshot';
  end if;
  begin
    perform cpi_private.save_profile(a,'prism_a','DE');
    raise exception 'Country changed before 720-hour cooldown';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_PROFILE_COUNTRY_COOLDOWN' then raise; end if;
  end;
  -- Keeping country does not extend cooldown or block independent name edits.
  perform cpi_private.save_profile(a,'prism_renamed','BG');
  update cpi_private.profile_region_state set first_ranked_at=clock_timestamp()-interval '720 hours'
    where user_id=a;
  perform cpi_private.save_profile(a,'prism_renamed','DE');
  if (select country_snapshot<>'BG' or continent_snapshot<>'EU'
      from cpi_private.ranked_runs where id=run_a) then
    raise exception 'Profile country change moved old ranked snapshot';
  end if;
  update cpi_private.ranked_runs set status='finished',finalized_at=clock_timestamp()
    where id=run_a;
  insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
    values(run_a2,a,'CI-only','{}');
  result := cpi_private.lock_run_region(a,run_a2);
  if result->>'countryCode'<>'DE' then
    raise exception 'New run did not receive updated country';
  end if;
  begin
    update cpi_private.ranked_runs set country_snapshot='FR' where id=run_a;
    raise exception 'Historical snapshot could be edited';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_RUN_REGION_IMMUTABLE' then raise; end if;
  end;
  begin
    update cpi_private.ranked_runs set ruleset_version='another' where id=run_a;
    raise exception 'Run ruleset could be edited';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_RUN_IDENTITY_IMMUTABLE' then raise; end if;
  end;
  perform cpi_private.save_profile(w,'world_only',null,'skip');
  insert into cpi_private.ranked_runs(id,user_id,ruleset_version,checkpoint_private)
    values(run_w,w,'CI-only','{}');
  result := cpi_private.lock_run_region(w,run_w);
  if result is distinct from '{"countryCode":null,"continent":null,"mappingVersion":"cpi-regions-2026-11-v1"}'::jsonb then
    raise exception 'Missing country must be explicit world-only with version';
  end if;
  begin
    perform cpi_private.lock_run_region(a,run_w);
    raise exception 'Foreign run accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'CPI_RUN_NOT_FOUND' then raise; end if;
  end;
  if cpi_private.get_profile_owner(a)->'profile'->>'public_id'<>old_public_id then
    raise exception 'Resume/edit created a different public identity';
  end if;
  update cpi_private.profiles_private set analytics_age_band='25_34',
    age_response_at=clock_timestamp()-interval '366 days' where user_id=a;
  if cpi_private.get_profile_owner(a)->>'analyticsAgeBand' is not null then
    raise exception 'Expired analytics still returned';
  end if;
  purged := cpi_private.purge_profile_analytics();
  if purged < 1
     or (select analytics_age_band is not null or age_response_at is not null
         from cpi_private.profiles_private where user_id=a) then
    raise exception 'Analytics retention purge failed';
  end if;
end
$tests$;
reset role;

-- Actual client role invocation is denied, even with a caller-chosen subject.
set role anon;
do $tests$
begin
  begin
    perform cpi_private.get_profile_config();
    raise exception 'Guest invoked trusted profile service';
  exception when insufficient_privilege then null;
  end;
end
$tests$;
reset role;
set role authenticated;
do $tests$
begin
  begin
    perform cpi_private.save_profile('00000000-0000-4000-8000-000000000019','stolen','US');
    raise exception 'Mobile user invoked trusted profile mutation';
  exception when insufficient_privilege then null;
  end;
end
$tests$;
reset role;
rollback;
