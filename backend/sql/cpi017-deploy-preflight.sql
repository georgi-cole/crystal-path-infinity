-- CPI-017: read-only *hosted* schema-emptiness check.
-- Supabase's experimental read-only SQL endpoint requires every entity
-- reference to be schema-qualified. Avoid unqualified helper functions.
-- Query the PostgreSQL catalog directly: catalog names are fully qualified.
-- Missing access or an unknown error fails closed; NEVER assume empty.
select case when
  not exists (
    select 1 from pg_catalog.pg_namespace as namespace
    where namespace.nspname = 'cpi_private'
  )
  and not exists (
    select 1
    from pg_catalog.pg_class as relation
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'profiles_public'
  )
  then 'CPI017_PRECHECK_OK'
  else 'CPI017_PRECHECK_FAIL'
end as cpi017_schema_preflight;
