# App Store launch corrections · 14 November 2026

Scope: CPI-023/CPI-025/CPI-044. Candidate version: **1.0.2**. This record describes
source changes and the console observations below; it does not claim a replacement
binary has shipped or that live ads/ranked phone play have passed acceptance.

## Ads: console finding and client handling

The released iOS app is version 1.0.1, build 72. Its AdMob app
`ca-app-pub-9243398419153145~7303584917` had no App Store details linked.
On 14 November the official listing `https://apps.apple.com/app/id6831790531`
was found by its full URL and the link was saved. AdMob confirmed the store update
but could not yet complete app-ads.txt verification. A fresh verification request
was made and returned the same pending verification problem.

The public developer-root file `https://georgi-cole.github.io/app-ads.txt` was
opened and contains the exact AdMob-required declaration:

```text
google.com, pub-9243398419153145, DIRECT, f08c47fec0942fa0
```

The same declaration already exists in the publisher-root repository. No publisher
file was rewritten. Google's app-ads.txt dashboard currently shows no detected
requests/crawled rows and says domain changes can take up to seven days to appear.
Verification/readiness and a real phone ad presentation remain outstanding.
Do not label this as an accepted live ad integration.

After linking, the iOS app overview explicitly reports **Requires review**, with
12 requests, zero impressions and a 0% match rate in its seven-day view. This shows
requests reaching Google; it does not establish that an eligible ad can be served.

The client now preserves `no_fill` separately from initialization, consent, SDK,
load and presentation errors. Copy explains retrying and keeps unused continues
unchanged. Guest initialization has a bounded wait and cancellation checks; local
diagnostics record only the failure stage/platform/status, not account or consent
contents. Rewards still require the earned callback and a saved grant; a dismissal,
timeout or failure never grants a continuation. Production native account services
now select the registered live rewarded unit rather than demonstration inventory
for the public Campaign profile. Internal Campaign service builds retain demo ads.

## Infinity rankings

Build 72 explicitly disabled ranked services and its Campaign-enabled Infinity
button created local seasonal runs. These never passed through the ranked server,
so opening a leaderboard could correctly return zero official results after a long
local crossing. Local scores cannot be relabelled as verified server scores.

The new public candidate requires/enables ranked services. Online players can enter
**Ranked Infinity** from Home or Rankings; players who need an account/nickname are
directed to Profile. Admission requires a loaded profile. Country/continent filters
receive the profile's country mapping. Ranked play uses the existing authoritative
`infinity-v11-live` rules and its existing score ordering, recovery and reward checks.
Offline seasonal Infinity, gear and existing checkpoints keep their original rules
and stay available through the separate offline option. The ranking page explains
this distinction without showing internal ruleset IDs or database terminology,
provides an explicit refresh action and explains how to earn a first position.

Campaign remains non-ranked: everyone follows the same 30 mission definitions.
No new server ruleset, season/gear score import, local-score upload, leaderboard
backfill or historical-result conversion is implemented by this correction.

At the initial diagnostic checkpoint, the signed-in Supabase browser account listed
staging/development projects but did not expose the production project. No production
policy or reward approval had changed at that checkpoint. The later access and
ranking correction are recorded below.

## Mission success transition and audio contract

Only a successful mission landing starts this sequence. The saved clear/reward
remains immediate and idempotent. Gameplay input and the clock are then held while
the final contact/impact/travel animation finishes; the normal run soundtrack stops.
After 900 ms the transition cue and a 350 ms fade lead into the existing reward film.
Reduced motion shortens the waits to 100 ms plus 100 ms and suppresses the fade.
Failed missions retain their failure/result flow and receive no success audio.

Supply these optional files in `apps/mobile/src/assets/campaign/`:

| File | Trigger | Playback |
| --- | --- | --- |
| `mission-complete.m4a` | Successful requirements on the final row | One completion cue |
| `mission-transition.m4a` | Departure fade begins | One transition cue |
| `mission-celebration.m4a` | Reward film begins | Continuous loop through the result modal |

The music does not restart when the film becomes the result card. It stops on
leaving/retrying/starting another run and pauses in the background. Sound effects
and music respect their separate settings. Backgrounding does not replay one-shot
cues on return. Optional files are discovered at build time: absent files are silent
and generate no failed network requests. Playback/codec rejection never blocks the
mission. No new audio files or generated music are bundled in this correction.

