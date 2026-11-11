# CPI-007 — active time and native lifecycle ownership

Issue: [#7](https://github.com/georgi-cole/crystal-path-infinity/issues/7). Base: CPI-006 / PR #44, merged as `5a2ed5bc7fbb0a7dd1b0996f3609ac4274350e95`.

## Shared active time

`createTimedRunSession` wraps the existing run/session with an injected monotonic source. Choices, hints, mysteries and effect settlement use this same clock. The original `infinity-v1` has no idle death, forced movement timer or progress from waiting. The later [infinity-v2 follow-up](CPI-005-row-pressure-v2.md) uses this same active timeline for its row deadline and survival rewards. Holds and lifecycle ownership remain unchanged.

The initial recovery hold excludes time spent constructing the owner and reconciling its page. Independent leases cover user pause, ads, verification and recovery; releasing one cannot release another. Ordinary animations do not acquire a hold. Dead and finished states freeze active time automatically.

A new/recovered practice runtime requests a fresh native sample before releasing that initial hold. The page's original readiness promise may have resolved long before the player starts a run. Reusing its cached sample would charge menu time to the first gameplay tick; observation offsets must also be anchored against the fresh sample to avoid counting that interval twice. Disposal during this startup request leaves the checkpoint and resources untouched.

`hold(reason)` settles the current active interval and returns its transition events. Its lease's `release()` rebases the source while still paused, without ticking. The host handles each returned transition once. Fractional milliseconds carry across samples and pauses. Invalid, backward and overflowing clocks throw; intervals are not shortened with arbitrary delta limits.

A 900 ms sample can discover lethal drain at 500 ms. The returned checkpoint commits **500 ms** and discards the unplayed tail before revival. A normal pause preserves remaining effect durations; revive clears them through the existing reducer. The 5000 ms expiry boundary excludes a tenth periodic pulse.

Observation timestamps are separate: `observationNow` supplies host-owned epoch milliseconds, or the clock uses one epoch anchor plus monotonic elapsed. Calendar changes never drive effects. Mobile practice observations remain local estimates, not authenticated ranked/calendar evidence. Ranked clocks and pause leases must be server-owned in CPI-021.

## Input, scheduler and resource ownership

The CPI-006 session also accepts lazy time, evaluated after disposed/finished/consumed/stale guards. The timed session scopes actions and End confirmations to their pause phase. Reward commands keep explicit death/intent/grant identities.

`createPracticeRuntime` owns the timed session, serialized input requests, one cancellable wakeup and supplied playback cleanup. The nominal 100 ms wakeup requests a sample; it does not determine elapsed game time. Inputs bind when presented and are checked again after the asynchronous native read. Cancelled wakeups check their owner/generation before sampling.

Native read failure freezes recovery and propagates the error. Only an explicit successful `refresh()` clears that fault; a later active event cannot restart play by itself. Synchronous disposal invalidates the core before attempting all resource cleanups and retains its last acknowledged checkpoint. Cleanup failures propagate after remaining cleanups have been attempted. It never implicitly ends a run or clears pending rewards. For a planned departure, await `hold('recovery')`, handle its events and dispose. Durable saving belongs to CPI-009.

The page lifecycle starts before React mounts. The visible app remains the foundation shell: no practice run, ad or audio player starts automatically. CPI-008 will mount the actual renderer and its run owner. Playback here is a tested resource contract, not a new audio implementation.

## Native foreground source

The local `CpiLifecycle` plugin adds no external npm package or device permission. Android/iOS accumulate foreground duration at their actual native active/inactive boundaries. Each snapshot contains:

| Field | Meaning |
| --- | --- |
| `pageId` | Current JavaScript document, shared by diagnostics and lifecycle. |
| `bridgeId` | Native bridge owner; recreated processes use a new identity. |
| `sequence` | Increasing snapshot/event sequence in that owner. |
| `isActive` | Current native activity/scene state. |
| `nativeTimeMs` | Monotonic elapsed time since native bridge creation. |
| `foregroundTimeMs` | Actual foreground duration, frozen while inactive. |

Listeners are installed before a real native handshake. It checks the exact page ID and real `window.Capacitor.triggerEvent` function. Navigation invalidates the old page generation. Wrong-identity responses fail closed; obsolete events and older responses cannot replace newer state. Historical pre-page events are dropped, never replayed into gameplay.

Practice ticks/inputs use **confirmed native foreground samples**, without extrapolating JavaScript time across an OS suspend. Visibility can become hidden before the accurate native pause arrives. The runtime immediately stops resources/input, then settles the final confirmed foreground interval when that native boundary arrives. A second core background hold at the older visibility sample would discard this interval: the source already excludes background duration, while runtime lifecycle scope blocks input. Explicit user/ad/verification leases remain independent. Web practice uses an equivalent visibility/pagehide foreground accumulator and handles BFcache return.

iOS declares the SystemBootTime API's in-app elapsed-time purpose in its bundled privacy manifest. Diagnostics expose bridge-relative intervals, not raw device uptime. Neither platform requests location or adds tracking.

## Native readiness change

Locked Capacitor Android 8.5.3 `MockCordovaWebViewImpl.triggerDocumentEvent` invoked `window.Capacitor.triggerEvent` without a current-page readiness gate. CPI-003 recorded an early pre-React exception; earlier ordinary cold-start tests did not reproduce it.

Generation copies the pinned Android library into the ignored native project and patches that copy, leaving installed npm files untouched. Its exact upstream source SHA256 must match `7d2d95e8d3986b6608630262166cdee1c208bc4270d76ee69c05b7463a02c0c7`; dependency/source changes stop generation for review. Dispatch requires a handshaken page and rechecks identity when queued evaluation executes. There is no bridge stub or global exception suppression. This does not claim an independent reproduction of the old intermittent failure on its original revision.

Pinned iOS already guards legacy scene events while loading; the local plugin adds the current-page/foreground contract. Native templates and the Android patch are checked by `native:generate --check`.

## Verification boundaries

Core tests cover 0/499/500/5000 ms, fractions, overlapping holds, long pauses, a new process's unrelated monotonic origin, fatal-tail discard and stale/failed callbacks. Adapter/runtime tests exercise real TypeScript implementations with deterministic clock/native ports and scheduler control, including out-of-order responses, early visibility followed by the precise native boundary, faults and cleanup exceptions. They are unit/integration evidence.

Native CI uses a development-only native navigation gate, released by a real operating-system return:

- Android: Home before first JavaScript, lock/wake before first JavaScript, then a normal third cold start. All three recreated processes/WebViews also perform post-readiness Home/resume.
- iOS Simulator: Settings causes a real scene deactivation before first JavaScript; the navigation gate releases only after the scene activates again. A second process/WebView is then recreated, and both perform post-readiness Settings/resume checks. This does not claim an iOS lock-button test.

The driver waits on observable native/page predicates, without fixed dwell sleeps. Post-readiness checks require native inactive/active snapshots on the same page and a successful native bridge round-trip after reactivation; Capacitor's legacy document pause/resume events are not used as a proxy for the native foreground clock. iOS Settings launch is observed concurrently with the native inactive boundary, so a slow `simctl` response cannot hide an already observed transition. The workflow checks gate ordering, no page before release, current-page readiness, foreground suspension and distinct recreated identities. App-scoped JavaScript exceptions and failed readiness remain failures. Gate controls are disabled in staging/production generation.

### Fresh iOS simulator provisioning

The [verification run on `84baa153`](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41348930277) compiled successfully but exposed two provisioning deadlines. Its first attempt emitted the expected native gate about 89 seconds after the launch command, beyond the 60-second allowance. One targeted retry then exhausted the 360-second boot allowance during Apple's CoreLocation data migration, before installing or launching the app. Both failed artifacts and command transcripts are retained; neither attempt provides a passing lifecycle result.

The driver now allows up to 900 seconds for the fresh simulator's initial boot and 180 seconds for the first native process gate. The iOS smoke step has a 30-minute ceiling within the existing 45-minute job ceiling. Configured budgets are recorded in `ios-smoke-device.json`. These are bounded provisioning allowances, not fixed sleeps or additional retries; the driver proceeds immediately when each required predicate succeeds. Page readiness, identity, pause/resume, foreground-time and error assertions remain mandatory. More time does not prove that a stuck OS migration will recover: a deadline failure still fails CI and preserves its diagnostics.

The [CPI-013 run on `12b85aff`](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42234357054) retained two additional Tahoe/iOS 26.5 host failures: initial post-migration shutdown exceeded 180 seconds; a fresh-host rerun reached both recreated app processes and their bridge/lifecycle observations without runtime errors, then timed out capturing the second required screenshot at 60 seconds. The host-pressure sample recorded 0% idle CPU, a load average above 500 and only 414 MB free on the 14 GB host. These are not passing launch results.

The required app workflow therefore pins the supported 14 GB macOS 15 Intel / Xcode 26.3 / iOS 26.2 baseline, while retaining asynchronous OS control and all app assertions. Screenshot capture receives its own bounded 180-second OS allowance and remains mandatory for each attempt. This changes the tested OS baseline, not the number or meaning of startup, identity, pause/resume, foreground-time or error checks. The recorded evidence identifies the actual runtime; it is not presented as iOS 26.5 validation.

Executed counts, exact revision, workflow links and artifact digests are recorded in the issue/PR. Local generation is not native compile/launch evidence. Emulator/simulator results do not replace physical-device, real-ad, server, performance or long-session gates in CPI-002/CPI-034.

## 11 November 2026 · CPI-040 · avoid unconditional simulator restarts

This current note supersedes the earlier provisioning sequence and toolchain description above without rewriting its historical failures. The workflow currently pins Xcode 26.6 / iOS 26.5 on `macos-26-intel`, a standard 14 GB Intel host ([GitHub runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)). CPI-040 changes neither that runtime nor the required native gate.

The passing [PR #110 baseline, run #414](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43015447506), feature head `e2587f0f438ce32e3fd05d5d9919702731dd384d`, provides actual command timings: initial boot 227.8 s; unconditional shutdown 57.5 s; warm boot 77.1 s; Settings launch 12.9 s; Settings termination 4.1 s. The forced restart therefore cost 134.6 s before app installation. Its full iOS smoke took about 10 minutes 53 seconds including cleanup; two recreated app processes, Settings interruptions, bridge identity/resume, required screenshots and zero runtime errors passed. The screenshot was inspected. These remain historical measurements, not a speed prediction for the new policy. The UI's single long smoke step was insufficient to show which OS/app phase was progressing.

The new sequence is first boot → valid Settings PID → successful Settings termination → install CPI. Only a thrown pre-install Settings launch permits one shutdown/warm boot of the same fresh owned device and a second readiness probe. Its initial failed command/log remains recorded separately from the recovery log. An invalid successful PID response is terminal. Cold boot, shutdown, warm boot, second probe or termination failure cannot produce a readiness pass. No failed app launch, lifecycle assertion, screenshot or runtime-error check is retried or waived. The first-boot allowance remains 900 seconds, with existing per-command limits and the 30-minute smoke ceiling. On a healthy boot, the old forced restart is absent; unreliable OS readiness retains a bounded recovery path before CPI is installed.

The driver emits phase start/completion timings and a 20-second progress heartbeat with the last OS log line. It records `ios-provisioning-summary.json` with per-phase status, budgets, elapsed times and a restart flag, then explicitly announces app cold-start verification. The native command transcript, host-pressure sample, fresh-device ownership/cleanup, two full app starts (one for a selected smoke profile), lifecycle boundaries, screenshots and error assertions remain required. The final PR records observed new-run timings and acceptance; local deterministic orchestration tests alone are not simulator evidence. No game rules, economy, real payments or runtime service permissions change.

## Sources inspected

- [Capacitor v8 Android custom code](https://capacitorjs.com/docs/android/custom-code) and [iOS custom code](https://capacitorjs.com/docs/ios/custom-code).
- [Apple required-reason API categories](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype), for SystemBootTime in-app elapsed timing.
- Locked 8.5.3 Android sources: `MockCordovaWebViewImpl.java`, `BridgeActivity.java`, `PluginHandle.java`; iOS: `CapacitorBridge.swift`, `CAPBridgeViewController.swift`, `WebViewDelegationHandler.swift`.
- [CPI-001 timing contract](CPI-001-product-contract.md), [CPI-005 clock boundaries](CPI-005-game-core.md) and [CPI-006 input ownership](CPI-006-death-progress.md).
