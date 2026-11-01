# CPI-003 — Standalone app foundation

**Status: implemented; native CI evidence pending, 2026-11-01.** This task provides the independent application workspace, minimal screen, three environment identities, generated native projects, and build/launch checks. The acceptance criteria are in [issue #3](https://github.com/georgi-cole/crystal-path-infinity/issues/3). This document records actual results separately from checks that have only been configured.

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

The [CPI-002 build record](../spikes/CPI-002-results.md) is the basis for these toolchain choices. CPI-003 must still produce its own app build and launch evidence.

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
| Android / iOS generation | Both development projects generated and validated locally |
| Environment mismatch before mutation | Integration verification in progress |
| Browser screen | Passed on Chromium 145.0.7632.6 at 320×568, 390×844 and 844×390; also 200% root text size at 320×568 |
| Browser errors / requests | No uncaught or console errors; no external requests observed in the tested screen |
| Android debug compilation and emulator launch | Pending CPI-003 CI execution |
| iOS Simulator compilation and launch | Pending CPI-003 CI execution |
| Planning validation | Pending final changed-document check |

The enlarged-text check found heading overflow and led to a responsive typography fix. The repeated check showed no horizontal overflow in all four cases. Narrow or short screens can scroll vertically; text and build metadata remain reachable. Reduced-motion preference was enabled for these checks, and the minimal screen has no required animation.

[`mobile-app.yml`](../../.github/workflows/mobile-app.yml) installs from the lockfile, builds all three web environments, compiles development native binaries, and checks the identities and permissions inside the built artifacts. It then installs and opens each app using official Android SDK / Xcode tools. A passing native launch requires the React post-commit marker to match the build metadata and a captured PNG screenshot. Result JSON explicitly labels emulator/Simulator evidence as `physicalDevice: false`. Each invocation clears its preceding success/failure report and screenshots so a failed retry cannot present old success evidence.

| Artifact name | Reviewable evidence |
| --- | --- |
| `mobile-app-web-evidence` | Test/dependency logs and three web bundles |
| `mobile-app-android-evidence` | Generated settings, dependency/build/permission records, launch result, logs and screenshot |
| `mobile-app-android-development` | Development debug APK |
| `mobile-app-ios-evidence` | Generated settings, resolved SPM graph, build records, launch result, logs and screenshot |
| `mobile-app-ios-development-simulator` | Unsigned development Simulator app archive |

Artifacts expire after seven days. Failed jobs may upload diagnostics; an uploaded artifact alone is not evidence of a passing build or launch. Source, pinned dependencies and workflow remain the reproduction path.

## 5. Scope and next step

CPI-003 establishes an installable application foundation. It does not implement the endless engine, SP/revive flow, accounts, regional rankings, advertising, analytics, final splash/icon art, release signing or store submission. Those stay in the existing backlog, with accepted gameplay values unchanged.

The [app instructions](../../apps/mobile/README.md) provide clean installation and matching web/native commands. CPI-004 follows with the expanded quality gates and required-check configuration. The physical-device, ad/SSV and deployed-backend evidence in CPI-002 remains separately open regardless of this foundation's emulator/Simulator result.
