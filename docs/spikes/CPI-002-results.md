# CPI-002 — Mobile compatibility spike: evidence and remaining gates

**Status: in progress, 2026-11-01.** The isolated lab is implemented and its web/server behavior is verified locally. Both Android debug and unsigned iOS Simulator compilation passed in GitHub Actions. Physical Android/iPhone behavior, actual Google SSV delivery, exact Families eligibility and a deployed backend cost/latency decision remain open. **CPI-002 is not complete and CPI-003 is not cleared by a browser result.**

The accepted product rules remain 300 starting SP, a 400 SP maximum, 200 SP for continuations 1–5 and 150 SP for 6–10. The tenth continuation remains playable; the next death ends that run. The lab is not the full endless game: it has a fixed diagnostic scene and 20 SP damage per wrong test step. Its results are never ranked. See the [accepted product contract](../decisions/CPI-001-product-contract.md), [lab instructions](../../spikes/mobile/README.md), [probe API contract](../../spikes/mobile/server/CONTRACT.md) and [native source audit](CPI-002-native-audit.md).

## 1. What was built

- A small React/TypeScript bridge scene, portrait-oriented native wrappers, safe-area CSS, 44 px minimum button heights, reduced-motion support and an opt-in Web Audio diagnostic tone. Input and sound pause while an ad is open, while backgrounded, or after manual Pause.
- A server-authoritative test run with opaque bearer credentials, ordered steps and idempotency. The client retains an unacknowledged step's exact sequence, side and key; it permits a retry or authoritative state read before another choice. A fatal step plays one death cue.
- A continuation intent that fixes the promised SP and ordinal before the ad. Server grant, ad dismissal and local restoration are separate states. Earned/dismissed event order, duplicate grants, duplicate restoration and late callbacks cannot create extra SP.
- A real ECDSA SSV verifier and bounded Google public-key cache. Local tests use local signing keys. They prove verifier behavior and intent/user/ad-unit binding, not delivery from Google. Provider `reward_amount` never determines SP.
- Native Google demo-ad integration with listener cleanup, a callback-only test that needs no backend, and an explicit exit from a closed but unverified demo probe. That exit creates no grant and does not cancel the retained server intent. Durable recovery after WebView reload/app kill is outside this volatile lab and remains unimplemented.
- Reproducible native generation and three CI jobs: web validation, Android debug APK, and unsigned iOS Simulator app. No production ad IDs or store-signing credentials are embedded.

The scene uses the source game's two-choice bridge/HUD approach and visual palette, reviewed at `georgi-cole/bbmobilenew-source@6ace929a60410e728928aa51eaf80ba9b5cf2262`. It does not copy the original component's application integrations, complete stylesheet, large background image or global audio manager. The diagnostic tone is new. No changes are made to Big Eye.

## 2. Version record

These are the pinned candidates. Package/configuration checks and the native resolutions listed below have passed; device validation is still required. The [native audit](CPI-002-native-audit.md) gives immutable source references and the plugin's known callback/privacy behavior.

| Component | Candidate / observed version |
| --- | --- |
| Local host | Linux x86_64; Node 24.22.1; npm 11.9.0 |
| CI Node | 22.23.4; package engines `>=22.23.4 <25` |
| React / React DOM | 19.2.9 / 19.2.9 |
| TypeScript / Vite / Vitest | 5.9.3 / 8.0.16 / 4.1.2 |
| Capacitor core/CLI/Android/iOS | 8.5.3 |
| Capacitor App / community AdMob | 8.1.2 / 8.2.1 |
| Android native SDKs | GMA 25.4.0; UMP 4.0.0; no external mediation adapters |
| Android tools | Temurin 21.0.13+9; Gradle 8.14.3 (embedded Kotlin 2.0.21); AGP 8.13.0; application Kotlin 2.2.20; compile/target API 36; minimum API 24 |
| iOS native SDKs | GMA 13.11.0; UMP exact 3.1.0; Capacitor SPM 8.5.3 |
| iOS tools | macOS 26 / Xcode 26.6 (17F113); Swift 6.3.3; observed iPhone Simulator SDK 26.5; minimum iOS 15; iPhone target |
| Lab app ID | `com.georgicole.crystalpath.spike` |
| Privacy test context | Fixed child/unknown; separate UMP/GMA flags, G rating, non-personalized request, Android AD_ID removed |

