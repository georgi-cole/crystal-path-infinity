begin;
create table cpi_private.live_service_schema (
  singleton boolean primary key default true check(singleton), version text not null
);
insert into cpi_private.live_service_schema(version) values('20261107000600');
-- Public publisher IDs supplied by the owner. These rows enable URL verification ONLY;
-- no review flag, country authorization or ad start is approved by this seed.
insert into cpi_private.reward_sdk_configurations(environment,platform,sdk_version,ad_unit_id,ssv_ad_unit,reward_amount,reward_item)
 values('production','android','25.4.0','ca-app-pub-9243398419153145/5387868010','5387868010','1','continue'),
       ('production','ios','13.11.0','ca-app-pub-9243398419153145/4563926844','4563926844','1','continue');
alter table cpi_private.reward_intents add constraint no_console_probe_intent check(nonce<>'00000000-0000-4000-8000-000000000000'::uuid);
alter table cpi_private.live_service_schema enable row level security;
alter table cpi_private.live_service_schema force row level security;
revoke all on cpi_private.live_service_schema from public,anon,authenticated,service_role;
grant select on cpi_private.live_service_schema to service_role;
create policy runtime_read on cpi_private.live_service_schema for select to service_role using(true);
-- Operator-reviewed rollout matrix. The runtime may read it, never approve or edit it.
create table cpi_private.reward_launch_reviews (
  environment text not null check(environment in ('development','staging','production')),
  platform text not null check(platform in ('android','ios')),
  country text not null check(country ~ '^[A-Z]{2}$'),
  policy_version text not null,
  configuration_id uuid not null references cpi_private.reward_sdk_configurations(id),
  review_reference text not null check(length(review_reference) between 8 and 180),
  enabled boolean not null default false, valid_until timestamptz not null,
  primary key(environment,platform,country,policy_version)
);
alter table cpi_private.reward_launch_reviews enable row level security;
alter table cpi_private.reward_launch_reviews force row level security;
revoke all on cpi_private.reward_launch_reviews from public,anon,authenticated,service_role;
grant select on cpi_private.reward_launch_reviews to service_role;
create policy runtime_read on cpi_private.reward_launch_reviews for select to service_role using(true);
create function cpi_private.issue_launch_reward_authorization(p_family uuid,p_environment text,p_geo_country text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare f cpi_private.account_families%rowtype; config uuid;
begin
  select * into f from cpi_private.account_families where id=p_family and revoked_at is null and expires_at>extract(epoch from clock_timestamp())*1000 and access_expires_at>extract(epoch from clock_timestamp())*1000;
  if not found or f.platform='web' or p_geo_country is null then return; end if;
  perform 1 from cpi_private.profile_owners where user_id=f.user_id for update;
  if exists(select 1 from cpi_private.account_deletion_requests where user_id=f.user_id) then return; end if;
  select r.configuration_id into config from cpi_private.reward_launch_reviews r
    join cpi_private.reward_sdk_configurations c on c.id=r.configuration_id
    join cpi_private.reward_launch_reviews geo on geo.environment=r.environment and geo.platform=r.platform and geo.policy_version=r.policy_version and geo.configuration_id=c.id and geo.country=p_geo_country
    where r.environment=p_environment and r.platform=f.platform and r.country=f.country and r.policy_version=f.policy_version
    and r.enabled and geo.enabled and r.valid_until>clock_timestamp()+interval '15 minutes' and geo.valid_until>clock_timestamp()+interval '15 minutes'
    and c.enabled and c.reviewed and c.families_reviewed and c.closeability_reviewed and not c.tracking_enabled;
  if config is null then return; end if;
  -- Reusing a valid authorization avoids unbounded rows on every eligibility refresh.
  if exists(select 1 from cpi_private.reward_authorizations where user_id=f.user_id and configuration_id=config and policy_version=f.policy_version and revoked_at is null and valid_until>clock_timestamp()+interval '2 minutes') then return; end if;
  insert into cpi_private.reward_authorizations(user_id,configuration_id,privacy_context,policy_version,verification_reference,prerequisites_satisfied,child_directed,under_age_of_consent,max_ad_content_rating,non_personalized,valid_until)
    values(f.user_id,config,f.privacy_context,f.policy_version,'launch-policy:'||f.id::text,true,true,true,'G',true,clock_timestamp()+interval '10 minutes');
end $$;
revoke all on function cpi_private.issue_launch_reward_authorization(uuid,text,text) from public,anon,authenticated;
grant execute on function cpi_private.issue_launch_reward_authorization(uuid,text,text) to service_role;
commit;
