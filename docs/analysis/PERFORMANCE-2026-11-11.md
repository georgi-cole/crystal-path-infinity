# Gameplay performance investigation — 2026-11-11

## Scope and status

Tester reports lag during Android campaign play; owner also observes milder lag on iPhone. This is a local investigation and proposed optimization plan, not a deployed fix or a measured native-device diagnosis. No game rules, business assumptions, rewards, purchases, or historical results were changed.

Inspected working tree: branch `codex/mystery-pacts`, base commit `1ac154ffe8a7a8d3d4dcd23a4280367f13b8c2c6`, including substantial existing tracked and untracked changes. Results describe that working tree, not the clean commit or the tester's unidentified installed build. Existing application edits were preserved.

## Checks performed

- `npm test`: mobile 716 passed / 1 failed (717); game core 310 passed; server core 194 passed. Failure: `config/brand-identity.test.ts:33` expects the old SVG favicon while current HTML uses PNG. This does not establish a gameplay performance failure. Root command exits unsuccessfully and therefore skips the chained balance suite.
- `npm run test:balance`: separately run; all 6 passed.
- `npm run build:production`: passed, including mobile TypeScript check. Main JS 376.31 kB (114.41 kB gzip); shared account-controls-client chunk 470.51 kB (144.78 kB gzip); main CSS 171.87 kB (37.25 kB gzip). Emitted campaign PNGs: 2.67 MB and 2.91 MB. Emitted asset size is not evidence of an in-play stall or immediate download.
- Host Node v26.3.0 is outside the declared >=22.23.4 <25 range. Reproduce release validation on a supported Node version.

## Local microbenchmarks

Executed via Vite `createServer` with `ssrLoadModule`, `performance.now()`, 200 warmups and 3,000 individually timed iterations per operation. These are repeated operations on an initial state, not a simulated long play session. They exclude React reconciliation, DOM layout, paint, GPU work, actual WebView storage, native bridge latency, audio, and thermal throttling.

| Case | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| Basic initial scene projection | 0.0025 | 0.0034 | 0.0047 |
| Basic initial run JSON serialization | 0.0018 | 0.0028 | 0.0073 |
| Basic initial tick | 0.0070 | 0.0172 | 0.0307 |
| Campaign Infinity initial projection | 0.0031 | 0.0176 | 0.0346 |
| Campaign save with no-op storage | 0.0049 | 0.0135 | 0.0410 |
| Campaign Infinity initial tick | 0.0253 | 0.0665 | 0.1420 |

Basic fixture: `createRun`, practice RNG cursors 123/456, ahead 8/history 2, observedAt 1000; checkpoint 1,176 characters. Campaign fixture: `createCampaignInfinityRun(EMPTY_CAMPAIGN_PROGRESS)`, generated random seed, ruleset `infinity-v12-tiles-50-50-plain-journey1-plain`, checkpoint 2,031 characters. Save benchmark calls `writeCampaignSave` with `setItem(){}`. Its timings cannot exclude slow real storage on a phone. Campaign weather missions and mature saves were not benchmarked.

Interpretation: these desktop samples do not implicate basic game logic as the primary cost. They do not establish native FPS or dismiss device-specific stalls.

## Findings and proposed priorities

1. **Confirmed intentional input delay.** `scene-cinematics.ts` blocks successive choices through contact/impact/travel. Safe step: 430 + 460 = 890 ms; wrong step: 820 + 460 = 1,280 ms. `InfinityRun.issue` ignores commands while the director is busy, and the view also blocks controls. This can feel unresponsive even at stable FPS. Proposal: shorten the sequence or unlock at the safe visual boundary with immediate pressed feedback. Avoid replaying queued stale taps. This needs playtesting because active game time continues and faster input changes achievable pacing; document any accepted behavior change in current rules before merging.
2. **Shared rendering work: first optimization candidate.** `schedulePracticeTick` wakes every 100 ms; each runtime transition calls `setState`, and `InfinitySceneView` projects and renders the scene. Separate timer/HUD updates from stable bridge, scenery, and companion subtrees. Memoize expensive geometry using stable primitive inputs; `PaneFragments` already memoizes `glassPattern`, but projects current and previous shards each render. Measure React commits before and after; blanket memoization with fresh object props will not help.
3. **Graphics cost: candidate requiring a device trace.** Seasonal scenery has repeated animated particles, blur, shadows and weather layers. Compare the same mission with reduced motion on/off; then add a visual-quality option reducing particles, blur and fracture detail while retaining game information. Profile paint/compositing on Android WebView and iPhone WKWebView. Keep decorative animations on transform/opacity where practical. Do not assume asset compression fixes in-play frame drops.
4. **Synchronous saves: candidate requiring actual storage timings.** Scene checkpoints occur on events and at least every 500 ms during active play. Campaign `commitCampaignProgress` synchronously calls `writeCampaignSave` (`JSON.stringify` + storage `setItem`). Measure duration and correlation with missed frames on phones. Consider coalescing periodic noncritical saves or asynchronous persistence, while preserving durable resource consumption, mission rewards, exit/background saves and recovery guarantees. Do not simply remove saves.
5. **Asset delivery: secondary for this report.** Resize/compress campaign artwork to required display resolution and load optional art near use. Measure decoding/texture upload around first appearance. This is more directly relevant to loading or first-use hitches than sustained play.

