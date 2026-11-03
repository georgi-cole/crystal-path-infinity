-- CPI-017 read-only postdeployment catalog audit on the *hosted* dev project.
-- The migration creates 10 private tables and one intentionally public table.
-- Supabase's read-only Management API requires schema-qualified entity references.
-- This is not a substitute for real anon/account-A/account-B HTTP RLS tests.
select case when
  (select pg_catalog.count(*) from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'cpi_private' and c.relkind = 'r') = 10
  and (select pg_catalog.count(*) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'cpi_private' and c.relkind = 'r'
      and c.relrowsecurity and c.relforcerowsecurity) = 10
  and exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles_public'
      and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity
  )
  and (select pg_catalog.array_agg(column_name::text order by column_name)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles_public')
    = array['country_code','created_at','public_id','updated_at','username']::text[]
  and not pg_catalog.has_schema_privilege('anon','cpi_private','usage')
  and not pg_catalog.has_schema_privilege('authenticated','cpi_private','usage')
  and pg_catalog.has_schema_privilege('service_role','cpi_private','usage')
  and pg_catalog.has_table_privilege('anon','public.profiles_public','select')
  and pg_catalog.has_table_privilege('authenticated','public.profiles_public','select')
  and not pg_catalog.has_table_privilege('anon','public.profiles_public','insert')
  and not pg_catalog.has_table_privilege('authenticated','public.profiles_public','insert')
  and not pg_catalog.has_table_privilege('authenticated','public.profiles_public','update')
  and not pg_catalog.has_table_privilege('authenticated','public.profiles_public','delete')
  and not pg_catalog.has_table_privilege('authenticated','cpi_private.profile_owners','select')
  and not pg_catalog.has_table_privilege('authenticated','cpi_private.profiles_private','select')
  and not pg_catalog.has_table_privilege('authenticated','cpi_private.ranked_runs','select')
  and not pg_catalog.has_table_privilege('authenticated','cpi_private.ranked_runs','update')
  and not pg_catalog.has_table_privilege('authenticated','cpi_private.reward_transactions','insert')
  and not pg_catalog.has_table_privilege('authenticated','cpi_private.verified_results','insert')
  and pg_catalog.has_table_privilege('service_role','cpi_private.ranked_runs','insert')
  and pg_catalog.has_table_privilege('service_role','cpi_private.profiles_private','select')
  then 'CPI017_POSTCHECK_OK'
  else 'CPI017_POSTCHECK_FAIL'
end as cpi017_security_postcheck;
