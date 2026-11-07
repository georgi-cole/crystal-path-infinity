-- Source candidate only. The frozen CPI-017 deployment must not deploy this migration.
-- OTP/email payloads and retry envelopes use application AES-GCM; tokens use domain-separated HMAC.
begin;
create table cpi_private.account_permits (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  policy_version text not null, country text not null check(country ~ '^[A-Z]{2}$'),
  privacy_context text not null check(privacy_context in ('teen','adult')),
  platform text not null check(platform in ('android','ios','web')),
  client_build integer not null check(client_build > 0),
  expires_at bigint not null, revoked boolean not null default false
);
create table cpi_private.account_challenges (
  id uuid primary key default gen_random_uuid(), email_hash text not null,
  permit_hash text references cpi_private.account_permits(token_hash) on delete cascade,
  purpose text not null check(purpose in ('login','export','delete')),
  user_id uuid references auth.users(id) on delete cascade,
  family_id uuid, payload_encrypted text, code_hash text not null,
  expires_at bigint not null, resend_at bigint not null,
  attempts smallint not null default 0 check(attempts between 0 and 5),
  verified_at bigint, ticket_hash text, ticket_encrypted text,
  mail_sent_at bigint, mail_lease_until bigint not null default 0,
  check((purpose='login') = (permit_hash is not null))
);
create index account_challenge_email on cpi_private.account_challenges(email_hash,purpose,resend_at desc);
create table cpi_private.account_tickets (
  token_hash text primary key, challenge_id uuid not null unique references cpi_private.account_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permit_hash text not null references cpi_private.account_permits(token_hash) on delete cascade,
  expires_at bigint not null, exchanged_at bigint, response_encrypted text
);
create table cpi_private.account_families (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null default gen_random_uuid(), platform text not null check(platform in ('android','ios','web')),
  client_build integer not null, policy_version text not null,
  country text not null, privacy_context text not null check(privacy_context in ('teen','adult')),
  access_hash text not null unique, access_expires_at bigint not null,
  created_at bigint not null, expires_at bigint not null, revoked_at bigint
);
alter table cpi_private.account_challenges add foreign key(family_id) references cpi_private.account_families(id) on delete cascade;
create index account_families_owner on cpi_private.account_families(user_id);
create table cpi_private.account_refresh_tokens (
  token_hash text primary key, family_id uuid not null references cpi_private.account_families(id) on delete cascade,
  expires_at bigint not null, rotated_at bigint, response_encrypted text
);
create unique index account_one_refresh on cpi_private.account_refresh_tokens(family_id) where rotated_at is null;
create table cpi_private.account_reauth (
  token_hash text primary key, family_id uuid not null references cpi_private.account_families(id) on delete cascade,
  purpose text not null check(purpose in ('export','delete')), verified_at bigint not null, expires_at bigint not null
);
create table cpi_private.account_rate_limits (
  key_hash text not null, window_start bigint not null, count integer not null check(count>0),
  primary key(key_hash,window_start)
);
-- Admin-only lookup after our OTP is verified. No client email lookup RPC.
create function cpi_private.account_user_for_verified_email(email_input text) returns uuid
language sql security definer set search_path='' as $$
  select id from auth.users where lower(email)=lower(email_input) and email_confirmed_at is not null limit 1;
$$;
revoke all on function cpi_private.account_user_for_verified_email(text) from public,anon,authenticated;
grant execute on function cpi_private.account_user_for_verified_email(text) to service_role;
do $$ declare name text; begin
  foreach name in array array['account_permits','account_challenges','account_tickets','account_families','account_refresh_tokens','account_reauth','account_rate_limits'] loop
    execute format('alter table cpi_private.%I enable row level security',name);
    execute format('alter table cpi_private.%I force row level security',name);
    execute format('revoke all on cpi_private.%I from public,anon,authenticated',name);
    execute format('grant select,insert,update,delete on cpi_private.%I to service_role',name);
    execute format('create policy service_only on cpi_private.%I for all to service_role using(true) with check(true)',name);
  end loop;
end $$;
commit;
