# CPI-021 / CPI-022 — Trusted ranked authority and recovery

This change supplies an executable server authority, a cryptographic private route
stream, a PostgreSQL repository and a bounded HTTP handler. It does not activate ranked play in
the mobile application. Account eligibility, reviewed privacy/guardian policy,
verified server authentication, trusted HTTP deployment, hosted A/B tests and
physical-device latency evidence must be verified
before ranked play is enabled. Passing a serialized repository fake is evidence of
the core contract, not evidence of hosted isolation or multi-process persistence.

## Authenticated boundary

`RankedAuthority` takes a trusted `RankedActor` from verified server authentication.
The subject and device identifier must never come from the JSON body. The device
identifier must be bound to the authenticated session/channel. A subject, device ID
or lease capability supplied by a client is not an authentication mechanism.

Start accepts only an idempotency key. The official ruleset is server configuration;
the server generates the run ID, independent 256-bit route and mystery keys and all
timestamps. A keyed HMAC-SHA256 counter stream makes the route deterministic for
recovery while keeping future draws unpredictable to a client that cannot read the
private checkpoint. The practice PRNG is rejected by ranked checkpoint validation.

Actions accept only a run ID, canonical decimal sequence, idempotency key, lease
capability and one allowlisted command. Choose/hint/mystery additionally bind the
displayed row and applied-revive life. Unknown properties are rejected, including
scores, clocks, checkpoints, rulesets, reward callbacks and client forfeitures.
There is no client grant or revive bypass. CPI-028/029 must supply a separately
verified reward integration before ranked advertising can be enabled.

The public projection contains resources, exact decimal progress, current visible
mystery/reveal state, at most two resolved history rows and active effects. It omits
the route buffer, future safe answers, RNG keys/cursors, future mystery cursor,
account identifiers and private profile data. Only a consumed hint reveals the
current safe side; previously resolved rows retain their already-public outcomes.
Regions come from the locked profile snapshot inside the start transaction and are
unchanged for the run.

## Durable transaction requirements

`RankedRepository.transaction(subject, callback)` must hold an account-level
database lock across the whole callback. This serializes simultaneous starts,
actions, recovery and takeover on all server processes. Checkpoint, monotonic
sequence, immutable region, idempotency receipt and audit event must commit together
or all roll back. The database must enforce one active run per subject and unique
account/idempotency keys and run/sequence values. A process-local lock or an
in-memory map does not satisfy this production contract.

`PostgresRankedRepository` uses an upsert and `FOR UPDATE` lock on the private
profile ownership row shared with profile edits. This serializes the first start
even before an active run exists, and the Auth foreign key coordinates deletion.
Run reads additionally lock the account-scoped run row. Checkpoints are JSONB and
their authoritative scalars are mirrored into `ranked_runs` in the same transaction.
An existing run cannot change owner, ruleset or region, and the adapter refuses to
rewrite a finished run. A failed write rolls back; failed rollback passes a fixed
error to `release(error)` so the host pool discards the broken connection.

Migration `20261104000200_cpi021_ranked_authority.sql` adds the authority markers,
one-active-run index and private receipt/action tables with forced RLS, scoped
ownership foreign keys and immutable records. It is a new proposed migration;
the already-deployed CPI-017 foundation remains unchanged. Applying the new
migrations to hosted environments is separate reviewed work.

The receipt fingerprints the normalized request, authenticated device, target run,
sequence and lease capability. Reusing a key with different content fails. An exact
retry returns the original response without advancing time, RNG, sequence or
resources. The database adapter must preserve string sequences and decimal scores
without conversion to JavaScript numbers or bounded 32-bit counters.

Checkpoint allocation remains at eight current/future rows and two history rows.
Audit events and receipts live separately from the active checkpoint. Retention and
cost enforcement belong to the durable deployment: retain receipts through the
recoverable life of a run, and preserve an explicit tombstone/rejection policy after
pruning so an old key cannot execute again. Do not truncate an active receipt
ledger without an agreed retry horizon and archival/rejection strategy.

