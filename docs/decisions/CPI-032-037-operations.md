# CPI-032 + CPI-037 — Operational controls and minimal diagnostics

This slice prepares an explicit server control plane, bounded metrics collector,
read-only maintenance status and incident procedures. It does not deploy a
monitoring service, create paid accounts, send notifications, configure a support
address, or authorize production advertising/accounts. Guest practice remains
independent. Default operational collection and both new-start controls are off.

## Atomic start controls and compatibility

`operations_control` has one private, revisioned row. The default policy disables
new ranked attempts and new ad intents, supports `infinity-v1`, and specifies
positive start/recovery minimum build numbers. A maintenance message is a fixed
code (`service_not_ready`, `scheduled_maintenance`, `backend_unavailable`,
`reward_verification_delayed`, `ruleset_review`, `client_update_required` or
`none`), never unreviewed operator/user text.

Normal mobile roles have no private access. The ordinary server role may read
the policy and invoke narrowly scoped checks; it cannot edit policy tables or
execute `set_operations_policy`. An operator uses a separate privileged
connection and supplies the expected revision, explicit full replacement policy
and an opaque staff reference. Revision conflicts reject stale updates. Every
accepted change appends a private audit record with policy, reference and time;
no account/email/age or request payload is included.

The trusted native/session verifier binds a positive `clientBuild` to the server
actor. A build number from a game command body is not evidence. After locking the
account owner, the start transaction invokes
`authorize_operation_start('ranked' | 'ad', clientBuild, serverRuleset)`, through
`createOperationStartGate`. It checks the live policy while holding a shared
policy-row lock and sets a transaction-local start context. New run/intent
INSERT triggers require that context, check its ruleset against the stored run
ruleset and recheck live controls. Missing, stale, malformed or old-build context
fails closed. An operator disable takes effect when its change commits; it does
not cut through an already authorized transaction.

PostgreSQL executes BEFORE INSERT triggers on an upsert conflict path too. The
guards explicitly recognize existing run IDs and existing intent/death pairs, so
normal checkpoint upserts and exact intent retries remain recoverable after a
new-start stop. Existing owner, unique, immutable-result and region constraints
still enforce the actual update. New starts never get a client-selected public
ruleset, free progress, resource reset or locally promoted practice score.

The controls do **not** gate existing-run UPDATE, signature verification, earned
grant creation/application, pending reconciliation, explicit finalization or
publication. Those operations retain their existing privacy/account-deletion
authorization and transaction checks. A network outage or operational stop must
never delete/forfeit an earned reward or silently finish a recoverable run.

Recovery has an independent minimum build and allowed-ruleset list via
`check_operation_recovery`/`createOperationRecoveryGate`; it ignores new-start
kill flags. Raising the start minimum does not automatically raise the recovery
floor. The operator cannot remove a ruleset with an unresolved server-validated
run from the recovery list. Before enabling a new ruleset, deploy and verify its
actual reducer and old-run compatibility; policy text does not install code or
turn unsupported checkpoints into a valid run. Old results keep their original
ruleset/country/continent snapshots and are never mixed or moved retrospectively.

`createOperationsStatusHandler` exposes only explicitly approved POST
`/operations/status` reads on a validated mount. It accepts `{schemaVersion:1}`,
has strict origin/public-read/rate-limit seams, bounded input and no-store output.
It returns the allowlisted compatibility/maintenance policy, without staff audit,
account data or an operator write route. No client calls it automatically, and a
status response is never authority to bypass the transactional server checks.

## Event dictionary and privacy boundaries

`OperationsMetrics` is disabled unless the host deliberately sets `enabled:true`.
It never installs a telemetry SDK, opens a network connection, reads localStorage,
extracts request headers/bodies or serializes an exception/stack trace. The
injected sink receives cumulative aggregate snapshots only. The caller's
response/error is preserved even if diagnostics, its clock or its sink fails.

| Input event | Allowed fields | Purpose and output |
| --- | --- | --- |
| `request` | Fixed endpoint enum, fixed outcome enum, bounded duration, configured ruleset or null | Request counts and rounded-millisecond latency buckets, including retries as infrastructure requests |
| `reward` | Fixed outcome enum, verification latency, configured ruleset | Intent/verification/grant/no-fill/skip/error counts and latency buckets; not proof of an earned reward |
| `resource` | Configured ruleset, checkpoint bytes, DB read/write counts, canonical audit-row count, handler duration | Checkpoint/retention growth buckets, DB cost inputs and handler latency |
| `finalized_gameplay` through the separate optional method | Configured ruleset, exact progress input, active/ad durations and the three revive counters | Optional finalization, endless distance, active/ad time and revive histograms |

