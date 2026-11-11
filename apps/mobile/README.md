# Mobile app foundation — CPI-003

## Full Campaign service acceptance profile — CPI-044 · 12 November 2026

The separate `campaign-services` profile retains the current illustrated Campaign/Infinity game and uses native-priced checkout, verified account entitlements and account-scoped offline supplies. It requires both native SDKs, demonstration ads, native browser sign-in and the exact isolated staging `/cpi` gateway. It rejects live guest-ad inventory. Google/Apple browser callbacks are pinned independently from the existing iPhone native sign-in client; credentials remain server-only. Normal production and the offline free-claim beta remain separate.

TestFlight accepts `campaign_services=true` only from checked main with internal-only distribution; it cannot be combined with `campaign_beta`, `external_beta` or review-branch signing. A new version-specific demo-ad acknowledgement and exact-source full native checks are still required before upload. The profile emits `campaign-services-info.json` and account-service metadata for archive inspection. This is acceptance-build preparation, not a public-release profile or evidence of a completed phone transaction.

Collected consumables stay on this device and can be used offline. A server allocation and an atomic local grant/receipt prevent duplicate retry delivery; acknowledged consumables cannot be restored after deleting local app data. Permanent items restore after account sign-in. Campaign mission kits stay separate from purchased Infinity stock. See [the current integration and outstanding acceptance gates](../../docs/decisions/CPI-044-campaign-full-services.md).

## Signed offline Campaign beta — CPI-042 · 11 November 2026

The app marketing version is 1.0.1 for this candidate, following App Store Connect's existing 1.0.0 build 45. The offline playtest's feature version remains 0.7.4; build numbers come from new TestFlight workflow runs. Historical 0.1.0 results remain unchanged.

The explicit `campaign-beta` Vite profile builds the reviewed 0.7.4 offline Campaign/Infinity game with the registered production bundle identity for TestFlight signing. It enables the same local test store and isolated campaign save namespace as `campaign-qa`, while rejecting active account gateways, sign-in, ads, billing and native commerce flags. It emits `campaign-beta-info.json` with the source SHA and simulated-purchase disclosure. Normal production builds remain separate; unsigned release preparation rejects this review profile.

The TestFlight workflow accepts `campaign_beta=true` and optionally `external_beta=true`; external eligibility is restricted to this offline profile. Default uploads remain internal-only staging clients. Beta archives must contain the matching manifest/source and disabled services. Upload still requires checked current main, a new build counter, protected signing/upload credentials and an exact-source full iOS simulator pass. External eligibility does not submit an App Store version or grant developer access. External testers may require Apple's beta review; invitations/availability must be verified separately from upload. Tester addresses are not committed or passed through public workflow inputs.

## Targeted iPhone simulator checks — CPI-041 · 11 November 2026

Owner-approved policy: known artwork/menu/game-content changes retain all application tests and web builds, a real Android smoke, and unsigned iOS compilation. They intentionally omit iPhone simulator preparation/launch. Native/startup/lifecycle/runtime entry points, dependencies, CI/release files and unknown diffs require full native verification; nightly and manual runs are full. `App.tsx` and `main.tsx` remain integration entry points requiring full checks. The aggregate requires an explicit matching iOS `build`/`full` output and successful compilation. Compile-only evidence has a distinct job name/summary and is never called a launch pass. Release/TestFlight preparation requires the full iOS launch check on its exact source commit; dispatch full verification first if the source only had a content-scope check. See CONTRIBUTING and the CPI-007 decision.

## Offline playtest 0.7.4 — 11 November 2026

Hint, Kit and Pause now use compact icon controls with 44px touch areas. The Kit stays open while selecting boosters or gear. A small animated ready count confirms loading; minus returns an unused selection. X, Escape or outside dismissal applies the selection once and resumes. Stability is staged in 25-SP doses and spent only on closing; a failed save keeps the Kit open without spending stock.

New Infinity crossings use `-supplies-shield-stack`: several shields can be loaded, stay ready without a timer, and block one damaging broken tile each. Loaded shields are a subset of owned stock; only a blocked hit spends one. They can be unloaded, survive saves/continues, and unused stock stays available on restart. A physical gold-and-jade shield replaces the character outline. Existing saved runs retain their previous temporary-shield rules; start a new crossing to test stacking. Campaign still uses only its mission kit. This supersedes 0.7.3's auto-close interaction, not its repeat-restock policy. Prices and real-service availability are unchanged.

