-- CPI-025: private reports and explicit, audited staff decisions.
-- Preparation only; no hosted deployment or staff service is activated.
begin;

create table cpi_private.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  target_public_id uuid not null unique references public.profiles_public(public_id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','dismissed','actioned')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index moderation_case_queue on cpi_private.moderation_cases(state,updated_at,id);
create table cpi_private.name_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  target_public_id uuid not null references public.profiles_public(public_id) on delete cascade,
  case_id uuid not null references cpi_private.moderation_cases(id) on delete cascade,
  reason_code text not null check (reason_code in
    ('impersonation','hate_or_harassment','sexual_content','personal_information','spam')),
  pending boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);
create unique index name_report_pending_pair
  on cpi_private.name_reports(reporter_user_id,target_public_id) where pending;
create index name_report_reporter_window on cpi_private.name_reports(reporter_user_id,created_at);
create index name_report_target_window on cpi_private.name_reports(reporter_user_id,target_public_id,created_at);
create index name_report_case_pending on cpi_private.name_reports(case_id,pending,reason_code);
create table cpi_private.moderation_decisions (
  decision_id uuid primary key,
  case_id uuid not null references cpi_private.moderation_cases(id) on delete cascade,
  decision text not null check (decision in
    ('dismiss','hide_player','restore_player','disqualify_run','restore_run')),
  run_id uuid references cpi_private.verified_results(run_id) on delete cascade,
  actor_reference text not null check (actor_reference ~ '^[A-Za-z0-9:_-]{1,80}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  check ((decision in ('disqualify_run','restore_run')) = (run_id is not null))
);
create index moderation_decision_case on cpi_private.moderation_decisions(case_id,recorded_at);

create function cpi_private.submit_name_report(p_reporter uuid,p_target uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare
  target_owner uuid;
  case_key uuid;
  now_at timestamptz := clock_timestamp();
begin
  if p_reporter is null or p_target is null or p_reason is null or p_reason not in
    ('impersonation','hate_or_harassment','sexual_content','personal_information','spam') then
    raise exception 'CPI_REPORT_INVALID' using errcode='22023';
  end if;
  select o.user_id into target_owner from cpi_private.profile_owners o
    join public.profiles_public p using(public_id) where p.public_id=p_target;
  if not found then raise exception 'CPI_REPORT_INVALID' using errcode='22023'; end if;
  -- Deterministic parent lock order avoids A->B/B->A report deadlocks and
  -- serializes durable limits and account-deletion guards across server nodes.
  perform 1 from cpi_private.profile_owners where user_id in (p_reporter,target_owner)
    order by user_id for update;
  if not exists(select 1 from cpi_private.profile_owners where user_id=p_reporter)
    or not exists(select 1 from cpi_private.profile_owners o join public.profiles_public p using(public_id)
      where o.user_id=target_owner and p.public_id=p_target)
    or exists(select 1 from cpi_private.account_deletion_requests where user_id in (p_reporter,target_owner)) then
    raise exception 'CPI_REPORT_UNAVAILABLE' using errcode='55000';
  end if;
  now_at := clock_timestamp();
  if exists(select 1 from cpi_private.name_reports
    where reporter_user_id=p_reporter and target_public_id=p_target and pending) then
    return jsonb_build_object('status','accepted');
  end if;
  if (select count(*) from cpi_private.name_reports
      where reporter_user_id=p_reporter and created_at>now_at-interval '1 hour')>=5
    or exists(select 1 from cpi_private.name_reports where reporter_user_id=p_reporter
      and target_public_id=p_target and created_at>now_at-interval '24 hours') then
    raise exception 'CPI_REPORT_RATE_LIMITED' using errcode='54000';
  end if;
  insert into cpi_private.moderation_cases(target_public_id,updated_at)
    values(p_target,now_at) on conflict(target_public_id)
    do update set state='pending',updated_at=excluded.updated_at returning id into case_key;
  insert into cpi_private.name_reports(reporter_user_id,target_public_id,case_id,reason_code,created_at)
    values(p_reporter,p_target,case_key,p_reason,now_at);
  return jsonb_build_object('status','accepted');
end
$function$;

create function cpi_private.read_moderation_queue(p_after_at timestamptz default null,p_after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $function$
declare
  result jsonb;
begin
  if (p_after_at is null) <> (p_after_id is null) then
    raise exception 'CPI_MODERATION_INVALID' using errcode='22023';
  end if;
  with page as (
    select c.id,c.target_public_id,p.username,c.updated_at from cpi_private.moderation_cases c
      join public.profiles_public p on p.public_id=c.target_public_id
      where c.state='pending' and (p_after_at is null or (c.updated_at,c.id)>(p_after_at,p_after_id))
      order by c.updated_at,c.id limit 101
  ), shown as (select * from page order by updated_at,id limit 100)
  select jsonb_build_object('schemaVersion',1,'cases',coalesce((
    select jsonb_agg(jsonb_build_object('caseId',s.id,'targetPublicId',s.target_public_id,
      'username',s.username,'updatedAt',s.updated_at,'reasons',coalesce((
        select jsonb_object_agg(reason_code,amount::text) from (
          select reason_code,count(*) as amount from cpi_private.name_reports
          where case_id=s.id and pending group by reason_code
        ) reasons),'{}'::jsonb)) order by s.updated_at,s.id) from shown s),'[]'::jsonb),
    'next',case when (select count(*) from page)>100 then (
      select jsonb_build_object('afterAt',updated_at,'afterId',id) from shown order by updated_at desc,id desc limit 1
    ) end) into result;
  return result;
end
$function$;

create function cpi_private.review_moderation_case(
  p_case_id uuid,p_decision_id uuid,p_decision text,p_run_id uuid,p_actor_reference text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare
  target uuid;
  target_owner uuid;
  saved cpi_private.moderation_decisions%rowtype;
begin
  if p_case_id is null or p_decision_id is null or p_decision is null or p_decision not in
    ('dismiss','hide_player','restore_player','disqualify_run','restore_run')
    or p_actor_reference is null or p_actor_reference !~ '^[A-Za-z0-9:_-]{1,80}$'
    or ((p_decision in ('disqualify_run','restore_run')) <> (p_run_id is not null)) then
    raise exception 'CPI_MODERATION_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cpi025-decision:'||p_decision_id::text,0));
  select c.target_public_id,o.user_id into target,target_owner from cpi_private.moderation_cases c
    join cpi_private.profile_owners o on o.public_id=c.target_public_id where c.id=p_case_id;
  if not found then raise exception 'CPI_MODERATION_NOT_FOUND' using errcode='22023'; end if;
  perform 1 from cpi_private.profile_owners where user_id=target_owner for update;
  if exists(select 1 from cpi_private.account_deletion_requests where user_id=target_owner) then
    raise exception 'CPI_MODERATION_UNAVAILABLE' using errcode='55000';
  end if;
  perform 1 from cpi_private.moderation_cases where id=p_case_id and target_public_id=target for update;
  if not found then raise exception 'CPI_MODERATION_NOT_FOUND' using errcode='22023'; end if;
  -- A decision ID is an immutable retry key, not permission to change an action.
  select * into saved from cpi_private.moderation_decisions where decision_id=p_decision_id;
  if found then
    if saved.case_id is distinct from p_case_id or saved.decision is distinct from p_decision
      or saved.run_id is distinct from p_run_id or saved.actor_reference is distinct from p_actor_reference then
      raise exception 'CPI_MODERATION_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('status','reviewed','caseId',p_case_id,'decisionId',p_decision_id);
  end if;
  if p_run_id is not null and not exists(select 1 from cpi_private.verified_results
    where run_id=p_run_id and user_id=target_owner and published_at is not null) then
    raise exception 'CPI_MODERATION_INVALID' using errcode='22023';
  end if;
  if p_decision in ('hide_player','restore_player') then
    perform cpi_private.set_leaderboard_suppression(target,null,p_decision='hide_player',p_actor_reference,'name_review');
  elsif p_decision in ('disqualify_run','restore_run') then
    perform cpi_private.set_leaderboard_suppression(null,p_run_id,p_decision='disqualify_run',p_actor_reference,'confirmed_invalid');
  end if;
  insert into cpi_private.moderation_decisions(decision_id,case_id,decision,run_id,actor_reference)
    values(p_decision_id,p_case_id,p_decision,p_run_id,p_actor_reference);
  update cpi_private.name_reports set pending=false where case_id=p_case_id;
  update cpi_private.moderation_cases set state=case when p_decision='dismiss' then 'dismissed' else 'actioned' end,
    updated_at=clock_timestamp() where id=p_case_id;
  return jsonb_build_object('status','reviewed','caseId',p_case_id,'decisionId',p_decision_id);
end
$function$;

-- The lifecycle export adapter can include these own-only pages. No reporter
-- identity appears in the queue or another player's public profile.
create function cpi_private.export_own_name_reports(p_user_id uuid,p_after uuid default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $function$
declare
  result jsonb;
begin
  with page as (
    select id,target_public_id,reason_code,pending,created_at from cpi_private.name_reports
      where reporter_user_id=p_user_id and (p_after is null or id>p_after) order by id limit 101
  ), shown as (select * from page order by id limit 100)
  select jsonb_build_object('reports',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'targetPublicId',target_public_id,'reason',reason_code,'pending',pending,'createdAt',created_at)
    order by id) from shown),'[]'::jsonb),'next',case when(select count(*) from page)>100
      then(select id from shown order by id desc limit 1) end) into result;
  return result;
end
$function$;

do $permissions$
declare
  relation_name text;
  routine regprocedure;
begin
  foreach relation_name in array array['moderation_cases','name_reports','moderation_decisions'] loop
    execute format('alter table cpi_private.%I enable row level security',relation_name);
    execute format('alter table cpi_private.%I force row level security',relation_name);
    execute format('revoke all on cpi_private.%I from public,anon,authenticated,service_role',relation_name);
    execute format('grant select on cpi_private.%I to service_role',relation_name);
  end loop;
  foreach routine in array array[
    'cpi_private.submit_name_report(uuid,uuid,text)'::regprocedure,
    'cpi_private.read_moderation_queue(timestamptz,uuid)'::regprocedure,
    'cpi_private.review_moderation_case(uuid,uuid,text,uuid,text)'::regprocedure,
    'cpi_private.export_own_name_reports(uuid,uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',routine);
    execute format('grant execute on function %s to service_role',routine);
  end loop;
end
$permissions$;
-- Hosts use the staff-reviewed operation, never an unaudited raw visibility API.
revoke execute on function cpi_private.set_leaderboard_suppression(uuid,uuid,boolean,text,text) from service_role;

commit;