## Listing and release acceptance

The live App Store description was inspected: the earlier repeated paragraph is
already removed. Published metadata is locked; it was not rewritten here.
Any replacement listing should describe only Infinity as ranked and Campaign as
the common mission route. Version 1.0.2 is reserved in source for the next update.

Required phone acceptance before claiming resolution:

- Confirm Google publisher verification/readiness and present a real rewarded ad;
  check dismissal, earned reward, unavailable inventory and another attempt.
- Start a new Ranked Infinity run with a completed profile, finish it, refresh World,
  Country and Continent standings, and check the personal position. Check recovery
  after an interrupted connection. Existing offline scores remain local.
- Clear a mission on a safe final step and on a surviving broken final step. Verify
  the last movement finishes, no extra step/spend is accepted, the film fades in,
  the modal retains its music, and Continue stops it. Repeat with reduced motion,
  muted music/effects and background/foreground interruption.

Prices, continuation quotas, reward amounts, business assumptions and previously
recorded test/revenue results are unchanged; BUSINESS_PLAN.md needs no revision.

## Source verification

Supported Node 24.22.1 was used for the final checks. Typecheck, lint and formatting
pass. The mobile suite passed 975 tests including the new cancellation and audio
regressions. Game-core: 315; server-core: 234;
balance: 6; CI routing: 17. Development, staging, production and configured public
Campaign builds compile. Planning validation and its 13 tests pass. No new native
archive, Simulator/Emulator result or physical-device acceptance is claimed here.
The local browser preview could not reach the sandboxed development server.

## Production access and ranked admission · 14 November 2026, 21:10 UTC

The live Cloudflare worker `crystal-path-production-api` was inspected in its
owning account. Its `crystalpath-api.kolequant.xyz` domain routes to
`https://wtldjvzvpcfkwfacgsqj.supabase.co/functions/v1/cpi-live`. The exact Supabase
project is now accessible in the owner's other account; its generic display name
had hidden its connection to Crystal Path. No new project was created.

A read-only production query found policy revision 1, ranked/ad starts disabled,
`service_not_ready`, v1 starts/recovery, and zero ranked runs/verified results.
The v11 economy/resource tables and review-inventory migration are installed.
The runtime login is a member of `service_role` and explicitly switches to that
role. Under that effective role, policy reads, start authorization and leaderboard
reads are permitted; changing the operator policy is correctly not permitted.

A transaction temporarily applied the candidate policy, switched to `service_role`,
checked v11 ranked admission, v1/v11 recovery and the World leaderboard, then rolled
back. A final read confirmed revision 1 was unchanged. The approved ranking fix was
then applied through the audited, revision-checked operator function:

```sql
select cpi_private.set_operations_policy(
  1, true, false, 1, 1,
  'infinity-v11-live', array['infinity-v1','infinity-v11-live'],
  'none', 'owner:rankings-fix-20261114'
);
```

The committed result is revision **2**, updated **2026-11-14T21:10:11.710808Z**:
ranked starts enabled, v11-live starts, maintenance `none`, both v1 and v11-live
recovery retained. Existing build floors remain 1 so previously authenticated
sessions are not stranded. Ad starts remain disabled; no ad approvals, grant rules,
authentication, purchase verification, account data or historical scores changed.

An independent read confirmed the saved policy and successful World, Bulgaria and
Europe leaderboard queries, all currently with zero players. This validates the
database admission/read path; it is not an authenticated phone run or an HTTP
end-to-end test. Build 72 still launches local Infinity. It needs the client update
from this PR before players can use the new ranked entry. Existing local scores
remain local.

All checks for runtime source `f8e2a8a` passed, including Android and iOS launch checks
in [43638361769](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43638361769)
and iOS archive compilation in [43638361742](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43638361742).
No replacement store binary has been distributed. Physical-device ranked play,
Google ad verification/readiness and the owner's three audio files remain pending.

## TestFlight 1.0.2 preparation and source verification - 14 November 2026

