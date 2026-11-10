# MVP account-scoped mobile integration

The application accepts an optional `ApprovedAccountServices` dependency. The
default `<App />` supplies none: startup remains bounded and offline, guest
practice needs no account, age response or analytics permission, and no remote
identity is restored automatically. The existing gated OTP intake remains
separate from this dependency; it cannot activate a session on its own.

An approved host supplies the verified session owner, fixed-route clients,
reviewed country catalog, and fresh reauthentication/export/deletion adapter.
Profile editing, verified play, reports and data controls require the current
opaque account scope. Sign-out rotates that scope synchronously. Each account
client/view also fences its own responses so a reused client cannot display an
earlier account's private profile, personal position, report activity or export.
The scope contains no user ID or credential and is never sent to the server.

The Play panel consumes only server-confirmed current-row data. It supports
ordered actions, explicit pause, exact lost-response retry, active-run discovery
after restart and explicit device takeover. It never imports local practice
state or applies a reward from a client callback. Leaving preserves the run;
only the explicit End action finalizes it. Confirmed finalization now publishes
the immutable result in the same PostgreSQL transaction. Recovery upserts retain
the original creation timestamp so later score timestamps satisfy constraints.

Rankings show only the matching ruleset/scope. Public-only memory snapshots can
be displayed offline with their timestamp; an own-account association is removed
on logout or scope changes. Reporting uses an accessible reason-only dialog;
ordinary mobile credentials cannot call the staff queue or decisions.

Settings expose explicit account deletion confirmation and transient private
export display/copy. No export is persisted or copied without a user action.
The host must gather every export page; incomplete pagination is rejected rather
than presented as a complete export. A pending revocation remains visibly pending,
and a failed retry cannot convert it into a successful deletion.

Server route adapters support an explicit validated mount prefix such as `/cpi`.
The matching HTTPS client base therefore works without a hidden path-rewriting
assumption. Each namespace remains fixed. Permission verifiers require an exact
`true`, not a truthy malformed response.

Validation includes the full mobile/core/server suites, all environment builds,
and actual mobile-client -> authenticated handler -> PostgreSQL execution under
`service_role`: server hints, a committed choice with a lost response, exact retry,
fresh-client discovery/recovery, automatic publication and A/B account clearing.
Original profile/ranked/leaderboard/lifecycle/moderation SQL assertions run in
migration order; current runtime integration runs after the full schema.

Browser inspection additionally verified the default guest profile has no
collection fields and that practice can start, advance a row and pause. This is
browser evidence, not physical-device or live-account acceptance.

No hosted database, Auth issuer, provider account or store release is deployed by
this change. Reviewed account/privacy/guardian services, real hosted A/B tests,
native ad/consent integration, physical-device latency/interruption evidence and
signed distribution remain release gates. The applied CPI-017 migration and its
original deployment guard are unchanged.

## Web signup preparation · 10 November 2026

The player home shows a Sign in action when its account host is configured.
New and returning players follow the same email-code flow after the existing
age and residence check. The Crystal Path issuer verifies the code before it
creates an account or starts a session. Browser credentials stay in the current
tab's memory. Native sessions use protected storage.

The web account binding supports profile, export and deletion. Guest crossings
use local practice. The phone review builds use their isolated local wallets.

Pages accepts the account flag only for publication from main. It checks the
fixed production gateway and exact Pages origin before building. The production
project is separate, but its current country allowlist is empty, so public signup
remains disabled until the policy and privacy-flow acceptance are complete. The
account configuration is public and contains no credential. Tester output does
not receive it. [Production setup](../RELEASE_SERVICES_SETUP_BG.md).

[Worldwide signup rollout review](../operations/WEB_SIGNUP_ROLLOUT.md)
