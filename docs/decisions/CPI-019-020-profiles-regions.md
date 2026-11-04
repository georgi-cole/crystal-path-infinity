# CPI-019 + CPI-020 — Profiles and declared regional history

This implementation combines the shared profile transaction, country selector
configuration and immutable ranked-region foundation. It is a proposed follow-up
migration to the already deployed CPI-017 schema. It does not deploy anything,
rerun CPI-017, activate account capture, issue analytics permission, or create
verified results. Guest practice remains independent of all profile fields.

## Trusted profile boundary

`cpi_private.save_profile(user_id, username, country_code, analytics_action,
analytics_age_band)` is a **service-role-only, security-invoker** transaction.
The HTTP account service must authenticate the subject and apply its trusted
account/privacy eligibility before using the verified subject as `user_id`.
Never pass a client-supplied owner identifier through to this routine. No
`anon`/`authenticated` role receives private schema usage, table access or
function execution. Private tables have RLS and FORCE RLS. The public profile
table keeps exactly its original five publishable columns.

Usernames are NFKC-normalized, trimmed and converted to lowercase ASCII aliases:
3–24 letters, digits or underscores. Full-width ASCII normalizes consistently;
other Unicode, invisible/control characters, punctuation and email-like names
are rejected. Reserved official/admin/support names and their selected prefixes
are rejected. The existing unique index enforces normalized uniqueness across
concurrent transactions. A failed update rolls back the entire statement,
including owner/profile/analytics/country changes. Repeated edits preserve the
same opaque public ID and never create an Auth account.

The public result is an explicit allowlist: `public_id`, `username`,
`country_code`, `created_at`, `updated_at`. It contains no login UUID, email,
analytics age band, privacy context or consent evidence. The separate
`get_profile_owner(user_id)` service response contains that public object as
`profile`, plus the owner's `analyticsAgeBand`, `ageResponseAt`,
`analyticsAllowed` and `countryChangeAvailableAt`. An account without a profile
returns SQL NULL; the account API maps this to its documented onboarding state.
This owner response must never be used as the public profile or leaderboard
response.

Stable validation errors are `CPI_PROFILE_USERNAME_INVALID`,
`CPI_PROFILE_USERNAME_RESERVED`, `CPI_PROFILE_USERNAME_TAKEN`,
`CPI_PROFILE_COUNTRY_UNSUPPORTED`, `CPI_PROFILE_COUNTRY_COOLDOWN`,
`CPI_PROFILE_ANALYTICS_ACTION_INVALID`, `CPI_PROFILE_BAND_INVALID` and
`CPI_PROFILE_ANALYTICS_NOT_ALLOWED`. They contain no submitted personal values.
The trusted HTTP adapter maps them to localized validation messages and does not
log request bodies or raw database errors.

## Optional age analytics

The profile API accepts an enum band only; **there is no exact-age or birthdate
parameter**. The transient UI converts an optional integer answer to
`under_13`, `13_15`, `16_17`, `18_24`, `25_34`, `35_44`, `45_54`, `55_64` or
`65_plus`, then discards the integer. Exact years must not enter transport,
storage, logs, crash reports or gameplay payloads. Age bands do not authorize
accounts, advertisements, tracking or a change to `privacy_context`.

The actions are `keep`, `skip`, `set` and `withdraw`. `skip` clears any existing
band/response timestamp; it does not infer adulthood or block practice. `set`
requires a current private analytics authorization issued by the reviewed
trusted eligibility service, matching the independent current privacy context,
a latest granted analytics consent, and an approved unrevoked analytics guardian
authorization for child/teen contexts. Unknown and parental-review contexts
always fail closed. Where consent timestamps are identical, a decline or
withdrawal defeats a grant; random UUID order cannot override withdrawal.
Demographic corrections do not change these protections.

Authorization permits have an opaque evidence reference and policy version,
expire within 24 hours, and never act as demographic data. Issuance is deliberately
not exposed as a mobile RPC. The approved account/privacy backend owns issuance,
refresh, revocation and the applicable jurisdiction/guardian rules. All trusted
profile/privacy/permit changes must acquire the account owner row lock first,
matching ranked start's transaction ordering.

`ageResponseAt` is server response time, not a birthday. Corrections replace the
band and response time without preserving raw age history or automatically
aging between bands. The proposed first-version retention is 365 days from the
latest response; expired values are omitted from owner reads. The trusted
backend must schedule `purge_profile_analytics()` daily to physically clear
expired bands/timestamps and expired authorization permits. `withdraw` clears
the band immediately, removes its permit and appends a withdrawn analytics
consent. Account deletion cascades these records from Auth. Policy review,
actual scheduler deployment and CPI-031's complete deletion/export remain
release gates; this migration does not claim those operations are live.

## Declared countries and frozen region membership

