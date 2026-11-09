# CPI-026 / CPI-028 — Privacy-gated verified rewarded continuations

This source adds trusted eligibility, intent, Google SSV verification and atomic
grant/application services. It installs no native ad SDK, configures no provider
account, issues no privacy approval and performs no hosted deployment. There are
no seeded ad configurations or authorizations: every ad flow is unavailable until
the operator supplies reviewed policy and actual SDK/provider configuration.
Guest practice remains available without an account or demographic response.

## Separate privacy authority

The trusted privacy service must issue a short-lived `reward_authorizations` row
for the authenticated subject, exact platform/configuration, policy version,
privacy context, verified prerequisites and request signals. The gameplay runtime
has only read access to authorizations and configurations; it cannot approve its
own eligibility. A narrow server-only SQL function holds shared locks while
checking a permit without granting that approval privilege to the runtime.

Eligibility checks the independent `profiles_private.privacy_context`, context
update time, permit expiry/revocation and later ad consent withdrawal. It never
reads `analytics_age_band`. A demographic answer, skip or correction cannot grant
ad permission. Child/unknown contexts default unavailable; a specifically reviewed
configuration can permit them only with child-directed and under-age-of-consent
signals, G content, non-personalized requests and explicit Families/closeability
review. This is not an adult-only product gate. Applicable market, guardian and
consent determinations still belong to the reviewed privacy service, not this
schema or a mobile boolean.

The client receives only a fresh, own-account permit with policy version, expiry,
exact SDK/mediation inventory and explicit request flags. Tracking configurations
are unsupported in this slice. Actual UMP/privacy-options behavior, withdrawal on
devices, Families self-certification, ATT where relevant, native closeability and
physical network-payload verification remain release gates. An injected operations
gate can additionally stop fresh eligibility and new intent creation. Existing
pending/status/callback/application operations do not depend on new-ad availability.

**Native test follow-up · 9 November 2026.** An approved ten-minute server
authorization could exceed the client's five-minute limit. The eligibility API
caps the returned permit at four minutes and preserves any earlier expiry.
The server still checks authorization before each intent and settles signed
callbacks through the existing reward flow.

## Intent and reward lifecycle

