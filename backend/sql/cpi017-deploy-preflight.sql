select case when
  pg_catalog.to_regnamespace('cpi_private') is null
  and pg_catalog.to_regclass('public.profiles_public') is null
  then 'CPI017_PRECHECK_OK'
  else 'CPI017_PRECHECK_FAIL'
end as cpi017_schema_preflight;
