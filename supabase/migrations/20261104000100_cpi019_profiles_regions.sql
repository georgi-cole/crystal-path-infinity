-- CPI-019 + CPI-020: trusted profile writes and frozen declared regions.
-- Proposed migration only. Do not rerun/replace the deployed CPI-017 migration.
-- No browser/mobile role can invoke these routines or mutate private storage.
begin;

create table cpi_private.country_regions (
  mapping_version text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  continent_code text not null check (continent_code in ('AF','AS','EU','NA','SA','OC','AN')),
  primary key (mapping_version, country_code),
  unique (mapping_version, country_code, continent_code)
);

-- Frozen UN M49 composition, retrieved 2026-11-04:
-- https://unstats.un.org/unsd/methodology/m49/overview/
-- Americas split into NA (Northern/Central America + Caribbean) and SA.
-- AQ is AN; TW is the explicit ISO-alpha2 extension assigned to AS.
-- Territory membership follows its own M49 area, not its administering state.
insert into cpi_private.country_regions(mapping_version,country_code,continent_code) values
  ('cpi-regions-2026-11-v1','AD','EU'),
  ('cpi-regions-2026-11-v1','AE','AS'),
  ('cpi-regions-2026-11-v1','AF','AS'),
  ('cpi-regions-2026-11-v1','AG','NA'),
  ('cpi-regions-2026-11-v1','AI','NA'),
  ('cpi-regions-2026-11-v1','AL','EU'),
  ('cpi-regions-2026-11-v1','AM','AS'),
  ('cpi-regions-2026-11-v1','AO','AF'),
  ('cpi-regions-2026-11-v1','AQ','AN'),
  ('cpi-regions-2026-11-v1','AR','SA'),
  ('cpi-regions-2026-11-v1','AS','OC'),
  ('cpi-regions-2026-11-v1','AT','EU'),
  ('cpi-regions-2026-11-v1','AU','OC'),
  ('cpi-regions-2026-11-v1','AW','NA'),
  ('cpi-regions-2026-11-v1','AX','EU'),
  ('cpi-regions-2026-11-v1','AZ','AS'),
  ('cpi-regions-2026-11-v1','BA','EU'),
  ('cpi-regions-2026-11-v1','BB','NA'),
  ('cpi-regions-2026-11-v1','BD','AS'),
  ('cpi-regions-2026-11-v1','BE','EU'),
  ('cpi-regions-2026-11-v1','BF','AF'),
  ('cpi-regions-2026-11-v1','BG','EU'),
  ('cpi-regions-2026-11-v1','BH','AS'),
  ('cpi-regions-2026-11-v1','BI','AF'),
  ('cpi-regions-2026-11-v1','BJ','AF'),
  ('cpi-regions-2026-11-v1','BL','NA'),
  ('cpi-regions-2026-11-v1','BM','NA'),
  ('cpi-regions-2026-11-v1','BN','AS'),
  ('cpi-regions-2026-11-v1','BO','SA'),
  ('cpi-regions-2026-11-v1','BQ','NA'),
  ('cpi-regions-2026-11-v1','BR','SA'),
  ('cpi-regions-2026-11-v1','BS','NA'),
  ('cpi-regions-2026-11-v1','BT','AS'),
  ('cpi-regions-2026-11-v1','BV','SA'),
  ('cpi-regions-2026-11-v1','BW','AF'),
  ('cpi-regions-2026-11-v1','BY','EU'),
  ('cpi-regions-2026-11-v1','BZ','NA'),
  ('cpi-regions-2026-11-v1','CA','NA'),
  ('cpi-regions-2026-11-v1','CC','OC'),
  ('cpi-regions-2026-11-v1','CD','AF'),
  ('cpi-regions-2026-11-v1','CF','AF'),
  ('cpi-regions-2026-11-v1','CG','AF'),
  ('cpi-regions-2026-11-v1','CH','EU'),
  ('cpi-regions-2026-11-v1','CI','AF'),
  ('cpi-regions-2026-11-v1','CK','OC'),
  ('cpi-regions-2026-11-v1','CL','SA'),
  ('cpi-regions-2026-11-v1','CM','AF'),
  ('cpi-regions-2026-11-v1','CN','AS'),
  ('cpi-regions-2026-11-v1','CO','SA'),
  ('cpi-regions-2026-11-v1','CR','NA'),
  ('cpi-regions-2026-11-v1','CU','NA'),
  ('cpi-regions-2026-11-v1','CV','AF'),
  ('cpi-regions-2026-11-v1','CW','NA'),
  ('cpi-regions-2026-11-v1','CX','OC'),
  ('cpi-regions-2026-11-v1','CY','AS'),
  ('cpi-regions-2026-11-v1','CZ','EU'),
  ('cpi-regions-2026-11-v1','DE','EU'),
  ('cpi-regions-2026-11-v1','DJ','AF'),
  ('cpi-regions-2026-11-v1','DK','EU'),
  ('cpi-regions-2026-11-v1','DM','NA'),
  ('cpi-regions-2026-11-v1','DO','NA'),
  ('cpi-regions-2026-11-v1','DZ','AF'),
  ('cpi-regions-2026-11-v1','EC','SA'),
  ('cpi-regions-2026-11-v1','EE','EU'),
  ('cpi-regions-2026-11-v1','EG','AF'),
  ('cpi-regions-2026-11-v1','EH','AF'),
  ('cpi-regions-2026-11-v1','ER','AF'),
  ('cpi-regions-2026-11-v1','ES','EU'),
  ('cpi-regions-2026-11-v1','ET','AF'),
  ('cpi-regions-2026-11-v1','FI','EU'),
  ('cpi-regions-2026-11-v1','FJ','OC'),
  ('cpi-regions-2026-11-v1','FK','SA'),
  ('cpi-regions-2026-11-v1','FM','OC'),
  ('cpi-regions-2026-11-v1','FO','EU'),
  ('cpi-regions-2026-11-v1','FR','EU'),
  ('cpi-regions-2026-11-v1','GA','AF'),
  ('cpi-regions-2026-11-v1','GB','EU'),
  ('cpi-regions-2026-11-v1','GD','NA'),
  ('cpi-regions-2026-11-v1','GE','AS'),
  ('cpi-regions-2026-11-v1','GF','SA'),
  ('cpi-regions-2026-11-v1','GG','EU'),
  ('cpi-regions-2026-11-v1','GH','AF'),
  ('cpi-regions-2026-11-v1','GI','EU'),
  ('cpi-regions-2026-11-v1','GL','NA'),
  ('cpi-regions-2026-11-v1','GM','AF'),
  ('cpi-regions-2026-11-v1','GN','AF'),
  ('cpi-regions-2026-11-v1','GP','NA'),
  ('cpi-regions-2026-11-v1','GQ','AF'),
  ('cpi-regions-2026-11-v1','GR','EU'),
  ('cpi-regions-2026-11-v1','GS','SA'),
  ('cpi-regions-2026-11-v1','GT','NA'),
  ('cpi-regions-2026-11-v1','GU','OC'),
  ('cpi-regions-2026-11-v1','GW','AF'),
  ('cpi-regions-2026-11-v1','GY','SA'),
  ('cpi-regions-2026-11-v1','HK','AS'),
  ('cpi-regions-2026-11-v1','HM','OC'),
  ('cpi-regions-2026-11-v1','HN','NA'),
  ('cpi-regions-2026-11-v1','HR','EU'),
  ('cpi-regions-2026-11-v1','HT','NA'),
  ('cpi-regions-2026-11-v1','HU','EU'),
  ('cpi-regions-2026-11-v1','ID','AS'),
  ('cpi-regions-2026-11-v1','IE','EU'),
  ('cpi-regions-2026-11-v1','IL','AS'),
  ('cpi-regions-2026-11-v1','IM','EU'),
  ('cpi-regions-2026-11-v1','IN','AS'),
  ('cpi-regions-2026-11-v1','IO','AF'),
  ('cpi-regions-2026-11-v1','IQ','AS'),
  ('cpi-regions-2026-11-v1','IR','AS'),
  ('cpi-regions-2026-11-v1','IS','EU'),
  ('cpi-regions-2026-11-v1','IT','EU'),
  ('cpi-regions-2026-11-v1','JE','EU'),
  ('cpi-regions-2026-11-v1','JM','NA'),
  ('cpi-regions-2026-11-v1','JO','AS'),
  ('cpi-regions-2026-11-v1','JP','AS'),
  ('cpi-regions-2026-11-v1','KE','AF'),
  ('cpi-regions-2026-11-v1','KG','AS'),
  ('cpi-regions-2026-11-v1','KH','AS'),
  ('cpi-regions-2026-11-v1','KI','OC'),
  ('cpi-regions-2026-11-v1','KM','AF'),
  ('cpi-regions-2026-11-v1','KN','NA'),
  ('cpi-regions-2026-11-v1','KP','AS'),
  ('cpi-regions-2026-11-v1','KR','AS'),
  ('cpi-regions-2026-11-v1','KW','AS'),
  ('cpi-regions-2026-11-v1','KY','NA'),
  ('cpi-regions-2026-11-v1','KZ','AS'),
  ('cpi-regions-2026-11-v1','LA','AS'),
  ('cpi-regions-2026-11-v1','LB','AS'),
  ('cpi-regions-2026-11-v1','LC','NA'),
  ('cpi-regions-2026-11-v1','LI','EU'),
  ('cpi-regions-2026-11-v1','LK','AS'),
  ('cpi-regions-2026-11-v1','LR','AF'),
  ('cpi-regions-2026-11-v1','LS','AF'),
  ('cpi-regions-2026-11-v1','LT','EU'),
  ('cpi-regions-2026-11-v1','LU','EU'),
  ('cpi-regions-2026-11-v1','LV','EU'),
  ('cpi-regions-2026-11-v1','LY','AF'),
  ('cpi-regions-2026-11-v1','MA','AF'),
  ('cpi-regions-2026-11-v1','MC','EU'),
  ('cpi-regions-2026-11-v1','MD','EU'),
  ('cpi-regions-2026-11-v1','ME','EU'),
  ('cpi-regions-2026-11-v1','MF','NA'),
  ('cpi-regions-2026-11-v1','MG','AF'),
  ('cpi-regions-2026-11-v1','MH','OC'),
  ('cpi-regions-2026-11-v1','MK','EU'),
  ('cpi-regions-2026-11-v1','ML','AF'),
  ('cpi-regions-2026-11-v1','MM','AS'),
  ('cpi-regions-2026-11-v1','MN','AS'),
  ('cpi-regions-2026-11-v1','MO','AS'),
  ('cpi-regions-2026-11-v1','MP','OC'),
  ('cpi-regions-2026-11-v1','MQ','NA'),
  ('cpi-regions-2026-11-v1','MR','AF'),
  ('cpi-regions-2026-11-v1','MS','NA'),
  ('cpi-regions-2026-11-v1','MT','EU'),
  ('cpi-regions-2026-11-v1','MU','AF'),
  ('cpi-regions-2026-11-v1','MV','AS'),
  ('cpi-regions-2026-11-v1','MW','AF'),
  ('cpi-regions-2026-11-v1','MX','NA'),
  ('cpi-regions-2026-11-v1','MY','AS'),
  ('cpi-regions-2026-11-v1','MZ','AF'),
  ('cpi-regions-2026-11-v1','NA','AF'),
  ('cpi-regions-2026-11-v1','NC','OC'),
  ('cpi-regions-2026-11-v1','NE','AF'),
  ('cpi-regions-2026-11-v1','NF','OC'),
  ('cpi-regions-2026-11-v1','NG','AF'),
  ('cpi-regions-2026-11-v1','NI','NA'),
  ('cpi-regions-2026-11-v1','NL','EU'),
  ('cpi-regions-2026-11-v1','NO','EU'),
  ('cpi-regions-2026-11-v1','NP','AS'),
  ('cpi-regions-2026-11-v1','NR','OC'),
  ('cpi-regions-2026-11-v1','NU','OC'),
  ('cpi-regions-2026-11-v1','NZ','OC'),
  ('cpi-regions-2026-11-v1','OM','AS'),
  ('cpi-regions-2026-11-v1','PA','NA'),
  ('cpi-regions-2026-11-v1','PE','SA'),
  ('cpi-regions-2026-11-v1','PF','OC'),
  ('cpi-regions-2026-11-v1','PG','OC'),
  ('cpi-regions-2026-11-v1','PH','AS'),
  ('cpi-regions-2026-11-v1','PK','AS'),
  ('cpi-regions-2026-11-v1','PL','EU'),
  ('cpi-regions-2026-11-v1','PM','NA'),
  ('cpi-regions-2026-11-v1','PN','OC'),
  ('cpi-regions-2026-11-v1','PR','NA'),
  ('cpi-regions-2026-11-v1','PS','AS'),
  ('cpi-regions-2026-11-v1','PT','EU'),
  ('cpi-regions-2026-11-v1','PW','OC'),
  ('cpi-regions-2026-11-v1','PY','SA'),
  ('cpi-regions-2026-11-v1','QA','AS'),
  ('cpi-regions-2026-11-v1','RE','AF'),
  ('cpi-regions-2026-11-v1','RO','EU'),
  ('cpi-regions-2026-11-v1','RS','EU'),
  ('cpi-regions-2026-11-v1','RU','EU'),
  ('cpi-regions-2026-11-v1','RW','AF'),
  ('cpi-regions-2026-11-v1','SA','AS'),
  ('cpi-regions-2026-11-v1','SB','OC'),
  ('cpi-regions-2026-11-v1','SC','AF'),
  ('cpi-regions-2026-11-v1','SD','AF'),
  ('cpi-regions-2026-11-v1','SE','EU'),
  ('cpi-regions-2026-11-v1','SG','AS'),
  ('cpi-regions-2026-11-v1','SH','AF'),
  ('cpi-regions-2026-11-v1','SI','EU'),
  ('cpi-regions-2026-11-v1','SJ','EU'),
  ('cpi-regions-2026-11-v1','SK','EU'),
  ('cpi-regions-2026-11-v1','SL','AF'),
  ('cpi-regions-2026-11-v1','SM','EU'),
  ('cpi-regions-2026-11-v1','SN','AF'),
  ('cpi-regions-2026-11-v1','SO','AF'),
  ('cpi-regions-2026-11-v1','SR','SA'),
  ('cpi-regions-2026-11-v1','SS','AF'),
  ('cpi-regions-2026-11-v1','ST','AF'),
  ('cpi-regions-2026-11-v1','SV','NA'),
  ('cpi-regions-2026-11-v1','SX','NA'),
  ('cpi-regions-2026-11-v1','SY','AS'),
  ('cpi-regions-2026-11-v1','SZ','AF'),
  ('cpi-regions-2026-11-v1','TC','NA'),
  ('cpi-regions-2026-11-v1','TD','AF'),
  ('cpi-regions-2026-11-v1','TF','AF'),
  ('cpi-regions-2026-11-v1','TG','AF'),
  ('cpi-regions-2026-11-v1','TH','AS'),
  ('cpi-regions-2026-11-v1','TJ','AS'),
  ('cpi-regions-2026-11-v1','TK','OC'),
  ('cpi-regions-2026-11-v1','TL','AS'),
  ('cpi-regions-2026-11-v1','TM','AS'),
  ('cpi-regions-2026-11-v1','TN','AF'),
  ('cpi-regions-2026-11-v1','TO','OC'),
  ('cpi-regions-2026-11-v1','TR','AS'),
  ('cpi-regions-2026-11-v1','TT','NA'),
  ('cpi-regions-2026-11-v1','TV','OC'),
  ('cpi-regions-2026-11-v1','TW','AS'),
  ('cpi-regions-2026-11-v1','TZ','AF'),
  ('cpi-regions-2026-11-v1','UA','EU'),
  ('cpi-regions-2026-11-v1','UG','AF'),
  ('cpi-regions-2026-11-v1','UM','OC'),
  ('cpi-regions-2026-11-v1','US','NA'),
  ('cpi-regions-2026-11-v1','UY','SA'),
  ('cpi-regions-2026-11-v1','UZ','AS'),
  ('cpi-regions-2026-11-v1','VA','EU'),
  ('cpi-regions-2026-11-v1','VC','NA'),
  ('cpi-regions-2026-11-v1','VE','SA'),
  ('cpi-regions-2026-11-v1','VG','NA'),
  ('cpi-regions-2026-11-v1','VI','NA'),
  ('cpi-regions-2026-11-v1','VN','AS'),
  ('cpi-regions-2026-11-v1','VU','OC'),
  ('cpi-regions-2026-11-v1','WF','OC'),
  ('cpi-regions-2026-11-v1','WS','OC'),
  ('cpi-regions-2026-11-v1','YE','AS'),
  ('cpi-regions-2026-11-v1','YT','AF'),
  ('cpi-regions-2026-11-v1','ZA','AF'),
  ('cpi-regions-2026-11-v1','ZM','AF'),
  ('cpi-regions-2026-11-v1','ZW','AF');