The native flow must load the approved ad before requesting an intent. A true
no-fill or load failure therefore leaves the dead run at its offer without
creating an ambiguous obligation. After load, a deliberate user choice obtains a
fresh intent immediately before showing. Google permits setting custom SSV data
on a loaded ad before display. [Google custom-data instructions](https://developers.google.com/admob/android/ssv#custom_data).

One intent binds an authenticated account's current authoritative run/death,
immutable ruleset, next applied ordinal, fixed SP and a random nonce. Only the
nonce is passed as `custom_data`; no Auth UUID, email, age, route seed or `user_id`
is sent to the provider. The service fixes SP to 200 for ordinals 1–5 and 150 for
6–10, independent of provider reward amount. Duplicate intent requests return the
same response, and a different request for that death cannot create a second ad
obligation. Starting an intent marks the actual core checkpoint pending and pauses
it, preventing premature finalization.

`expiresAt` is the **before-display freshness deadline**. A client must not begin
display with an expired authorization. It is not an earning or callback settlement
deadline: a long legitimate ad, lock/unlock, slow return or late provider delivery
must retain an owed grant. A verified earned timestamp must not predate the intent
or lie in the future beyond five seconds of clock tolerance. It is not rejected
merely for being received late or after the display deadline. A signed callback
cannot prove that a malicious SDK obeyed every display/privacy timing requirement;
the native gate and reviewed integration remain necessary.

## Cryptographic provider boundary

Google's protocol signs the original query prefix before the final `signature`
and `key_id` parameters. The verifier preserves those bytes and verifies ECDSA
SHA-256 with a P-256 key. It rejects duplicate/unexpected parameters, altered
encoding, unexpected `user_id`, malformed numbers and ambiguous signatures.
Key retrieval uses only the fixed Google HTTPS key URL, disables redirects and
cookies, bounds the document and refresh rate, and expires its cache after 20
hours. Google documents a maximum cache duration of 24 hours. [Google SSV verification and key rotation](https://developers.google.com/admob/android/ssv#manual_verification_of_rewarded_ssv).

The verified event must match the intent's snapshotted environment, exact ad unit,
allowlisted ad network, reward amount/item and nonce. Production configuration
rejects the whole Google demo publisher prefix. Native test units and local signed
fixtures do not constitute production ranked evidence. Configurations contain no
default units and cannot be changed by the gameplay runtime.

The host must preserve the original callback request target and disable raw URL,
query, signature and credential access logging on the SSV route. The database
stores only a signed-prefix SHA-256 digest plus the minimal provider transaction
identifier and timestamps, not raw URLs/signatures. HTTP failures expose fixed
codes, and neither optional analytics nor a client `earned` callback creates a
grant. Local callback signals only prompt a status check.

## Atomicity, recovery and application

Every account mutation locks the same profile-owner row and then the run row.
Signature verification precedes nonce lookup. In one transaction, an accepted
callback records the globally unique provider transaction, changes its one intent
to verified, creates one grant and executes the actual core `grant-revive`
transition. Checkpoint, mirrored counters and audit event commit together. A replay
with changed content or a transaction reused for another intent fails; duplicates
of the same event return success without incrementing a counter. Maximum grants
remain ten. Revocation after a legitimate ad does not erase an owed grant.

Application is a separate authenticated POST with run/grant identity, idempotency
key, current lease token and lossless sequence. The server checks current device,
lease, sequence, death, ordinal, ruleset and fixed SP from its ledger, then executes
the actual `apply-revive` transition. It atomically marks the grant applied, updates
the checkpoint and counters and records the exact retry response. SP is assigned,
not added. Hints, consumed mystery, row, prior score tie metadata and run policy
survive; effects clear. The resulting run remains paused until explicit resume
after the full-screen ad has closed. An ad can outlast the ranked lease: recover
the same device first; another live device requires explicit takeover, and the
grant remains owed while that decision is pending.

New migration 006 also corrects the foundation reward-ledger foreign keys so
account/run deletion actually cascades through transaction and grant history.
Deleting/revoking a policy permit cannot silently erase a retained owed intent.
The already-applied CPI-017 migration is unchanged. Permit/receipt retention and
scheduled cleanup need an operator-approved policy; active recoverable obligations
must not be pruned by a generic TTL job.

Ambiguous post-show failures remain pending and unpublished. A detached saved
pending run and bounded recovery-list path are being implemented separately for
CPI-030; this slice alone does not claim that acceptance complete. No timeout
automatically forfeits a legitimate reward or rewrites a finalized result.

## Own-account export

The reauthenticated account export now requires two additional independent pages:
`rewards` and `adAuthorizations`, with `reward` and `adAuthorization` cursors.
Each contains at most 100 own records. Reward pages summarize intent/grant states,
ordinals, fixed SP and event times; authorization pages summarize policy/context,
request flags, validity/revocation and SDK inventory. They omit nonce/custom data,
verification references, raw signatures, provider queries, Auth IDs and private
checkpoints. SQL scopes both collections to the verified subject and the HTTP
consumer rebuilds only allowed fields. Missing or malformed export functions fail
the whole page instead of silently omitting user-owned data. Pagination and
another account's exclusion are checked against the actual SQL functions.

## Executed evidence

Unit tests verify exact raw signatures, altered/duplicate queries, wrong keys,
unknown-key rotation, cache expiry/outage, bounded documents and HTTP/auth/input
boundaries. Disposable PostgreSQL tests check private grants/RLS, configuration
approval separation, restrictive unknown policy, analytics independence, wrong
platform/environment and withdrawal.

The actual HTTP/service/PostgreSQL integration uses **local generated signing
keys and clearly synthetic Google-shaped fixtures**, not a provider account. It
checks ten intents/grants/applications, races and duplicate callbacks, wrong unit
and timestamps, a long ad plus delayed delivery, revoked eligibility after earning,
same-device lease recovery, exact retries, 200→150 SP at 5→6, immutable score ties,
final death after ten continuations, one published result and deletion cascades.
Live AdMob test SSV, reviewed native privacy/SDK configuration and physical-device
advertising/recovery measurements remain external release evidence.
