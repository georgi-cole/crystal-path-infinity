# Private MVP server modules

New source candidate (7 November 2026): `supabase/functions/cpi-live` composes the private OTP/session issuer, authoritative v11 economy, verified rewards/commerce, account lifecycle and maintenance. It is disabled by default and has not been deployed. The original development `cpi-api` remains closed. See [architecture and remaining gates](../../docs/decisions/LIVE-SERVER-2026-11.md) and [owner setup](../../docs/RELEASE_SERVICES_SETUP_BG.md).

These modules implement the trusted service contracts for the standalone game.
They do not start a network listener, select a hosted project, deploy migrations,
or enable account capture or advertising. The shipped mobile entry point injects
no account services. Default builds are not connected to live services; hosted activation requires the reviewed setup described above.

`createMvpServer` composes explicitly supplied Fetch `Request` handlers at one
validated HTTPS base path. Every composed handler must use the same `basePath`.
An absent handler returns a fixed unavailable response. The router forwards the
original signed SSV request without reconstructing its query. It accepts no
arbitrary upstream URLs, general Auth proxy or operator write route.

| Handler slot | Constructor / responsibility |
| --- | --- |
| `profile` | `createProfileHandler`: trusted-subject profile reads and transactional edits |
| `ranked` | `createRankedHandler`: start, ordered actions, active lookup and explicit recovery |
| `pendingRuns` | `createPendingRunsHandler`: exact archive receipts and own saved-run paging |
| `leaderboard` | `createLeaderboardHandler`: approved public and owner-scoped projections |
| `account` | `createAccountLifecycleHandler`: fresh reauthentication, complete paged export and durable deletion |
| `moderation` | `createModerationHandler`: account reports and separately verified staff decisions |
| `rewards` | `createRewardHandler`: fresh eligibility, fixed intents, verification and grant application |
| `operations` | `createOperationsStatusHandler`: allowlisted read-only maintenance and compatibility policy |
| `approvedAccountIssuer` | Separately reviewed eligibility, guardian, OTP and secure-session service; absent by default |

The host supplies a `SqlPool`, strict origin/rate-limit policy, verified account
and device identity, fresh privacy/account authorization, and separately verified
staff and reauthentication proofs. Account subjects and the positive native
`clientBuild` come from that trusted verifier, never JSON fields or an unverified
request header. The normal service credential belongs only in the server host.
Do not embed it, private RNG state, provider verification data or database URLs
in the app. The host must honor aborts, bound request and connection lifetimes,
and keep raw request bodies, signed queries, tokens and exception text out of
access/error logs.

`PostgresRankedRepository` and `RewardService` enforce operational start checks
after the common account-owner lock, inside the business transaction. Recovery
uses its separate compatibility floor. Policy writes require a separate
privileged operator connection; there is no mobile enable flag. New-start stops
must preserve existing pending intents, earned grants, immutable results and
exact idempotency retries. The operations migration defaults both starts off.
See [the operational contract and incident procedures](../../docs/decisions/CPI-032-037-operations.md).

Optional `OperationsMetrics` instrumentation starts disabled. Its finite schemas
accept only unlinked counters and buckets. Optional gameplay aggregation also
requires a fresh independent analytics permission on every event. Supplying a
metrics collector does not approve a sink, retention policy, demographics join,
hosted alerts or client telemetry. Diagnostics failures preserve business replies.

CI applies migrations to an isolated PostgreSQL17 database in order, runs each
SQL suite before later schema changes, then executes the current HTTP/database
integrations against the complete schema as the restricted service role. The
original deployed CPI-017 migration is unchanged. Additional migrations need a
separate reviewed deployment procedure: do not reset that database, rewrite its
migration history, or run the old single-migration deployment workflow for them.
Synthetic signed fixtures exercise the reward contract and do not demonstrate
live AdMob delivery or approve any SDK configuration.