## Offline playtest 0.7.3 — 11 November 2026

Gear and supplies are tucked behind the compact HUD Kit button. The illustrated phone/wide-screen dialog pauses the crossing while browsing; using an item closes it and resumes before applying the action. Hint remains directly accessible, and a first-row hint now hides both initial direction prompts. Consumable test packs now support repeat restocking and stacking, including after consumption; permanent unlocks remain one-time. Restock shows the live stored balance. The 0.7.2 mode separation and atomic saved-run contracts below are unchanged.


## Offline Campaign/Infinity playtest 0.7.2 — 11 November 2026

The explicit `campaign-qa` profile now reserves all store supplies and functional Gear/No Clock for Infinity. Campaign uses the mission kit, with cosmetic choices shared. New Campaign rules carry `-mission-kit`; new Infinity rules carry `-supplies`. Existing run snapshots retain their captured rules.

Infinity's hint button includes free run hints and stored stock: two starting hints plus a 10-pack shows 12. Stored stock is debited only after the two free hints, and only when used. Inventory and the resulting Infinity checkpoint share an atomic local save with the separate Campaign checkpoint; failed writes roll back the supply action. Legacy Infinity saves migrate when the new slot is created. First-clear Campaign supplies reward Infinity and cannot be spent to finish Campaign missions.

Run `npm run build:campaign-qa` and `npm run preview:campaign-qa`, then refresh port 4178 and start a new crossing for the new policy. Test claims remain free/local, not real billing. See [current rules](../../docs/CURRENT_GAME_RULES.md) and [detailed contract](../../docs/decisions/CAMPAIGN-LIGHTHOUSE-PROPOSAL.md).


Server integration update, 7 November 2026: the native client now supports the reviewed age-screen contract, fresh-OTP export/deletion, automatic unfinished-purchase recovery on store entry, server-paid resource spending and the strict `infinity-v11-live` wire schema. The separate `account.html` page uses memory-only web credentials. Default/unsigned builds keep live services off. See [setup and acceptance](../../docs/RELEASE_SERVICES_SETUP_BG.md); synthetic tests are not real ads/payments.

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
| `npm run dev:campaign-qa` | Separate offline Campaign/Infinity playtest on port 5178 |
| `npm run typecheck` | Check the app, configuration, and tests |
| `npm run lint` | Type-aware application lint and native/CI script checks |
| `npm run format:check` | Check the scoped app/config/script formatting |
| `npm run format` | Apply formatting locally to the same scope |
| `npm test` | Run the environment and startup-diagnostic contract tests |
| `npm run build` | Build development assets into `apps/mobile/dist` |
| `npm run build:staging` | Build staging assets into the same directory |
| `npm run build:production` | Build production assets into the same directory |
| `npm run build:qa` | Build QA assets separately into `apps/mobile/dist-qa` |
| `npm run build:campaign-qa` | Build the offline mission playtest separately into `apps/mobile/dist-campaign-qa` |
| `npm run preview` | Serve the latest built assets on port 4174 |
| `npm run preview:qa` | Serve the separate QA bundle on port 4177 |
| `npm run preview:campaign-qa` | Serve the offline mission bundle on port 4178 |

The development and preview servers bind to `127.0.0.1` and fail if their port is occupied. Each build includes type checking and replaces the previous environment's web output.

