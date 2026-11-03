# CPI-021 / CPI-022 — Mobile ranked consumption

The mobile ranked client and scene consume the [trusted server authority](CPI-021-022-ranked-authority.md).
They remain optional dependencies: without an explicitly injected approved
client, the application reports ranked play unavailable and guest practice keeps
working. No account capture, privacy approval, endpoint or deployment is enabled by
this implementation. This is source and integration work, not a claim of hosted or
physical-device acceptance.

## Confirmed progress only

`createRankedClient` requires HTTPS configuration and the existing authenticated
session owner. It sends fixed JSON POST requests to `/ranked/start`,
`/ranked/action`, `/ranked/recover` and `/ranked/active`. Credentials are bearer
headers, with cookies omitted, redirects prohibited, referrers disabled and caches
disabled. Neither account nor device identity is accepted in a request body.
The server owns ruleset, country mapping, time, resources, routes and publication.
An optional fixed `basePath`, such as `/cpi`, must match the client's configured
base URL. The authenticated handler validates and strips exactly that prefix;
requests cannot select another mount namespace.

The client strictly parses a bounded public response, rejects private/unknown
fields and preserves decimal row/sequence values as strings. Current panes,
hints, mystery consumption and SP change only after a valid authenticated server
response. There is no optimistic official progress, client-side ranked engine,
local countdown or local score upload. The scene sends heartbeats every three
seconds while active, within the authority's default ten-second connected window.

An unconfirmed request stays in memory with its exact serialized body, sequence,
idempotency key and lease capability. Retry resends that body. Offline transitions
abort local requests and stop input; they never finish or reset a run. Explicit
recovery can supersede an uncertain request by obtaining the authoritative state.
Responses cannot replace newer lease generations or sequences, change run/ruleset
identity, or move the frozen region snapshot. Old callbacks cannot act on a newer
displayed row/life.

## Restart and device recovery

Authenticated POST `/ranked/active` accepts only `{}` and returns either
`{status: 'none'}` or `{status: 'active', runId}` for the verified subject. It does
not expose a lease, rotate a lease, settle time, return private state or permit an
arbitrary account lookup. It uses the same trusted account/privacy authorization,
origin policy, bounded body and durable rate limits as all ranked routes.

The scene's explicit Recover action performs this lookup when it has no known run
ID, then requests the server checkpoint. This permits recovery after app restart
without storing identifiers or checkpoints in localStorage. A live lease held by
another device requires a separate explicit Take over action. Recovered runs start
paused and require Resume. Interruption, Save and leave, offline state and cleanup
never send End run; ending requires a visible confirmation.

## Account boundary

`AccountSessionOwner.accountScope()` exposes an opaque local object or null, with
no subject or token. It changes on account invalidation and remains stable through
a valid same-account refresh. Subscribers are notified synchronously on sign-out,
before remote revocation finishes. Ranked state and pending commands are cleared,
requests are aborted, and late A-account responses cannot appear under B. Pending
requests also remain covered by the owner's existing post-response account fence.

The client stores no auth credentials, ranked checkpoints or account associations
persistently and never reads or writes practice storage. The host must dispose old
clients when their approved dependency is removed. Session scope changes clear an
existing client immediately.

## Validation and remaining release gates

Tests cover strict private-field rejection, huge decimal values, confirmed-only
rendering, exact retries after a lost response, offline abort/late-response fencing,
lease takeover and stale-response fencing, active-run discovery after restart,
pending rewards, and synchronous A/B account isolation. Existing session lifecycle
tests still pass. Server tests verify minimal discovery is account-scoped and does
not change the checkpoint or lease.

The actual mobile client also runs through the real ranked HTTP handler and
PostgreSQL adapter under `service_role` in a disposable SQL integration suite.
It loses a response after the choice commits, retries the exact command without
duplicating progress, creates a fresh client with no local ID, discovers and
recovers the run, and verifies synchronous account clearing. A later run started
on another device replaces a stale finished view only after discovery and explicit
takeover. End publishes the immutable result inside the same database transaction;
publication failure rolls back finalization. SQL persistence preserves the
original creation timestamp across later heartbeat/recovery upserts instead of
proposing an invalid newer creation time before conflict resolution.

Trusted hosted token and device verification, reviewed account/guardian/privacy
eligibility, production origin/rate-limit configuration, signed native device
latency/interruption checks and live guest/A/B Data API checks remain required.
Rewarded ads are unavailable in this scene until CPI-028/029 supply verified grants
and the native ad/consent lifecycle. Local test fixtures are never ranked evidence.
