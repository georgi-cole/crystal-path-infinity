begin;

-- Staging tests link an existing account after authentication. The provider subject is never public.
create table cpi_private.account_provider_links (
  provider text not null check (provider in ('apple','google')),
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  apple_refresh_encrypted text,
  primary key (provider,identity_hash),
  unique (user_id,provider),
  check ((apple_refresh_encrypted is not null) = (provider = 'apple'))
);

create table cpi_private.account_provider_challenges (
  nonce_hash text primary key check (nonce_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('apple','google')),
  family_id uuid references cpi_private.account_families(id) on delete cascade,
  permit_hash text references cpi_private.account_permits(token_hash) on delete cascade,
  country text not null check (country ~ '^[A-Z]{2}$'),
  expires_at bigint not null,
  check (num_nonnulls(family_id,permit_hash) = 1)
);
create index account_provider_challenge_expiry on cpi_private.account_provider_challenges(expires_at);

alter table cpi_private.account_tickets alter column challenge_id drop not null;
alter table cpi_private.account_tickets add column provider_nonce_hash text unique
  check (provider_nonce_hash ~ '^[a-f0-9]{64}$');
alter table cpi_private.account_tickets add constraint account_ticket_one_challenge
  check (num_nonnulls(challenge_id,provider_nonce_hash) = 1);

do $$ declare name text; begin
  foreach name in array array['account_provider_links','account_provider_challenges'] loop
    execute format('alter table cpi_private.%I enable row level security',name);
    execute format('alter table cpi_private.%I force row level security',name);
    execute format('revoke all on cpi_private.%I from public,anon,authenticated',name);
    execute format('grant select,insert,update,delete on cpi_private.%I to service_role',name);
    execute format('create policy service_only on cpi_private.%I for all to service_role using(true) with check(true)',name);
  end loop;
end $$;
commit;