PR #138 passed all selected checks and was squash-merged as
`08a90c8058d7b83ab2c88c4e9f2222532180205c` (tree
`e6a25e51465c6c227d073138a8b3f39e21abb81a`). The exact merged source then
passed App quality, backend checks, both native launch checks, Planning and the
aggregate required gate in
[43642617328](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43642617328).

The first post-merge iOS job
[132593904454](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43642617328/job/132593904454)
compiled the app, but failed at 21:35 UTC while stopping Apple's Settings app
during simulator provisioning. It exceeded the existing 60-second limit before
game installation or game launch verification. That failure is retained.
A fresh-runner retry,
[132596430466](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43642617328/job/132596430466),
passed full game launch/lifecycle verification. No source, timeout or verification
gate was changed to obtain that result.

The owner requested TestFlight inspection. A new manual
[run 75](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43644569608)
uses that exact checked main SHA with `upload_to_testflight=true` and
`public_release=true`; Campaign beta/services, external beta, rewarded-ads staging
test and review-source options are false. This selects production account/ranking
services and the real owned ad units. AdMob's console test mode, described below,
configures 1.0.2 for test requests; phone ad presentation is still unverified. It is separate from the staging demo-ad
build profile. No public App Store submission was requested.

### AdMob configuration and remaining live-ad gate

AdMob test mode was enabled specifically for iOS marketing version **1.0.2**.
After observing that saved setting, the owner completed GitHub identity
confirmation and `CPI_IOS_ADMOB_TEST_VERSION` in `cpi-ios-testflight` was updated
from 1.0.1 to 1.0.2. This is manual testing with no ad revenue. Disable 1.0.2 test
mode before any later public launch of that version; record that separate
release decision. The current public 1.0.1 was not placed into test mode.

The public App Store page shows its Developer Website link as
`https://georgi-cole.github.io/crystal-path-infinity/`.
`https://georgi-cole.github.io/app-ads.txt` publicly serves the exact publisher
entry AdMob requests; `/robots.txt` returns 404 rather than a denying rule.
AdMob still reports **Not verified / Requires review**. A fresh Verify app /
Check for updates attempt still reports a publisher-file mismatch despite that
matching public entry. A cached listing/crawl is a possible explanation, not a
confirmed diagnosis. No publisher file or website-domain change was made.

Google's [troubleshooting guidance](https://support.google.com/admob/answer/9776740)
allows up to 24 hours to detect listing/developer-site changes and crawl the file.
[App readiness review](https://support.google.com/admob/answer/10564477) typically
takes 2-3 days after
[successful app verification](https://support.google.com/admob/answer/14538460).
If the verification error persists after the crawl window, escalate with the exact
store, developer and publisher-file URLs and observed error. Do not describe the
app as already under review or live ads as working.

Production policy remains revision 2: ranked starts enabled; server-verified
ranked ad starts disabled pending callback acceptance. Local Infinity ad tests
are separate. New ranked runs can be inspected after sign-in/profile completion;
Campaign and existing local Infinity scores remain unranked. The owner's three
optional celebration audio files are still absent; the transition and audio hooks
are included. Prices, rewards, continuation quotas, business assumptions and
historical results are unchanged.

### Upload receipt - 14 November 2026, 21:50 UTC

The signed archive passed verification. Xcode reported Upload succeeded and
EXPORT SUCCEEDED at **2026-11-14T21:50:10Z** in run 75; the workflow and signing
cleanup completed successfully. Logs confirm marketing version **1.0.2** and native
build number **75**. App Store Connect independently shows **Version 1.0.2, Build
75 - Processing** (build ID `17d9ad66-ab49-4f9e-ad95-11341ddecb64`).
This checkpoint is upload acceptance, not internal tester availability or phone
acceptance. Group distribution and test notes are the next steps after processing.


### Internal availability - 15 November 2026, Sofia time

Apple completed processing. The OS-only encryption declaration was saved, build
1.0.2 (75) became Ready to Submit, and the existing Crystal Path Internal QA group
was assigned with one tester. Build-specific What to Test notes were saved for
rankings, local ad tests and Campaign transitions. The owner can now update through
TestFlight. No external beta or public App Store review was submitted. Phone
acceptance, live Google ad verification, ranked ad revives and new audio assets
remain pending.
