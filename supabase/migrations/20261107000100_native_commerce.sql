-- Source preparation only. Not applied by the frozen CPI-017 development deployment.
begin;
create table cpi_private.commerce_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  revision bigint not null default 0 check (revision >= 0),
  sp bigint not null default 0 check (sp >= 0),
  hints bigint not null default 0 check (hints >= 0),
  credits bigint not null default 0 check (credits >= 0),
  owned text[] not null default array['obsidian']::text[],
  equipped text not null default 'obsidian',
  blocked boolean not null default false,
  constraint commerce_owned_valid check (owned <@ array['obsidian','chaos','jelly','wilds','league','puppy','kitten']::text[] and 'obsidian'=any(owned)),
  constraint commerce_equipped_owned check (equipped=any(owned))
);
-- The account alias and transaction tombstone survive deletion of the Auth user.
-- They cannot be reattached. This prevents buying, deleting, and claiming the receipt again.
-- Retention/deletion/export policy and provider refund processing are activation prerequisites.
create table cpi_private.purchase_deliveries (
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{64}$'),
  wallet_id uuid not null references cpi_private.commerce_wallets(id),
  platform text not null check (platform in ('android','ios')),
  environment text not null check (environment in ('production','sandbox')),
  transaction_id text not null check (char_length(transaction_id) between 1 and 200),
  sku text not null check (char_length(sku) between 1 and 200),
  product_key text not null,
  granted_at timestamptz not null default now(),
  unique(platform,environment,transaction_id)
);
alter table cpi_private.commerce_wallets enable row level security;
alter table cpi_private.commerce_wallets force row level security;
alter table cpi_private.purchase_deliveries enable row level security;
alter table cpi_private.purchase_deliveries force row level security;
revoke all on cpi_private.commerce_wallets, cpi_private.purchase_deliveries from public, anon, authenticated, service_role;
grant select, insert, update on cpi_private.commerce_wallets to service_role;
grant select, insert on cpi_private.purchase_deliveries to service_role;
commit;
