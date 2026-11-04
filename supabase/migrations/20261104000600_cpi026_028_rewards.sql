-- CPI-026/028: server-only ad permits, fixed intent contracts and verified ledger.
-- No configuration or authorization is seeded. All ad flows default unavailable.
begin;

create table cpi_private.reward_sdk_configurations (
  id uuid primary key default gen_random_uuid(),
  environment text not null check(environment in ('development','staging','production')),
  platform text not null check(platform in ('android','ios')),
  sdk_version text not null check(sdk_version ~ '^[A-Za-z0-9._-]{1,80}$'),
  mediation jsonb not null default '[]' check(jsonb_typeof(mediation)='array' and jsonb_array_length(mediation)<=20),
  ad_unit_id text not null check(ad_unit_id ~ '^ca-app-pub-[0-9]{16}/[0-9]{10}$'),
  ssv_ad_unit text not null check(ssv_ad_unit ~ '^[A-Za-z0-9_/-]{1,128}$'),
  ad_networks text[] not null default array['5450213213286189855'] check(cardinality(ad_networks) between 1 and 32),
  reward_amount text not null check(reward_amount ~ '^[1-9][0-9]{0,8}$'),
  reward_item text not null check(reward_item ~ '^[A-Za-z0-9_-]{1,80}$'),
  reviewed boolean not null default false,
  families_reviewed boolean not null default false,
  closeability_reviewed boolean not null default false,
  tracking_enabled boolean not null default false check(not tracking_enabled),
  enabled boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique(environment,platform,ad_unit_id),
  constraint reward_production_unit_not_demo check(environment<>'production' or
    ad_unit_id not like 'ca-app-pub-3940256099942544/%')
);

-- Issued only by the reviewed trusted privacy service. This is not optional age
-- analytics, a client canRequestAds claim, or a self-selected adult assertion.
create table cpi_private.reward_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  configuration_id uuid not null references cpi_private.reward_sdk_configurations(id),
  privacy_context text not null check(privacy_context in ('unknown','child','teen','adult')),
  policy_version text not null check(policy_version ~ '^[A-Za-z0-9._-]{1,80}$'),
  verification_reference text not null check(verification_reference ~ '^[A-Za-z0-9:_-]{1,180}$'),
  prerequisites_satisfied boolean not null default false,
  child_directed boolean not null,
  under_age_of_consent boolean not null,
  max_ad_content_rating text not null check(max_ad_content_rating in ('G','PG','T','MA')),
  non_personalized boolean not null,
  issued_at timestamptz not null default clock_timestamp(),
  valid_until timestamptz not null,
  revoked_at timestamptz,
  check(valid_until>issued_at and valid_until<=issued_at+interval '15 minutes'),
  check(privacy_context not in ('unknown','child') or
    (child_directed and under_age_of_consent and max_ad_content_rating='G' and non_personalized))
);
create index reward_authorizations_owner_expiry on cpi_private.reward_authorizations(user_id,valid_until desc);

-- A narrow definer read holds shared locks on immutable configuration/permit
-- rows without granting the runtime service authority to approve its own policy.
create function cpi_private.reward_authorization_for(p_user uuid,p_platform text,p_environment text,p_now timestamptz)
returns table(id uuid,policy_version text,valid_until timestamptz,privacy_context text,configuration_id uuid,
  platform text,sdk_version text,mediation jsonb,child_directed boolean,under_age_of_consent boolean,
  max_ad_content_rating text,non_personalized boolean,ssv_ad_unit text,ad_networks text[],reward_amount text,reward_item text)