## Leases, recovery and time

New runs and recoveries start paused. Explicit `resume` begins a server-issued
connected interval. An authenticated client sends ordered heartbeats while active
and `pause` on a known interruption. Defaults are a 10-second heartbeat window and
a 60-second ownership lease. The server counts elapsed time only up to the last
issued connected window; recovery settles due effects in that interval, freezes the
offline remainder and never advances distance. There is no idle death or special
finish at row 350. The server can legitimately apply ordinary due drain effects
within the previously issued window.

Actions arriving after the connected window require recovery instead of pretending
the connection remained live. Actions after lease expiry require recovery. Recovery
reads the bounded authoritative checkpoint and rotates the lease capability and
generation. A second authenticated device needs an explicit takeover while the old
lease is live; expiry permits recovery. The previous device is immediately fenced.
No client checkpoint can overwrite state or reroll the route.

The default minimum interval between accepted choice attempts is 100 ms, measured
by the server. This abuse/cadence configuration must be validated against the
CPI-002 physical latency budget; it is not a claim of bot detection or a measured
device result. Rate limits for start/recover/heartbeat and request sizes belong at
the authenticated HTTP boundary. A client that lies about foreground presence is
not completely detectable by the server; this design does not claim otherwise.

Receipt retries can return an older committed response after another action or
takeover. A network client must fence replies by run identity, lossless sequence,
lease generation and account session generation. The original response cannot
mutate the newer server state or revive an obsolete capability.

## Executed checks

The deterministic core suite covers concurrent start/sequence races; same-key
different-payload rejection; atomic rollback after a durable-write failure;
lost-response retries; another account and two-device takeover; lease expiry and
offline time; due drain death; one-time mystery consumption; hidden future/RNG
fields; pending-reward finalization refusal; 600-row progression and recovery; and
adjacent row/sequence values beyond JavaScript's safe integer boundary. Checkpoint
and response windows remain bounded through repeated generator batches.

These tests do not establish production Auth/HTTP behavior, deployed migration
correctness, signing or physical-device performance. Guest practice stays local and
does not become ranked evidence.

## HTTP host contract

`createRankedHandler` accepts fixed HTTPS POST routes `/ranked/start`,
`/ranked/action` and `/ranked/recover`. OPTIONS responses explicitly allow only
POST and the Authorization/Content-Type headers for an injected allowlisted
origin. Responses have `Cache-Control: no-store`; there are no cookies or wildcard
credentialed origins. Request bodies are read as bounded streams with a 4096-byte
budget before JSON parsing. Unexpected commands and URL query data are rejected.
Errors use fixed public codes and never echo verifier, database or credential text.

The host must inject trusted token verification that also supplies the device
binding and fresh `rankedAllowed` policy authorization, an explicit origin policy
and a durable shared rate limiter. There is no default verifier or always-allowed
privacy path. The handler does not issue tokens, register accounts, approve guardian
flows or configure a public endpoint. Its tests exercise real authority parsing and
capabilities through mock persistence; production Auth behavior still needs staging
and hosted guest/account A/B verification.

The separate PostgreSQL SQL suite verifies role grants/RLS, unique active ownership,
region immutability, required server timestamps, account/run receipt binding,
idempotency and exact adjacent sequences beyond `2^53`, plus deletion cascades.

## Real SQL integration gate

`backend/tests/server-integration.mjs` executes the actual profile HTTP handler and PostgreSQL ranked repository with independent `service_role` connections on the isolated CI PostgreSQL service. It checks concurrent starts and duplicate commands, durable exact response retries, atomic hints/active time, foreign-account denial, explicit device takeover and immutable finalization fields. It never contacts a hosted database. The same adapter scenario passed locally against PostgreSQL WASM; PostgreSQL 17 CI remains a separate required result.

The server routes can be mounted by a trusted host after its token-family and device verifier, current privacy/account policy authorization, explicit origin policy and durable limiter are supplied. They do not implement or activate the missing CPI-018 issuer. There is no client score import and no development reward bypass.
