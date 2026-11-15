-- Disposable PostgreSQL fixtures only. No synthetic result survives this transaction.
begin;
create function pg_temp.local_score_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Local Infinity: %',message; end if; end $$;
insert into auth.users(id,email) select ('15000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'local-score-'||i||'@example.invalid' from generate_series(1,12) i;
insert into cpi_private.profile_owners(user_id,public_id) select ('15000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,('15100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,12) i;
insert into public.profiles_public(public_id,username,country_code) select ('15100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Local_Score_'||i,case when i=1 then 'US' else 'BG' end from generate_series(1,12) i;
create temp table verified_before as select count(*) as n from cpi_private.verified_results;
select cpi_private.submit_infinity_score(('15000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,('15200000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,(1000-i)::text,case when i=12 then 15 else 0 end,10000) from generate_series(1,12) i;
do $$ declare board jsonb; saved jsonb; begin
  board:=cpi_private.read_infinity_scores('infinity-device-v1','world',null,null,'15000000-0000-4000-8000-000000000012');
  perform pg_temp.local_score_assert(board->>'count'='12' and jsonb_array_length(board->'top100')=10,'top 10 length');
  perform pg_temp.local_score_assert(board->'own'->>'rank'='12' and board->'own'->>'revivesToReachScore'='15','own score below top 10');
  perform pg_temp.local_score_assert(board->'top100'->0->>'lastClearedRow'='999','descending rows');
  board:=cpi_private.read_infinity_scores('infinity-device-v1','country','BG','cpi-regions-2026-11-v1',null);
  perform pg_temp.local_score_assert(board->>'count'='11' and board->'top100'->0->>'countryCode'='BG','profile region filtering');
  saved:=cpi_private.export_infinity_score('15000000-0000-4000-8000-000000000012');
  perform cpi_private.submit_infinity_score('15000000-0000-4000-8000-000000000012','15200000-0000-4000-8000-000000000012','988',15,10000);
  perform pg_temp.local_score_assert(cpi_private.export_infinity_score('15000000-0000-4000-8000-000000000012')=saved,'retry retains timestamp');
  perform cpi_private.submit_infinity_score('15000000-0000-4000-8000-000000000012','15300000-0000-4000-8000-000000000012','900',0,10000);
  perform pg_temp.local_score_assert(cpi_private.export_infinity_score('15000000-0000-4000-8000-000000000012')=saved,'worse score ignored');
  begin
    perform cpi_private.submit_infinity_score('15000000-0000-4000-8000-000000000012','15200000-0000-4000-8000-000000000012','2000',0,10000);
    raise exception 'conflicting retry accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform cpi_private.submit_infinity_score('15000000-0000-4000-8000-000000000011','15200000-0000-4000-8000-000000000012','2000',0,10000);
    raise exception 'foreign run accepted';
  exception when invalid_parameter_value then null; end;
  perform cpi_private.submit_infinity_score('15000000-0000-4000-8000-000000000012','15400000-0000-4000-8000-000000000012','2000',1,10000);
  board:=cpi_private.read_infinity_scores('infinity-device-v1','world',null,null,'15000000-0000-4000-8000-000000000012');
  perform pg_temp.local_score_assert(board->'own'->>'rank'='1','improved score moves position');
  perform pg_temp.local_score_assert(not has_table_privilege('service_role','cpi_private.infinity_device_bests','insert'),'no raw service writes');
  perform pg_temp.local_score_assert(not has_function_privilege('authenticated','cpi_private.submit_infinity_score(uuid,uuid,text,integer,bigint)','execute'),'no direct client RPC');
  perform pg_temp.local_score_assert(has_function_privilege('service_role','cpi_private.submit_infinity_score(uuid,uuid,text,integer,bigint)','execute'),'trusted handler may submit');
  perform pg_temp.local_score_assert((select count(*)=(select n from verified_before) from cpi_private.verified_results),'no verified result fabrication');
  delete from auth.users where id='15000000-0000-4000-8000-000000000012';
  perform pg_temp.local_score_assert(cpi_private.export_infinity_score('15000000-0000-4000-8000-000000000012') is null,'account deletion removes best');
end $$;
rollback;