Operational endpoint/outcome tags come from finite allowlists. Ruleset labels
come only from at most eight deployment-configured versions; arbitrary per-user
versions are rejected. Extra fields make the entire input event invalid.
Email, OTP, token, signed callback text, URL/query, exact age, birthdate,
`analyticsAgeBand`, `privacyContext`, consent history, account/run IDs, device/IP/
location identifiers and free user text are never event fields or labels.
Metric collectors retain no raw event queue or individual samples. Progress and
audit-row histograms expose buckets with a final overflow bucket and no exact
sum; there is no cap/finisher category at row 350. Counts and sums that are
collected use canonical decimal strings, avoiding a counter wrap or float loss.

The separate `recordOptionalGameplay` path also requires a fresh trusted
`authorizeOptionalAnalytics(opaquePermit) === true` result for every input. Its
default is deny. The host binds this callback to the actual independent privacy,
guardian and current consent state. Skipping age, withdrawing analytics or an
authorization outage never blocks gameplay; they only prevent these optional
observations. The opaque permit is not serialized. A demographic answer cannot
make the callback permissive, and this slice performs no demographic upload,
aging, age-band join or small-group demographic report. CPI-019 private bands and
their withdrawal/deletion rules remain separate.

Optional sample counts describe consenting submissions, not every player; no
report may label them as a population-wide distance or age distribution. Unlinked
rollups retain no account-to-contribution map. Account deletion removes the
underlying private profile/consents/run records, and fresh permission checks stop
subsequent optional collection. The approved retention notice must explain any
already unlinked aggregate retention; this code does not claim a reversible
per-user erasure operation for anonymous rollups.

## Bounds, persistence and cost reporting

The collector retains at most 256 series by default (configurable 8–512), fixed
histogram buckets and scalar cumulative counters, irrespective of action
history. Cardinality exhaustion increments a dropped-series-observation counter;
it never allocates per-account tags. Only one sink flush may be in flight, with a
five-second default timeout. A failed/late flush cannot clear counters or create
an unbounded retry queue. The sink must replace/deduplicate cumulative snapshots
by their monotonic sequence within its trusted producer scope, never sum a retry
as another sample. The producer scope belongs to the deployment sink adapter,
not user-controlled metric labels.

Proposed deployed retention is 14 days for these unlinked operational/optional
rollups, with no raw event store; normal process memory disappears on process
exit. The injected external sink must implement that retention and access
control. Policy-change audit expires after 90 days via an operator-owned hourly
`purge_operations_audit` schedule. Neither external persistence nor scheduling is
activated here. Active game/reward ledgers have their independent recoverability
and CPI-031 deletion requirements: do not prune an active idempotency ledger as a
metrics cost shortcut.

Before launch, the operator's report must derive actual requests per acknowledged
action/active minute, retry fraction, p50/p95, handler runtime, DB reads/writes,
checkpoint bytes, retained action/receipt/reward growth and egress. Apply the
selected provider's actual prices and measured retention/replication overhead.
Configure an explicit monetary and storage budget; missing budgets are an alert,
not an assumption of free or unlimited resources. Keep ad duration separate from
active play and identify the accepted revive schedule (200 SP for 1–5, 150 SP for
6–10), exact ruleset, sample size and consent scope. SP arithmetic and loopback
HTTP measurements are not physical playtesting, production capacity, billable
runtime or revenue evidence.

## Proposed alert defaults and ownership

