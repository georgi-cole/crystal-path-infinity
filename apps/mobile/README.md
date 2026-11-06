# Mobile app foundation — CPI-003

This React 19 / Capacitor 8 app has an offline practice renderer (CPI-008–010), and CPI-013 adds its dedicated Play/Practice/Rankings/Profile/Settings menu. CPI-012 generates real Midnight Prism native icon exports and a static native splash, with a separate immediate in-app startup state and retry/offline fallback. The source SVG and native image generation remain independent of a network or commercial image service. CPI-007 adds the internal game-core dependency for a tested practice runtime and a local `CpiLifecycle` native plugin. **7 November 2026:** optional AdMob/UMP and native-purchase packages/adapters are installed and pinned. Default generation excludes them; default player builds still have no active advertising or billing service. See [native-service activation](../../docs/decisions/NATIVE-SERVICES-2026-11.md) for exact IDs, source status and outstanding release gates. Default Android declares network access; iOS requests no permission purpose strings and declares the in-app elapsed-time API purpose in its privacy manifest.

Capacitor's bundled `SystemBars` uses light icons on the dark Android shell and native safe-area handling. The screen consumes `env(safe-area-inset-*)`; no separate system-bar dependency or injected CSS-variable fallback is needed. iOS uses its existing dark appearance setting.

## CPI-007 clock and lifecycle

The page starts `getGameplayLifecycle()` before React mounts. Its current-page handshake and increasing native snapshots drive confirmed foreground time. `createPracticeRuntime` in `src/practice-runtime.ts` connects that source to a timed core session, serialized inputs, independent pause leases, one cancellable scheduler and an injected playback cleanup capability. No run or audio starts automatically; CPI-008 will mount the actual gameplay owner. See the [clock/lifecycle decision](../../docs/decisions/CPI-007-clock-lifecycle.md) for integration, error handling and verification boundaries.

Generation owns the local Java/Swift templates. Android uses a generated copy of the pinned Capacitor library with a SHA256-guarded readiness patch; installed npm files are unchanged. A dependency upgrade changing that source requires review. `native:generate --check` verifies the templates and patch. Optional external packages are allowlisted with exact versions and copied only with `CPI_NATIVE_ADS=true` / `CPI_NATIVE_PURCHASES=true`. The manual Mobile app checks input `native_services=true` compiles and launches that configured variant using Google demonstration inventory; normal required checks retain the baseline variant.

Native smoke exercises Home and lock/wake before the first JavaScript page on Android, and an early Settings interruption on iOS Simulator. It verifies current page/bridge identity across three Android and two iOS process/WebView starts. The development-only navigation gate uses real OS transitions and observable predicates, with no fixed dwell sleeps or JavaScript error suppression. iOS lock testing and physical devices remain separate gates.

## CPI-018 protected-session foundation

The local native `CpiSecureSession` plugin now provides **refresh-token-only** persistence: iOS Keychain with `WhenUnlockedThisDeviceOnly` (and first-install orphan cleanup), and Android Keystore AES-GCM with backup disabled. The React adapter fails closed on web and never stores account tokens in localStorage or Preferences. It is a security primitive, **not an active account login**: no Supabase request, OTP form, remote account, privacy/parental approval or ranked record is claimed ready in this slice. See [the implementation decision](../../docs/decisions/CPI-018-secure-session.md).

## CPI-018 privacy-gated account intake (phase 2)

The profile now includes a **fail-closed account eligibility and one-time-code flow**. It has no email field until a trusted server grants a short-lived, policy-versioned eligibility permit; parental-review/unknown answers never implicitly count as adult permission. Requests go only to the explicitly configured HTTPS `VITE_ACCOUNT_API_BASE_URL` with fixed `/eligibility`, `/otp/request`, and `/otp/verify` endpoints; the client never calls Supabase's public `/auth/v1/otp` directly or saves user data to practice. The backend must **revalidate permits for every OTP request** and enforce jurisdiction-appropriate privacy and guardian requirements. The UI is disabled by default because the production-grade server, consent policies, and Auth hooks are not deployed yet.

OTP verification ends in an explicit *not signed in* state without an approved backend ticket. Since 7 November the bound native entry hands a valid, one-time ticket to `AccountSessionOwner` for exchange and protected credential storage. This does not implement/deploy the missing trusted account issuer, SMTP or fresh-reauth account deletion. No local score is promoted. See [the gated-OTP decision](../../docs/decisions/CPI-018-privacy-otp.md) and [current integration status](../../docs/decisions/NATIVE-SERVICES-2026-11.md).

## CPI-018 session lifecycle (phase 3)

The new injected `AccountSessionOwner` provides a tested contract for explicit native session restoration, rotating refresh credentials, memory-only bearer access, logout and server revocation. A verified OTP **alone** is not a session. The owner rejects subject switching and stale post-logout account responses, and reports incomplete remote revocation without pretending the account is safely logged out everywhere. The new `createSessionTransport` prepares fixed HTTPS `/session/*` endpoints but initiates no requests until invoked by an approved caller.

