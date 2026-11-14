# First-version release evidence ledger

**Decision on 2026-11-04: NO GO for live services and public distribution.** The user explicitly requested that live services remain disabled. Source implementation and reviewable PRs continue; the remaining acceptance gates below are not represented as completed. Nothing in this ledger authorizes deployment, account/ad activation, paid registration or store submission.

## Reviewable source

Merged work through [PR #68](https://github.com/georgi-cole/crystal-path-infinity/pull/68), baseline `9384060`, was the starting point. The following stacked PRs carry the remaining source slices. Their linked check runs and reviews determine acceptance; being in this table does not mean merged, deployed or verified on a physical device.

| PR | Source scope | Acceptance limit |
| --- | --- | --- |
| [#69](https://github.com/georgi-cole/crystal-path-infinity/pull/69) | CPI-019/020 own profiles and frozen regions | Trusted account/privacy issuer remains separately gated |
| [#70](https://github.com/georgi-cole/crystal-path-infinity/pull/70) | CPI-021/022 server authority, leases, private checkpoints and durable SQL | Disposable database tests do not demonstrate a hosted deployment |
| [#71](https://github.com/georgi-cole/crystal-path-infinity/pull/71) | CPI-023/024 authoritative leaderboard projections | Production data/latency are unmeasured |
| [#72](https://github.com/georgi-cole/crystal-path-infinity/pull/72) | CPI-031 export, revocation and deletion lifecycle | Actual account-provider/session revocation still needs host integration |
| [#73](https://github.com/georgi-cole/crystal-path-infinity/pull/73) | CPI-025 moderation and report isolation | Named support/staff ownership remains external |
| [#74](https://github.com/georgi-cole/crystal-path-infinity/pull/74) | Optional mobile account/ranked consumption and real HTTP/SQL roundtrips | Defaults remain guest practice; no live issuer is supplied |
| [#75](https://github.com/georgi-cole/crystal-path-infinity/pull/75) | CPI-026/028 trusted permits, immutable reward intents and verified SSV ledger | Synthetic locally signed callbacks are not real Google/SDK evidence |
| [#76](https://github.com/georgi-cole/crystal-path-infinity/pull/76) | CPI-029/030 explicit reward choices, saved pending runs and recovery | No native ad SDK initialization or real-ad device result |
| [#77](https://github.com/georgi-cole/crystal-path-infinity/pull/77) | CPI-032/037 bounded diagnostics, start/recovery controls and fixed server composition | No hosted monitor, backup exercise or operator approval is implied |
| CPI-035 preparation, this PR | Unsigned device-artifact workflow, provenance/version guards and this ledger | CPI-035 signed-beta acceptance remains open |

Unit, adversarial, disposable PostgreSQL and browser/native smoke evidence must retain the exact tested PR head. Native/emulator evidence from an earlier head does not certify later source changes. The source PRs retain the existing required quality, planning and native checks; source-only test flags cannot grant official progress or rewards.

## Evidence recorded in this preparation

These local results used a working tree based on `edf5151e10ddb70ae0db6af67ecbcc46788c5064` with the preparation/runtime edits. They are repeatable development checks, not a clean-source signed attestation or published beta:

| Check | Result | What it establishes |
| --- | --- | --- |
| Release-input and environment tests | 23 passed | Input bounds, standalone IDs, source/build metadata matching, live-config rejection and default behavior |
| Unsigned source/workflow guards | 3 passed | Exact-source required checks, manual main-only preparation, reused-counter rejection and no signing/store credentials |
| Synthetic archive/Mach-O verifier | 3 passed | Metadata/signature/secret/path guards on local fixtures; not actual device-binary inspection |
| Staging web build; Android/iOS generation and `--check` | Passed with native build 42 | Both generated platforms and copied public metadata agree on selected staging identity/version/build |
| Ordinary development build; Android/iOS generation and `--check` | Passed, restored build 1 | Existing default development behavior is preserved |
| Actual client/handler/SQL integrations | Seven suites passed locally on pinned Node22 with all current migrations in disposable PGlite | Profile/ranked/retry/recovery, mobile parsing, synthetic SSV, publication, moderation, lifecycle and operational kill/build/recovery controls work through the fixed server router |
| Manual unsigned device packaging | Not run | Requires reviewed source on `main` and the exact successful required checks. AAB native-manifest inspection remains explicitly outside this preparation's verification scope |
| Signing, channel installation, real rewarded ads, physical-device performance | Not run | Remain acceptance gates below |

PGlite integration is additional local evidence. Required CI still runs against disposable PostgreSQL; neither constitutes production-scale latency, cost, device, provider or privacy approval evidence. Record CI URLs, artifact digests and the accepted source SHA in the eventual go/no-go record.

## Android Internal Testing evidence · 2026-11-07

- Source `bf7f804ec8e974eec75813b831030015fb4134e7`, package `com.georgicole.crystalpath.infinity`, version `0.1.0`, build `1`, min SDK 24 and target SDK 36. The signed AAB contains the Google Play Billing permission and points to the separate Crystal Path staging API. Ads are disabled for this build.
- `npm run build:production`, Android generation and `--check`, Gradle `:app:bundleRelease`, `jarsigner` verification and `bundletool validate` passed. This build uses the registered Play package with a staging API URL. The signed AAB SHA-256 is `770D60F45538B08D35095189C6F926A2C1B7C7DA665364CD9804C63C5C93BB69`.
- Google Play showed `Active` and `Available to internal testers` for `0.1.0 (1) - Billing internal`. The internal tester list and account-wide License testing list were verified. All 18 Android one-time products showed one active purchase option. [Tester opt-in](https://play.google.com/apps/internaltest/4701734144458822899).
- The upload key is separate from Play App Signing. Its private keystore is stored outside the repository, with the password protected for the current Windows user. Google Play reported a non-blocking missing deobfuscation file warning. Installation, actual test checkout and server fulfilment on a phone are pending. The public go/no-go decision remains open.

## Gates that remain open

| Backlog gate | Evidence still required | Current state |
| --- | --- | --- |
| CPI-019/026 privacy and online issuer | Approved jurisdictions/consent/guardian policy, trusted issuer integration, exact SDK inventory and verified protective signals independent of optional analytics | No live approval; disabled |
| CPI-027 native rewarded SDK | Reviewed bridge/native/mediation versions, account-owned app/ad-unit configuration, real-device SSV test and closeability evidence for supported privacy contexts | No actual ad SDK activated; disabled |
| CPI-028 pending reward operations | Named support owner, actual delayed-callback incident exercise and reviewed retention/reconciliation procedure preserving earned rights | Source safeguards exist; operational acceptance open |
| CPI-034 physical-device QA | Exact-build Android/iPhone matrix, weak Android, narrow safe areas, VoiceOver/TalkBack, larger text, reduced motion, lock/call interruption and weak-signal recovery | Not run in this task |
| CPI-034 endless/revive evidence | Physical sessions beyond 350→351, long-soak memory/frame/network/storage measurements; ten real rewarded revives, 5→6 200/150 SP boundary, no-fill/error and restart cases | Synthetic mechanics tested; physical/ad/balance evidence open |
| CPI-035 signed betas | Matching symbols/mappings where applicable, external-device install from normal beta channels and signed iOS TestFlight evidence | Android `0.1.0 (1)` signed and available in Internal Testing. External-device installation and iOS beta pending |
| CPI-036 store package | Real build captures, accurate BG/EN copy, chosen target audience/category/rating, exact SDK/network privacy disclosures and reviewer access | The Pages build includes privacy, support and a public email deletion route. Store forms and support mailbox acceptance remain open |
| CPI-037 live operations | Named support/security paths and owners, numeric alarms, real backup restore/forward-fix exercise, outage/late-SSV/ruleset drill and incident coverage | Source controls/runbook only; no monitor deployed |
| CPI-038 public go/no-go | Accepted P0 issues, reviewed beta and balance data, numerical rollout stop/continue criteria, checked signed production build, named release owner and explicit approval | NO GO |

The source retains guest practice without optional analytics, account or ad availability. Neither unknown age nor a failed ad request synthesizes an adult context, a grant or ranked score. No pending reward is silently forfeited to meet a release deadline.

## Public player information · 2026-11-09

- [Privacy policy](https://georgi-cole.github.io/crystal-path-infinity/privacy.html), [support](https://georgi-cole.github.io/crystal-path-infinity/support.html) and [account deletion requests](https://georgi-cole.github.io/crystal-path-infinity/support.html#account-deletion) are packaged with the public web build. The pages are available in English and Bulgarian and identify Innovation Creativity Opportunities Ltd and `support@kolequant.xyz`.
- The web release uses guest play. The policy identifies optional account and native features by availability. Confirm support receipt and handling, and match the store disclosures to the signed candidate and its enabled SDKs before submitting.

## Capture and store-material handoff

The [10 November store media set](store-media/README.md) provides the six English panels and the Play feature graphic in the required dimensions. The panels use the production player UI on a portrait browser viewport and are tracked separately from physical-device release evidence.

Use the exact candidate named in a receipt. Record source SHA, app/bundle ID, marketing/native versions, ruleset, environment, device model/OS, locale and privacy/ad context before recording. Preserve original image/video files and their hashes. Remove account identifiers, tokens, emails and provider transaction data from shared captures.

For the currently disabled-services build, capture only actual guest practice, settings/help and available navigation; describe those capabilities accurately. Do not stage a leaderboard, rewarded choice or successful sign-in as if live. The full CPI-036 package requires captures from the later accepted signed build with its approved services, including bridge/SP, actual leaderboard and the explicit rewarded choice where available.

For each screenshot, retain the untouched device capture, platform-required export dimensions and source receipt. Review BG/EN text against that same build. Do not copy old Big Eye location declarations, infer age ratings from “all ages,” claim guaranteed ad availability or promise infinite lives. Confirm support/privacy/deletion pages are reachable for the new product before entering any URL in a store form.

## Eventual go/no-go record

The release owner must fill this record after the evidence exists:

- Source SHA, signed package hashes, platform app IDs, marketing/native versions, ruleset and environment.
- Required CI/check links, reviewed PRs, device matrix, beta-channel installation results, matching symbol/mapping receipts and unresolved defects.
- Exact consent/guardian/SDK inventory and privacy approval; actual store disclosures, support/deletion URLs and account prerequisites.
- Measured session/distance, memory/frame pacing, latency/error, no-fill, delayed SSV, ad/play-time and `revivesToReachScore` data with sample sizes and limits.
- Named release/incident owners, numerical rollout bounds and stop criteria, backup/recovery drill evidence and explicit approval decision.

Until that record is accepted, keep the live issuer, ranked/ad starts and provider configuration disabled. A source merge, an unsigned artifact or a green synthetic test does not change this decision.
# Launch correction candidate · 14 November 2026

Version 1.0.2 prepares an explicit Ranked Infinity entry, clearer ranking/ad copy,
bounded guest ad initialization, and final-row Campaign transition/audio hooks.
The released 1.0.1 (72) is unchanged until a replacement is built and distributed.
The iOS AdMob App Store link is now saved; publisher verification still blocks
claiming successful ad readiness. At that initial checkpoint, production ranked
admission was unverified and no live database policy had changed.
[Detailed evidence and acceptance checklist](../operations/APPSTORE_LAUNCH_FIXES_20261114.md).

**Follow-up, 14 November 2026, 21:10 UTC:** production access is verified. Audited
policy revision 2 enables v11-live ranked starts, retains historical recovery and
leaves server-verified ad starts disabled. A rolled-back effective-role preflight
and independent World/BG/EU reads passed. All original runtime-source GitHub checks,
including both native launch checks, passed. Phone ranked acceptance, AdMob
verification, audio assets and replacement distribution remain pending.