## Device verification needed

Use the tester's exact build/mission, phone model, OS and Android System WebView version. Record a release-like campaign session on Android and iPhone, including clear weather, rain, safe/wrong steps, mystery effects and pause/resume. Run baseline and each change separately with identical quality settings; include a longer session to expose thermal degradation.

Capture frame intervals/dropped frames, React commit cost, long main-thread tasks, save duration, native lifecycle sampling latency, and tap-to-first-feedback versus tap-to-next-choice. The runtime samples lifecycle through an async ordered queue before commands, so bridge cost is another measurement target; preserve authoritative lifecycle timing when optimizing it.

Proposed targets, not achieved results: roughly 16.7 ms/frame at 60 Hz, p95 tap-to-first-feedback under 100 ms, and no repeatable long task above 50 ms attributable to gameplay. Frame cadence and visual unlock timing must be assessed separately. Android's rendering guidance explains the approximate 16 ms frame budget: https://developer.android.com/topic/performance/issues/render .

No physical-device trace, FPS measurement, native build/launch, network latency test, or observed optimization improvement is claimed by this report.

## Implementation follow-up — 11 November 2026

Implemented in the same local working tree after owner authorization. This section supplements the baseline above; it does not replace those historical results.

- Shared Android/iOS step lock: safe 600 ms (32.6% shorter), wrong 850 ms (33.6% shorter). These are configured timer windows, not measured device response times. Contact 80 ms, safe settle 300 ms, wrong settle 550 ms, travel 300 ms.
- Bridge memoization compares every prop and all projected row/cue fields; stable choose/mystery callbacks avoid invalidating it on ordinary ticks. Timer, controls, hints, changed handlers, context and local camera state remain responsive. Seasonal atmosphere uses primitive-prop memoization.
- Geometry/light travel and mystery hit regions now animate for 280 ms inside the travel window. Companion hop/escape durations derive from the step constants so they land before the next phase. Existing tests caught the initially overlong companion motions; those durations were corrected before final validation.
- Preserved all visual detail, effects, weather and art. Preserved the simulation tick cadence, native lifecycle sampling, synchronous save guarantees and command serialization. No speculative save deferral or reduced-art mode was needed for this pass.
- Updated a pre-existing favicon test mismatch to validate the PNG used by current HTML, including file signature.

Validation after implementation: `npm test` passed: 723 mobile + 310 game-core + 194 server-core + 6 balance = **1,233 tests**. Mobile includes six new regression cases. Production build passed. Further check results are recorded below when completed.

Remaining limitation: no physical Android/iPhone trace or native launch was performed; reduced lock durations are verified by tests, but smoother frame pacing and perceived appearance still require phone playtesting. Host Node remains v26.3.0, outside the repository's declared range. No backend deployment or store release was performed.

Final additional checks: workspace typecheck, lint, formatting, development/staging/production builds and campaign-QA build all passed. CI routing tests passed (15). The `planning:check` npm wrapper could not find `python3` on this Windows host; rerunning its exact validator and unittest steps with installed `python` passed (38-issue plan valid; 13 tests). Formatting initially included existing generated campaign-QA output; `.prettierignore` now excludes `dist-qa` and `dist-campaign-qa`, consistently with generated `dist`. Source formatting then passed.

Documentation updated together: current game rules, player/QA presentation contract, business-plan pacing caveat and this dated report. Historical simulations and the baseline report remain intact. No PR or merge was performed.

## CPI-046 PR preparation against current main — 11 November 2026

Issue: https://github.com/georgi-cole/crystal-path-infinity/issues/123 . Branch: `codex/gameplay-performance`. Base: `40ca8bca69d0ab9fe281f14d6a1c4a45396b8d72` (current `origin/main` at preparation). Only the performance edits were transferred into a clean managed checkout; the original checkout and its unrelated edits were retained. The sections above remain historical evidence from the older working tree.

The latest-main supply commitment callback and Kit pause guard are preserved inside the memoized command handler, with `onInfinitySupplyCommit` included in its dependencies. Existing shield-aware cinematics and updated artwork are retained. The favicon mismatch is already fixed on current main, so the final PR does not change that test or any icon.

Revalidation uses Node **v24.11.1**, within the declared range, via `npx --yes --package=node@24.11.1 -c "<command>"`. `npm ci --ignore-scripts` installed the root lockfile first using host Node v26.3.0; no dependency versions or lockfile changed.

- `npm test`: **1,346 passed** (814 mobile, 315 game-core, 211 server-core, 6 balance). This replaces the older-tree count only for this PR revision.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: passed.
- `npm run build:production`, `npm run build:staging`: passed. Vite warns that the current-main main bundle exceeds 500 kB; no chunk-warning suppression was added.
- `node --test .github/scripts/app-checks.test.mjs`: 17 passed.
- Planning validation: `python scripts/validate_plan.py` and `python -m unittest discover -s scripts -p 'test_*.py'` passed (13 tests). Installed `python` substitutes for the unavailable Windows `python3` launcher.
- `git diff --check`: passed.

No claim of physical-device FPS, native launch, backend deployment or a merge is made. Those remain distinct from source checks and PR creation.

Final PR build matrix: development, staging, production and campaign-QA all passed on Node v24.11.1.
