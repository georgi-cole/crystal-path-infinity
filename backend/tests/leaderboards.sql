-- Disposable PostgreSQL only. No fixtures survive this transaction.
begin;

create function pg_temp.cpi023_assert(ok boolean, message text) returns void
language plpgsql as $function$
begin
  if ok is distinct from true then raise exception 'CPI023: %', message; end if;
end
$function$;

insert into auth.users(id,email)
select ('23000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       'cpi023-' || i::text || '@example.invalid'
from generate_series(1,105) i;
insert into cpi_private.profile_owners(user_id,public_id)
select id,('23100000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid
from generate_series(1,105) i
join auth.users on id = ('23000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
insert into public.profiles_public(public_id,username,country_code)
select ('23100000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       'CPI023_Player_' || i::text,'BG'
from generate_series(1,105) i;

-- Independent authoritative-storage fixtures. These do not pretend that a
-- client can submit these fields or that a hosted run has been validated.
create function pg_temp.cpi023_run(
  p_suffix integer, p_user integer, p_ruleset text, p_score text,
  p_country text default 'BG', p_revives integer default 0,
  p_achieved timestamptz default '2020-01-01 01:00:00+00',
  p_status text default 'finished', p_validated boolean default true
) returns uuid language plpgsql as $function$
declare
  run_key uuid := ('23200000-0000-4000-8000-' || lpad(p_suffix::text,12,'0'))::uuid;
begin
  insert into cpi_private.ranked_runs
    (id,user_id,ruleset_version,checkpoint_private,status,last_cleared_row,current_row,
     revives_granted,revives_applied,revives_to_reach_score,created_at,finalized_at,
     achieved_at,server_validated,country_snapshot,continent_snapshot,mapping_version,region_snapshotted_at)
  values (run_key,('23000000-0000-4000-8000-' || lpad(p_user::text,12,'0'))::uuid,
    p_ruleset,'{}',p_status,p_score,(p_score::numeric + 1)::text,
    p_revives,p_revives,p_revives,'2020-01-01 00:00:00+00',
    case when p_status = 'finished' then '2020-01-01 02:00:00+00'::timestamptz end,
    case when p_score <> '0' then p_achieved end,p_validated,p_country,
    case when p_country in ('BG','GB') then 'EU' when p_country = 'US' then 'NA' end,
    'cpi-regions-2026-11-v1','2020-01-01 00:00:00+00');
  return run_key;
end
$function$;

do $tests$
declare
  i integer;
  run_key uuid;
  board jsonb;
  first_reply jsonb;
  next_reply jsonb;
  own_user uuid := '23000000-0000-4000-8000-000000000101';
begin
  for i in 1..105 loop
    run_key := pg_temp.cpi023_run(i,i,'cpi023-order',(106-i)::text,
      case when i <= 70 then 'BG' when i <= 90 then 'GB' when i <= 104 then 'US' end);
    perform cpi_private.publish_ranked_result(run_key);
  end loop;
  board := cpi_private.read_leaderboard('cpi023-order','world',null,null,own_user);
  perform pg_temp.cpi023_assert(board->>'count' = '105','105 eligible accounts counted exactly');
  perform pg_temp.cpi023_assert(jsonb_array_length(board->'top100') = 100,'Top100 bounded');
  perform pg_temp.cpi023_assert(board->'own'->>'rank' = '101','own rank beyond Top100');
  perform pg_temp.cpi023_assert(board->'neighbors'->0->>'rank' = '99'
    and board->'neighbors'->4->>'rank' = '103','neighbors outside Top100');
  perform pg_temp.cpi023_assert(board->'top100'->0->>'lastClearedRow' = '105','numeric sort, not lexical');
  perform pg_temp.cpi023_assert(board->'top100'->0->>'countryCode' = 'BG','run country projected');
  perform pg_temp.cpi023_assert(board->>'updatedAt' is not null,'snapshot timestamp present');
  perform pg_temp.cpi023_assert(not (board::text ~
    'user_id|checkpoint|email|analytics|privacy_context|refresh|safeSide|23000000'),
    'no private account or gameplay fields returned');

  first_reply := cpi_private.publish_ranked_result('23200000-0000-4000-8000-000000000001');
  next_reply := cpi_private.publish_ranked_result('23200000-0000-4000-8000-000000000001');
  perform pg_temp.cpi023_assert(first_reply = next_reply,'idempotent publication reply');
  perform pg_temp.cpi023_assert((select count(*) = 105 from cpi_private.verified_results
    where ruleset_version = 'cpi023-order'),'duplicate publication creates no duplicate result');
  begin
    update cpi_private.verified_results set last_cleared_row = '999999'
      where run_id = '23200000-0000-4000-8000-000000000001';
    raise exception 'CPI023: immutable result accepted an update';
  exception when sqlstate '55000' then null;
  end;

  -- A better later run changes World and the new region; it does not move
  -- the first run away from Bulgaria or create two places for this player.
  run_key := pg_temp.cpi023_run(200,1,'cpi023-order','200','GB');
  perform cpi_private.publish_ranked_result(run_key);
  board := cpi_private.read_leaderboard('cpi023-order');
  perform pg_temp.cpi023_assert(board->>'count' = '105'
    and board->'top100'->0->>'lastClearedRow' = '200','best per account, one World entry');
  board := cpi_private.read_leaderboard('cpi023-order','country','BG','cpi-regions-2026-11-v1');
  perform pg_temp.cpi023_assert(board->>'count' = '70'
    and board->'top100'->0->>'lastClearedRow' = '105','old country keeps old best snapshot');
  board := cpi_private.read_leaderboard('cpi023-order','country','GB','cpi-regions-2026-11-v1');
  perform pg_temp.cpi023_assert(board->>'count' = '21'
    and board->'top100'->0->>'lastClearedRow' = '200','new country gets new result');
  board := cpi_private.read_leaderboard('cpi023-order','continent','EU','cpi-regions-2026-11-v1');
  perform pg_temp.cpi023_assert(board->>'count' = '90','non-EU GB is Europe, one account per continent');
  board := cpi_private.read_leaderboard('cpi023-order','country','BG','future-mapping');
  perform pg_temp.cpi023_assert(board->>'count' = '0','mapping versions never mix');
  board := cpi_private.read_leaderboard('different-ruleset');
  perform pg_temp.cpi023_assert(board->>'count' = '0' and board->'own' = 'null'::jsonb
    and board->'neighbors' = '[]'::jsonb,'empty distinct ruleset');

  -- Above IEEE-754 range and at the full 1,000-digit schema boundary.
  perform cpi_private.publish_ranked_result(pg_temp.cpi023_run(301,1,'cpi023-huge','9007199254740992'));
  perform cpi_private.publish_ranked_result(pg_temp.cpi023_run(302,2,'cpi023-huge','9007199254740993'));
  board := cpi_private.read_leaderboard('cpi023-huge');
  perform pg_temp.cpi023_assert(board->'top100'->0->>'lastClearedRow' = '9007199254740993'
    and board->'top100'->1->>'lastClearedRow' = '9007199254740992','adjacent huge scores stay distinct');
  perform cpi_private.publish_ranked_result(pg_temp.cpi023_run(303,3,'cpi023-huge',repeat('9',999)||'7'));
  perform cpi_private.publish_ranked_result(pg_temp.cpi023_run(304,4,'cpi023-huge',repeat('9',999)||'8'));
  board := cpi_private.read_leaderboard('cpi023-huge');
  perform pg_temp.cpi023_assert(board->'top100'->0->>'lastClearedRow' = repeat('9',999)||'8'
    and board->'top100'->1->>'lastClearedRow' = repeat('9',999)||'7','1000-digit lossless numeric ordering');

  perform cpi_private.publish_ranked_result(pg_temp.cpi023_run(401,1,'cpi023-ties','10','BG',1));
  perform cpi_private.publish_ranked_result(pg_temp.cpi023_run(402,2,'cpi023-ties','10','BG',0,'2020-01-01 01:01+00'));
  perform cpi_private.publish_ranked_result(pg_temp.cpi023_run(403,3,'cpi023-ties','10','BG',0));
  perform cpi_private.publish_ranked_result(pg_temp.cpi023_run(404,4,'cpi023-ties','10','BG',0));
  board := cpi_private.read_leaderboard('cpi023-ties');
  perform pg_temp.cpi023_assert(board->'top100'->0->>'publicId' = '23100000-0000-4000-8000-000000000003'
    and board->'top100'->1->>'publicId' = '23100000-0000-4000-8000-000000000004'
    and board->'top100'->2->>'publicId' = '23100000-0000-4000-8000-000000000002'
    and board->'top100'->3->>'publicId' = '23100000-0000-4000-8000-000000000001',
    'tie order uses revives, server achievement, stable public ID');
  perform cpi_private.publish_ranked_result(pg_temp.cpi023_run(405,5,'cpi023-ties','0'));
  board := cpi_private.read_leaderboard('cpi023-ties','world',null,null,
    '23000000-0000-4000-8000-000000000005');
  perform pg_temp.cpi023_assert(board->>'count' = '4' and board->'own' = 'null'::jsonb,
    'score zero remains personal, absent from ranking');

  -- Pending/dead/unvalidated records cannot become official results.
  run_key := pg_temp.cpi023_run(501,5,'cpi023-guards','1','BG',0,
    '2020-01-01 01:00+00','dead');
  begin
    perform cpi_private.publish_ranked_result(run_key);
    raise exception 'CPI023: dead run published';
  exception when sqlstate '55000' then null; end;
  run_key := pg_temp.cpi023_run(502,5,'cpi023-guards','1','BG',0,
    '2020-01-01 01:00+00','finished',false);
  begin
    perform cpi_private.publish_ranked_result(run_key);
    raise exception 'CPI023: unvalidated run published';
  exception when sqlstate '55000' then null; end;
  run_key := pg_temp.cpi023_run(503,5,'cpi023-guards','1');
  insert into cpi_private.reward_intents(id,run_id,death_id,ordinal,promised_restore_sp,ruleset_version)
    values ('23300000-0000-4000-8000-000000000503',run_key,'death-1',1,200,'cpi023-guards');
  begin
    perform cpi_private.publish_ranked_result(run_key);
    raise exception 'CPI023: pending SSV published';
  exception when sqlstate '55000' then null; end;
  update cpi_private.reward_intents set state = 'verified',resolved_at = clock_timestamp()
    where run_id = run_key;
  insert into cpi_private.revive_grants(intent_id,run_id,death_id,ordinal,restore_sp)
    values ('23300000-0000-4000-8000-000000000503',run_key,'death-1',1,200);
  begin
    perform cpi_private.publish_ranked_result(run_key);
    raise exception 'CPI023: unused earned continuation silently lost';
  exception when sqlstate '55000' then null; end;
  update cpi_private.revive_grants set state = 'forfeited' where run_id = run_key;
  perform cpi_private.publish_ranked_result(run_key);
  perform pg_temp.cpi023_assert((select count(*) = 1 from cpi_private.verified_results
    where ruleset_version = 'cpi023-guards'),'only resolved final result published');

  -- Suppressing one run immediately reveals the next eligible best in all
  -- affected scopes. Player suppression and account deletion are consistent.
  perform cpi_private.set_leaderboard_suppression(null,
    '23200000-0000-4000-8000-000000000200',true,'ci-operator','confirmed_invalid');
  board := cpi_private.read_leaderboard('cpi023-order');
  perform pg_temp.cpi023_assert(board->'top100'->0->>'lastClearedRow' = '105','suppressed best falls back');
  board := cpi_private.read_leaderboard('cpi023-order','country','GB','cpi-regions-2026-11-v1');
  perform pg_temp.cpi023_assert(board->>'count' = '20','suppressed result absent from country');
  perform cpi_private.set_leaderboard_suppression(
    '23100000-0000-4000-8000-000000000001',null,true,'ci-operator','account_review');
  board := cpi_private.read_leaderboard('cpi023-order');
  perform pg_temp.cpi023_assert(board->>'count' = '104','player hide affects World');
  board := cpi_private.read_leaderboard('cpi023-order','country','BG','cpi-regions-2026-11-v1');
  perform pg_temp.cpi023_assert(board->>'count' = '69','player hide affects old country');
  perform cpi_private.set_leaderboard_suppression(
    '23100000-0000-4000-8000-000000000001',null,false,'ci-operator','account_review');
  board := cpi_private.read_leaderboard('cpi023-order');
  perform pg_temp.cpi023_assert(board->>'count' = '105','restore uses original immutable bests');
  perform pg_temp.cpi023_assert((select count(*) = 3 from cpi_private.leaderboard_moderation_events),
    'moderation changes journaled');
  delete from auth.users where id = '23000000-0000-4000-8000-000000000001';
  board := cpi_private.read_leaderboard('cpi023-order');
  perform pg_temp.cpi023_assert(board->>'count' = '104','deleted player absent from every read');
  perform pg_temp.cpi023_assert(not exists (select 1 from cpi_private.verified_results
    where user_id = '23000000-0000-4000-8000-000000000001'), 'deleted results cascaded');
  perform pg_temp.cpi023_assert(not exists (select 1 from cpi_private.leaderboard_suppressions)
    and not exists (select 1 from cpi_private.leaderboard_moderation_events),
    'deleted identity has no dangling moderation identifiers');
end
$tests$;

do $tests$
begin
  perform pg_temp.cpi023_assert(not has_function_privilege('anon',
    'cpi_private.publish_ranked_result(uuid)','execute')
    and not has_function_privilege('authenticated',
    'cpi_private.publish_ranked_result(uuid)','execute'),'mobile cannot publish arbitrary results');
  perform pg_temp.cpi023_assert(not has_function_privilege('anon',
    'cpi_private.read_leaderboard(text,text,text,text,uuid)','execute')
    and not has_function_privilege('authenticated',
    'cpi_private.read_leaderboard(text,text,text,text,uuid)','execute'),'own-account input is service only');
  perform pg_temp.cpi023_assert(not has_function_privilege('authenticated',
    'cpi_private.set_leaderboard_suppression(uuid,uuid,boolean,text,text)','execute'),
    'mobile token cannot moderate');
  perform pg_temp.cpi023_assert(not has_table_privilege('service_role','cpi_private.verified_results','insert')
    and not has_table_privilege('service_role','cpi_private.verified_results','update'),
    'service must finalize through guarded publisher');
  perform pg_temp.cpi023_assert(not has_table_privilege('authenticated',
    'cpi_private.leaderboard_suppressions','select'), 'private suppression not exposed');
  begin
    perform cpi_private.read_leaderboard('cpi023-order','world','BG');
    raise exception 'CPI023: ambiguous World filter accepted';
  exception when invalid_parameter_value then null; end;
end
$tests$;

-- Exercise the exact granted operations as the server role, not only owner.
set local role service_role;
select cpi_private.publish_ranked_result('23200000-0000-4000-8000-000000000002')->>'status' as cpi023_idempotent_service;
select cpi_private.read_leaderboard('cpi023-order')->>'count' as cpi023_service_count;
reset role;
set local role authenticated;
do $negative$
begin
  begin
    perform cpi_private.publish_ranked_result('23200000-0000-4000-8000-000000000002');
    raise exception 'CPI023: authenticated publication succeeded';
  exception when insufficient_privilege then null; end;
end
$negative$;
reset role;

rollback;
