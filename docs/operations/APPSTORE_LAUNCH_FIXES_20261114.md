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
