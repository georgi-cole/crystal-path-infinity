# Ranked launch hotfix after TestFlight 75

Scope: CPI-025/CPI-029/CPI-044. The owner reported that TestFlight 1.0.2 (75)
opened a paused checkpoint on the first Ranked Infinity entry, then displayed an
unresponsive bridge when entering through Rankings.

## Confirmed causes and behavior

The ranked authority intentionally creates paused checkpoints. The Play entry
returned immediately after starting a fresh run, skipping its resume command.
Fresh starts and starts after archiving an outstanding continuation now share
the existing confirmed-checkpoint resume path. Explicit saved-run recovery keeps
its separate recovery behavior and account/entry cancellation fences.

The bound reward flow also started with input blocked until its optional reward
status endpoint responded successfully. A disabled/unavailable reward service
therefore froze a server-confirmed playing run. Before any reward has been observed
or requested, the same-account/run binding can initialize normal play from a ready
authoritative checkpoint with no pending or unapplied continuation. Reward status
availability is no longer a prerequisite for that initial bridge input.

Pending requests, uncertain ranked state, outstanding grants and fullscreen ads
retain their existing gates. Death still requires the actual reward endpoint;
the new initialization does not create/apply a grant or enable ad watching. Ranked
score submission, continuation amounts, eligibility, purchase verification and
production policy are unchanged. Campaign remains unranked. There is no pricing or
business-plan change.

## Regression evidence

Two new regression cases fail on the released source: fresh Play stays paused,
and a confirmed playing checkpoint remains blocked with reward status unavailable.
Both pass with the corrections. Tests also cover uncertain/pending/owed rewards
remaining blocked. The real in-memory `RankedAuthority` with `infinity-v11-live`
is exercised through the actual ranked client: start, resume, three crossings,
pause, Play resume and end, with reward status deliberately unavailable.

The actual React RankedScene/PrismBridge was inspected in a local browser against
that in-memory authority, with reward status deliberately unavailable. A new run
opened without a pause prompt; four tile choices advanced rows, including a choice
after pause/resume and another after Save and leave followed by reopening Home
Play. Input unlocked after each bounded bridge transition. This used a local test
account and memory-only run; no production scores were created by the test.

Supported Node 24.22.1: mobile 983, game-core 315, server-core 234 and balance 6
tests pass. Planning validation and 13 planning tests pass. Typecheck, lint,
formatting and development/staging/production builds also pass.
Native CI, replacement TestFlight distribution and authenticated phone acceptance
must be recorded separately when observed. This record does not claim Google live
ad approval or a completed phone acceptance run.

## Checked merge and upload receipt

[PR #140](https://github.com/georgi-cole/crystal-path-infinity/pull/140) passed
all selected checks, including both native launches, and was squash-merged as
`1a9297af13c91c66449a0b2a8ad6d2563c7ed774`. Its tree
`e4eeebba459795c01e4b82921be9590f5e272d8c` matches the checked PR source.
The exact main commit then passed App quality, backend, Planning, web builds,
both native launches and the aggregate gate in
[43650709219](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43650709219).
The iOS evidence reports profile `full` and zero unexpected runtime errors.

Signed [TestFlight run 76](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43651887268)
used that exact main SHA on its first attempt. Upload and public production-profile
options were true; Campaign beta/services, external beta, staging rewarded-ad test
and review-source options were false. This retains production ranked services
and version-specific AdMob test mode for marketing version 1.0.2. It does not
submit a public App Store release or enable ranked ad starts.

Xcode reported Upload succeeded / EXPORT SUCCEEDED at
**2026-11-14T23:13:37Z** (15 November, 01:13 Sofia time). Signing cleanup and the
workflow completed successfully. Logs confirm marketing version **1.0.2** and
native build **76**. App Store Connect independently lists **Version 1.0.2,
Build (76) - Processing**. Tester distribution and phone acceptance remain pending
at this upload checkpoint.

## Internal availability - 15 November, Sofia time

Apple completed processing for build ID `87b40408-c762-414e-bf14-605b2ed3206a`.
The existing OS-only encryption declaration was saved. Build **1.0.2 (76)** was
assigned to **Crystal Path Internal QA**, with one internal tester. Build-specific
What to Test notes for both ranked entry points, crossings, pause/resume, Home
re-entry and ranking refresh were saved. The same notes distinguish Offline
Infinity test ads from still-disabled ranked ad continues and pending live Google
verification. The owner can update from build 75 through TestFlight.

No external beta or public App Store submission was made. Authenticated phone
acceptance, Google live ad readiness and the owner's new Campaign audio files
remain pending; local/browser and native-startup evidence do not replace those.
