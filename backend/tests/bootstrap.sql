-- Isolated PostgreSQL 17 test fixture only. These role/auth definitions
-- simulate Supabase; NEVER deploy this file to a real Supabase environment.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
revoke all on schema auth from public, anon, authenticated;
create table auth.users (
  id uuid primary key,
  email text not null unique,
  email_confirmed_at timestamptz
);
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000000001', 'owner-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000002', 'owner-b@example.invalid');

-- Same schema's broad initial public grants that Supabase projects may have:
-- the migration must explicitly REVOKE them on its own created objects.
alter default privileges in schema public
  grant all privileges on tables to anon, authenticated, service_role;
