# CPI-018 phase 2 — privacy eligibility before email OTP

Issue: [#18](https://github.com/georgi-cole/crystal-path-infinity/issues/18). Depends on CPI-017's verified **development** foundation and the protected native credential vault from PR #66.

## Delivery

- Add a user-visible account-intake area to Profile while preserving unrestricted guest practice, existing local checkpoints, and local-only best scores.
- The default is **unconfigured**: no email field, no auth requests, no token storage. This PR does not configure the new API origin in any environment and does not touch the hosted database.
- Introduce an injected, testable OTP flow. First ask a trusted service for a short-lived eligibility permit; only an explicitly eligible response reveals the email field. Server responses may instead require parental review or deny availability; unknown and corrupt replies fail closed. There is no client-only "I am an adult" bypass.
- Restrict the transport to a configured HTTPS base with no URL query, userinfo, or redirect. Send PII only in JSON request bodies to three fixed trusted routes. Refuse a public Supabase Auth endpoint, no access/refresh tokens in URLs, referrers, browser storage, or logs. Errors shown to the user contain only stable generic messages.
- Request a 6-digit OTP with a 60-second local resend throttle **in addition to required server rate limiting**, server-defined short expiry, cancellation-safe state revisions, and invalid/expired/offline handling.
- OTP verification currently ends in `verified_pending_session` with an explicit **not signed in** message; it must not attach a ranked identity or assert successful account recovery until the session owner/revocation slice is complete.

## Required trusted service contract — NOT deployed

`POST <VITE_ACCOUNT_API_BASE_URL>/eligibility` accepts only `{"schemaVersion":1}`. The backend independently resolves the country/jurisdiction and privacy/guardian eligibility using reviewed policy, never optional analytics. It returns either `{"status":"parental_review"}`, `{"status":"unavailable"}`, or an explicitly allowed `{"status":"eligible","permit":"<opaque>","policyVersion":"...","expiresAt":<epoch milliseconds>}` valid for no more than 15 minutes. Eligibility proof must be unforgeable, one-purpose, and bound to the reviewed policy and server-side context.

`POST <base>/otp/request` receives `{"schemaVersion":1,"email":"...","eligibilityPermit":"..."}` and must validate the permit, applicable parent authorization and jurisdiction **server-side before processing any email**. Return a uniform account-existence-independent `{"status":"accepted","expiresAt":<epoch milliseconds>}` only when appropriate. Rate-limit by user/IP/device with privacy-preserving abuse controls; the browser throttle is NOT an abuse defense. The server must handle the fact that Supabase's direct public OTP endpoint could otherwise bypass client gating: configure and verify the Auth Before User Created and Send Email hooks / blocked signup configuration, or keep public registration disabled until a reviewed equivalent control is installed. Never expose service-role credentials to the app.

`POST <base>/otp/verify` receives the same permit and email with six-digit `code`, returns only `{"status":"verified"}` for this preliminary contract. The session issuing flow, token rotation, true cross-device identity recovery and revocation remain separately gated and cannot be inferred from this response. Use neutral errors to avoid leaking whether an address is already registered.

## Operational/consent acceptance blockers

1. Legal/product review of jurisdiction-aware account consent, child/teen/unknown contexts, privacy notice, guardian verification and policy versioning. **No blanket 18+ restriction** and no requirement for optional age analytics to play practice.
2. Implement and deploy the trusted eligibility/OTP backend in an owner-approved isolated development environment with fail-closed Supabase Auth hooks and abuse prevention. A client-origin configuration flag is **not** proof of server authorization.
3. Implement native session owner using PR #66 vault: access tokens only in memory, rotating refresh token in Keychain/Keystore, secure logout/revocation and stale-request invalidation. Confirm Android/iOS restart, second device, OTP expiration and cross-account isolation.
4. Test hosted guest/user A/user B security and account existence non-disclosure; conduct actual provider email delivery and physical native-device tests. CPI-021 is required for ranked server authority; local practice results never become verified.
5. Do not deploy this UX to production with `VITE_ACCOUNT_API_BASE_URL` set until these criteria are signed off. No database migration or deployment is requested in this PR.

## Reference

Supabase Auth docs: https://supabase.com/docs/guides/auth/auth-email-passwordless, https://supabase.com/docs/guides/auth/rate-limits, https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook.
