# CPI-023 — immutable results and scoped leaderboard reads

This migration prepares the database implementation of verified personal bests and World/Continent/Country reads. It does not deploy a migration or enable ranked accounts. The trusted account backend, authoritative run adapter, reward verification, hosted guest/account A/B tests, and physical-device acceptance remain separate gates. Guest practice and its local scores are unchanged.

## Authority and finalization

`cpi_private.publish_ranked_result(run_id)` accepts a run identifier only. It copies score, revives used to reach that score, server achievement time, ruleset and the original country/continent/mapping snapshot from the existing server-owned run. The caller cannot supply score or timestamps to this function. Its execution privilege belongs only to `service_role`; it is not a public Supabase RPC and must never be exposed to a client with server credentials.

The authoritative adapter must set `server_validated` only after validating and durably committing the run against the shared ranked rules. Merely creating a database run does not provide that proof. `achieved_at` is the server time of the progress that produced the credited score, not the finalization time or a client timestamp. A later revive without progress must not change it or `revives_to_reach_score`.

Publication locks the owner and then re-reads and locks the source run, matching the common ranked/account-deletion lock order. It requires an explicit finished state, validated authority, a locked region snapshot and a valid score achievement time. Pending reward verification and unconsumed grants block publication. Every command/reward writer must use the same owner/run locks before writing, so a finalizer cannot race a new pending reward. A recoverable death is not a finished result. Earned continuations must be applied or explicitly forfeited first. A zero-score result can be retained privately but receives no ranking position.

Publication is idempotent: retrying returns the same copied result without another insert. Updates to final results are rejected, even by ordinary trusted writes. Visibility changes are separate. Legacy foundation records have no `published_at`; reads exclude them and publishing over them demands explicit review. They do not silently become verified. Direct result insert/update/delete/truncate privileges are removed from `service_role`; the guarded publisher owns the insert. Account/run foreign-key cascades still remove deleted data.

## Ranking and scopes

`cpi_private.read_leaderboard(ruleset, scope, region, mapping_version, own_user)` returns a single database snapshot. Its `own_user` argument must come from the authenticated server identity, never a user-supplied account ID. This service-only function returns:

- At most 100 entries, total eligible-account count, the caller's own entry and up to two neighbors on each side, including the own entry.
- Ruleset, scope, region and requested mapping version, plus `updatedAt` as the database statement's snapshot-generation time. No persistent cache is claimed.
- Opaque public player ID, current public username, run country/continent/mapping snapshot, exact cleared-row string, revive tie-break value and server achievement time.

It returns no Auth UUID, age band, privacy/consent history, email, private checkpoint, route, RNG, session credentials or unverified pending result. Rank and count are decimal strings as well as the score, so an adapter cannot accidentally serialize a large database integer through an imprecise JavaScript number.

Eligible results sort by numeric cleared rows descending, revives used to reach score ascending, server achievement time ascending, then stable public player ID and run ID. Each account first selects its best eligible run within the requested scope, using run ID as its stable final tie-break. PostgreSQL `numeric` compares the canonical decimal strings exactly, including the 1,000-digit storage bound. There is no 350-row cap or finisher category.

World selects the best run across country snapshots for one ruleset and requires no regional arguments. Country/continent requests require an explicit mapping version. A changed country never moves old runs: the old country can retain its old regional best while the new country uses a new run. Europe includes countries outside the EU. Missing declared country still permits a World result but no fabricated regional entry. Mapping versions and rulesets never mix implicitly.

Bests and ranks are selected together in one MVCC statement from immutable results. There is no separately updated best pointer that can lose a concurrent better finalization. Concurrent publication on one run serializes on its row; publication of different runs becomes visible atomically as each transaction commits. Appropriate ruleset/numeric-order and regional indexes support this first implementation; production load/cost acceptance still requires measurement and a subsequent reviewed cache strategy if necessary.

## Visibility and deletion

The private suppression hook can hide a confirmed invalid run or every run of a public player without changing score history. The same predicate runs in every scope and can expose the next eligible personal best. Each change records an opaque operator reference and fixed reason code. Only the server role may call it. CPI-025 still must implement and verify staff authorization, rate-limited reports, review procedures and tooling before a moderation endpoint is live.

Reads have no independent stale cache: suppression, restoration and account deletion affect all subsequent database snapshots. Deletion cascades remove results, suppression records and the corresponding moderation identifiers. Retention/backups and the actual deletion/export service remain CPI-031 work.

## Verification

`backend/tests/leaderboards.sql` runs in a transaction and rolls back its fixtures. It checks 105 accounts, own rank 101 and its neighbors, numeric rather than lexical ordering, adjacent values above IEEE-754 and at 1,000 digits, all tie-breaks, one place per account, old/new country results, World-only missing country, distinct mapping/ruleset scopes, zero-score exclusion, empty states, idempotency, immutable results, pending/dead/unvalidated guards, unused-grant handling, consistent suppression/restore, account deletion cascades and client/service privilege boundaries.

These tests use independent authoritative-storage fixtures. They are not evidence of a real user finishing a hosted ranked run, live Google SSV, hosted authorization, physical devices, store readiness or production performance. Required PostgreSQL CI and the existing application/native aggregate must pass before review.

## Mobile and HTTP read integration

The menu accepts an explicitly injected leaderboard client and the approved profile country catalog. Without one, the existing unavailable/guest-practice experience remains. The verified table implements World, continent and declared-country filters, Top100, personal rank and neighbors outside100, pending personal-result explanation, large decimal rows and explicit offline/cached/error states. Public-only bounded memory caching never retains an own-account association; filter/client changes fence stale responses. No country is inferred from language or device location.

The server read route requires an explicit allowed ruleset/mapping list, public-read policy, origin policy and durable limiter. An optional verified bearer provides only that account's own position; a bad bearer cannot fall back to a public request. A single SQL snapshot supplies count, ranks, neighbors and metadata without a stale shared server cache.

`backend/tests/leaderboard-integration.mjs` proves the positive path using actual ranked commands and the PostgreSQL adapter: hint, clear row1, device takeover, final end, guarded publication and guest/owner World, Europe and Bulgaria reads. It also verifies immutable publish retry and excludes auth IDs/private fields. The same scenario passed locally under service_role with PostgreSQL WASM; required PostgreSQL17 CI repeats it on actual independent connections.

## 9 November 2026 · Active ranked board and scope controls

The game menu queries `infinity-v11-live` for new verified crossings. Existing v1 results stay in their separate dataset. World, Continent and Country appear once as filter options, with a screen-reader legend. Country filtering falls back to the game's ISO country list when the account service has no narrower list. A pending reward attempt still has no published result.
