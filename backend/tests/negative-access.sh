#!/usr/bin/env bash
set -euo pipefail
# Live negative SQL access, not just grant catalog checks. Every command runs
# as the actual Supabase API role under a separate test connection.
# PostgreSQL CI credentials must point only to the disposable test service.
psql_ci=(psql -X -v ON_ERROR_STOP=1 -qAt)
owner_a=00000000-0000-4000-8000-000000000001
owner_b=00000000-0000-4000-8000-000000000002
deny() {
  local role="$1" subject="$2" sql="$3" log
  log="$(mktemp)"
  if "${psql_ci[@]}" -c "set role ${role}; set request.jwt.claim.sub = '${subject}'; ${sql}" >"$log" 2>&1; then
    printf 'UNEXPECTED API ACCESS: role=%s\n' "$role" >&2
    rm -f "$log"
    exit 1
  fi
  if ! grep -Eiq 'permission denied|row.level security' "$log"; then
    printf 'Unexpected failure type; privilege test is inconclusive (%s):\n' "$role" >&2
    cat "$log" >&2
    rm -f "$log"
    exit 1
  fi
  rm -f "$log"
}
deny anon "$owner_a" "select * from cpi_private.profile_owners;"
deny anon "$owner_a" "select * from cpi_private.profiles_private;"
deny authenticated "$owner_a" "select * from cpi_private.profile_owners;"
deny authenticated "$owner_a" "select * from cpi_private.profiles_private;"
deny authenticated "$owner_b" "select * from cpi_private.profiles_private;"
deny authenticated "$owner_a" "select * from cpi_private.consent_events;"
deny authenticated "$owner_b" "select * from cpi_private.parental_authorizations;"
deny authenticated "$owner_a" "select checkpoint_private from cpi_private.ranked_runs;"
deny authenticated "$owner_b" "select checkpoint_private from cpi_private.ranked_runs;"
deny authenticated "$owner_a" "select * from cpi_private.run_actions;"
deny anon "$owner_a" "select * from cpi_private.reward_intents;"
deny authenticated "$owner_a" "select * from cpi_private.reward_transactions;"
deny authenticated "$owner_b" "select * from cpi_private.revive_grants;"
deny anon "$owner_a" "select * from cpi_private.verified_results;"
deny authenticated "$owner_a" "select * from cpi_private.verified_results;"

# A and B cannot edit even their own publicly readable row; all changes go
# through future authorized server endpoints with moderation/privacy checks.
deny anon "$owner_a" "insert into public.profiles_public(public_id,username) values ('00000000-0000-4000-8000-000000000101','impostor');"
deny authenticated "$owner_a" "update public.profiles_public set country_code='US' where public_id='00000000-0000-4000-8000-000000000101';"
deny authenticated "$owner_b" "update public.profiles_public set username='stolen' where public_id='00000000-0000-4000-8000-000000000101';"
deny authenticated "$owner_b" "delete from public.profiles_public where public_id='00000000-0000-4000-8000-000000000101';"
deny authenticated "$owner_a" "insert into cpi_private.verified_results(run_id,user_id,ruleset_version,last_cleared_row,revives_to_reach_score) values ('00000000-0000-4000-8000-000000000011','$owner_a','test-ruleset','999999',0);"
deny authenticated "$owner_b" "update cpi_private.ranked_runs set sp=400,revives_granted=10 where id='00000000-0000-4000-8000-000000000011';"
deny anon "$owner_a" "insert into cpi_private.revive_grants(intent_id,run_id,death_id,ordinal,restore_sp) values ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000011','death-1',1,200);"
deny authenticated "$owner_a" "select email from auth.users;"
# Even a public API join attempt cannot reveal the private Auth-to-public-ID map.
deny authenticated "$owner_a" "select p.username,o.user_id from public.profiles_public p join cpi_private.profile_owners o using(public_id);"

printf 'CPI-017: all guest, account A/B, score, revive and private read/write attacks denied.\n'
