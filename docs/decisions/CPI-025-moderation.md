# CPI-025 — minimal reports and reviewed leaderboard visibility

This slice prepares private report storage, a bounded staff queue and explicit hide/restore/disqualification decisions. It does not deploy SQL, publish a staff tool, activate accounts or automatically moderate names. Guest practice remains universal. Staff provisioning, incident response, report UI/device acceptance and hosted access tests remain release work.

## Reports

`POST /moderation/report` accepts exactly `schemaVersion: 1`, an opaque public `targetPublicId` and one reason: `impersonation`, `hate_or_harassment`, `sexual_content`, `personal_information` or `spam`. There is no free-text accusation, email, exact age, private profile, score submission, attachment or client role flag. The trusted reporter verifier supplies the authenticated account and fresh `reportAllowed` authorization. A cookie or client-supplied subject is insufficient.

`submit_name_report(reporter, target, reason)` uses server time and deterministic owner locks to enforce limits across processes. A reporter may create at most five reports per rolling hour and one per target per 24 hours. A still-pending duplicate returns the same neutral accepted acknowledgment without inserting another report or changing its reason. A host-injected durable limiter additionally protects unauthenticated and per-actor HTTP traffic. A client cooldown is not enforcement.

Reports are private and grouped into one case per public target. Reporting and high scores never automatically hide, ban or disqualify anybody. Staff must review the relevant evidence. There is no general rule that a high endless score is suspicious enough for automatic punishment.

## Staff authority and decisions

The framework-independent handler requires a separate `authenticateModerator` verifier. An ordinary mobile bearer cannot select the staff role or claim an operator identity. Queue permission and review permission are distinct. The verifier supplies an opaque `actorReference`; the body cannot override it. Actual staff provisioning, role revocation and verified evidence procedures must exist before enabling these routes.

`POST /moderation/queue` accepts paired `afterAt`/`afterId` cursors and returns at most 100 pending cases. The response contains case ID, public target ID, current public username, server update time and enum reason counts as decimal strings. It contains no reporter Auth UUID, email, analytics, consent history, private route or checkpoint. Queue cursors grant no authority. Hosts strip their approved route prefix and mount the canonical paths explicitly.

`POST /moderation/review` accepts `caseId`, a unique `decisionId`, `decision`, nullable `runId` and schema version. Decisions are deliberately limited:

| Decision | Result |
| --- | --- |
| `dismiss` | Close the pending reports without changing visibility. |
| `hide_player` | Hide the target's results in every applicable scope. |
| `restore_player` | Remove that player-wide suppression after a correction. |
| `disqualify_run` | Hide one published run belonging to this case's target. |
| `restore_run` | Restore that same immutable run after a correction. |

The database locks owner then case, validates run ownership and records an immutable decision. A decision ID is a retry key: the same operation returns the same acknowledgment; changing case, action, run or operator under that ID fails. Independent decisions can correct prior actions without overwriting history. Visibility changes use CPI-023's audited suppression mechanism. The unreviewed raw suppression function is no longer granted to `service_role`.

All World/Continent/Country reads apply the same live suppression predicate. A disqualified personal best exposes the next eligible immutable best rather than inventing a score. Restoration preserves original region snapshots and tie-break times. This slice never changes username, country cooldown, age analytics or privacy context. A future name-reset operation needs its own reviewed normalization and audit contract; it must not be improvised through an administrative profile payload.

## Privacy and deletion

Reporter and target identity links are foreign-key constrained. Reporter deletion removes their reports. A case has no reporter identity link and can remain associated with the public target so a mistaken staff action can still be corrected after the reporter leaves. Deleting the target removes reports, cases, decisions and corresponding suppression identity links. Pending deletion blocks new reports by or about that account and blocks new target moderation while deletion proceeds.

`export_own_name_reports(user_id, after)` provides fixed 100-row own-only pages. CPI-031's trusted fresh-reauthentication export handler now always calls it and returns `reports` plus `next.report`; a missing/failed report function fails the whole page rather than silently omitting user data. Legacy four-field request cursors remain accepted; the fifth report cursor is optional. The caller's subject comes from verified authentication, never the cursor/body.

Case/decision retention, staff access logging and operational review require an approved deployment policy before processing real users. No complete public moderation service or production retention schedule is claimed here.

## Verification

`backend/tests/moderation.sql` uses rollback fixtures to check duplicate handling, grouped reasons, durable hourly and target limits, no automatic punishment, all-scope hide/restore, run ownership, corrected decisions, immutable retry keys, private context preservation, report export, deletion cascades, pending-deletion guards and role boundaries.

Handler tests check ordinary bearer denial on staff routes, separate permissions, strict enum/body validation, server-injected operator identity, SQL parameterization, bounded private queue projection, CORS, request limits, safe errors and both host/database limits. The lifecycle tests check mandatory own-report export and failure when it is unavailable. Local SQL execution is preparatory evidence; PostgreSQL 17 CI, existing app/native checks and real hosted guest/account/staff access verification remain required.

## Full route and database integration

The isolated PostgreSQL CI also executes `backend/tests/moderation-integration.mjs`: a server-earned positive score is reported through the actual report HTTP route, a normal account is denied the staff queue, a separately verified staff actor hides/restores the player across every regional scope, and the reporter's own export contains the report. Duplicate reports create only one durable pending entry. The same scenario passed locally with PostgreSQL WASM and service_role connections. This is synthetic verifier evidence, not proof that a staff issuer or hosted service exists.
