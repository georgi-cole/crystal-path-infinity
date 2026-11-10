begin;

create table cpi_private.account_provider_signups (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('apple','google')),
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  permit_hash text not null references cpi_private.account_permits(token_hash) on delete cascade,
  country text not null check (country ~ '^[A-Z]{2}$'),
  payload_encrypted text not null,
  expires_at bigint not null
);
create index account_provider_signup_expiry on cpi_private.account_provider_signups(expires_at);
alter table cpi_private.account_provider_signups enable row level security;
alter table cpi_private.account_provider_signups force row level security;
revoke all on cpi_private.account_provider_signups from public,anon,authenticated;
grant select,insert,update,delete on cpi_private.account_provider_signups to service_role;
create policy service_only on cpi_private.account_provider_signups for all to service_role using(true) with check(true);

-- An email match alone can never attach a provider to an existing Auth user.
-- Only the immutable server-issued marker can recover an interrupted provider creation.
create function cpi_private.account_provider_signup_owner(address text, marker text)
returns table(subject uuid, matches_provider boolean)
language sql security definer set search_path='' as $$
  select u.id, coalesce(lower(u.email)=lower(address)
    and u.email_confirmed_at is not null
    and u.raw_app_meta_data->>'cpi_provider_signup'=marker,false)
  from auth.users u
  where lower(u.email)=lower(address) or u.raw_app_meta_data->>'cpi_provider_signup'=marker;
$$;
revoke all on function cpi_private.account_provider_signup_owner(text,text) from public,anon,authenticated;
grant execute on function cpi_private.account_provider_signup_owner(text,text) to service_role;

commit;
