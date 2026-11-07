-- Run with psql as the isolated project's database administrator AFTER the migrations.
-- Supply CPI_RUNTIME_DB_PASSWORD in the process environment; never paste a password in this file.
\set ON_ERROR_STOP on
\getenv runtime_password CPI_RUNTIME_DB_PASSWORD
select 'create role cpi_runtime login nosuperuser nocreatedb nocreaterole noinherit nobypassrls password ' || quote_literal(:'runtime_password')
  where not exists(select 1 from pg_roles where rolname='cpi_runtime')
\gexec
grant service_role to cpi_runtime;
-- An existing role/password is deliberately not reset by this script.
-- Runtime connection: cpi_runtime.<verified project ref>@<session pooler>:5432/postgres.
-- The edge sets role service_role; it cannot reset into postgres or approve its own rollout matrix.