create table cpi_private.profile_region_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_ranked_at timestamptz,
  last_country_change_at timestamptz,
  check (last_country_change_at is null or first_ranked_at is not null)
);

-- A reviewed trusted eligibility service issues these short-lived permits.
-- This is deliberately separate from optional age bands and ordinary consent.
-- Never derive an authorization from a self-reported demographic age.
create table cpi_private.analytics_authorizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  privacy_context text not null check (privacy_context in ('adult','teen','child')),
  policy_version text not null check (char_length(policy_version) between 1 and 80),
  authorization_reference text not null check (
    char_length(authorization_reference) between 1 and 180
  ),
  valid_until timestamptz not null,
  issued_at timestamptz not null default clock_timestamp(),
  check (valid_until > issued_at and valid_until <= issued_at + interval '24 hours')
);

alter table cpi_private.ranked_runs
  add column country_snapshot text,
  add column continent_snapshot text,
  add column mapping_version text,
  add column region_snapshotted_at timestamptz,
  add constraint ranked_run_region_pair check (
    (country_snapshot is null) = (continent_snapshot is null)
  ),
  add constraint ranked_run_region_initialized check (
    (mapping_version is null) = (region_snapshotted_at is null)
    and (mapping_version is not null or country_snapshot is null)
  ),
  add constraint ranked_run_region_mapping foreign key
    (mapping_version, country_snapshot, continent_snapshot)
    references cpi_private.country_regions(mapping_version, country_code, continent_code);