**This layer is not wired into the Profile UX or startup**, and real account registration, email delivery, parental review, Supabase session issuance, server token-family revocation, cross-device validation and ranked endpoints remain unavailable. No app key, hosted database write or new Supabase migration is involved. See [the session lifecycle contract](../../docs/decisions/CPI-018-session-owner.md).

## CPI-013 navigation and local progress

The new Midnight Prism menu keeps the CPI-012 instant offline bootstrap. Play explains unavailable ranked/auth features rather than fabricating a login or official run. Practice is playable without account or age/analytics response, with safe Resume and explicit New confirmation. Personal best is strictly local and not part of the verified rankings. Profile and Rankings show honest guest/offline/unconfigured states, while Settings contains real persistent music/SFX/haptics/reduced-motion controls.

Known hash routes allow direct return and browser/Android WebView Back. An active game's Back is delegated to its own checkpoint-and-exit routine; no duplicate runtime or native plugin is introduced. See [CPI-013 menu/navigation decision](../../docs/decisions/CPI-013-menu-navigation.md).

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
| `npm run dev:qa` | Explicit QA browser server on port 5177 |
| `npm run typecheck` | Check the app, configuration, and tests |
| `npm run lint` | Type-aware application lint and native/CI script checks |
| `npm run format:check` | Check the scoped app/config/script formatting |
| `npm run format` | Apply formatting locally to the same scope |
| `npm test` | Run the environment and startup-diagnostic contract tests |
| `npm run build` | Build development assets into `apps/mobile/dist` |
| `npm run build:staging` | Build staging assets into the same directory |
| `npm run build:production` | Build production assets into the same directory |
| `npm run build:qa` | Build QA assets separately into `apps/mobile/dist-qa` |
| `npm run preview` | Serve the latest built assets on port 4174 |
| `npm run preview:qa` | Serve the separate QA bundle on port 4177 |

The development and preview servers bind to `127.0.0.1` and fail if their port is occupied. Each build includes type checking and replaces the previous environment's web output.

## Player and QA previews

`build:production` and `build:staging` show the player interface. `development` and explicit Vite `qa` mode retain the local test store, simulated rewarded continuation, balance tuner and complete mystery demo room. This is one maintained codebase with build-time gates, not a permanently divergent QA branch. A URL or saved setting cannot enable QA in a player build. QA emits `dist-qa/qa-info.json`; its application identity uses staging, but its output directory remains separate. Capacitor rejects a QA marker copied into `dist`, and an unsigned release envelope cannot be combined with QA mode.

Player checkpoints, bests, discoveries, tutorial and settings use the `cpi.player.v1:` storage namespace; QA keeps its historical keys. Player startup also rejects copied-in experiment/test-wallet checkpoints. Language is shared. Existing QA data is not cleared or migrated into the player profile. A completed death declined with Return to menu is finalized and no longer resumable. Shopping retains the current death/continuation offer; pending or earned unused rewards remain recoverable.

The player preview has no mock checkout, wallet reset, simulated ad button or QA demo. The real billing/ad services are not connected: unavailable actions are explained, while free practice and new crossings remain available. This separation is not an App Store release or proof of physical-device integrations. For a player preview, build production **last** before `npm run preview`; a later development build replaces `dist` with development assets. QA builds do not replace it.

Cold page starts show the owner-approved 3-second Kolequant DNA → codons → actual INFINITY home-title transition. Route changes and resume do not replay it; reduced motion uses a static signature. The original heading is restored on completion, resize, backgrounding or cleanup. See [the full decision and verification](../../docs/decisions/PLAYER-QA-RELEASE-PREVIEW.md).

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

**iOS:** compilation requires a Mac. CI pins **Xcode 26.6** and an **iOS 26.5** iPhone Simulator on the standard 14 GB `macos-26-intel` host, matching the toolchain observed in [CPI-002](../../docs/spikes/CPI-002-results.md). The generator chooses manual signing with signing disabled and an empty identity; CI builds an unsigned Simulator app. Running on a physical iPhone requires explicit local Xcode signing configuration, including an appropriate team/provisioning setup. Keep signing credentials and provisioning profiles out of the repository; regeneration replaces local project settings.

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

OS control commands are awaited asynchronously, so the attached native log stream continues draining during real Settings/background/resume transitions. Fresh-device shutdown has a 180-second provisioning budget after observed 60-second shutdown failures on both Tahoe/iOS 26.5 and Sequoia/iOS 26.2 hosts. Settings commands use the existing 180-second system-launch budget. React/page/bridge readiness and actual lifecycle observations retain their original limits and assertions. Continuous `ios-host-pressure.log` sampling retains process/memory evidence without putting a synchronous process report ahead of required first-boot cleanup.

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
