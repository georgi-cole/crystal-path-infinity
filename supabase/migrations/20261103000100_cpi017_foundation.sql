-- CPI-017 · Standalone backend schema, ownership and access boundaries.
-- Apply ONLY to a new Crystal Path: Infinity Supabase project, independently
-- in development, staging and production. Never on The Big Eye project.
-- This migration defines storage and permissions, NOT playable ranked RPCs.
begin;

-- Supabase Auth owns the account directory. Do not copy email, exact age,
-- provider identities or other auth data to a public player table.
create schema if not exists cpi_private;
revoke all on schema cpi_private from public, anon, authenticated;
grant usage on schema cpi_private to service_role;

-- Server-only mapping prevents exposing Supabase Auth user IDs in public
-- profile or leaderboard identifiers. Auth deletion cascades to this mapping
-- and then to the separately published profile.
create table cpi_private.profile_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Only intentionally publishable fields exist in the API's public table.
-- A trusted server creates a mapping, then publishes a chosen username. Auth
-- signup by itself never inserts a public profile or exposes a login UUID.
create table public.profiles_public (
  public_id uuid primary key references cpi_private.profile_owners(public_id) on delete cascade,
  username text not null,
  country_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_public_username_valid check (
    username = btrim(username)
    and char_length(username) between 3 and 24
    and username !~ '[[:cntrl:]]'
  ),
  constraint profiles_public_country_valid check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  )
);
create unique index profiles_public_username_lookup
  on public.profiles_public (lower(username));
create index profiles_public_country_lookup
  on public.profiles_public (country_code)
  where country_code is not null;

-- The age band is optional analytics, not a birthday, auth criterion, or
-- advertisement eligibility determination. No exact age is persisted.
create table cpi_private.profiles_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  analytics_age_band text,
  age_response_at timestamptz,
  privacy_context text not null default 'unknown',
  context_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint profiles_private_age_band_valid check (
    analytics_age_band is null or analytics_age_band in
      ('under_13', '13_15', '16_17', '18_24', '25_34',
       '35_44', '45_54', '55_64', '65_plus')
  ),
  constraint profiles_private_age_pair check (
    (analytics_age_band is null) = (age_response_at is null)
  ),
  constraint profiles_private_context_valid check (
    privacy_context in ('unknown', 'child', 'teen', 'adult', 'parental_review')
  )
);

-- Append-only in the application contract: the trusted service records
-- consent decisions, including withdrawal. These records are never public.
create table cpi_private.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (
    purpose in ('account', 'analytics', 'leaderboard', 'ads', 'tracking')
  ),
  decision text not null check (
    decision in ('granted', 'declined', 'withdrawn')
  ),
  policy_version text not null check (char_length(policy_version) between 1 and 80),
  jurisdiction text check (jurisdiction is null or jurisdiction ~ '^[A-Z]{2}$'),
  recorded_at timestamptz not null default now()
);
create index consent_events_owner_time
  on cpi_private.consent_events (user_id, purpose, recorded_at desc);

-- Reference opaque parental-verification evidence, not parent email,
-- identity documents or a child's exact age. No approval is presumed.
create table cpi_private.parental_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('account', 'ads', 'analytics')),
  state text not null default 'pending' check (
    state in ('pending', 'approved', 'denied', 'revoked')
  ),
  verification_reference text,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint parental_approval_requires_verification check (
    state <> 'approved' or
    (verified_at is not null and verification_reference is not null)
  )
);
create index parental_authorizations_owner
  on cpi_private.parental_authorizations (user_id, purpose, created_at desc);

