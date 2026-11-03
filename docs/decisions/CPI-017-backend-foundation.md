# CPI-017 — isolated Supabase backend and least-privilege database

**State:** schema, policies and PostgreSQL security regression harness are implemented in the repository. **No hosted Supabase development, staging or production project has been provisioned or connected by this PR.** The existence of SQL migrations must never be described as an online profile, playable ranked game, published ranking or production-ready ad/SSV integration.

This is a *new Crystal Path: Infinity* backend. Do not reuse, copy tables into, or run a migration against The Big Eye production Supabase project. The three future Crystal Path Supabase projects must have different project IDs, database instances, Auth tenants, storage and secret scopes.

## Trust boundaries

| Object | Columns / privacy | Unauthenticated mobile | Authenticated mobile | Trusted server |
| --- | --- | --- | --- | --- |
| `auth.users` | Supabase-managed ID/email/identity | No direct query | No direct query through this app | Auth service / narrowly trusted server |
| `public.profiles_public` | Publishable username, opaque public ID and optional country only | SELECT | SELECT | INSERT/UPDATE/DELETE after validation and privacy eligibility |
| `cpi_private.profile_owners` | Secret Auth user UUID → independent public ID mapping | None | None | Server writes; delete cascades by Auth user |
| `cpi_private.profiles_private` | Optional analytics age **band**, answer date, separate privacy context | None | None (future own endpoint needed) | Read/write |
| `cpi_private.consent_events` | Separate auditable account/analytics/ads/tracking/publication decisions | None | None | Append new decision |
| `cpi_private.parental_authorizations` | Only opaque guardian-verification reference; no parent email | None | None | Minimal authorized processing |
| `cpi_private.ranked_runs` | Full private checkpoint: RNG, future route, SP/hints, revives and time | None | None | Validated server transitions only |
| `cpi_private.run_actions` | Ordered request, idempotency key and committed response | None | None | Atomic append with run checkpoint |
| `cpi_private.reward_intents` | Death, nonce, ordinal, fixed 200/150 SP promise, verification state | None | None | Verified issuance/reconciliation |
| `cpi_private.reward_transactions` | Unique provider transaction and signed-query hash | None | None | Verified SSV callback only |
| `cpi_private.revive_grants` | One unique grant per death with apply/forfeit status | None | None | Idempotent trusted operations |
| `cpi_private.verified_results` | Private score source, timestamp and country snapshot | None | None | Only after validating authoritative completed run |

Every `public` table has RLS enabled **and forced**. `profiles_public` has a single explicit read policy for `anon` and `authenticated`; the migration **revokes all previous privileges** before granting only SELECT to clients. All ten `cpi_private` tables have RLS enabled and forced, **no client policies**, **no client privileges**, and **no schema usage** for either API role. The `service_role` bypasses RLS (Supabase role) and is strictly server-side; only it has private schema usage and object privileges. No public view, `SECURITY DEFINER` function, PostgREST RPC or GraphQL resolver is created from the private ledgers. Auth UUIDs and emails are never placed in public rows. Public IDs are independently generated and mapped only by `cpi_private.profile_owners`. A private age band cannot leak through the `profiles_public` table or a queryable public-to-private view.

The schema deliberately stores **no exact years, date of birth, parent identity/contact, GPS or email copy**. Optional `analytics_age_band` and `age_response_at` are paired; `privacy_context` is independent, defaults to `unknown`, and is never inferred to be `adult` from a missing analytics response. Parental authorizations are not auto-approved. Consent and account lifecycle API flows are implemented in CPI-018/019/026/031, with age and legal review; the migration does not itself perform those features.

PostgreSQL check constraints enforce integer/row bounds, `0 <= applied <= granted <= 10`, server-only score visibility, one provider transaction/intent, one death intent/grant, unique action sequence/idempotency key, and the accepted `200 SP` revive indices 1–5 and `150 SP` indices 6–10. The core reducer, secret route, account lease, country cooldown, verified score rules and SSV signature validation **still require server services in CPI-021–023 and CPI-028–030**. Database constraints alone do not prevent a compromised *trusted* server from recording an invalid result. No ranked score or revive is ever accepted from client state.

## Three project environments (owner provisioning gate)

