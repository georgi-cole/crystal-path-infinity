-- Run after migration; PostgreSQL CI connection owns the schema and can
-- validate catalog metadata without granting API callers any private reads.
do $tests$
declare
  relation_name text;
  result_columns text[];
  table_count integer;
begin
  select array_agg(column_name::text order by column_name)
  into result_columns
  from information_schema.columns
  where table_schema='public' and table_name='profiles_public';
  if result_columns is distinct from
     array['country_code', 'created_at', 'public_id', 'updated_at', 'username']::text[] then
    raise exception 'Public profile field leak: %', result_columns;
  end if;
  if has_schema_privilege('anon','cpi_private','usage')
     or has_schema_privilege('authenticated','cpi_private','usage') then
    raise exception 'Mobile roles must never use private schema';
  end if;
  if not has_schema_privilege('service_role','cpi_private','usage') then
    raise exception 'Trusted service role lacks private schema usage';
  end if;
  foreach relation_name in array array[
    'profile_owners','profiles_private','consent_events','parental_authorizations',
    'ranked_runs','run_actions','reward_intents',
    'reward_transactions','revive_grants','verified_results'
  ] loop
    if has_table_privilege('anon', 'cpi_private.'||relation_name,'select')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'select')
       or has_table_privilege('anon','cpi_private.'||relation_name,'insert')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'insert')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'update')
       or has_table_privilege('authenticated','cpi_private.'||relation_name,'delete') then
      raise exception 'Client role has access to private table: %',relation_name;
    end if;
    if not has_table_privilege('service_role','cpi_private.'||relation_name,'insert') then
      raise exception 'Server cannot persist private table: %',relation_name;
    end if;
    if not exists (
      select 1
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='cpi_private' and c.relname=relation_name
        and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'Missing forced RLS on private table: %',relation_name;
    end if;
  end loop;
  if not has_table_privilege('anon','public.profiles_public','select')
    or not has_table_privilege('authenticated','public.profiles_public','select') then
    raise exception 'Public fields must remain explicitly readable';
  end if;
  if has_table_privilege('anon','public.profiles_public','insert')
    or has_table_privilege('authenticated','public.profiles_public','insert')
    or has_table_privilege('authenticated','public.profiles_public','update')
    or has_table_privilege('authenticated','public.profiles_public','delete')
    or has_table_privilege('authenticated','public.profiles_public','truncate') then
    raise exception 'Client can edit public profile or bypass server-side moderation';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='profiles_public'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'Public table missing forced RLS';
  end if;
  if exists (
    select 1
    from pg_views v
    where v.schemaname='public'
      and v.viewname like 'cpi_%'
  ) then
    raise exception 'Unreviewed public views must not expose private source data';
  end if;
  select count(*) into table_count
  from information_schema.tables
  where table_schema='cpi_private' and table_type='BASE TABLE';
  if table_count <> 10 then
    raise exception 'Expected ten private tables; got %', table_count;
  end if;
end
$tests$;

-- The trusted server can create two owners' records; these are test fixtures,
-- not user data or public demo leaderboard entries.
set role service_role;
insert into cpi_private.profile_owners(user_id,public_id) values
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000102');
insert into public.profiles_public(public_id,username,country_code) values
 ('00000000-0000-4000-8000-000000000101','Owner_A','BG'),
 ('00000000-0000-4000-8000-000000000102','Owner_B','FR');
insert into cpi_private.profiles_private
  (user_id,analytics_age_band,age_response_at,privacy_context) values
 ('00000000-0000-4000-8000-000000000001','25_34',now(),'unknown'),
 ('00000000-0000-4000-8000-000000000002',null,null,'child');
insert into cpi_private.consent_events
 (user_id,purpose,decision,policy_version) values
 ('00000000-0000-4000-8000-000000000001','analytics','declined','CI-only');
insert into cpi_private.ranked_runs
 (id,user_id,ruleset_version,checkpoint_private) values
 ('00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001',
  'test-ruleset', '{"stream":{"secretRouteRng":"private-test-only"}}'),
 ('00000000-0000-4000-8000-000000000022',
  '00000000-0000-4000-8000-000000000002',
  'test-ruleset', '{"stream":{"secretRouteRng":"private-test-only"}}');
insert into cpi_private.run_actions
 (run_id,command_sequence,idempotency_key,command_private,result_private)
 values (
 '00000000-0000-4000-8000-000000000011',1,
 '00000000-0000-4000-8000-000000000031',
 '{"type":"choose","side":"left"}','{"accepted":true}');
insert into cpi_private.reward_intents
 (id,run_id,death_id,ordinal,promised_restore_sp,ruleset_version)
 values (
 '00000000-0000-4000-8000-000000000041',
 '00000000-0000-4000-8000-000000000011',
 'death-1', 1, 200, 'test-ruleset');
insert into cpi_private.reward_transactions
 (provider_transaction_id,intent_id,run_id,signed_query_sha256,earned_at)
 values (
 'provider-ci-1','00000000-0000-4000-8000-000000000041',
 '00000000-0000-4000-8000-000000000011',
 repeat('a',64),now());
insert into cpi_private.revive_grants
 (intent_id,run_id,death_id,ordinal,restore_sp)
 values (
 '00000000-0000-4000-8000-000000000041',
 '00000000-0000-4000-8000-000000000011','death-1',1,200);
insert into cpi_private.verified_results
 (run_id,user_id,ruleset_version,last_cleared_row,revives_to_reach_score,achieved_at)
 values (
 '00000000-0000-4000-8000-000000000011',
 '00000000-0000-4000-8000-000000000001',
 'test-ruleset','350',0,now());
reset role;

-- Read permissions are exactly for safe public fields; don't surface emails,
-- age bands, consent evidence, private routes or unverified score sources.
set role anon;
select public_id,username,country_code from public.profiles_public order by username;
reset role;
set role authenticated;
select public_id,username,country_code from public.profiles_public order by username;
reset role;

-- Trusted writes cannot violate basic cross-run, restore or idempotency
-- invariants even though server endpoints are still a separate CPI milestone.
do $tests$
begin
  if not exists (
    select 1 from cpi_private.ranked_runs
    where id='00000000-0000-4000-8000-000000000011'
      and sp=300 and revives_granted=0 and revives_applied=0
  ) then
    raise exception 'Seeded private run was not preserved';
  end if;
end
$tests$;
