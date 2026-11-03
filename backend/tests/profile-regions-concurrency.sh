#!/usr/bin/env bash
set -euo pipefail
# Two actual PostgreSQL connections, not sequential mock calls. This test is
# restricted to the disposable CI service; it must never target hosted data.
test "${PGHOST:-}" = 127.0.0.1
test "${PGDATABASE:-}" = cpi_ci
psql_ci=(psql -X -v ON_ERROR_STOP=1 -qAt)
owner_a=00000000-0000-4000-8000-000000000030
owner_b=00000000-0000-4000-8000-000000000031
temporary_test="$(mktemp -d)"
first_pid=''
cleanup() {
  if [[ -n "$first_pid" ]]; then wait "$first_pid" 2>/dev/null || true; fi
  "${psql_ci[@]}" -c "delete from auth.users where id in ('$owner_a','$owner_b') and email in ('race-a@example.invalid','race-b@example.invalid');" >/dev/null
  rm -f "$temporary_test/a.log" "$temporary_test/b.log"
  rmdir "$temporary_test"
}
trap cleanup EXIT
"${psql_ci[@]}" <<SQL
insert into auth.users(id,email) values
 ('$owner_a','race-a@example.invalid'),('$owner_b','race-b@example.invalid');
SQL

PGAPPNAME=cpi019-race-a "${psql_ci[@]}" >"$temporary_test/a.log" 2>&1 <<SQL &
begin;
set role service_role;
select cpi_private.save_profile('$owner_a','  RACE_PRISM  ','BG','skip');
select pg_sleep(3);
commit;
SQL
first_pid=$!

# Wait until A holds its unique-username row inside an uncommitted transaction.
# B must block on the unique index then fail, rather than publish a duplicate.
ready=false
for attempt in {1..40}; do
  if [[ "$("${psql_ci[@]}" -c "select count(*) from pg_stat_activity where application_name='cpi019-race-a' and wait_event='PgSleep';")" = 1 ]]; then
    ready=true
    break
  fi
  sleep 0.1
done
test "$ready" = true
if "${psql_ci[@]}" >"$temporary_test/b.log" 2>&1 <<SQL
set role service_role;
select cpi_private.save_profile('$owner_b','race_prism','DE','skip');
SQL
then
  printf 'Concurrent duplicate normalized username was accepted.\n' >&2
  exit 1
fi
grep -q CPI_PROFILE_USERNAME_TAKEN "$temporary_test/b.log"
wait "$first_pid"
first_pid=''
test "$("${psql_ci[@]}" -c "select count(*) from public.profiles_public where username='race_prism';")" = 1
test "$("${psql_ci[@]}" -c "select count(*) from cpi_private.profile_owners where user_id='$owner_b';")" = 0
printf 'CPI-019: concurrent normalized-name race has one winner and zero loser side effects.\n'

# First ranked start locks the declared country before a concurrent profile
# change can commit. Once the start commits, the waiting edit must observe the
# new cooldown; it cannot slip through using a stale pre-lock profile read.
PGAPPNAME=cpi019-race-a "${psql_ci[@]}" >"$temporary_test/a.log" 2>&1 <<SQL &
begin;
set role service_role;
select cpi_private.snapshot_profile_region('$owner_a');
select pg_sleep(3);
commit;
SQL
first_pid=$!
ready=false
for attempt in {1..40}; do
  if [[ "$("${psql_ci[@]}" -c "select count(*) from pg_stat_activity where application_name='cpi019-race-a' and wait_event='PgSleep';")" = 1 ]]; then
    ready=true
    break
  fi
  sleep 0.1
done
test "$ready" = true
if "${psql_ci[@]}" >"$temporary_test/b.log" 2>&1 <<SQL
set role service_role;
select cpi_private.save_profile('$owner_a','race_prism','DE','keep');
SQL
then
  printf 'Country changed concurrently past its first-ranked lock.\n' >&2
  exit 1
fi
grep -q CPI_PROFILE_COUNTRY_COOLDOWN "$temporary_test/b.log"
wait "$first_pid"
first_pid=''
test "$("${psql_ci[@]}" -c "select country_code from public.profiles_public where username='race_prism';")" = BG
printf 'CPI-020: concurrent ranked-start/country edit is serialized and preserves its country.\n'