The original plugin's Android GMA dependency is dynamic. The lab overrides it with the exact version supported by its Gradle configuration. Its application-level SPM constraint pins UMP without modifying third-party package manifests. The generator owns `cap sync`; a later standalone sync can remove that application constraint. `--check` detects the overwrite. Exact native version checks also run against resolved CI dependency reports.

### Native build evidence

| Evidence | Current state |
| --- | --- |
| Generate Android/iOS from actual built web bundle | PASS locally; both generated projects passed `--check` |
| Parse generated Android XML and iOS plist | PASS locally |
| Third-party native manifests unchanged by generation | PASS locally; fingerprint checks enforced |
| Android debug compilation / resolved dependencies / merged AD_ID permission | PASS: GMA 25.4.0 / UMP 4.0.0 resolved; APK produced; merged AD_ID absent |
| iOS Simulator compilation / resolved SPM versions and lockfile | PASS: Capacitor 8.5.3 / GMA 13.11.0 / UMP 3.1.0 resolved; unsigned Simulator app produced |
| Real phone installation / display of test ads | Not executed |

First native build: [Actions run 41322334324](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41322334324), source head `26a4bfafe988ff61e51cc31ee61c11bc25f13e76`; [compact evidence record](evidence/CPI-002-native-build.json). All three mobile jobs and the separate planning check passed. The actual [SPM lock](../../spikes/mobile/native-locks/Package.resolved) is captured from the iOS evidence artifact and is reused with automatic package resolution disabled. [PR #40](https://github.com/georgi-cole/crystal-path-infinity/pull/40) shows current-head checks, including the subsequent locked rebuild.

Build artifacts are retained for seven days. The CI build proves compilation, not phone behavior or ad delivery. The Simulator archive is not an installable physical-iPhone IPA.

## 3. Executed local checks

`npm run typecheck`, **30 Vitest tests** and `npm run build` pass. Tests cover server authority, all ten SP amounts, fatal-row scoring, idempotency and transaction reuse, signed raw-query integrity, HTTP trust boundaries, callback order, foreground/manual pause, evidence separation and partial native-listener registration failure. Native-ad unit tests use a mocked bridge.

The production bundle is approximately 223.19 kB for the main JavaScript file, 6.55 kB CSS and two small plugin web chunks; main-JS gzip is 71.06 kB at this observation. This is not the final game's asset/download size.

Headless desktop Chromium **145.0.7632.6** exercised the actual React app over local HTTP. Results: [flow checks](evidence/CPI-002-browser-flow.json) and [response-loss checks](evidence/CPI-002-browser-recovery.json).

| Check | Observed result |
| --- | --- |
| 320×568, 390×844, 844×390 viewports | No horizontal overflow; all measured buttons at least 44 px; reduced-motion transition disabled |
| Start / step | 300 starting SP; completed row changes only after server response |
| No-fill then retry | No reward, no consumed continuation |
| Ten continuations, alternating earned/dismissed order | 200, 200, 200, 200, 200, 150, 150, 150, 150, 150 SP |
| Pause while verified | Restore blocked until Resume |
| Death after continuation ten | Terminal state; no eleventh continuation |
| Evidence export | `official:false`; no run token; no claimed native SSV grants |
| Step committed but response deliberately dropped | New choice blocked; retry preserves exact command; server mutates once |
| Lost response followed by state read | Client catches up and permits the next choice |
| Delayed step response | Waiting state visible; second input blocked |
| Restore committed but response dropped | State read restores UI once; no second SP reset |
| Uncaught page errors | None in these checks |

Desktop viewports do not test actual cutout insets, native frame performance, device audio focus, the ad renderer, or an iOS/Android lifecycle. App kill/relaunch recovery and native export/download behavior remain untested/unimplemented as applicable. This lab has no authentication, profile collection or public leaderboard.

## 4. Actual HTTP measurements and resource model

Run `npm run measure` from `spikes/mobile`. [The recorded raw report](evidence/CPI-002-loopback-http.json) was produced by the committed harness using actual serial loopback HTTP requests. Server and client shared the same Linux host. No TLS, cloud runtime, database or mobile network was involved. Each profile is one controlled run, not a capacity benchmark.

The long-run fixture always chooses the safe side to isolate mechanics and storage. It reaches **row 10,000 while still playing**, passes row 350 without a finish event, rejects duplicate advancement, and then returns an explicit *lab resource-budget* error at its configured action budget. This is not a balance/playability result. The interactive fixture retains a separate 1,000-action/20-run budget; neither budget becomes a product row limit.

| Profile | Successful step samples | p50 round trip | p95 round trip |
| --- | ---: | ---: | ---: |
| Loopback, no artificial delay | 10,000 | 0.306 ms | 0.667 ms |
| 150 ms artificial server delay | 30 | 151.745 ms | 152.988 ms |
| 600 ms artificial server delay | 12 | 602.182 ms | 605.012 ms |

The injected delay is not a simulated cellular network. The sub-millisecond loopback result must not be used as a forecast for an internet-connected phone. At 600 ms per acknowledged step the waiting is directly imposed on play; that profile exceeds the proposed normal-play latency target below.

### Request and storage observations

Across 10,000 successful steps, request JSON averaged **86.889 bytes** and response JSON **559.227 bytes**, or **646.116 bytes per pair**. This excludes headers, TLS, protocol framing, ads, authentication and database operations. The full scenario made 10,009 HTTP requests including setup, metric snapshots, a duplicate and a deliberate budget-error request. The one reported HTTP error is that expected budget test.

| Cleared rows | Retained actions | Serialized action-history bytes | Public checkpoint JSON bytes |
| --- | ---: | ---: | ---: |
| 100 | 100 | 14,977 | 446 |
| 351 | 351 | 53,380 | 446 |
| 1,000 | 1,000 | 152,680 | 451 |
| 10,000 | 10,000 | 1,556,683 | 456 |

These counts serialize the actual fixture records. They are not heap usage, a database's billable storage, indexes or replicas. The public checkpoint excludes credentials/private server state; reward-bearing checkpoints will be larger. The 10,000-step scenario's measured sum of HTTP-handler wall times was 751.856 ms, including diagnostic endpoints; this is not CPU time or billed serverless execution. Injected waits are included in handler wall time in the delayed profiles.

For an **assumed**, sustained interaction rate, the measured payload model gives:

| Assumed steps per second per active player | Step requests per minute | Step JSON transfer per minute, both directions |
| --- | ---: | ---: |
| 0.5 | 30 | about 19.4 kB |
| 1 | 60 | about 38.8 kB |
| 2 | 120 | about 77.5 kB |

For example, 1,000 simultaneously active players at one step/second imply **1,000 step requests/second**, before polling and rewards. This is arithmetic, not a demonstrated throughput capacity. A production run with `N` step attempts and `V` completed continuations adds at least creation, reward-intent requests, provider verification callbacks and restore requests; a planning model is `N + 1 + 3V + P + R + F`, with `P` reconciliation polls, `R` retries and `F` finish/account/other endpoints. Frontend retry idempotency prevents extra game mutations, not extra infrastructure requests.

No backend provider has been selected or priced by this test. The cost worksheet for the next deployment must use actual provider rates and measured `requests × request rate + runtime × compute rate + reads/writes × DB rates + retained bytes × storage rate + egress × transfer rate`, then add logging/monitoring. It must include checkpoint frequency, history retention, abandoned/pending runs, reward ledgers, high-concurrency runs and retention policies. Persisting the entire 10,000-action history indefinitely is not an accepted architecture decision.

### Proposed UX and resource gates

These are engineering targets for the device/deployed-server test, not a claimed industry formula:

- For normal online play: acknowledged-step p50 ≤150 ms and p95 ≤250 ms on the chosen launch regions; measure at least 200 actions per device/network profile.
- Immediate local pressed/waiting feedback should appear within 50 ms, without revealing or predicting the authoritative safe side. A request awaiting confirmation cannot permit a new choice.
- Slow/offline: visible waiting state, exact-command retry or state reconciliation, no duplicated progress and no local promotion to a ranked result. The current HTTP timeout is 12 seconds; final retry UX must be assessed on phones.
- Test 1,000 and 10,000 action histories against the selected persistent model, plus expected and peak concurrency. Keep bounded rendering/checkpoints and define retention/compaction without a product finish row.
- If internet/device p95 cannot fit the play budget, change backend placement/transport/transaction design before CPI-003. Do not expose future path answers to hide the latency.

## 5. Remaining device and account evidence

Google demo units can show test ads and exercise native callbacks. They are not account-owned units on which we can configure our SSV endpoint. Real end-to-end verification requires owned AdMob app/unit configuration, registered test devices and a reachable HTTPS callback. See [Google's SSV prerequisites](https://developers.google.com/admob/android/ssv), [AdMob callback setup](https://support.google.com/admob/answer/9603226?hl=en) and the [exact plugin findings](CPI-002-native-audit.md).

| Gate | Android | iPhone | Required record |
| --- | --- | --- | --- |
| Install and launch on real hardware | Pending | Pending | Device, OS, build SHA, memory class / hardware |
| Portrait, cutout/home indicator, repeated input | Pending | Pending | Recording and observed layout/input behavior |
| Audio on/off, ad audio focus, background/foreground | Pending | Pending | Audible recording plus lifecycle trace |
| Real test-ad load, earned, dismissed, no-fill and repeated attempts | Pending | Pending | Native callbacks and listener/resource observations |
| Fixed child/unknown consent/request flags | Pending | Pending | Fresh-install consent/SDK request behavior |
| Owned-unit signed SSV for one opaque intent | Pending | Pending | Google signature verified; exact unit/user/intent; one grant |
| Delayed/replayed SSV and recovery | Pending | Pending | Exactly-once grant; no second SP reset; persistent recovery design |
| Deployed endpoint p50/p95 and poor-network UX | Pending | Pending | ≥200 measured actions per declared device/network profile |
| Exact Families SDK eligibility / later mediation | Pending | — | Current exact-version record; no adapter inferred compliant |

To perform these tests, the remaining external inputs are an Android phone, an iPhone with a Mac/signing setup, and later an account-owned AdMob rewarded test configuration plus a deployed HTTPS probe. The callback-only build can be exercised before the backend/owned-unit setup. App IDs, ad-unit IDs and test-device configuration belong in a reviewed test change; do not add credentials to this public repository.

The current lab uses a single child/unknown context, so adult/teen transitions, consent revocation, App Tracking Transparency paths, durable app-kill recovery and production SSV-log redaction are not implemented evidence. They remain listed in the native audit and the corresponding later privacy/runtime tasks; they cannot be treated as passed by this spike's unit tests.

## 6. Current decision

**Continue the successfully compiled Capacitor candidate through physical-device validation.** Published source supports the necessary SSV bridge, and the local application/server flow has no demonstrated blocker after the fixes above. **Hold the final CPI-002 go/no-go and keep the task open** until native/device/SSV and deployed latency/resource evidence is recorded. The server's volatile state and demo ad IDs are intentional diagnostic boundaries, not production choices.