create function cpi_private.protect_run_region()
returns trigger
language plpgsql security invoker
set search_path = pg_catalog
as $function$
begin
  if new.user_id is distinct from old.user_id
     or new.ruleset_version is distinct from old.ruleset_version then
    raise exception using errcode='22023', message='CPI_RUN_IDENTITY_IMMUTABLE';
  end if;
  if old.region_snapshotted_at is not null and (
      new.country_snapshot is distinct from old.country_snapshot
      or new.continent_snapshot is distinct from old.continent_snapshot
      or new.mapping_version is distinct from old.mapping_version
      or new.region_snapshotted_at is distinct from old.region_snapshotted_at
    ) then
    raise exception using errcode='22023', message='CPI_RUN_REGION_IMMUTABLE';
  end if;
  return new;
end
$function$;
create trigger ranked_runs_immutable_region
before update on cpi_private.ranked_runs
for each row execute function cpi_private.protect_run_region();

create function cpi_private.profile_analytics_allowed(p_user_id uuid)
returns boolean
language sql stable security invoker
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from cpi_private.profiles_private p
    join cpi_private.analytics_authorizations a on a.user_id=p.user_id
    where p.user_id=p_user_id
      and p.privacy_context=a.privacy_context
      and a.valid_until > statement_timestamp()
      and p.privacy_context in ('adult','teen','child')
      and (
        p.privacy_context='adult' or (
          select g.state='approved' and g.revoked_at is null
            and g.verified_at is not null and g.verification_reference is not null
          from cpi_private.parental_authorizations g
          where g.user_id=p.user_id and g.purpose='analytics'
          order by g.created_at desc, (g.state='approved') asc, g.id desc limit 1
        )
      )
      and (
        select e.decision='granted' and e.policy_version=a.policy_version
        from cpi_private.consent_events e
        where e.user_id=p.user_id and e.purpose='analytics'
        -- UUIDs are not temporal sequence numbers. At an ambiguous equal
        -- timestamp, decline/withdrawal always defeats a grant.
        order by e.recorded_at desc, (e.decision='granted') asc, e.id desc limit 1
      )
  )
