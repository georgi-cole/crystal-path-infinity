# Supabase Edge integration — development, closed services

The `cpi-api` function is a deployable **locked host**, not an enabled account issuer.
Its entry returns `service_unavailable` for all known account/game/ad operations.
It does not initialize the database driver, fetch Auth, read incoming email bodies,
issue tokens, approve privacy, start ranked play or initialize ads. Successful SMTP
and a received code establish email delivery only. The current mobile app continues
guest practice with no live account base URL or ad provider.

## What is integrated

- The actual `createMvpServer` routes run under `/cpi-api` and the external
  `/functions/v1/cpi-api` mount. Unknown mounts fail. Requests retain their original
  identity; there is no arbitrary URL proxy or public Supabase Auth proxy.
- Origin allowlisting, bounded preflight, no cookies/credential queries, fixed errors
  and no-store responses apply before dispatch. No request/response/credential logging
  is added. The hosted gateway must also have request-body logging disabled.
- `createSupabaseIdentityVerifier` verifies an access token with the fixed development
  project's `/auth/v1/user` endpoint. It bounds reply size/time, refuses redirects,
  anonymous users, unconfirmed email and malformed identities, and ignores user metadata.
  **Identity alone is not privacy authorization or session-family revocation proof.**
- `createApprovedEdgeServices` composes the real profile and authenticated leaderboard
  handlers only when a host explicitly injects an independent current policy/revocation
  checker and shared durable limiter. Neither dependency is invented by this PR. The
  deployed entry does not inject them. No environment toggle can open account/ad routes.
- A Deno-compatible pinned `pg` adapter connects only to this development project's
  direct or **session** pooler on port 5432 with certificate verification and deadlines.
  It selects/verifies `service_role` before exposing a connection and closes every
  connection on release (including uncertain transactions). It does not reuse elevated
  session state. The four-client bound is resource protection, not a durable rate limiter.
  Do not use transaction pooling (6543), URL TLS overrides, or a mobile database secret.

## Current hosted state and prerequisites

Development project: `jbyguybxhezjhdbenevh`, renamed DEV, Ireland. Only CPI-017 is
known deployed; later merged migrations are **not** assumed applied. This PR does not
change hosted SQL or deployment history. Before enabling any approved service,
review/apply subsequent migrations with a separately reviewed incremental deployment
and rerun real guest/A/B checks. Do not rerun the old CPI-017 empty-database deployment.

Public/anonymous signups remain disabled. Local `config.toml` now matches that policy,
requires email confirmation and uses 6-digit/600-second OTPs. This file does **not**
push Auth settings to the hosted project. Do not use `supabase config push` here.

Owner-confirmed setup in this chat: `auth.kolequant.xyz` is verified in Resend; its
three public DNS records were independently checked. SMTP was saved in Supabase and
the owner received both invitation and code emails. The SMTP key remains solely in
the provider/Supabase secret UI; no credential belongs in this repository or logs.

## Deployment handoff (not executed by this PR)

After this PR is reviewed, merged and its exact `main` CI passes, deploy only the
locked entry using an appropriately scoped **development** deployment credential:

```sh
supabase functions deploy cpi-api --project-ref jbyguybxhezjhdbenevh
```

Run from the reviewed checkout. The checked-in per-function config retains
`verify_jwt = true`; **do not pass `--no-verify-jwt`**. Current Supabase asymmetric
tokens may be rejected by the legacy gateway; while the function is closed, that
is an intentional additional block, not permission to turn verification off. A later
reviewed issuer entry must establish application verification before changing that
gateway. Public OTP/SSV routes will need their own reviewed gateway treatment.

Platform-provided `SUPABASE_URL` must exactly match the pinned project.
`SUPABASE_ANON_KEY` is used only by the identity-verifier factory when approved
services are later composed. Optional `CPI_ALLOWED_ORIGINS` is a comma-separated
exact allowlist (for example `capacitor://localhost`). Empty means no browser origins.
No database or Resend secret is needed by the locked entry. Do not create another
Supabase project, change passwords, expose `cpi_private`/`auth`, or enable signups/ads.

The Postgres factory is available for later approved composition, with its private
connection string passed from managed function secrets. It is not imported by the
locked entry. The database password is privileged; the adapter restricts runtime
queries to `service_role`, but the secret itself must stay exclusively server-side.

## Validation and remaining work

Required CI now checks the actual imports/entry/Postgres factory with pinned Deno
2.9.6, executes Deno handler smoke tests without network/environment/filesystem
permissions, and runs adversarial adapter tests and real PostgreSQL17 A/B integration
through the existing server profile handlers. These tests use synthetic provider
responses/policy approvals, never real emails or production keys. Deno dependencies
are pinned in `deno.json` and integrity-locked in `deno.lock`.

This does not complete CPI-018 live account acceptance. Remaining work includes the
approved jurisdiction/guardian policy, durable abuse controls, OTP eligibility and
one-time exchange tickets, refresh-family rotation/revocation and reauthentication,
issuer lifecycle integration, hosted A/B security and physical-device tests. No real
user's eligibility is inferred from analytics, a manual test account or an Auth JWT.
Ranked and reward/SSV composition, native ad SDKs, signing and store release also stay
gated. Ad/reward callbacks must not be enabled on this locked host.

## Direct links

- [Development Edge Functions](https://supabase.com/dashboard/project/jbyguybxhezjhdbenevh/functions)
- [Development function secrets](https://supabase.com/dashboard/project/jbyguybxhezjhdbenevh/functions/secrets)
- [Development Auth settings](https://supabase.com/dashboard/project/jbyguybxhezjhdbenevh/auth/providers)
- [Function configuration](https://supabase.com/docs/guides/functions/function-configuration)
- [Node/npm compatibility](https://supabase.com/blog/edge-functions-node-npm)
- [Database connections](https://supabase.com/docs/guides/functions/connect-to-postgres)
- [Server-verified users](https://supabase.com/docs/reference/javascript/auth-getuser)