1. Create **three new independent Supabase projects** for Crystal Path: Infinity: development, staging and production. Choose regions/backup policy deliberately. Record their *public project references and URLs* in a private copy of `backend/projects.example.json`; this example is intentionally invalid for real deployment.
2. Verify that all three references and API URLs are distinct using `node backend/scripts/validate-environments.mjs path/to/private-projects.json`. This validator rejects duplicate refs, malformed HTTPS origins and any secret/password/key fields. Never commit the real project manifest if it reveals operational details you prefer private. Never put `service_role`, JWT signing keys, Postgres credentials or SSV keys in `VITE_*` variables, app bundles, Git, public logs or test artifacts. Vite's public URL/anon publishable key is different from a secret and must still be permission-scoped.
3. In each project, restrict **Data API exposed schemas to `public`**. Exclude `cpi_private`, `auth` and storage internals. Do not add `cpi_private` to `extra_search_path`. Review default grants; Supabase projects have historically auto-granted broad permissions, so do not remove the explicit REVOKE statements.
4. First apply the migration to a disposable local/new project using the Supabase CLI. For a newly provisioned **development** project, independently verify its reference before linking (`supabase link --project-ref <development-ref>`) and running `supabase db push`. Repeat the project reference verification in isolated CI deployment contexts for staging and production; do not reuse an ambiguous linked-project state. Review every migration in the PR before deploying. **Never run `backend/tests/bootstrap.sql` against hosted Supabase**; it creates mock Supabase roles and fake `auth.users` for the disposable PostgreSQL CI service only.
5. Store server credentials separately in each environment's managed secret storage and scope production deployment permissions to specific approvers. No real project references, production secrets or OTP/account settings were installed by this task. Provision backup access and restore permissions separately.

## Test commands and scope

GitHub Actions uses a disposable **PostgreSQL 17 service**. The new *Backend schema and access controls* job first creates only CI mock roles + two mock auth users, applies `supabase/migrations/20261103000100_cpi017_foundation.sql` from a clean DB, checks forced RLS, each grant and the exact five public profile columns (with an opaque ID, no Auth UUID), then uses real `SET ROLE anon/authenticated` SQL requests with account A/B JWT-like claims to attempt forbidden read/write operations. The test **fails if a write/read succeeds** or if an unexpected kind of error occurs. It checks mobile score tampering, SP/revive changes, SSV ledger access, public profile changes, and private age/consent/route access. Another test checks environment identity separation and public-secret name leaks.

The existing stable `Mobile app checks / App required checks` gate now requires **Backend schema and access controls = success** for *every* workflow run, **even if native platforms are skipped on documentation-only changes**. Existing App quality, Android/iOS verification and gate failure behavior are not bypassed. This is a PostgreSQL privilege/RLS simulation, **not** a live Supabase Data API/Edge Function integration test; after provisioning, verify the same negative scenarios through anon and real signed-in A/B HTTP requests (and absence of exposed private schema). No consumer API is claimed ready until those real tests pass.

## Indexing and disaster recovery

Migration indexes support owner/status run retrieval, ordered action replay, single-run intent reconciliation, owner+ruleset best records, and country/ruleset lookup. Long `last_cleared_row` values are bounded decimal **strings** (not IEEE-754 JavaScript numbers); leaderboard ordering must use numeric semantics in CPI-023 rather than lexical text sorting.

For each independent project, enable the managed backup/PITR capability appropriate to its plan, verify encryption and retention choices with the actual provider, and restrict access to the restoration role. Define and agree RPO/RTO before launch; neither is invented in this document. Demonstrate restoring a *development or staging backup to a new disposable project* and running the migration/security checks on restored data. Never test restoration by overwriting live production; never copy personal production records to a non-production project without authorization and sanitization. This PR does not enable or measure backups in an uncreated hosted project.

### Release blockers for CPI-017 beyond code

- Three actual projects, independently authenticated environments and secret scopes
- Migration applied to each provisioned target with tracked release approvals
- Native API negative tests against real Supabase `anon`, user A and user B and parent/child account constraints
- Verified backup/restore drill and provider-specific log/retention review
- Follow-on trusted endpoint authorization/score verification in CPI-018 onward

**Sources:** [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles), [RLS/grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [database testing](https://supabase.com/docs/guides/local-development/testing/overview).