$function$;

create function cpi_private.get_profile_config()
returns jsonb
language sql stable security invoker
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'mappingVersion','cpi-regions-2026-11-v1',
    'usernameMin',3,'usernameMax',24,
    'countries',jsonb_agg(jsonb_build_object(
      'countryCode',country_code,'continentCode',continent_code
    ) order by country_code)
  )
  from cpi_private.country_regions
  where mapping_version='cpi-regions-2026-11-v1'
$function$;

create function cpi_private.get_profile_owner(p_user_id uuid)
returns jsonb
language sql stable security invoker
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'profile',case when p.public_id is null then null else
      jsonb_build_object('public_id',p.public_id,'username',p.username,
        'country_code',p.country_code,'created_at',p.created_at,'updated_at',p.updated_at)
      end,
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

create function cpi_private.save_profile(
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
  if normalized_username is null or normalized_username !~ '^[a-z0-9_]{3,24}$' then
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
  if old_country is distinct from p_country_code and region_state.first_ranked_at is not null
     and response_time < coalesce(region_state.last_country_change_at,region_state.first_ranked_at)
       + interval '720 hours' then
    raise exception using errcode='22023', message='CPI_PROFILE_COUNTRY_COOLDOWN';
  end if;
  if p_analytics_action='set' and not cpi_private.profile_analytics_allowed(p_user_id) then
    raise exception using errcode='22023', message='CPI_PROFILE_ANALYTICS_NOT_ALLOWED';
  end if;

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

create function cpi_private.snapshot_profile_region(p_user_id uuid)
returns jsonb
language plpgsql security invoker
set search_path = pg_catalog
as $function$
declare
  owner_public_id uuid;
  declared_country text;
  mapped_continent text;
begin
  select public_id into owner_public_id from cpi_private.profile_owners
    where user_id=p_user_id for update;
  if not found then
    raise exception using errcode='22023', message='CPI_PROFILE_REQUIRED';
  end if;
  select country_code into declared_country from public.profiles_public
    where public_id=owner_public_id;
  if not found then
    raise exception using errcode='22023', message='CPI_PROFILE_REQUIRED';
  end if;
  if declared_country is not null then
    select continent_code into mapped_continent from cpi_private.country_regions
      where mapping_version='cpi-regions-2026-11-v1' and country_code=declared_country;
    if not found then
      raise exception using errcode='22023', message='CPI_PROFILE_COUNTRY_UNSUPPORTED';
    end if;
  end if;
  insert into cpi_private.profile_region_state(user_id,first_ranked_at)
    values(p_user_id,clock_timestamp())
    on conflict(user_id) do update set
      first_ranked_at=coalesce(cpi_private.profile_region_state.first_ranked_at,excluded.first_ranked_at);
  return jsonb_build_object('countryCode',declared_country,'continent',mapped_continent,
    'mappingVersion','cpi-regions-2026-11-v1');
end
$function$;

create function cpi_private.lock_run_region(p_user_id uuid,p_run_id uuid)
returns jsonb
language plpgsql security invoker
set search_path = pg_catalog
as $function$
declare
  snapshot jsonb;
  existing cpi_private.ranked_runs%rowtype;
begin
  -- Use the same owner->run lock ordering for profile, start and resume paths.
  perform 1 from cpi_private.profile_owners where user_id=p_user_id for update;
  if not found then
    raise exception using errcode='22023', message='CPI_PROFILE_REQUIRED';
  end if;
  select * into existing from cpi_private.ranked_runs where id=p_run_id for update;
  if not found or existing.user_id is distinct from p_user_id then
    raise exception using errcode='22023', message='CPI_RUN_NOT_FOUND';
  end if;
  if existing.region_snapshotted_at is not null then
    return jsonb_build_object('countryCode',existing.country_snapshot,
      'continent',existing.continent_snapshot,'mappingVersion',existing.mapping_version);
  end if;
  if existing.status <> 'playing' then
    raise exception using errcode='22023', message='CPI_RUN_REGION_START_REQUIRED';
  end if;
  snapshot := cpi_private.snapshot_profile_region(p_user_id);
  update cpi_private.ranked_runs set country_snapshot=snapshot->>'countryCode',
    continent_snapshot=snapshot->>'continent',mapping_version=snapshot->>'mappingVersion',
    region_snapshotted_at=clock_timestamp()
    where id=p_run_id;
  return snapshot;
end
$function$;

-- Scheduled by the trusted backend; no raw age history or automatic aging.
create function cpi_private.purge_profile_analytics()
returns integer
language plpgsql security invoker
set search_path = pg_catalog
as $function$
declare
  purged integer;
begin
  update cpi_private.profiles_private
    set analytics_age_band=null,age_response_at=null,updated_at=clock_timestamp()
    where age_response_at <= statement_timestamp() - interval '365 days';
  get diagnostics purged = row_count;
  delete from cpi_private.analytics_authorizations where valid_until <= statement_timestamp();
  return purged;
end
$function$;

do $permissions$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'country_regions','profile_region_state','analytics_authorizations'
  ] loop
    execute format('alter table cpi_private.%I enable row level security',relation_name);
    execute format('alter table cpi_private.%I force row level security',relation_name);
    execute format('revoke all privileges on table cpi_private.%I from public,anon,authenticated,service_role',relation_name);
  end loop;