**Beacon Route 0.7.1 · 11 November 2026.** Open `http://127.0.0.1:4178/#campaign` after building and starting the Campaign preview. The profile includes the full 30-mission route and a Weather & Seasons guide in Discoveries at `/#infinity-weather`. Store at `/#store` opens with all six Worlds. Bridges opens an eight-style collection with a separate preview for each bridge, including Jelly Path earned at mission 11. Ivy Lantern Walk has been removed and earned torches remain usable. Gear previews equipment on the existing companions. Supplies shows reserves with Add more actions that open the illustrated Restock view. Season Changes are used in Supplies. Test claims are local and free. Campaign and Infinity saves use separate local slots. Profile explicitly labels the offline mode, which starts without account services. [Rules, assets and mission list](../../docs/decisions/CAMPAIGN-LIGHTHOUSE-PROPOSAL.md#current-offline-build--07--11-november-2026).

The Campaign preview identifies its Git base in `/qa-info.json`.

Run the fixed-route, weather-boundary and save checks from the root with `npm exec --workspace @crystal-path-infinity/mobile -- vitest run config/campaign-journey.test.ts`.

## Player and QA previews

`build:production` and `build:staging` show the player interface. `development` and explicit Vite `qa` mode retain the local test store, simulated rewarded continuation, balance tuner and complete mystery demo room. This is one maintained codebase with build-time gates, not a permanently divergent QA branch. A URL or saved setting cannot enable QA in a player build. QA emits `dist-qa/qa-info.json`; its application identity uses staging, but its output directory remains separate. Capacitor rejects a QA marker copied into `dist`, and an unsigned release envelope cannot be combined with QA mode.

Player checkpoints, bests, discoveries, tutorial and settings use the `cpi.player.v1:` storage namespace; QA keeps its historical keys. Player startup also rejects copied-in experiment/test-wallet checkpoints. Language is shared. Existing QA data is not cleared or migrated into the player profile. A completed death declined with Return to menu is finalized and no longer resumable. Shopping retains the current death/continuation offer; pending or earned unused rewards remain recoverable.

Production and staging use the configured commerce and ad services. Where those services are unavailable, players can still explore worlds and start free crossings. To inspect the release build locally, build production **last** before `npm run preview`. A later development build replaces `dist` with development assets.

The separate web player review exercises simulated ads, continuation credits and world unlocks in the player UI with its own local wallet. Build it with `npm exec --workspace @crystal-path-infinity/mobile -- vite build --mode player-preview`. It writes `dist-player-preview/player-preview-info.json`. The QA demo, tuning, wallet reset and forced checkout outcomes are available in QA. Both review builds are excluded from unsigned release preparation and native asset copying.

Cold page starts show the owner-approved 3-second Kolequant DNA → codons → actual INFINITY home-title transition. Route changes and resume do not replay it; reduced motion uses a static signature. The original heading is restored on completion, resize, backgrounding or cleanup. See [the full decision and verification](../../docs/decisions/PLAYER-QA-RELEASE-PREVIEW.md).

The menu track streams after the splash while the crossing track prepares in the background. The first ordinary interaction retries music when the browser requires one. New local v13 runs give the first mystery description up to 10 seconds, with clock protection through the first 7 seconds or until the player steps. The tester can open a new crossing or try a timed effect in the QA Mystery Lab. [Soundtrack](../../docs/decisions/CPI-010-scene-soundtrack.md) · [Discovery rules](../../docs/decisions/MYSTERY-DISCOVERY-V7.md).

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

**iOS:** compilation requires a Mac. CI pins **Xcode 26.6** and an **iOS 26.5** iPhone Simulator on the standard Apple silicon `macos-26` host (CPI-042, 11 November 2026); `macos-26-intel` remains a manual diagnostic option with the same toolchain and assertions. The generator chooses manual signing with signing disabled and an empty identity; CI builds an unsigned Simulator app. Running on a physical iPhone requires explicit local Xcode signing configuration, including an appropriate team/provisioning setup. Keep signing credentials and provisioning profiles out of the repository; regeneration replaces local project settings.

The generator restores the app-specific [Swift Package Manager lock](native-locks/Package.resolved), captured from CPI-003's first successful iOS compilation. Its sole package is Capacitor 8.5.3. CI then requires the recorded package versions instead of silently updating resolution.

## Native splash and icon exports (CPI-012)

The approved glass-tile launcher artwork is committed under `brand-assets/native/`. Native generation copies and verifies the exact Android launcher PNGs and the 1024px iOS icon, which uses RGB without an alpha channel. Android's adaptive layer is inset for launcher masks. The web favicon and Apple touch icon share the 180px export. Both platforms use a black system starting window before the Kolequant intro. The iPhone app opts into Game Mode, hides the status bar. Layouts keep their safe areas. The generator checks the copied PNGs byte-for-byte in `--check` mode. Regenerate the ignored native projects after changing the source art. See [CPI-012](../../docs/decisions/CPI-012-native-launch.md#9-november-2026-approved-icon-and-launch-handoff).

The OS splash does **not** contain an arbitrary fullscreen scene, or a forced delay. It transitions into the in-app Crystal Path intro on the same dark base; local settings/checkpoint reads complete immediately when available, with a 1.5-second *maximum timeout only*. A timeout/error offers Retry or Play offline without deleting an existing save, and no ad/analytics/leaderboard backend is requested on startup. In-app text stays real selectable HTML, not embedded into a bitmap. Full physical-device cold/warm/offline appearance, platform-mask checks, and App Store/Play asset sign-off remain separate acceptance gates. See [CPI-012 decision](../../docs/decisions/CPI-012-native-launch.md).

## Native smoke checks and CI evidence

[The app workflow](../../.github/workflows/mobile-app.yml) runs **App quality** on every PR: clean install, typecheck, lint, formatting, application/routing tests and all three web builds. A complete Git diff selects the two native jobs for runtime, dependency, toolchain, workflow or unknown changes; known documentation/planning changes skip them explicitly. **App required checks** always runs and requires successful quality plus both native results when selected. It is separate from the CPI-002 spike workflow. The [CPI-004 record](../../docs/decisions/CPI-004-quality-gates.md) covers gate behavior, settings and verification.

After compiling the development APK or Simulator app and preparing the corresponding runtime, the launch check can be run from the root:

```sh
node --experimental-strip-types apps/mobile/scripts/smoke-native.mjs --platform android
node --experimental-strip-types apps/mobile/scripts/smoke-native.mjs --platform ios
```

The script does not compile. Android needs the dedicated accelerated `cpi003-development` AVD with the API 36 **AOSP/default x86_64** image and emulator port 5554 available; the script wipes that AVD's data. iOS needs an available iPhone device type with the iOS 26.5 runtime. The script creates a fresh named simulator and deletes only that simulator afterward. The workflow contains the setup commands.

OS control commands are awaited asynchronously, so the attached native log stream continues draining during real Settings/background/resume transitions. **11 November 2026 · CPI-040:** after the first successful boot, the driver immediately requires a valid Settings process and successful termination. A healthy device is no longer shut down and booted again unconditionally. Only a failed pre-install Settings launch permits one restart of this invocation's owned simulator, followed by a second required probe. Cold-boot failure, malformed process evidence, termination failure, failed recovery and every app/lifecycle failure remain terminal. No failed game process is retried. The original failed Settings log is kept separately from its recovery log.

The optional readiness-recovery shutdown/warm boot each retain a 180-second budget. Opening Settings and relaunching the app each use the 180-second system-launch budget. Both screenshot captures remain required and each has a 180-second OS-command budget. React/page/bridge readiness and actual lifecycle observations retain their original limits and assertions. Continuous `ios-host-pressure.log` sampling retains process/memory evidence. OS commands now announce their phase, show elapsed progress every 20 seconds and print completion timing; `ios-provisioning-summary.json` records each setup phase, failures and whether a restart was needed. This distinguishes OS preparation from actual app verification.

Fresh iOS provisioning retains its 900-second boot deadline and 180-second first native process gate deadline, recorded in `ios-smoke-device.json`. The driver advances as soon as the required observation arrives. The one pre-install readiness recovery described above does not retry any app assertions. The iOS smoke step remains capped at 30 minutes. The [CPI-007 decision](../../docs/decisions/CPI-007-clock-lifecycle.md#fresh-ios-simulator-provisioning) preserves the historical failures, the measured old setup costs and the current policy. Actual improvement must be measured on the final CI revision; removing a mandatory restart does not guarantee every hosted simulator boots quickly.

Both checks require the React commit marker, page readiness, a real read-only native bridge call, and confirmed native inactive/active lifecycle snapshots followed by another native bridge call on the same page. Android performs three cold process starts in one emulator, each with Home followed by resuming the same activity. iOS opens Settings then resumes the existing app; its first-page gate waits for scene deactivation and releases on reactivation, while the Settings launch runs alongside that native observation so a slow `simctl` response cannot hide an already observed state change. The development-only observer records timestamps and session/sequence information without suppressing errors; staging and production omit that observer. Unexpected JavaScript exceptions and app/unattributed runtime errors fail the check, including errors before the React marker and later in the observation window. Android runtime crashes conclusively attributed to another process remain in the raw logs and a separate diagnostics field; app, WebView, malformed or ambiguous process evidence is never treated as unrelated.

Logs, screenshots, per-attempt diagnostic JSON, lifecycle actions and a final result are saved in `apps/mobile/artifacts`. Boot progress is captured in `ios-boot.log`. Every Android attempt is retained; a later pass cannot erase an earlier error. Their scope is the minimal screen and startup/lifecycle behavior, with physical-device, gameplay, ads, backend, and store checks tracked separately.

**11 November 2026 · CPI-042 release prerequisite:** main run 43033075588 and beta run 43033150189 both failed before Android launch because `azure.archive.ubuntu.com` could not resolve. Android preparation now removes that mirror from the hosted image's mirror list while retaining its official HTTPS Ubuntu archive/security fallbacks and normal package signature checks. Package-index refresh and dependency installation have separate 120/180-second limits and 15-second network timeouts with one transfer retry. Installation or later emulator failures remain blocking; historical failed attempts are preserved.

The next beta run, 43037536810, reached the new 120-second index-refresh limit because the primary Ubuntu archive was also unreachable. The final preparation now probes HTTPS `InRelease` availability over IPv4 before choosing the Ubuntu archive, Linux Kernel Archives mirror or MIT mirror, each with a 15-second maximum probe. Apt also uses IPv4 and retains the same limits and Ubuntu signature verification. No reachable archive or a failed install still fails the check. Mirror sources: [GitHub hosted-image configuration](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh), [Linux Kernel Archives](https://mirrors.edge.kernel.org/) and [MIT Ubuntu mirror](https://mirrors.mit.edu/ubuntu/). This is a delivery prerequisite, not a passing launch result.

Manual full run 43041299745 passed on Apple silicon at source `176ce184b2ac6d5a38298491d2b090ef5c8ffc11`: two iOS cold starts and native scene interruptions, three Android starts, startup/resume bridge evidence and zero unexpected runtime errors. iOS preparation took 108.3 seconds with no restart; this is one observed run, not a timing guarantee. Android screenshots exposed that a successful resume bridge response can precede the visible compositor frame. The final driver also requires its existing graphics/resource settling gate after resume, before capturing each screenshot; this adds evidence readiness without altering app behavior or relaxing native assertions. Final-head PR evidence is recorded separately.

| CI artifact | Contents |
| --- | --- |
| `mobile-app-web-evidence` | Dependency/test logs and the three web bundles |
| `mobile-app-android-evidence` | Generated configuration, build/permission evidence, and launch logs/screenshots |
| `mobile-app-android-development` | Development debug APK |
| `mobile-app-ios-evidence` | SPM resolution, generated configuration, build evidence, and launch logs/screenshots |
| `mobile-app-ios-development-simulator` | Archive of the unsigned development Simulator app |

Artifacts are retained for seven days. Evidence uploads can include failed-run diagnostics; inspect the job result and launch JSON before treating an artifact as a pass.

At scaffold creation, local type checking, 19 environment tests, web builds, and generation of both native projects passed. CPI-003 native compilation and launch results require their own CI evidence. The authoritative results and remaining checks are maintained in [CPI-003 app foundation](../../docs/decisions/CPI-003-app-foundation.md).

11 November 2026 · 0.6.2: unified illustrated bridge showroom; higher World companions; material-preserving tile breaks and rebuilt trampolines; six Gear items including Trail Scarf; tap selected Campaign pin again to restore full map; aligned Supplies actions and No Clock display name. Existing saves/offer IDs and offline-only claims are preserved.

11 November 2026 · 0.7: preview feet share the tile camera, slim material edges and matching breaks, redesigned Cosmic Crossing, opaque vivid gameplay companions/Gear, grounded World-card animations, and ten more missions in Starfall Observatory and Cloudrest Harbour. New goals/rewards persist; original attempts retain revision 0.3 and new chapters use 0.4.

11 November 2026 · 0.7.1 (CPI-039): distinct browse/selection companion reactions, guaranteed hinted landing for new Journey attempts, fresh Campaign retry seeds, and unchanged saved-run resume behavior. See the detailed integration update and issue #109.
