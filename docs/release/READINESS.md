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

## Gates that remain open

| Backlog gate | Evidence still required | Current state |
| --- | --- | --- |
| CPI-019/026 privacy and online issuer | Approved jurisdictions/consent/guardian policy, trusted issuer integration, exact SDK inventory and verified protective signals independent of optional analytics | No live approval; disabled |
| CPI-027 native rewarded SDK | Reviewed bridge/native/mediation versions, account-owned app/ad-unit configuration, real-device SSV test and closeability evidence for supported privacy contexts | No actual ad SDK activated; disabled |
| CPI-028 pending reward operations | Named support owner, actual delayed-callback incident exercise and reviewed retention/reconciliation procedure preserving earned rights | Source safeguards exist; operational acceptance open |
| CPI-034 physical-device QA | Exact-build Android/iPhone matrix, weak Android, narrow safe areas, VoiceOver/TalkBack, larger text, reduced motion, lock/call interruption and weak-signal recovery | Not run in this task |
| CPI-034 endless/revive evidence | Physical sessions beyond 350→351, long-soak memory/frame/network/storage measurements; ten real rewarded revives, 5→6 200/150 SP boundary, no-fill/error and restart cases | Synthetic mechanics tested; physical/ad/balance evidence open |
| CPI-035 signed betas | Verified new store records and ownership, secret-store signing setup, actual unique store version history, signed package, matching symbols/mappings and external-device install from normal beta channels | Only unsigned preparation source; no signing or distribution |
| CPI-036 store package | Real build captures, accurate BG/EN copy, chosen target audience/category/rating, exact SDK/network privacy disclosures, verified support/privacy/deletion URLs and reviewer access | No forms submitted, screenshots fabricated or URLs invented |
| CPI-037 live operations | Named support/security paths and owners, numeric alarms, real backup restore/forward-fix exercise, outage/late-SSV/ruleset drill and incident coverage | Source controls/runbook only; no monitor deployed |
| CPI-038 public go/no-go | Accepted P0 issues, reviewed beta and balance data, numerical rollout stop/continue criteria, checked signed production build, named release owner and explicit approval | NO GO |

The source retains guest practice without optional analytics, account or ad availability. Neither unknown age nor a failed ad request synthesizes an adult context, a grant or ranked score. No pending reward is silently forfeited to meet a release deadline.

## Capture and store-material handoff

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
