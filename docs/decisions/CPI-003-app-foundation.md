# CPI-003 — Standalone app foundation

**Status: implementation complete; review and merge tracked in [PR #41](https://github.com/georgi-cole/crystal-path-infinity/pull/41), 2026-11-01.** This task provides the independent application workspace, minimal screen, three environment identities, generated native projects, and build/launch checks. The acceptance criteria are in [issue #3](https://github.com/georgi-cole/crystal-path-infinity/issues/3). This document records the observed build and launch evidence with its source revisions; the PR checks and handoff record verify the final revision.

Georgi merged [PR #40](https://github.com/georgi-cole/crystal-path-infinity/pull/40) and explicitly requested CPI-003. We use the successfully compiled CPI-002 toolchain while leaving its physical-device, real SSV, Families eligibility, and deployed-backend evidence open in [issue #2](https://github.com/georgi-cole/crystal-path-infinity/issues/2). The [CPI-001 contract](CPI-001-product-contract.md), including endless progression and 200/150 SP revives, remains authoritative.

## 1. Independent workspace

The repository root owns one npm workspace, `apps/mobile`, and one root lockfile. The separate CPI-002 laboratory keeps its own package and lockfile under `spikes/mobile`. App commands do not import, install, or run that laboratory or `bbmobilenew-source`.

| Component | Pinned version / decision |
| --- | --- |
| CI and documented Node | 22.23.4, root `.nvmrc` |
| React / React DOM | 19.2.9 |
| TypeScript | 5.9.3 |
| Vite / React plugin | 8.0.16 / 5.2.0 |
| Vitest | 4.1.2 |
| Capacitor CLI / core / Android / iOS | 8.5.3 |
| Android compilation | JDK 21; SDK 36; build tools 36.0.0; generated Gradle 8.14.3 wrapper |
| iOS compilation | Xcode 26.6; unsigned iPhone Simulator; iOS 26.5 SDK/runtime |

The [CPI-002 build record](../spikes/CPI-002-results.md) is the basis for these toolchain choices. CPI-003 produces its own app build and launch evidence separately.

Runtime dependencies are React, React DOM and the three Capacitor platform/core packages. There is no Pixi, Three, Remotion, season store, billing, location, ad SDK, authentication, analytics, or backend integration. The crystal artwork is new inline SVG, with no copied binary assets or third-party font downloads. Big Eye is unchanged.

## 2. Separate identities and environment selection

| Environment | Android application ID and iOS bundle identifier | Display name |
| --- | --- | --- |
| Development | `com.georgicole.crystalpath.infinity.dev` | Crystal Path Dev |
| Staging | `com.georgicole.crystalpath.infinity.staging` | Crystal Path Staging |
| Production | `com.georgicole.crystalpath.infinity` | Crystal Path Infinity |

These identifiers are **provisional until store registration**, belong to this standalone project, and do not reuse Big Eye production identifiers. App version `0.1.0` comes from the app package; native build number starts at `1`.

Root build commands explicitly select Vite's mode. `CPI_APP_ENV` selects Capacitor configuration; it cannot silently relabel a web build. The shared environment contract writes `dist/build-info.json` and injects the same public metadata into the app. Before any native project is replaced, the generator requires the exact environment, identity, version and metadata schema. It then verifies the copied assets. The Capacitor loader also rejects copying missing or mismatched web output through direct `add`, `copy`, `sync`, `build` or `run` commands.

Development and staging show the environment, version, public app ID and platform on screen. Production hides those diagnostics. Only development enables native WebView debugging. Environment examples contain blank placeholders; no environment file, service account, secret or backend setup is needed to run the scaffold. `VITE_*` configuration is public and must never contain secrets.

## 3. Native configuration as source

[`generate-native.mjs`](../../apps/mobile/scripts/generate-native.mjs) is the source of lasting native settings. It runs Capacitor `add` and `sync`, applies settings, and verifies the result. The selected `android/` or `ios/` directory is generated, ignored, and disposable; regeneration replaces local edits. The command accepts either platform and all three environments. `--check` validates an existing matching project without regenerating it.

Both platforms use portrait orientation and a dark launch background. Native launcher icons remain template placeholders and the designed splash screen remains a later backlog task. The visible React screen is deliberately minimal: it proves the application can render before gameplay extraction begins.

Capacitor's bundled `SystemBars` explicitly uses `DARK` styling, meaning light system-bar content against the dark screen. Android uses `insetsHandling: native` and a `cover` viewport hint; the screen already consumes CSS `env(safe-area-inset-*)`. This uses Capacitor's native inset handling without its additional JavaScript CSS-variable injection. iOS also receives light status-bar content and retains its overall dark appearance. These are core presentation settings, with no extra plugin package or permission. The [Capacitor 8 documentation](https://capacitorjs.com/docs/apis/system-bars) describes the style and Android inset modes; the pinned 8.5.3 Android and iOS implementations were inspected when choosing these settings.

Android declares Internet access only at app level, disables cleartext traffic and backup, and carries no release signing configuration. Compiled-manifest checks also permit AndroidX's app-scoped signature permission for non-exported dynamic receivers; that framework protection is not a location, billing or advertising permission.

iOS targets iPhone, has no permission purpose strings or ATS exceptions, and uses manual signing with signing disabled. CI builds an unsigned Simulator app. Its SPM graph must contain only Capacitor 8.5.3. No signing files, production ad IDs, third-party production credentials, GPS or billing requests belong in this task.

## 4. Verification record

Local execution uses Node 24.22.1 / npm 11.9.0 on Linux; the repeatable CI pin is Node 22.23.4. Native generation on Linux validates project configuration, not native compilation.

| Check | Current evidence |
| --- | --- |
| Clean checkout | Passed in an isolated directory with 21 input files; `npm ci --ignore-scripts --offline` installed 196 packages from cache |
| Dependency independence | No lab, source repo or preexisting dependencies copied; dependencies resolved within the isolated directory, with no external symlinks |
| Strict TypeScript | Passed in the original and isolated workspaces |
| Environment contract | 19 tests passed, including cross-environment relabeling, stale version and invalid metadata |
| Development / staging / production web builds | All passed from the isolated install; metadata matched each requested identity and version |
| Android / iOS generation | Both platforms generated and validated for all three environments; see the retry note below |
| Environment mismatch before mutation | Four dev-bundle → staging/production requests rejected; complete native tree fingerprints and key-file hashes stayed unchanged |
| Browser screen | Passed on Chromium 145.0.7632.6 at 320×568, 390×844 and 844×390; also 200% root text size at 320×568 |
| Browser errors / requests | No uncaught or console errors; no external requests observed in the tested screen |
| Built staging / production UI | Passed at 390×844: staging showed its exact metadata; production hid diagnostics and emitted no ready log |
| Android debug compilation | Passed, including compiled identity and permission checks; revision/run provenance below |
| Android emulator launch | Run 4 passed on a Pixel 7 AVD, Android 16 / API 36, with matching React ready metadata, launch JSON and an inspected screenshot |
| iOS Simulator compilation | Passed, including compiled identity, permission and locked SPM checks; revision/run provenance below |
| iOS Simulator launch | Passed in runs 2 and 4 on a fresh iPhone 17 / iOS 26.5 Simulator; run 2's matching ready metadata and screenshot were inspected |
| Planning validation | Passed; 38-issue manifest valid and all 13 bootstrap tests passed |

The enlarged-text check found heading overflow and led to a responsive typography fix. The repeated check showed no horizontal overflow in all four cases. Narrow or short screens can scroll vertically; text and build metadata remain reachable. Reduced-motion preference was enabled for these checks, and the minimal screen has no required animation.

The first local environment matrix had one production iOS generation fail with `platform already exists`. A separate retry and a focused isolated matrix, including consecutive production regeneration, passed; no reproducible cause was established for that original observation. Later, Android regeneration in the synchronized workspace encountered a previously configured manifest instead of the original template. Its historical content and preserved old modification time, together with a new change time, strongly support restoration of stale generated files; the responsible process was not traced. The installed template was unchanged. Fresh Android generation and regeneration, and iOS generation, passed in isolated `/tmp` fixtures using the current source. Strict template assertions remain in place. These local workspace observations are not presented as application defects fixed by weakening validation, and fresh CI checkouts provide the separate native build/launch evidence.

An independent review found that repeated launch checks could leave a previous success report after a new failure. The script now clears prior reports/screenshots before reading the selected build. A focused failing invocation confirmed the old success output was removed and the new failure was recorded.

[`mobile-app.yml`](../../.github/workflows/mobile-app.yml) installs from the lockfile, builds all three web environments, compiles development native binaries, and checks the identities and permissions inside the built artifacts. It then installs and opens each app using official Android SDK / Xcode tools. A passing native launch requires the React post-commit marker to match the build metadata and a captured PNG screenshot. Result JSON explicitly labels emulator/Simulator evidence as `physicalDevice: false`. Each invocation clears its preceding success/failure report and screenshots so a failed retry cannot present old success evidence.

| Artifact name | Reviewable evidence |
| --- | --- |
| `mobile-app-web-evidence` | Test/dependency logs and three web bundles |
| `mobile-app-android-evidence` | Generated settings, dependency/build/permission records, launch result, logs and screenshot |
| `mobile-app-android-development` | Development debug APK |
| `mobile-app-ios-evidence` | Generated settings, resolved SPM graph, build records, launch result, logs and screenshot |
| `mobile-app-ios-development-simulator` | Unsigned development Simulator app archive |

Artifacts expire after seven days. Failed jobs may upload diagnostics; an uploaded artifact alone is not evidence of a passing build or launch. Source, pinned dependencies and workflow remain the reproduction path.

### Native CI and lock provenance

The [initial app run](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41327823941) at commit `4980ada6aeadf4247c051558cab181962f9161f3` passed web checks and both native compilations. Android emulator setup failed because the shell did not include the command-line tools directory; the workflow now uses the explicit SDK tool paths. iOS timed out while booting the runner's precreated iPhone 17, before the app was installed. The retry created its own simulator and captured `ios-boot.log`. That setup subsequently passed, without establishing the cause of the original timeout.

[`native-locks/Package.resolved`](../../apps/mobile/native-locks/Package.resolved) was copied from that run's [iOS evidence artifact](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41327823941/artifacts/13091934441), whose ZIP SHA-256 was verified before extraction. The resolved graph contains only `capacitor-swift-pm` **8.5.3**, revision `4c7f346d16196e21fbe23d4a7a6fc7af62af6742`. It is the app's own lock, with no laboratory advertising dependencies. Subsequent generation restores it and CI requires locked resolution.

The [second run](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41328968665) at commit `a52489216b0ba07f5b417eef731ccdf897be1cbb` passed the locked iOS build and launch. The [iOS evidence](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41328968665/artifacts/13092353860) contains a matching ready marker, launch JSON and screenshot, which was inspected after verifying the archive SHA-256. Boot took 3 minutes 55 seconds and the recorded delay was OS data migration, including CoreLocation's system migrator; the app has no location permission or feature. No claim is made that a cache defect caused the earlier timeout, and no cache workaround was added. The [unsigned Simulator app](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41328968665/artifacts/13092533346) is available for reproduction.

That run's Android emulator stopped before boot because its Linux loader could not find `libpulse.so.0`. The workflow installs `libpulse0` and the small OpenGL support package `libglu1-mesa`, then executes the normal emulator launcher before downloading its system image. Raw `ldd` output is kept as a diagnostic because the launcher supplies additional bundled-library paths. These are CI host prerequisites, not application dependencies.

The next Android attempt could run the emulator executable but could not find the created AVD. The workflow now shares an explicit `ANDROID_AVD_HOME` between creation and launch, supplies the device data path, and verifies that the emulator lists the AVD before attempting boot. [Run 4](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41330419323), at `d2f65312cca73d021225e369dd629cad64fec7e0`, passed all three jobs: web environments, Android compilation and launch, and iOS compilation and launch. Its [Android evidence](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41330419323/artifacts/13093700518) was downloaded, ZIP SHA-256 verified, and screenshot inspected. The Android report confirms Android 16 / API 36 and the exact development identity. Its [debug APK](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41330419323/artifacts/13093500999) is available for reproduction.

That screenshot exposed low-contrast Android status-bar content, and the log recorded safe-area CSS injection before the document root existed. Inspection of Capacitor's pinned source established that its default system-bar style followed the device theme and its default CSS mode attempted the early injection. The small core `SystemBars` configuration described above addresses both without patching dependencies or suppressing diagnostics. The corrected app source is `97ee49235cefff094aead8310b14d5e5c834e7cb`. Local TypeScript, all 19 configuration tests and isolated native generation/checks passed after this change. Both native compilations also passed in [run 5](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41333235369); this observation does not itself claim a launch result for that run.

The [PR checks](https://github.com/georgi-cole/crystal-path-infinity/pull/41/checks) and PR handoff contain the final revision's build/launch outcome and evidence links. Documentation-only commits after `97ee49235cefff094aead8310b14d5e5c834e7cb` do not change that app source. Before marking the PR ready, inspect the final passing launch reports and screenshots, including light status-bar content and absence of the early CSS-injection error. Keep earlier failed or superseded runs as history; do not substitute their artifacts for evidence from the reviewed revision.

## 5. Scope and next step

CPI-003 establishes an installable application foundation. It does not implement the endless engine, SP/revive flow, accounts, regional rankings, advertising, analytics, final splash/icon art, release signing or store submission. Those stay in the existing backlog, with accepted gameplay values unchanged.

The [app instructions](../../apps/mobile/README.md) provide clean installation and matching web/native commands. CPI-004 follows with the expanded quality gates and required-check configuration. The physical-device, ad/SSV and deployed-backend evidence in CPI-002 remains separately open regardless of this foundation's emulator/Simulator result.

## 6. Reuse direction confirmed during this task

Georgi asked us to reuse suitable The Big Eye splash settings, buttons, shared components, Play, Profile, Hall of Fame and Settings, adapted to Crystal Path. The [screen plan](../SCREEN_PLAN.md), [architecture](../ARCHITECTURE.md), local backlog templates and existing issues #8, #11, #12, #13, #16, #19 and #24 now make that direction explicit. Exact shell component paths will be recorded after inspection during extraction; no unverified paths or wholesale source dependencies are introduced here.

Bridge-tile skins and backgrounds are future presentation variants. The renderer will keep resource/style selection separate from game state. Boosts are a future gameplay decision with their own effect, server validation and ranked-ruleset considerations. This foundation adds no purchase flow or shop; the accepted SP, revive and scoring rules remain unchanged.
