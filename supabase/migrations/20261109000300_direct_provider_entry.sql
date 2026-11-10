begin;

alter table cpi_private.account_provider_challenges
  add column direct_client_build integer check (direct_client_build > 0),
  drop constraint account_provider_challenges_check,
  add constraint account_provider_challenge_one_context
    check (num_nonnulls(family_id,permit_hash,direct_client_build) = 1);

alter table cpi_private.profiles_private
  add column provider_display_name text check (char_length(provider_display_name) between 1 and 48),
  add column pending_country_code text check (pending_country_code ~ '^[A-Z]{2}$');

create or replace function cpi_private.get_profile_owner(p_user_id uuid)
returns jsonb
language sql stable security invoker
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'profile',case when p.public_id is null then null else
      jsonb_build_object('public_id',p.public_id,'username',p.username,
        'country_code',p.country_code,'created_at',p.created_at,'updated_at',p.updated_at)
      end,
    'providerDisplayName',q.provider_display_name,
    'countryCode',case when p.public_id is null then q.pending_country_code else p.country_code end,
    'analyticsAgeBand',case when q.age_response_at > statement_timestamp() - interval '365 days'
      then q.analytics_age_band else null end,
    'ageResponseAt',case when q.age_response_at > statement_timestamp() - interval '365 days'
      then q.age_response_at else null end,
    'analyticsAllowed',cpi_private.profile_analytics_allowed(p_user_id),
    'countryChangeAvailableAt',
      coalesce(r.last_country_change_at,r.first_ranked_at) + interval '720 hours'
  )
  from cpi_private.profile_owners o
  left join public.profiles_public p on p.public_id=o.public_id
  left join cpi_private.profiles_private q on q.user_id=o.user_id
  left join cpi_private.profile_region_state r on r.user_id=o.user_id
  where o.user_id=p_user_id
$function$;

create or replace function cpi_private.save_profile(
  p_user_id uuid,
  p_username text,
  p_country_code text,
  p_analytics_action text default 'keep',
  p_analytics_age_band text default null
)
returns jsonb
language plpgsql security invoker
set search_path = pg_catalog
as $function$
declare
  normalized_username text;
  owner_public_id uuid;
  old_country text;
  region_state cpi_private.profile_region_state%rowtype;
  response_time timestamptz := clock_timestamp();
  consent_policy text;
  changed_constraint text;
