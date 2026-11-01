# Mobile app foundation — CPI-003

This React 19 / Capacitor 8 app currently displays a minimal branded screen. Gameplay extraction, the designed splash screen, and final app icons belong to later tasks; the native launcher icons are template placeholders. The app has no imported game engine, ad SDK, native feature plugins, tracking, location, or billing integration. Android declares network access; iOS requests no permission purpose strings.

Capacitor's bundled `SystemBars` uses light icons on the dark Android shell and native safe-area handling. The screen consumes `env(safe-area-inset-*)`; no separate system-bar dependency or injected CSS-variable fallback is needed. iOS uses its existing dark appearance setting.

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
| `npm run typecheck` | Check the app, configuration, and environment tests |
| `npm test` | Run the environment contract tests |
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

## Native smoke checks and CI evidence

[The app workflow](../../.github/workflows/mobile-app.yml) defines clean installs, all three web builds, development native compilation, identity/permission checks, and emulator/Simulator launch checks. It is separate from the CPI-002 spike workflow.

After compiling the development APK or Simulator app and preparing the corresponding runtime, the launch check can be run from the root:

```sh
node apps/mobile/scripts/smoke-native.mjs --platform android
node apps/mobile/scripts/smoke-native.mjs --platform ios
```

The script does not compile. Android needs the dedicated accelerated `cpi003-development` AVD with the API 36 Google APIs x86_64 image and emulator port 5554 available; the script wipes that AVD's data. iOS needs an available iPhone device type with the iOS 26.5 runtime; the script creates a fresh named simulator and deletes only that simulator afterward. The workflow contains the setup commands. Both checks install and launch the development app, wait for its React commit marker to match the build metadata, and capture logs, a screenshot, and a JSON result in `apps/mobile/artifacts`. Boot progress is captured in `ios-boot.log`. Their scope is the minimal screen, with physical-device, gameplay, ads, backend, and store checks tracked separately.

| CI artifact | Contents |
| --- | --- |
| `mobile-app-web-evidence` | Dependency/test logs and the three web bundles |
| `mobile-app-android-evidence` | Generated configuration, build/permission evidence, and launch logs/screenshots |
| `mobile-app-android-development` | Development debug APK |
| `mobile-app-ios-evidence` | SPM resolution, generated configuration, build evidence, and launch logs/screenshots |
| `mobile-app-ios-development-simulator` | Archive of the unsigned development Simulator app |

Artifacts are retained for seven days. Evidence uploads can include failed-run diagnostics; inspect the job result and launch JSON before treating an artifact as a pass.

At scaffold creation, local type checking, 19 environment tests, web builds, and generation of both native projects passed. CPI-003 native compilation and launch results require their own CI evidence. The authoritative results and remaining checks are maintained in [CPI-003 app foundation](../../docs/decisions/CPI-003-app-foundation.md).