-- All private generator cursors, future safe sides, death snapshots, reward
-- state, SP and score authority stay in the non-exposed schema. The server
-- must validate ordered game actions and commit state+ledger atomically in
-- CPI-021; merely possessing a row here is not proof of a ranked result.
create table cpi_private.ranked_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ruleset_version text not null check (
    char_length(ruleset_version) between 1 and 80
  ),
  status text not null default 'playing' check (
    status in ('playing', 'dead', 'verification_pending', 'finished')
  ),
  checkpoint_private jsonb not null check (
    jsonb_typeof(checkpoint_private) = 'object'
  ),
  sp smallint not null default 300 check (sp between 0 and 400),
  hints integer not null default 2 check (hints >= 0),
  last_cleared_row text not null default '0' check (
    last_cleared_row ~ '^(0|[1-9][0-9]*)$'
    and char_length(last_cleared_row) <= 1000
  ),
  current_row text not null default '1' check (
    current_row ~ '^[1-9][0-9]*$'
    and char_length(current_row) <= 1000
  ),
  revives_granted smallint not null default 0 check (
    revives_granted between 0 and 10
  ),
  revives_applied smallint not null default 0 check (
    revives_applied >= 0 and revives_applied <= revives_granted
  ),
  revives_to_reach_score smallint not null default 0 check (
    revives_to_reach_score >= 0
    and revives_to_reach_score <= revives_applied
  ),
  active_time_ms bigint not null default 0 check (active_time_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint ranked_run_finished_pair check (
    (status = 'finished') = (finalized_at is not null)
  )
);
create index ranked_runs_owner_status
  on cpi_private.ranked_runs (user_id, status, updated_at desc);
create index ranked_runs_ruleset_status
  on cpi_private.ranked_runs (ruleset_version, status);

create table cpi_private.run_actions (
  id bigint generated always as identity primary key,
  run_id uuid not null references cpi_private.ranked_runs(id) on delete cascade,
  command_sequence bigint not null check (command_sequence >= 1),
  idempotency_key uuid not null,
  command_private jsonb not null check (jsonb_typeof(command_private) = 'object'),
  result_private jsonb not null check (jsonb_typeof(result_private) = 'object'),
  committed_at timestamptz not null default now(),
  constraint run_actions_unique_sequence unique (run_id, command_sequence),
  constraint run_actions_unique_idempotency unique (run_id, idempotency_key)
);
create index run_actions_run_recent
  on cpi_private.run_actions (run_id, committed_at desc);

-- One intent per death. Later delivery can still resolve the same intent;
-- no client callback increments granted or applied counters by itself.
create table cpi_private.reward_intents (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references cpi_private.ranked_runs(id) on delete cascade,
  death_id text not null check (char_length(death_id) between 1 and 120),
  ordinal smallint not null check (ordinal between 1 and 10),
  promised_restore_sp smallint not null,
  ruleset_version text not null check (char_length(ruleset_version) between 1 and 80),
  nonce uuid not null unique default gen_random_uuid(),
  state text not null default 'pending' check (
    state in ('pending', 'verified', 'denied', 'forfeited')
  ),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reward_intents_one_per_death unique (run_id, death_id),
  constraint reward_intents_run_identity unique (id, run_id),
  constraint reward_intents_fixed_sp_schedule check (
    (ordinal between 1 and 5 and promised_restore_sp = 200)
    or (ordinal between 6 and 10 and promised_restore_sp = 150)
  ),
  constraint reward_intents_resolution_pair check (
    (state = 'pending') = (resolved_at is null)
  )
);
create index reward_intents_run_state
  on cpi_private.reward_intents (run_id, state);

-- Provider transaction identity is global and unique; callbacks must be
-- signature-verified before the trusted server can write these rows.
create table cpi_private.reward_transactions (
  provider_transaction_id text primary key check (
    char_length(provider_transaction_id) between 1 and 180
  ),
  intent_id uuid not null,
  run_id uuid not null,
  signed_query_sha256 text not null check (
    signed_query_sha256 ~ '^[a-f0-9]{64}$'
  ),
  earned_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint reward_transactions_one_per_intent unique (intent_id),
  constraint reward_transactions_intent_owner foreign key (intent_id, run_id)
    references cpi_private.reward_intents (id, run_id)
);

