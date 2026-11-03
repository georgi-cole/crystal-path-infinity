# CPI-018 Phase 3 — session owner, rotation, local fencing and revocation contract

Status: **code and mock-backed tests only; no live account or trusted backend connected**. Related issue: [CPI-018 #18](https://github.com/georgi-cole/crystal-path-infinity/issues/18). Built upon the native Keychain/Keystore refresh vault of [PR #66](https://github.com/georgi-cole/crystal-path-infinity/pull/66) and the privacy-gated OTP intake of [PR #67](https://github.com/georgi-cole/crystal-path-infinity/pull/67).

## What this adds

- `AccountSessionOwner` is a deliberately **injected**, side-effect-free credential owner. Its constructor does not read native storage, contact a server, collect email or start an account. The existing Profile form continues to end at `verified_pending_session`, explicitly **not signed in**. Local guest practice, boot timing, checkpoint keys and rankings are unaffected.
- `exchangeVerifiedTicket` requires a server-issued, one-time, opaque ticket; a client-side OTP success flag is **never** sufficient. The trusted server must validate the privacy/guardian permit and OTP before issuing a ticket. An authenticated state is accepted only after a validated server response and successful protected native refresh-token write.
- Access token is **memory only**; the native vault persists only an opaque rotating refresh credential. The public session snapshot contains a phase and expiration, **no account ID, email, access/refresh token or scores**. A web build has no persistent vault and cannot establish a recoverable session.
- `restore` is explicitly invoked after the account infrastructure is configured, **never during offline practice startup**. It exchanges a stored refresh token for a rotated token and memory-only access token. A server transient failure leaves no authenticated state and can be retried without overwriting the encrypted token.
- Refresh rejects **same-token nonrotation** and a change in account subject. All vault writes/clears are serialized. Failed writes fail closed, attempt local cleanup, and trigger best-effort server revocation.
- `withAccountRequest` gives an approved service a short-lived in-memory bearer and abort signal; logout immediately fences all requests. A returned A-account result after logout or identity change is rejected, even if an HTTP call was already in flight.
- `signOut` immediately drops access, clears the protected vault, then awaits explicit `{"status":"revoked"}` from the server. Failure is **`revocation_unconfirmed`**, never a false success. It can be retried in the current app process, but a crash after local clear can lose the pending retry. Server-side token-family revocation, expiry and authoritative authorization are essential; client cancellation cannot undo an already accepted server mutation.
- The separately configurable HTTPS `SessionTransport` uses fixed `/session/exchange`, `/session/refresh`, `/session/revoke` routes under the trusted account base, with POST JSON bodies, no cookies, no redirects, no referrer, no response caching, no credential URLs, no raw error forwarding. The factory returns `null` without a configured base.

## Contract for future trusted backend (not deployed)

1. `POST /session/exchange` receives `{"schemaVersion":1,"verifiedTicket":"..."}`. The backend must consume the short-lived **single-use** ticket that was issued only after compliant OTP/eligibility/guardian verification. The client cannot mint it. The backend returns `{"status":"active","subject":"<auth UUID>","accessToken":"...","refreshToken":"...","expiresAt":<epoch ms>}`.
2. `POST /session/refresh` receives the old opaque refresh credential. The backend validates session status, expiry, subject, rotation history and revocation, and **atomically rotates** the refresh credential; it returns the same account identity and a bounded new access expiry.
3. `POST /session/revoke` receives a refresh credential. The backend revokes its **entire token family**, including a concurrently issued successor, and returns `{"status":"revoked"}`. It must reject future mutation requests bearing revoked credentials or failing per-user authorization. Idempotent revoke semantics should be supported.
4. The policy/parental-review and Supabase Auth hooks described in [Phase 2](CPI-018-privacy-otp.md) remain **hard blockers**. A client-side permission switch or a publishable Supabase key alone is not enforcement. Do not configure/enable real email collection or ranked play before server-side gates and legal/product review.
5. The server response is trusted only over an owner-approved HTTPS origin. Use distinct development/staging/production account endpoints and secrets. Never put server keys or a service-role key into `VITE_*`, native assets or logs.

## What CI demonstrates and what it cannot

Mocked native stores and trusted gateways cover bogus responses, invalid proof, restart restoration, credential rotation, concurrent refresh de-duplication, wrong-account responses, logout during an in-flight request or refresh, storage failure, revocation failure/retry, and independent devices/account A/B. Network tests verify the exact fixed HTTPS endpoints, no token query parameters and generic failures.

This is **not** a live authentication acceptance test, parent-authorization test, Supabase token validation test, native physical-device secure storage proof, or cross-device account recovery proof. After approved backend implementation, require real OTP, same-account second-device restoration, actual native kill/restart and logout/revocation, server-side A/B negative access cases, and abuse/rate-limit testing. CPI-021 remains the only prospective source of verified ranked results. Do not convert any local practice checkpoint into an official score.

The already deployed CPI-017 foundation is unchanged. No migration, hosted SQL or environment credential changes are included in this PR.
