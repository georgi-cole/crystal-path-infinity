# Mobile app foundation — CPI-003

This React 19 / Capacitor 8 app has an offline practice renderer (CPI-008–010). CPI-012 generates real Midnight Prism native icon exports and a static native splash, with a separate immediate in-app startup state and retry/offline fallback. The source SVG and native image generation remain independent of a network or commercial image service. CPI-007 adds the internal game-core dependency for a tested practice runtime and a local `CpiLifecycle` native plugin. There is no ad SDK, tracking, location or billing integration. Android declares network access; iOS requests no permission purpose strings and declares the in-app elapsed-time API purpose in its privacy manifest.

Capacitor's bundled `SystemBars` uses light icons on the dark Android shell and native safe-area handling. The screen consumes `env(safe-area-inset-*)`; no separate system-bar dependency or injected CSS-variable fallback is needed. iOS uses its existing dark appearance setting.

## CPI-007 clock and lifecycle

The page starts `getGameplayLifecycle()` before React mounts. Its current-page handshake and increasing native snapshots drive confirmed foreground time. `createPracticeRuntime` in `src/practice-runtime.ts` connects that source to a timed core session, serialized inputs, independent pause leases, one cancellable scheduler and an injected playback cleanup capability. No run or audio starts automatically; CPI-008 will mount the actual gameplay owner. See the [clock/lifecycle decision](../../docs/decisions/CPI-007-clock-lifecycle.md) for integration, error handling and verification boundaries.

Generation owns the local Java/Swift templates. Android uses a generated copy of the pinned Capacitor library with a SHA256-guarded readiness patch; installed npm files are unchanged. A dependency upgrade changing that source requires review. `native:generate --check` verifies the templates and patch. No extra external native plugin package is installed.

Native smoke exercises Home and lock/wake before the first JavaScript page on Android, and an early Settings interruption on iOS Simulator. It verifies current page/bridge identity across three Android and two iOS process/WebView starts. The development-only navigation gate uses real OS transitions and observable predicates, with no fixed dwell sleeps or JavaScript error suppression. iOS lock testing and physical devices remain separate gates.

## Start from a clean checkout

Use Node **22.23.4** (the root `.nvmrc` and CI version) and its npm. Run all commands below from the **repository root**:

```sh
git clone https://github.com/georgi-cole/crystal-path-infinity.git
cd crystal-path-infinity
npm ci --ignore-scripts
npm run dev
```

Open `http://127.0.0.1:5174`. No `.env` copying, backend setup, account, or service credentials are required. The `.env.*.example` files reserve a blank `VITE_API_BASE_URL` for later work; this scaffold does not use it. Any future `VITE_*` value is public client configuration.

The root npm workspace contains `apps/mobile`; its dependencies and lockfile live at the repository root. `spikes/mobile` is the separate CPI-002 laboratory with its own package and lockfile. Root app commands neither install nor run that laboratory.

| Root command | Purpose |
| --- | --- |
| `npm run dev` | Development browser server on port 5174 |
| `npm run typecheck` | Check the app, configuration, and tests |
| `npm run lint` | Type-aware application lint and native/CI script checks |
| `npm run format:check` | Check the scoped app/config/script formatting |
| `npm run format` | Apply formatting locally to the same scope |
| `npm test` | Run the environment and startup-diagnostic contract tests |
| `npm run build` | Build development assets into `apps/mobile/dist` |
| `npm run build:staging` | Build staging assets into the same directory |
| `npm run build:production` | Build production assets into the same directory |
| `npm run preview` | Serve the latest built assets on port 4174 |

The development and preview servers bind to `127.0.0.1` and fail if their port is occupied. Each build includes type checking and replaces the previous environment's web output.

## Build identities

