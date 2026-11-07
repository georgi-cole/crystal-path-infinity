# Live services host · 7 November 2026

Source candidate on `codex/mystery-pacts`; **not deployed production**. Continues [native preparation](NATIVE-SERVICES-2026-11.md). Owner setup: [Bulgarian release guide](../RELEASE_SERVICES_SETUP_BG.md).

## Isolation and accounts

`supabase/functions/cpi-live` is a separate Deno function using revocable opaque CPI sessions. Raw Supabase JWTs authorize nothing. The historical `cpi-api` and frozen CPI-017 deployment remain closed. An isolated project is required; the host rejects shared development project `jbyguybxhezjhdbenevh`. Runtime uses `cpi_runtime`, TLS and `SET ROLE service_role`, excluding bootstrap/admin credentials. Old `createEdgeSqlPool` callers retain their pinned development target.

Cloudflare forwards only to the fixed function, discards caller CPI/peer headers, derives country from `request.cf`, HMACs the peer and signs method/route/time/raw-body hash. The edge checks the signature and 60-second freshness. Provider callbacks verify their own signatures. Bodies and database connections/queries are bounded.

A neutral age/residency screen evaluates reviewed policy for both connecting country and declared residence before email intake. Exact age is not persisted. **This is not age assurance.** Analytics answers/client booleans grant no permission. Under-threshold/uncovered contexts remain guests. Guardian verification/external age assurance are **not implemented**; contexts requiring them stay closed pending provider selection and integration. There is no blanket 18+ game restriction.

Six-digit random OTPs have at most ten-minute expiry, a durable minute resend cooldown and five attempts. Failed attempts commit. HMAC-keyed address/peer limits are shared across instances. Purpose-bound AES-GCM protects mail payloads; delivery/expiry clears them. Resend uses a fixed HTTPS endpoint/idempotency key. Verified email reaches server-only Supabase admin lookup/create; public Auth signup/OTP providers must additionally be disabled and negatively tested.

One-use tickets issue random opaque credentials. Only HMACs persist. Access lasts 15 minutes; native refresh at most 30 days with a 90-day family limit. Web self-service is memory-only, with a 30-minute family limit. Device identity is server-issued. Build is bound at intake but **not platform-attested**; Play Integrity/App Attest are absent.

Rotation locks owner/family and retains an encrypted exact-response retry envelope for 60 seconds. Later reuse revokes the family, including successors. Logout via an earlier refresh also revokes the family. Current-policy checks and pending deletion close protected operations.

Fresh OTP reauthentication issues purpose/subject/family-bound one-use subproofs. Lifecycle SQL consumes each once. Export gathers/deduplicates every page, including commerce, sessions and assisted results, without raw receipts/tokens. Deletion revokes all CPI families before narrow SQL deletion completes. Identity/gameplay/session records cascade; minimal financial tombstones retain a random billing alias to prevent regrant. Retention/no-transfer-to-a-new-account behavior must be disclosed before launch. A pending server deletion continues independently of app process loss. The mobile client retains its status receipt during the operation. `account.html` provides separate web self-service without persistent credentials/ads/QA tools.

## Live rules and spending

New connected runs use **`infinity-v11-live`**, matching approved v11 balance: 50/50 tiles, 300 starting SP, −5 tile damage, 5–7-row mysteries and existing progressive clock. Historical v1 recovery selects its original authority; no checkpoint/result is rewritten. Business counters keep private checkpoint name `storeTest`; public output is an `economy` summary.

Ordinary game actions reject `test-resource`. The spend endpoint checks owner, version, device lease/generation, row/life, sequence, funds and idempotency. Owner → run → wallet locks commit debit, checkpoint, audit and receipt together. Failed effects do not debit; introductions/choices block spending. The 200 SP budget includes purchased-hint Marketing conversion. Early continues use ad or credit; slots 11–15 require credit. Restore sets 200 for the first five, then 150 SP. Half-point live SQL has no historical 400 ceiling; conditional constraints preserve old bounds. Assisted results have their own table and an additional guard against official publication.

## Commerce and ads

Current Google/Apple APIs verify evidence before delivery; immutable SKU mappings determine quantity/kind, including retired restore mappings. Sandbox/production do not mix. Apple Root G3 is copied from the pinned certificate and checked by hash.

Fingerprint advisory locks precede owner/wallet locks for delivery/refund. Refund-before-delivery blocks a racing/later grant. Delivery and encrypted acknowledgement job commit together; native finish follows durable delivery. The worker acknowledges Android transactions abandoned after network/app loss without consuming before delivery. Already-acknowledged restored worlds are not acknowledged twice. Opening the store retries unfinished paid transactions before prices load.

Apple V2 verifies both signed layers/app/environment. Refund/revoke removes resources/worlds; reversal restores what was removed. Effective timestamps prevent stale replay from undoing reversal. Shortfalls block wallet use pending review; revoked equipped worlds fall back to Obsidian unless another valid delivery owns them. Google Voided Purchases/Apple history polling use bounded pages, overlap, durable cursors and fenced leases. Failed pages do not advance. New-charge freshness uses **completed coverage**, not intermediate success, with both providers caught up within two hours and no newer failure. Recovery remains separate. Google RTDN push and Apple consumption-information responses are not implemented.

The authenticated minute worker processes bounded mail/completion batches, refund pages, deletion retries and expiry cleanup. Deployment must schedule/monitor it. Public errors omit provider bodies, addresses, receipts, keys and tokens. Worker failures expose job names/counts only.

Publisher SDK inventories are seeded **disabled/unreviewed**, Android 25.4.0 and iOS 13.11.0. No country approval is seeded. Runtime cannot approve inventory/Families/closeability/rollout tables. Initial permitted ads use G, child-directed, under-age-of-consent and non-personalized flags, with UMP before SDK init/request. No ATT or email/Auth UUID in custom data. These defaults are not territory/Families approval.

The reserved AdMob console nonce `00000000-0000-4000-8000-000000000000` validates a fresh signed matching callback and returns `verified-no-reward`; SQL/service prohibit using it for player intents. Normal callbacks preserve signed bytes and require durable matching intents. Console verification, demo SDK videos and synthetic SSV fixtures are distinct evidence, never real paid impressions.

## Deployment and validation

Preparation creates ignored secrets and an unconfirmed 36-row SKU mapping. Secret export excludes reserved Supabase/bootstrap fields. Redacted readiness checks cover schema/RLS, rollout, mail DNS and completed reconciliation. The gateway/account page require HTTPS hosting; unsigned preparation still forbids live configuration; QA tools remain separate.

Outstanding release requirements: owner agreements/payment profiles, isolated projects/credentials, verified mail/support DNS, real products, country/privacy/guardian decisions, scheduled/monitored jobs, callbacks and real-device internal/sandbox acceptance. A passing build does not satisfy them.

Validation results are added after completion. Prior native evidence on `d3a3f4c` remains historical in the native-services decision. Automated mail/provider/receipt/SSV events are synthetic.

Local validation, 7 November 2026: Node 24.22.1; typecheck, ESLint and Prettier passed; 684 mobile, 310 game-core and 183 server tests passed; 6 balance, 3 gateway, 15 CI-routing and 13 planning tests passed. Development, staging, QA and production web builds passed. Deno 2.9.6 compiled the new function and passed two closed-default smoke tests with environment/network/filesystem access denied. The readiness command correctly reported missing project, DB, platform-service and outgoing-mail configuration with live activation false, without printing secret values. Independent PostgreSQL 17/native evidence will be recorded when the new CI run completes.