end
$permissions$;
grant select on cpi_private.country_regions to service_role;
grant all privileges on cpi_private.profile_region_state,cpi_private.analytics_authorizations to service_role;
revoke all privileges on function cpi_private.protect_run_region() from public,anon,authenticated;
revoke all privileges on function cpi_private.profile_analytics_allowed(uuid) from public,anon,authenticated;
revoke all privileges on function cpi_private.get_profile_config() from public,anon,authenticated;
revoke all privileges on function cpi_private.get_profile_owner(uuid) from public,anon,authenticated;
revoke all privileges on function cpi_private.save_profile(uuid,text,text,text,text) from public,anon,authenticated;
revoke all privileges on function cpi_private.snapshot_profile_region(uuid) from public,anon,authenticated;
revoke all privileges on function cpi_private.lock_run_region(uuid,uuid) from public,anon,authenticated;
revoke all privileges on function cpi_private.purge_profile_analytics() from public,anon,authenticated;
grant execute on function cpi_private.protect_run_region() to service_role;
grant execute on function cpi_private.profile_analytics_allowed(uuid) to service_role;
grant execute on function cpi_private.get_profile_config() to service_role;
grant execute on function cpi_private.get_profile_owner(uuid) to service_role;
grant execute on function cpi_private.save_profile(uuid,text,text,text,text) to service_role;
grant execute on function cpi_private.snapshot_profile_region(uuid) to service_role;
grant execute on function cpi_private.lock_run_region(uuid,uuid) to service_role;
grant execute on function cpi_private.purge_profile_analytics() to service_role;

commit;