language sql security definer set search_path=pg_catalog as $function$
  select a.id,a.policy_version,a.valid_until,a.privacy_context,a.configuration_id,c.platform,c.sdk_version,c.mediation,
    a.child_directed,a.under_age_of_consent,a.max_ad_content_rating,a.non_personalized,c.ssv_ad_unit,c.ad_networks,c.reward_amount,c.reward_item
  from cpi_private.reward_authorizations a
  join cpi_private.reward_sdk_configurations c on c.id=a.configuration_id
  join cpi_private.profiles_private p on p.user_id=a.user_id
  where a.user_id=p_user and a.revoked_at is null and a.prerequisites_satisfied
    and a.issued_at<=p_now and a.valid_until>p_now+interval '5 seconds'
    and a.privacy_context=p.privacy_context and (p.context_updated_at is null or p.context_updated_at<=a.issued_at)
    and c.platform=p_platform and c.environment=p_environment and c.enabled and c.reviewed
    and c.closeability_reviewed and not c.tracking_enabled
    and (a.privacy_context not in ('unknown','child') or
      (c.families_reviewed and a.child_directed and a.under_age_of_consent and a.max_ad_content_rating='G' and a.non_personalized))
    and not exists(select 1 from cpi_private.consent_events e where e.user_id=a.user_id and e.purpose='ads'
      and e.decision in ('withdrawn','declined') and e.recorded_at>=a.issued_at)
  order by a.valid_until desc,a.id limit 1 for share of a,c,p
$function$;
revoke all on function cpi_private.reward_authorization_for(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function cpi_private.reward_authorization_for(uuid,text,text,timestamptz) to service_role;

alter table cpi_private.reward_intents
  add column authorization_id uuid references cpi_private.reward_authorizations(id),
  add column configuration_id uuid references cpi_private.reward_sdk_configurations(id),
  add column environment text,
  add column expires_at timestamptz,
  add column expected_ad_unit text,
  add column expected_ad_networks text[],
  add column expected_reward_amount text,
  add column expected_reward_item text,
  add constraint reward_intent_contract_complete check(authorization_id is null or
    (configuration_id is not null and environment in ('development','staging','production')
     and expires_at is not null and expires_at>created_at and expires_at<=created_at+interval '3 minutes'
     and expected_ad_unit is not null and expected_ad_networks is not null and cardinality(expected_ad_networks)>0
     and expected_reward_amount is not null and expected_reward_item is not null));

create table cpi_private.reward_api_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  run_id uuid not null,
  operation text not null check(operation in ('intent','apply')),
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  response_private jsonb not null check(jsonb_typeof(response_private)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,idempotency_key),
  foreign key(run_id,user_id) references cpi_private.ranked_runs(id,user_id) on delete cascade
);

-- Account/run deletion must actually remove reward history. The foundation's
-- composite references had no delete action and otherwise blocked the cascade.
-- Revoking a policy uses revoked_at; it must not erase an already owed intent.
alter table cpi_private.reward_transactions drop constraint reward_transactions_intent_owner;
alter table cpi_private.reward_transactions add constraint reward_transactions_intent_owner
  foreign key(intent_id,run_id) references cpi_private.reward_intents(id,run_id) on delete cascade;
alter table cpi_private.revive_grants drop constraint revive_grants_intent_reference;
alter table cpi_private.revive_grants add constraint revive_grants_intent_reference
  foreign key(intent_id,run_id) references cpi_private.reward_intents(id,run_id) on delete cascade;
create table cpi_private.reward_audit_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references cpi_private.ranked_runs(id) on delete cascade,
  intent_id uuid not null references cpi_private.reward_intents(id) on delete cascade,
  event text not null check(event in ('intent_created','ssv_verified','grant_applied')),
  recorded_at timestamptz not null default clock_timestamp()
);

create function cpi_private.protect_reward_contract() returns trigger
language plpgsql set search_path=pg_catalog as $function$
begin
  if row(new.run_id,new.death_id,new.ordinal,new.promised_restore_sp,new.ruleset_version,new.nonce,
         new.authorization_id,new.configuration_id,new.environment,new.created_at,new.expires_at,
         new.expected_ad_unit,new.expected_ad_networks,new.expected_reward_amount,new.expected_reward_item)
     is distinct from
     row(old.run_id,old.death_id,old.ordinal,old.promised_restore_sp,old.ruleset_version,old.nonce,
         old.authorization_id,old.configuration_id,old.environment,old.created_at,old.expires_at,
         old.expected_ad_unit,old.expected_ad_networks,old.expected_reward_amount,old.expected_reward_item) then
    raise exception 'CPI_REWARD_CONTRACT_IMMUTABLE' using errcode='22023';
  end if;
  return new;