create table cpi_private.revive_grants (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null unique,
  run_id uuid not null,
  death_id text not null check (char_length(death_id) between 1 and 120),
  ordinal smallint not null check (ordinal between 1 and 10),
  restore_sp smallint not null,
  state text not null default 'granted' check (
    state in ('granted', 'applied', 'forfeited')
  ),
  granted_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint revive_grants_once_per_death unique (run_id, death_id),
  constraint revive_grants_intent_reference foreign key (intent_id, run_id)
    references cpi_private.reward_intents (id, run_id),
  constraint revive_grants_restore_schedule check (
    (ordinal between 1 and 5 and restore_sp = 200)
    or (ordinal between 6 and 10 and restore_sp = 150)
  ),
  constraint revive_grants_applied_time check (
    (state = 'applied') = (applied_at is not null)
  )
);

-- Never expose this unreviewed score source as a public view. CPI-021
-- validates gameplay and CPI-023 creates the safe, scoped read model.
create table cpi_private.verified_results (
  run_id uuid primary key references cpi_private.ranked_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ruleset_version text not null check (char_length(ruleset_version) between 1 and 80),
  last_cleared_row text not null check (
    last_cleared_row ~ '^(0|[1-9][0-9]*)$'
    and char_length(last_cleared_row) <= 1000
  ),
  revives_to_reach_score smallint not null check (
    revives_to_reach_score between 0 and 10
  ),
  achieved_at timestamptz,
  country_snapshot text check (
    country_snapshot is null or country_snapshot ~ '^[A-Z]{2}$'
  ),
  finalized_at timestamptz not null default now(),
  constraint verified_results_positive_score_timestamp check (
    last_cleared_row = '0' or achieved_at is not null
  )
);
create index verified_results_owner_ruleset
  on cpi_private.verified_results (user_id, ruleset_version);
create index verified_results_ruleset_country
  on cpi_private.verified_results (ruleset_version, country_snapshot);

-- Supabase projects can inherit broad auto-grants on new public tables:
-- explicitly remove them, including non-DML privileges.
alter table public.profiles_public enable row level security;
alter table public.profiles_public force row level security;
revoke all privileges on table public.profiles_public
  from public, anon, authenticated, service_role;
grant select on table public.profiles_public to anon, authenticated;
grant all privileges on table public.profiles_public to service_role;
create policy read_published_profiles
  on public.profiles_public for select
  to anon, authenticated
  using (true);
-- No direct mobile writes, including 'update own profile' or self-assigned
-- country. A future server endpoint owns validation, privacy and cooldowns.

-- Defence in depth: even if someone changes project API exposure settings,
-- no anon/authenticated role receives schema usage or table privileges.
do $cpi17$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profile_owners', 'profiles_private', 'consent_events', 'parental_authorizations',
    'ranked_runs', 'run_actions', 'reward_intents',
    'reward_transactions', 'revive_grants', 'verified_results'
  ] loop
    execute format('alter table cpi_private.%I enable row level security', relation_name);
    execute format('alter table cpi_private.%I force row level security', relation_name);
    execute format(
      'revoke all privileges on table cpi_private.%I from public, anon, authenticated, service_role',
      relation_name
    );
    execute format(
      'grant all privileges on table cpi_private.%I to service_role',
      relation_name
    );
  end loop;
end
$cpi17$;

revoke all privileges on all sequences in schema cpi_private
  from public, anon, authenticated, service_role;
grant usage, select on all sequences in schema cpi_private to service_role;
revoke all privileges on all functions in schema cpi_private
  from public, anon, authenticated;
revoke all privileges on schema cpi_private from public, anon, authenticated;

-- New objects in our private schema must opt into API role access explicitly.
-- This does not alter Supabase-managed auth/public default privileges.
alter default privileges in schema cpi_private
  revoke all on tables from anon, authenticated;
alter default privileges in schema cpi_private
  revoke all on sequences from anon, authenticated;

commit;