begin
  -- Canonical ASCII aliases prevent invisible/bidi/confusable display names.
  -- PostgreSQL's NFKC normalization accepts full-width ASCII consistently.
  normalized_username := lower(btrim(normalize(p_username,NFKC)) collate "C");
  if p_username is not null and normalized_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception using errcode='22023', message='CPI_PROFILE_USERNAME_INVALID';
  end if;
  if normalized_username in (
    'admin','administrator','support','system','moderator','mod','official',
    'crystalpath','crystal_path','crystalpathinfinity','crystal_path_infinity',
    'deleted','anonymous','null','undefined'
  ) or normalized_username ~ '^(admin|support|moderator|official)_' then
    raise exception using errcode='22023', message='CPI_PROFILE_USERNAME_RESERVED';
  end if;
  if p_country_code is not null and not exists (
    select 1 from cpi_private.country_regions
    where mapping_version='cpi-regions-2026-11-v1' and country_code=p_country_code
  ) then
    raise exception using errcode='22023', message='CPI_PROFILE_COUNTRY_UNSUPPORTED';
  end if;
  if p_analytics_action is null or p_analytics_action not in ('keep','skip','set','withdraw')
     or (p_analytics_action <> 'set' and p_analytics_age_band is not null) then
    raise exception using errcode='22023', message='CPI_PROFILE_ANALYTICS_ACTION_INVALID';
  end if;
  if p_analytics_action='set' and (p_analytics_age_band is null
     or p_analytics_age_band not in (
      'under_13','13_15','16_17','18_24','25_34','35_44','45_54','55_64','65_plus'
     )) then
    raise exception using errcode='22023', message='CPI_PROFILE_BAND_INVALID';
  end if;

  insert into cpi_private.profile_owners(user_id) values(p_user_id)
    on conflict(user_id) do nothing;
  -- Serialize this account's profile edits with ranked-start region locks.
  select public_id into strict owner_public_id from cpi_private.profile_owners
    where user_id=p_user_id for update;
  insert into cpi_private.profiles_private(user_id) values(p_user_id)
    on conflict(user_id) do nothing;
  insert into cpi_private.profile_region_state(user_id) values(p_user_id)
    on conflict(user_id) do nothing;
  select * into strict region_state from cpi_private.profile_region_state
    where user_id=p_user_id for update;
  select country_code into old_country from public.profiles_public
    where public_id=owner_public_id;
  if p_username is null then
    select username into normalized_username from public.profiles_public
      where public_id=owner_public_id;
  end if;
  if old_country is distinct from p_country_code and region_state.first_ranked_at is not null
     and response_time < coalesce(region_state.last_country_change_at,region_state.first_ranked_at)
       + interval '720 hours' then
    raise exception using errcode='22023', message='CPI_PROFILE_COUNTRY_COOLDOWN';
  end if;
  if p_analytics_action='set' and not cpi_private.profile_analytics_allowed(p_user_id) then
    raise exception using errcode='22023', message='CPI_PROFILE_ANALYTICS_NOT_ALLOWED';
  end if;

  if normalized_username is null then
    -- Optional details can be saved before the player chooses a public nickname.
    update cpi_private.profiles_private set pending_country_code=p_country_code
      where user_id=p_user_id;
  else
    begin
      insert into public.profiles_public(public_id,username,country_code,created_at,updated_at)
        values(owner_public_id,normalized_username,p_country_code,response_time,response_time)
      on conflict(public_id) do update set
        username=excluded.username,country_code=excluded.country_code,updated_at=excluded.updated_at;
    exception when unique_violation then
      get stacked diagnostics changed_constraint = constraint_name;
      if changed_constraint='profiles_public_username_lookup' then
        raise exception using errcode='22023', message='CPI_PROFILE_USERNAME_TAKEN';
      end if;
      raise;
    end;
    update cpi_private.profiles_private set pending_country_code=null
      where user_id=p_user_id and pending_country_code is not null;
  end if;
  if old_country is distinct from p_country_code and region_state.first_ranked_at is not null then
    update cpi_private.profile_region_state set last_country_change_at=response_time
      where user_id=p_user_id;
  end if;
  -- Age response timestamp means response time, never birthday or aging schedule.
  if p_analytics_action='set' then
    update cpi_private.profiles_private
      set analytics_age_band=p_analytics_age_band,age_response_at=response_time,updated_at=response_time
      where user_id=p_user_id;
  elsif p_analytics_action in ('skip','withdraw') then
    update cpi_private.profiles_private
      set analytics_age_band=null,age_response_at=null,updated_at=response_time
      where user_id=p_user_id;
  else
    update cpi_private.profiles_private
      set analytics_age_band=null,age_response_at=null,updated_at=response_time
      where user_id=p_user_id and age_response_at <= response_time - interval '365 days';
  end if;
  if p_analytics_action='withdraw' then
    select policy_version into consent_policy from cpi_private.analytics_authorizations
      where user_id=p_user_id;
    delete from cpi_private.analytics_authorizations where user_id=p_user_id;
    insert into cpi_private.consent_events(user_id,purpose,decision,policy_version,recorded_at)
      values(p_user_id,'analytics','withdrawn',coalesce(consent_policy,'cpi-profile-v1'),response_time);
  end if;
  -- Strict allowlist: login identity, private age/context/consents never publish.
  return (select jsonb_build_object(
      'public_id',p.public_id,'username',p.username,'country_code',p.country_code,
      'created_at',p.created_at,'updated_at',p.updated_at
    ) from public.profiles_public p where p.public_id=owner_public_id);
end
$function$;

commit;