end
$function$;
create trigger reward_intent_contract_immutable before update on cpi_private.reward_intents
  for each row execute function cpi_private.protect_reward_contract();

-- Reauthenticated own-account export pages contain decisions/times, never the
-- nonce, verification reference, signature, private checkpoint or another user.
create function cpi_private.export_own_rewards(p_user uuid,p_after uuid default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $function$
declare result jsonb;
begin
  perform cpi_private.lifecycle_lock_owner(p_user);
  with page as (
    select i.* from cpi_private.reward_intents i join cpi_private.ranked_runs r on r.id=i.run_id
      where r.user_id=p_user and (p_after is null or i.id>p_after) order by i.id limit 101
  ), shown as(select * from page order by id limit 100)
  select jsonb_build_object('rewards',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'runId',i.run_id,'deathId',i.death_id,'rulesetVersion',i.ruleset_version,
      'state',i.state,'ordinal',i.ordinal,'restoreSp',i.promised_restore_sp,
      'createdAt',i.created_at,'expiresAt',i.expires_at,'resolvedAt',i.resolved_at,
      'grant',case when g.id is not null then jsonb_build_object('id',g.id,'state',g.state,
        'grantedAt',g.granted_at,'appliedAt',g.applied_at) end,'providerEarnedAt',t.earned_at
    ) order by i.id) from shown i left join cpi_private.revive_grants g on g.intent_id=i.id
      left join cpi_private.reward_transactions t on t.intent_id=i.id),'[]'::jsonb),
    'next',case when(select count(*) from page)>100 then(select id from shown order by id desc limit 1) end)
  into result;
  return result;
end
$function$;

create function cpi_private.export_own_ad_authorizations(p_user uuid,p_after uuid default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $function$
declare result jsonb;
begin
  perform cpi_private.lifecycle_lock_owner(p_user);
  with page as(
    select a.* from cpi_private.reward_authorizations a where a.user_id=p_user
      and (p_after is null or a.id>p_after) order by a.id limit 101
  ), shown as(select * from page order by id limit 100)
  select jsonb_build_object('adAuthorizations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'policyVersion',a.policy_version,'context',a.privacy_context,
      'prerequisitesSatisfied',a.prerequisites_satisfied,
      'flags',jsonb_build_object('childDirected',a.child_directed,'underAgeOfConsent',a.under_age_of_consent,
        'maxAdContentRating',a.max_ad_content_rating,'nonPersonalized',a.non_personalized),
      'issuedAt',a.issued_at,'validUntil',a.valid_until,'revokedAt',a.revoked_at,
      'inventory',jsonb_build_object('provider','admob','platform',c.platform,'sdkVersion',c.sdk_version,'mediation',c.mediation)
    ) order by a.id) from shown a join cpi_private.reward_sdk_configurations c on c.id=a.configuration_id),'[]'::jsonb),
    'next',case when(select count(*) from page)>100 then(select id from shown order by id desc limit 1) end)
  into result;
  return result;
end
$function$;
revoke all on function cpi_private.export_own_rewards(uuid,uuid),cpi_private.export_own_ad_authorizations(uuid,uuid)
  from public,anon,authenticated;
grant execute on function cpi_private.export_own_rewards(uuid,uuid),cpi_private.export_own_ad_authorizations(uuid,uuid) to service_role;

do $boundary$
declare relation text;
begin
  foreach relation in array array['reward_sdk_configurations','reward_authorizations','reward_api_receipts','reward_audit_events'] loop
    execute format('alter table cpi_private.%I enable row level security',relation);
    execute format('alter table cpi_private.%I force row level security',relation);
    execute format('revoke all on cpi_private.%I from public,anon,authenticated,service_role',relation);
  end loop;
end
$boundary$;
grant select on cpi_private.reward_sdk_configurations,cpi_private.reward_authorizations to service_role;
grant select,insert,delete on cpi_private.reward_api_receipts,cpi_private.reward_audit_events to service_role;
grant usage,select on sequence cpi_private.reward_audit_events_id_seq to service_role;
revoke all on function cpi_private.protect_reward_contract() from public,anon,authenticated;
commit;
