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

Production server admission/reward policy must be checked before phone acceptance.
The currently signed-in Supabase browser account lists staging/development projects
but does not expose the production project recorded in the launch documentation.
No production operations policy or reward approval was changed in this session.

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
