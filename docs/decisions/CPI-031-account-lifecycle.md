# CPI-031 — Self export and durable account deletion

This slice implements server account-lifecycle routes and private PostgreSQL
storage. It does not deploy a web service, publish a deletion URL, activate
accounts, or claim completed store/privacy acceptance. Guest practice does not
require an account or demographic answer. Hosted account setup stays disabled
until the existing trusted privacy, guardian, OTP and session gates are verified.

## Reauthentication and native/web routes

`createAccountLifecycleHandler` provides fixed POST routes ending in
`/account/export`, `/account/delete` and `/account/status`, with allowlisted native
and HTTPS web origins, CORS preflight, no cookie shortcut, durable rate limits,
4 KiB streaming request limits and no-store responses. The host must mount these
actual routes on its approved service and publish the working web resource;
there is no invented or default deletion URL.

Export and deletion require the verified access-token subject and a separate
trusted issuer-signed, subject- and purpose-bound reauthentication proof. The
injected verifier must validate the actual issuer signature, issuer/audience,
nonce, eligibility and recent reauthentication ceremony. Evidence must be no
older than five minutes, cannot come from the future and expires within five
minutes of verification. A client cannot submit an owner ID, admin flag, consent
assertion, privacy context or exact age. The signed proof is kept in memory only;
PostgreSQL consumes its nonce fingerprint atomically with the operation. Reusing
it, including for another purpose/account, fails. SQL credentials are never
mobile credentials.

`consume_account_reauthentication` does not independently verify cryptographic
proofs: only the trusted server can execute it, after the verifier succeeds. All
private tables have RLS and FORCE RLS. Mobile roles have neither schema usage,
table access nor routine execution. The migration grants no broad Auth-table
delete privilege. Only the narrow private deletion-completion routine elevates
privilege to delete the already authorized account.

## Export contract

The export includes only the requester's public profile, private analytics band
and response time, independent privacy context, consent decisions, parental
authorization status, own run resource/progress summaries and own result
summaries. It omits email, OTP, tokens, proof material, guardian/evidence
references, route buffers, seeds, future answers, private anti-cheat checkpoints,
other users and staff audit references. Exact progress and active durations are
strings. Raw age does not exist in this schema or export.

Each consent, parental-authorization, run and result collection has a fixed
100-row keyset page with explicit `next` UUID cursors. Cursors never choose an
account; every query uses the freshly verified subject. Subsequent export
requests use fresh one-time subproofs issued from the same recent
reauthentication ceremony and the returned cursor object. The host must gather
pages until every `next` entry is null, deduplicating collection IDs where an
already completed collection repeats its first page. Each page records its own
export time; this is a paginated live export, not a claim of one database snapshot
across multiple HTTP requests. If the account changes during export, refresh the
export rather than claiming a frozen archive. Moderation/report extensions in
CPI-025 must add the requester's report collection to the same export flow.

An export is sensitive self-service information, not a public profile payload.
The app/web host must display or download it transiently with an explicit privacy
label. It must not put exports into localStorage, telemetry or shared caches.

## Durable deletion state

Deletion first commits one private `account_deletion_requests` row, returning an
opaque random receipt and `revocation_pending`. Repeated authorized requests
recover the same request. Database write guards then reject new/updated public
profiles, private demographic/consent/guardian data, country state, ranked runs,
audit/receipt records, rewards and new result publication for that account.
Guards use the shared owner-row lock. All ranked/publication writers must acquire
that owner lock before run locks, matching profile/deletion order.

`processAccountDeletion` is also a durable worker entry point. The host must run
a trusted scheduled worker over committed pending request IDs, so a process
crash or subsequently revoked access token cannot abandon the deletion. The
injected issuer transport must revoke **all** token families for the exact
subject, idempotently by receipt ID. It must return a durable acknowledgment
`{status: 'revoked', subject, operationId}`. A rejected, mismatched, missing or
timed-out acknowledgment leaves the request pending; the handler returns HTTP
202 and never claims deletion. Waiting is bounded (15 seconds by default), and a
late acknowledgment cannot trigger an unobserved purge after that timeout.

After a matching acknowledgment, one PostgreSQL transaction deletes the Auth
identity and all linked profiles, age/context/consent/guardian data, country
state, runs, private actions/checkpoints/receipts, reward intents/transactions/
grants, results, suppressions and target-linked moderation audit. CPI-017's
restricted reward-child foreign keys require explicit child deletion before the
Auth cascade; all of it rolls back together on error. Deletion removes the
account from every uncached leaderboard read model. A late reward callback has
no surviving foreign-key target and cannot recreate the deleted run/account.

Only a successful database commit returns `deleted`. Failed/uncertain completion
keeps a usable pending receipt; failed rollback/uncertain connections are
discarded. The completed receipt has only its random request ID and timestamps,
with no account/public ID or recoverable identity mapping. The status route
accepts the opaque receipt in a fixed POST body after tokens are revoked and
returns only pending/deleted/not-found plus timestamps. It exposes no identity
or account data and cannot create, resume or approve a deletion. Unknown or
expired receipts never count as proof of deletion.

## Retention, providers and release gates

Completed status receipts expire after 168 hours. Consumed proof fingerprints
expire with their at-most-five-minute proof lifetime; their account FK is set to
NULL during deletion. The trusted host must run
`purge_account_lifecycle_receipts()` at least hourly, bounding physical receipt
retention to the expiry plus one maintenance interval. Pending requests remain
until successfully processed and require an operational retry/alert owner.
They are not silently expired while the account still exists.

These operations cover the application database and the injected issuer's
acknowledged token-family revocation. They do not assert erasure of independently
retained provider delivery/security logs, ad-provider records, backups or store
data. The actual providers, purposes, retention periods and backup expiry must
be documented and verified by the approved hosted privacy/deletion integration.
No private demographic archive is created here. Hosted cache invalidation, actual
Supabase Auth cascades/session revocation, the public web resource and native
reauthentication/deletion must be demonstrated before CPI-031 is closed.

## Executed verification

The handler tests cover fresh subject/purpose-bound reauthentication, replay,
forged owner/age/consent/admin fields, export cursor binding, issuer failures,
wrong-subject/operation acknowledgments, durable worker recovery, truthful
status-only receipts, bounded waiting/streamed input, origin/bearer/limiter
enforcement, rollback failures and safe errors.

`backend/tests/account-lifecycle.sql` executes real schema assertions for private
permissions, pagination, export allowlists, exact large scores, proof replay,
pending-write/publication guards, A/B isolation, all gameplay/reward/profile
cascades, completed receipt anonymity, idempotent deletion and denial of a late
provider callback. The migration and SQL suite passed local PostgreSQL WASM
(PGlite) execution. PostgreSQL 17 CI and actual hosted/native/web acceptance are
separate evidence; no hosted data was changed by implementing this slice.

## Runtime integration evidence

`backend/tests/account-lifecycle-integration.mjs` executes the actual lifecycle HTTP handler and worker with the migrated database under service_role. It proves own-data export, failed remote revoke retaining a truthful pending status, database-enforced frozen writes, successful worker retry, idempotent completed receipt, public removal and preservation of accountB. The same path passed locally in PostgreSQL WASM; required PostgreSQL17 CI executes it independently. Test authentication and issuer callbacks are injected synthetic fixtures, not evidence that the external issuer is deployed or approved.
