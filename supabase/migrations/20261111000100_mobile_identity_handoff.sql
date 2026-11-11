begin;
create table cpi_private.account_mobile_identity (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  state_hash text unique not null check (state_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('apple','google')),
  family_id uuid references cpi_private.account_families(id) on delete cascade,
  country text not null check (country ~ '^[A-Z]{2}$'),
  request_encrypted text not null,
  response_encrypted text,
  expires_at bigint not null
);
create index account_mobile_identity_expiry on cpi_private.account_mobile_identity(expires_at);
alter table cpi_private.account_mobile_identity enable row level security;
alter table cpi_private.account_mobile_identity force row level security;
revoke all on cpi_private.account_mobile_identity from public,anon,authenticated;
grant select,insert,update,delete on cpi_private.account_mobile_identity to service_role;
create policy service_only on cpi_private.account_mobile_identity for all to service_role using(true) with check(true);
commit;