| Environment | Application ID / bundle identifier | Display name |
| --- | --- | --- |
| `development` | `com.georgicole.crystalpath.infinity.dev` | Crystal Path Dev |
| `staging` | `com.georgicole.crystalpath.infinity.staging` | Crystal Path Staging |
| `production` | `com.georgicole.crystalpath.infinity` | Crystal Path Infinity |

These identifiers are provisional until store registration. The version comes from `apps/mobile/package.json` (currently `0.1.0`); the initial native build number is `1`.

Web builds select their environment through **Vite mode**, supplied by the root build scripts. **`CPI_APP_ENV` selects the Capacitor configuration** and is set by the native generator; setting it alone does not change the web build. The shared contract is in [config/environments.ts](config/environments.ts).

Every web build emits `dist/build-info.json` containing the schema version, environment, app ID, display name, and package version. The native generator checks that metadata **before deleting or regenerating a native project**, and checks the copied metadata again. Missing, stale, or mismatched assets stop generation. The Capacitor configuration also guards direct asset-copying commands against missing or mismatched metadata.

## Generate native projects

Build the matching web environment first, then choose Android or iOS:

```sh
npm run build
npm run native:generate -- --platform android --environment development
npm run native:generate -- --platform ios --environment development

npm run build:staging
npm run native:generate -- --platform android --environment staging

npm run build:production
npm run native:generate -- --platform ios --environment production
```

Either platform supports all three environments. The generator owns **Capacitor `add` and `sync`**, then applies and validates the native settings. It recreates the selected ignored `apps/mobile/android` or `apps/mobile/ios` directory, replacing local edits there. Keep lasting native changes in the generator. After web changes, repeat the matching build/generate sequence; do not run manual `cap sync` after the generated settings have been applied.

Add `--check` to validate an existing generated project without regenerating it; its web build must still match. After the production iOS example above:

```sh
npm run native:generate -- --platform ios --environment production --check
```

**Android:** use JDK 21, Android SDK platform/API 36, and build tools 36.0.0. Set `ANDROID_HOME` to the SDK installation. The generated project supplies the Gradle **8.14.3** wrapper; a separate global Gradle installation is unnecessary. The app targets portrait orientation, a dark background, and disabled cleartext traffic.

**iOS:** compilation requires a Mac. CI selects **Xcode 26.6** and an **iOS 26.5** iPhone Simulator, matching the toolchain observed in [CPI-002](../../docs/spikes/CPI-002-results.md). The generator chooses manual signing with signing disabled and an empty identity; CI builds an unsigned Simulator app. Running on a physical iPhone requires explicit local Xcode signing configuration, including an appropriate team/provisioning setup. Keep signing credentials and provisioning profiles out of the repository; regeneration replaces local project settings.

The generator restores the app-specific [Swift Package Manager lock](native-locks/Package.resolved), captured from CPI-003's first successful iOS compilation. Its sole package is Capacitor 8.5.3. CI then requires the recorded package versions instead of silently updating resolution.

## Native splash and icon exports (CPI-012)

The committed SVG prism is the editable source. `scripts/brand-assets.mjs` uses a self-contained deterministic, pixel-tested PNG encoder (no third-party render service), and `native:generate` produces and verifies the Android launcher densities (mdpi through xxxhdpi), foreground layers, round variants, themed monochrome vector, and Android 12+ icon/background OS splash. iOS receives an opaque 1024px app icon, 1×/2×/3× launch-mark images and a static centered image on a `#060a18` LaunchScreen storyboard. The generator checks every generated PNG byte-for-byte, including in `--check` mode; manual edits to the ignored native projects are overwritten.

The OS splash does **not** contain an arbitrary fullscreen scene, or a forced delay. It transitions into the in-app Crystal Path intro on the same dark base; local settings/checkpoint reads complete immediately when available, with a 1.5-second *maximum timeout only*. A timeout/error offers Retry or Play offline without deleting an existing save, and no ad/analytics/leaderboard backend is requested on startup. In-app text stays real selectable HTML, not embedded into a bitmap. Full physical-device cold/warm/offline appearance, platform-mask checks, and App Store/Play asset sign-off remain separate acceptance gates. See [CPI-012 decision](../../docs/decisions/CPI-012-native-launch.md).

