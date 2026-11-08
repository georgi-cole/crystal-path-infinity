# Supabase DEV deployment and verification — 4 November 2026

Target: `jbyguybxhezjhdbenevh` (The Crystal Path Infinity DEV, Ireland),
PostgreSQL 17.11. Source: merged main
`85940256ba52d7462d6be09ebccf8f187a1070e1` / [PR #79](https://github.com/georgi-cole/crystal-path-infinity/pull/79).
[Main application/native/backend CI passed](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41856232925).
The owner explicitly authorized the remaining merged database migrations in chat.
No production or staging project was touched.

## Before and after

The read-only preflight found exactly the CPI-017 history row and its ten private
tables. All application tables, including public profiles, were empty. Two Auth
users existed. The earlier [foundation security audit passed](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41857333053).

Only the eight missing migrations below were applied, in order, through the
signed-in DEV SQL Editor. The foundation history row and schema were not rerun.
One enclosing transaction replaced only the individual files' outer BEGIN/COMMIT
boundaries. It included a five-second lock timeout, 120-second statement timeout,
an advisory transaction lock, exact baseline/history guards, and security assertions
before COMMIT. Any error would roll back all eight migrations and their history.

Each new history row stores its exact original migration text as one `statements`
array element, with the original version and name. This was a manual SQL deployment,
not a Supabase CLI `db push` or history-only repair. A separate committed-state
read-only check verified all eight archived texts against the source with normalized
line endings. The two Auth users remained unchanged; no hosted test users or other
application fixtures were inserted.

| Version | Migration | Status |
| --- | --- | --- |
| `20261103000100` | `cpi017_foundation` | Already applied; preserved |
| `20261104000100` | `cpi019_profiles_regions` | Applied |
| `20261104000200` | `cpi021_ranked_authority` | Applied |
| `20261104000300` | `cpi023_leaderboards` | Applied |
| `20261104000400` | `cpi031_account_lifecycle` | Applied |
| `20261104000500` | `cpi025_moderation` | Applied |
| `20261104000600` | `cpi026_028_rewards` | Applied |
| `20261104000650` | `cpi030_saved_pending` | Applied |
| `20261104000700` | `cpi032_037_operations` | Applied |

The generated transaction's SHA-256 was
`d1efb641dc30c1014301528bff6bf30ed305f64d914550d82b8f645dbb6f4376`.
The exact transaction, source-hash manifest, rehearsals, JSON evidence and screenshot
are retained in this task's local `work` artifacts. No secret or personal user row
was copied into this repository.

## Verification

- Disposable PostgreSQL WASM/PGlite rehearsal: successful upgrade, duplicate-run
  rejection, and injected failure before COMMIT. The failed rehearsal retained
  only CPI-017, no new country table, and both synthetic Auth users.
- All existing SQL suites and eight actual handler/database integration suites
  passed locally. The exact source also passed PostgreSQL17 backend CI linked
  above. These fixtures used synthetic identities/provider responses.
- Hosted committed-state audit returned `CPI_DEV_UPGRADE_SECURITY_OK`: nine history
  versions, 29 private tables, RLS enabled and forced on each private table and
  public profiles, no browser-role private schema/table/RPC access or profile
  writes, fixed function search paths, and the complete 249-country mapping.
- Hosted read-only role checks returned `CPI_DEV_ROLE_BOUNDARIES_OK`: an actual
  `anon` role and two `authenticated` contexts with synthetic JWT subjects were
  denied all 87 attempted private-table reads and all three private profile RPC
  calls. This tests database-role boundaries; it is not live issuer/account-flow
  acceptance or an end-to-end cross-owner data test.
- Operational control is still `service_not_ready`, with
  `ranked_starts_enabled = false` and `ad_starts_enabled = false`. Reward SDK
  configurations and reward authorizations are empty. The application runtime
  cannot call the privileged operations activation routine.
- Auth dashboard rechecked after deployment: public signups off, anonymous
  sign-ins off, email confirmation on. Auth/SMTP configuration was not modified.
- All six deployed Edge account/profile/ranked/reward endpoints still returned
  HTTP 401 without authorization. No live issuer or ad integration was enabled.

## Locked Edge host

The `cpi-api` entry from the same main commit was previously deployed through
the dashboard using pinned Deno 2.9.6's bundle. Its SHA-256 is
`03100c0aa0caec58964e0dc340f97fa2bcb014d6c30f513cb933e7bbf613daf7`.
The entire editor contents matched the bundle before deployment. The dashboard
test returned the expected `404 / not_found` for the bare root, and the gateway
JWT setting was confirmed on. The exact bundle's six known service routes were
also tested locally and all returned `503 / service_unavailable`.

## Next deployment and remaining acceptance

Do not rerun the old foundation-only deployment or single-migration preview.
For a later upgrade, first read `supabase_migrations.schema_migrations`, compare
the exact deployed prefix and archived SQL with reviewed main, then apply only
new migrations with new preflight/postflight checks. Never mark an unapplied
migration as applied or rerun an existing non-idempotent migration.

The mobile app continues guest practice. Approved privacy/guardian policy, durable
abuse controls, OTP/session issuer composition, hosted application/account tests,
device testing and provider review remain before opening live services. Database
deployment does not satisfy those acceptance gates. No backup restore drill,
live reward/SSV test, signing or store release was performed here.

Direct links: [DEV SQL Editor](https://supabase.com/dashboard/project/jbyguybxhezjhdbenevh/sql),
[DEV Auth](https://supabase.com/dashboard/project/jbyguybxhezjhdbenevh/auth/providers),
[locked Edge host](https://supabase.com/dashboard/project/jbyguybxhezjhdbenevh/functions/cpi-api/details).

## 7 November 2026 — archive and pause

At the owner's request, the shared DEV project `jbyguybxhezjhdbenevh` was paused after a read-only export of its data. The export covers 75 tables across `auth`, `cpi_private`, `public`, `realtime`, `storage`, `supabase_migrations` and `vault`, including 11 Auth users and 9 migration history entries. Storage had zero objects. The export was saved under `%LOCALAPPDATA%/Kolequant/CrystalPath/Backups` with Windows current-user encryption. The archive was decrypted on the same account and each table's row count was checked. This is a data export. A full project restore uses the Supabase pause backup, which the dashboard offers under **Download backups**. A full restore drill is pending.

The freed slot now hosts [Crystal Path Infinity Staging](https://supabase.com/dashboard/project/yfntwewvfsvljxcztoyp), project `yfntwewvfsvljxcztoyp`, on GeorgiCole Free in Ireland. Supabase reported the project Healthy. Application migrations and live services were not deployed in this operation. The Big Eye production project was outside the operation. Its QA backend used the now-paused DEV.
