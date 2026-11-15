# Campaign map and result audio — 15 November 2026

## Candidate behavior

This refinement follows TestFlight 1.0.2 (77); it is a source candidate until its release evidence is added below.

- The map contains every cleared crossing, the current crossing and the next preview. It no longer discards all but the last two clears. Swipe horizontally to focus a crossing; tapping its signal or using the keyboard's left/right keys also selects it. The selected crossing is centered between its previous and next neighbors. Earlier chapters remain reachable on the same route, and all 30 crossings remain available for replay after the finale.
- Future mission names remain hidden beyond the next preview. The next crossing's briefing remains locked until the current crossing is cleared.
- The Crossing journal is hidden. Clear and Mastery records are retained; this removes a view, not saved progress. The briefing now groups the landing and required Stability together, gives the fixed mission kit a compact line, distinguishes already-collected first-clear rewards, and keeps a full-width action visible. Long details scroll within the briefing on smaller phones.
- A failed Campaign outcome plays the supplied mission-failed.mp3 once. A successful outcome plays mission-complete.mp3 once, preserving the final landing. Renders, settings updates and foreground changes do not replay either cue.
- After the complete cue ends, crystal-path-campaign.mp3 starts at 3 seconds as the bridge fades into the vortex. The same playback continues through the celebration and summary/next-signal dialog. Staying on the summary long enough repeats the campaign track from 3 seconds. Leaving or retrying stops and resets it. Pressing Continue dismisses the music before an interstitial opens; foreground changes or rerenders cannot restart it underneath the ad.
- Sound effects and music obey their separate settings. Backgrounding pauses music and preserves its position. Interrupted one-shot cues do not replay. Muted/missing/rejected media allows the normal short landing beat; a stalled completion decoder has a 6-second presentation fallback. Reduced motion keeps the complete sound but shortens visual fades.

Only Campaign presentation changes. Mission definitions, difficulty, first-clear grants, Mastery eligibility, mission kits, saved attempts, Infinity rankings, shop prices, ad limits and server configuration are unchanged.

## Audio supplied by the owner

The three original MP3 files are bundled unchanged under apps/mobile/public/assets/music/:

| Supplied file | Bundled filename | Use |
| --- | --- | --- |
| mission failed.mp3 | mission-failed.mp3 | One shot on a failed Campaign outcome |
| mission complete.mp3 | mission-complete.mp3 | One shot on a successful Campaign outcome |
| crystal path campaign.mp3 | crystal-path-campaign.mp3 | Success presentation and summary, starting at 0:03 |

## Validation and delivery

Validation results, checked source and any TestFlight distribution are recorded here after they are observed. A local screening room uses sample progress and real supplied audio; it does not write production saves, scores or accounts.


Local verification: 153 focused Campaign/audio tests passed. In the local browser at a 390 × 844 CSS viewport, horizontal scrolling reached mission 1, tapping mission 2 centered it between 1 and 3, and its full briefing/action fit without document overflow or internal scrolling. All 30 cleared crossings remained selectable after the finale. The original audio decoded as 3.55 s complete, 10.08 s failed and 168.36 s campaign music: one completion playback ended before the music started at exactly 3.00 s; it continued through the summary, and a failed outcome played the failure cue once and stopped success music. This is browser presentation evidence, not iPhone audio acceptance.

Local required checks passed: 997 mobile, 315 core and 236 server tests (1,548 application tests), six balance tests, typecheck, lint, formatting and development/staging/production builds. Planning validation (13 tests) and CI routing (17 tests) also passed. Native launch and TestFlight delivery remain pending.