`get_profile_config()` returns `mappingVersion`, `usernameMin`, `usernameMax`
and a sorted `countries` array with `countryCode` and `continentCode`. The UI
uses this configuration, with localized country labels, rather than a separate
runtime mapping or IP/GPS lookup. A choice is a declaration, not verified
citizenship or location. Null means world-only; unsupported codes are rejected,
and no country is guessed from IP, language or locale.

`cpi-regions-2026-11-v1` freezes all 249 ISO-alpha2 entries, using the
[UN M49 country/area composition](https://unstats.un.org/unsd/methodology/m49/overview/)
retrieved on 2026-11-04. The game codes are `AF`, `AS`, `EU`, `NA`, `SA`, `OC`
and `AN`. `EU` here means **Europe**, including non-EU members; it is not a
European Union membership indicator. The Americas are split into North America
(Northern/Central America and Caribbean) and South America. Antarctica is `AN`;
Taiwan (`TW`, absent as a separate M49 entry) is the explicit ISO extension
assigned `AS`. Kosovo (`XK`, not an assigned ISO-alpha2 entry) is unsupported by
this mapping. These groupings serve game leaderboard composition.

Territories keep their own M49 grouping, rather than their administering state's
continent: Greenland `GL→NA`, French Guiana `GF→SA`, US Minor Outlying Islands
`UM→OC`. Explicit transcontinental composition includes `RU→EU`,
`TR/CY/KZ/GE/AM/AZ→AS`, and `EG→AF`. Bulgaria `BG→EU` and the United Kingdom
`GB→EU` verify that Europe is independent of EU membership. The trusted runtime
can read the frozen table but cannot update/delete its entries. A changed
mapping requires a new reviewed version, leaving old snapshots intact.

## Country locking and immutable run snapshots

Before the first ranked start, country corrections are unrestricted. The
trusted ranked-start transaction calls `snapshot_profile_region(user_id)` and
persists the returned `{countryCode, continent, mappingVersion}` with its new
run before committing. Both operations must share one transaction: a failed
start must roll the profile lock back too. The alternate
`lock_run_region(user_id, run_id)` locks an already inserted playing run in the
same transaction. It checks ownership, initializes the run fields once and
returns the exact stored snapshot on retry.

Both profile editing and ranked snapshot acquisition lock the same owner row,
serializing a concurrent edit/start. First ranked start records server time;
the next country change is allowed on or after **720 elapsed hours**. Each
accepted later country change begins another 720-hour period. Keeping the same
country and editing the alias do not reset it. This includes changes to/from
null, preventing a missing-country shortcut around cooldown.

Each run stores `country_snapshot`, `continent_snapshot`, `mapping_version` and
`region_snapshotted_at`. A trigger forbids changes after initial assignment and
also protects its owner and ruleset identity. Null country still receives a
mapping version and initialization timestamp, so an intentional world-only run
differs from an uninitialized legacy row. Historical runs/results never move
when the profile changes. Old CPI-017 rows remain uninitialized; they are not
silently assigned a country retrospectively or treated as verified runs.

## Verification and outstanding evidence

`backend/tests/profile-regions.sql` runs against the real migrated schema with
rollback-only synthetic fixtures. It checks all 249 countries, difficult
territory/transcontinental cases, public allowlists, RLS/privilege denial,
normalization/reserved names, duplicate-name rollback, skipped/invalid/allowed
analytics, child/unknown protections, corrections/withdrawal/retention,
pre-ranked country edits, cooldown, immutable historical snapshots,
world-only and cross-owner denial. `profile-regions-concurrency.sh` uses two
actual PostgreSQL connections to prove exactly one concurrent normalized-name
winner and zero losing-owner side effects. It only runs on the disposable
`127.0.0.1/cpi_ci` PostgreSQL service.

The migration and SQL suites also passed local PGlite PostgreSQL WASM execution;
this is separate from PostgreSQL 17 CI and hosted tests. No hosted database
write, real account, device login, profile submission or live analytics
collection was performed. CPI-019/020 stay open until trusted hosted account
integration, privacy approval and real guest/account A/B verification complete.

## Server route and mobile editor

`@crystal-path-infinity/server-core` supplies a framework-independent profile POST handler. The host must inject active-token verification, fresh account/privacy authorization, a durable request limiter, an explicit origin allowlist and a private TLS database connection. Authentication derives the subject; bodies containing a subject, exact age, birthdate or privacy override are rejected. Profile save and owner/config read share one database transaction, with fixed, redacted error codes.

The mobile profile editor accepts only an explicitly injected session-scoped client. No service or account is created on startup. With the default null client the guest profile collects no fields. The editor converts an optional completed-age input into the existing schema band and clears the exact input before awaiting any request. Skip preserves the current answer; withdrawal clears it. Request aborts and generations prevent late results replacing another view. Country labels use Intl display names; locale never chooses a country.

The production route adapter remains deliberately unconfigured until the approved account backend, privacy services and real identity isolation checks are available. The original CPI-017 migration and its hosted deployment workflow are unchanged; the existing one-migration deployment gate rejects these new unapproved migrations.