The acknowledged-action p50 ≤150 ms / p95 ≤250 ms targets and ≥200-action sample
come from [CPI-002's proposed device/deployed-server gates](../spikes/CPI-002-results.md).
They have not been demonstrated on launch-region phones. The following remaining
thresholds are explicit initial engineering proposals, not measured results or
previously accepted production SLOs. `evaluateOperationsAlerts` emits fixed codes
only; it never changes gameplay, bans a player, adjusts SP or activates a kill.

| Signal in an explicit window of at least five minutes | Warning | Critical |
| --- | --- | --- |
| Server errors, ≥200 requests | >1% | >5% |
| Acknowledged actions, ≥200 samples | p50 >150 ms or p95 >250 ms | p95 >600 ms |
| Oldest unresolved reward | >2 minutes | >10 minutes |
| Private checkpoint p95 | >16 KiB | Operator review; no automatic truncation |
| Measured cost or storage against an explicitly configured budget | ≥80% | ≥100% |
| Missing cost/storage budget | Configuration warning | Resolve before release approval |

Before activating monitoring, Georgi must appoint the release/on-call operator,
backup and notification destination and review actual provider budgets. The
source does not invent an email or silently send messages. The public support
contact and private security-report route remain **unconfigured release gates**;
publish and verify owner-provided destinations before submission. Do not request
passwords, OTPs, private exports or signed reward callbacks in public issues.

## Incident runbook

**Backend outage:** the on-call operator checks current build/source, deployment
and error/latency window, then disables *new* ranked/ad starts with a revisioned
policy change and an appropriate fixed maintenance code. Keep guest practice and
safe account export/deletion status available where their dependencies permit.
Do not reset runs or pretend unacknowledged requests failed. Preserve exact
idempotency retries and authoritative recovery. Check database capacity,
connection errors, deployment/configuration changes and provider health using
redacted diagnostics. Restore service on the known compatible build, verify a
staging start/action/recovery and increment policy revision to re-enable starts.

**Delayed SSV or provider issue:** disable new ad intents first, display
`reward_verification_delayed`, and retain each pending intent/grant/run. Check
signature-key availability, exact app/unit binding, callback delivery and
verification-delay counters without logging signed queries or identifiers.
Retry verification/reconciliation idempotently. Valid late callbacks must still
grant the original reward; no-fill is not player misconduct. Confirm one grant,
one application and unchanged score ties before re-enabling ads. There is no
automatic timeout that discards an earned continuation.

**Wrong ruleset deployment:** disable new ranked/ad starts, keep all unresolved
rulesets recoverable, and route users to a compatible client/server version.
Inspect the exact source commit, supported reducer versions, start policy and
immutable historical snapshots. Roll the service back only if the prior service
supports the current persisted schema/checkpoints; otherwise deploy a forward
compatibility fix. Never rewrite old result scores, countries, rulesets or the
200/150 policy of an existing run to fit a new deployment.

**Database recovery:** choose a verified provider backup/point-in-time restore on
an isolated target and rehearse it before a real incident. Check affected
accounts, deletion receipts, consumed reauthentication proofs, idempotency keys,
pending intents/provider transaction uniqueness, applied grants and immutable
results. Reconcile callbacks received after the restore point; do not create a
second grant. Reapply deletion/consent-withdrawal decisions that postdate the
backup before exposing restored data. Validate guest/A/B permissions and every
required catalog/runtime assertion, then cut over deliberately. Preserve a
reviewed forward-fix migration; do not reset the deployed CPI-017 database,
rewrite migration history or blindly run destructive down migrations.

**Mobile rollback:** server rollout can be stopped quickly; store binary
rollback is not immediate and cannot recall an already installed app. Use start
minimums, fixed maintenance messages and retained recovery compatibility while
the corrected signed binary passes review/distribution. A minimum-build change
must not erase confirmed results or earned rewards.

## Evidence and remaining release work

Unit tests exercise disabled collection, separate optional permission/withdrawal,
redaction, fixed cardinality, long histories, exact counters, resource/reward
buckets, bounded failed sinks, diagnostic failure isolation, policy parsing,
fixed transactional gate parameters, explicit HTTP status mounts and alert
boundaries. `backend/tests/operations.sql` proves default-disabled starts,
operator-only revisioned changes, trusted-build requirements, kill guards,
upsert/retry recovery, retained active rulesets, earned verification/application
and unchanged publication under maintenance. The SQL suite passed local
PostgreSQL WASM execution; actual PostgreSQL 17 CI remains a separate check.

The PostgreSQL ranked adapter now invokes required new-start and recovery gates
after the owner lock. Ranked actions and recovery use the original attempt's
ruleset; the separate recovery floor leaves compatible installed clients able
to settle their existing attempts when new starts are disabled. The reward
service defaults to the mandatory database gate for fresh eligibility before SDK
initialization, and again before a new intent. Direct grant application checks
recovery compatibility, while signed SSV and own status remain available.
Durable exact receipts are read before current policy checks, so a committed
request can still return its original acknowledgment after a control change.
Missing trusted build context fails closed. The approved trusted session/build
issuer is still an external release gate; a request body/header does not prove a
client build.

`backend/tests/operations-integration.mjs` exercises the actual fixed host router,
handlers, PostgreSQL adapter and mobile reward flow using synthetic keys. It
proves default-disabled starts, fixed maintenance/update/ruleset refusals, no
native initialization/load after a fresh ad kill, signed late SSV under a kill,
retained route and confirmed progress, direct-apply recovery floors, exact
receipt retries and publication under maintenance. A diagnostics sink failure
does not change those successful results. A bounded sink timeout keeps its one
occupied slot until the actual write settles; repeated flushes cannot queue
overlapping writes behind a hung sink.

Hosts must deliberately enable instrumentation only under the reviewed policy.
Required deployed drills
are backend outage, delayed/replayed owned-unit SSV, failed ruleset rollout,
backup/deletion replay and a long run under real provider load. Record actual
builds, devices, settings, windows, samples, costs and operator decisions. Hosted
alerts, support destinations and physical/beta evidence remain open; this source
slice does not claim CPI-032/037 or public-release readiness complete.