## Native smoke checks and CI evidence

[The app workflow](../../.github/workflows/mobile-app.yml) runs **App quality** on every PR: clean install, typecheck, lint, formatting, application/routing tests and all three web builds. A complete Git diff selects the two native jobs for runtime, dependency, toolchain, workflow or unknown changes; known documentation/planning changes skip them explicitly. **App required checks** always runs and requires successful quality plus both native results when selected. It is separate from the CPI-002 spike workflow. The [CPI-004 record](../../docs/decisions/CPI-004-quality-gates.md) covers gate behavior, settings and verification.

After compiling the development APK or Simulator app and preparing the corresponding runtime, the launch check can be run from the root:

```sh
node --experimental-strip-types apps/mobile/scripts/smoke-native.mjs --platform android
node --experimental-strip-types apps/mobile/scripts/smoke-native.mjs --platform ios
```

The script does not compile. Android needs the dedicated accelerated `cpi003-development` AVD with the API 36 **AOSP/default x86_64** image and emulator port 5554 available; the script wipes that AVD's data. iOS needs an available iPhone device type with the iOS 26.5 runtime; the script creates a fresh named simulator and deletes only that simulator afterward. The workflow contains the setup commands.

Fresh iOS provisioning has a 900-second boot deadline and a 180-second first native process gate deadline, recorded in `ios-smoke-device.json`. The driver advances as soon as the required observation arrives. These limits accommodate cold OS migration and launch overhead; they add no retries and do not relax lifecycle or runtime-error assertions. The iOS smoke step is capped at 30 minutes. The [CPI-007 decision](../../docs/decisions/CPI-007-clock-lifecycle.md#fresh-ios-simulator-provisioning) records the failed CI evidence that motivated these allowances.

Both checks require the React commit marker, page readiness, a real read-only native bridge call, and document pause/resume delivery followed by another native bridge call. Android performs three cold process starts in one emulator, each with Home followed by resuming the same activity. iOS opens Settings then resumes the existing app. Both drivers wait for the actual pause observation before requesting resume. The development-only observer records timestamps and session/sequence information without suppressing errors; staging and production omit that observer. Unexpected JavaScript exceptions and app/unattributed runtime errors fail the check, including errors before the React marker and later in the observation window. Android runtime crashes conclusively attributed to another process remain in the raw logs and a separate diagnostics field; app, WebView, malformed or ambiguous process evidence is never treated as unrelated.

Logs, screenshots, per-attempt diagnostic JSON, lifecycle actions and a final result are saved in `apps/mobile/artifacts`. Boot progress is captured in `ios-boot.log`. Every Android attempt is retained; a later pass cannot erase an earlier error. Their scope is the minimal screen and startup/lifecycle behavior, with physical-device, gameplay, ads, backend, and store checks tracked separately.

| CI artifact | Contents |
| --- | --- |
| `mobile-app-web-evidence` | Dependency/test logs and the three web bundles |
| `mobile-app-android-evidence` | Generated configuration, build/permission evidence, and launch logs/screenshots |
| `mobile-app-android-development` | Development debug APK |
| `mobile-app-ios-evidence` | SPM resolution, generated configuration, build evidence, and launch logs/screenshots |
| `mobile-app-ios-development-simulator` | Archive of the unsigned development Simulator app |

Artifacts are retained for seven days. Evidence uploads can include failed-run diagnostics; inspect the job result and launch JSON before treating an artifact as a pass.

At scaffold creation, local type checking, 19 environment tests, web builds, and generation of both native projects passed. CPI-003 native compilation and launch results require their own CI evidence. The authoritative results and remaining checks are maintained in [CPI-003 app foundation](../../docs/decisions/CPI-003-app-foundation.md).
