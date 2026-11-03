-- CPI-017 preflight: a fresh new development project must have no CPI schema.
-- SELECT only, and run only with supabase db query --read-only --remote=<ref>.
-- If someone already created or partially applied these objects, stop.
select case when
  to_regnamespace('cpi_private') is null
  and to_regclass('public.profiles_public') is null
  and not exists (
    select 1 from pg_catalog.pg_namespace n
    where n.nspname = 'cpi_private'
  )
  then 'CPI017_PRECHECK_OK'
  else 'CPI017_PRECHECK_FAIL'
end as cpi017_schema_preflight;
