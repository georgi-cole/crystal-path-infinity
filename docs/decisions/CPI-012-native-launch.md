# CPI-012 — Native icons, platform splash and bounded offline bootstrap

The [9 November 2026 update](#9-november-2026-approved-icon-and-launch-handoff) supersedes the earlier prism icon and native launch artwork described below. Earlier runtime results describe their respective builds.

## Contract and inherited decisions

CPI-011 Midnight Prism is the baseline for launch branding, not a copy of the original The Big Eye icon or global splash overlay. The transparent prism icon asset belongs to CPI-011; its binary exports are generated deterministically by CPI-012. All UI text remains live HTML; no fake ranking, season reward or "win at 350" content is introduced.

**Owner correction · 8 November 2026:** the original CPI launch base was deep navy `#060a18`. Georgi now explicitly requests the pure-black metal start used by The Big Eye. This supersedes the earlier background choice for the OS launch screen, first HTML paint and in-app brand intro: all now use `#000000`, while the metallic prism/INFINITY mark remains. Gameplay/world colors are unchanged.

The original Big Eye source was inspected at commit \`6ace929a60410e728928aa51eaf80ba9b5cf2262\`:

- \`src/components/IntroSplash/IntroSplash.tsx\`: bounded fallback approach is useful; enforced 1,800ms minimum, KoleQuant logo, and automatic hold are **rejected**.
- \`src/components/IntroSplash/IntroSplash.css\` and \`src/screens/HomeHub/homeHubSplashSession.ts\`: overlay dark #000, fade and session/season gate are **not copied**.
- \`android/app/src/main/res/values/styles.xml\`: themed fullscreen background is **not** the Android 12+ icon/background splash model.
- \`ios/App/App/Base.lproj/LaunchScreen.storyboard\`: root image + system background risks mismatched/white launch; **not copied**.
- \`ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json\`: single 1024px icon slot verified; **only that platform shape is reused**.

Proprietary owner rights apply to referenced source files; new native assets are derived from the original CPI-011 standalone mark, not copied Big Eye images. See \`planning/reuse-manifest.json\`.

## Deterministic native exports

The generator owns *all* durable native resources in disposable generated projects. \`apps/mobile/scripts/brand-assets.mjs\` uses only built-in Node zlib and SHA256 (no image engine or network) to rasterize the audited Midnight Prism geometry and emit 8-bit RGBA PNG with deterministic CRC-checked chunks.

| Platform | Native resource | Size/output |
| --- | --- | --- |
| Android legacy launcher | \`mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png\` and \`ic_launcher_round.png\` | 48, 72, 96, 144, 192 px |
| Android adaptive foreground | \`mipmap-*/ic_launcher_foreground.png\` | 108, 162, 216, 324, 432 px; transparent |
| Android adaptive/themed | \`mipmap-anydpi-v26/ic_launcher*.xml\`, \`drawable/cpi_monochrome.xml\` | Masked adaptive icon with monochrome path, inset to safe area |
| Android 12+ splash | \`drawable-nodpi/cpi_splash_logo.png\` + launch theme | 256px centered mark, \`windowSplashScreenAnimatedIcon\` and \`windowSplashScreenBackground\` |
| iOS app icon | \`Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png\` | 1024px opaque, universal iPhone slot |
| iOS launch mark | \`CpiLaunchMark.imageset\` | 160/320/480 px for 1x/2x/3x |
| iOS launch storyboard | \`Base.lproj/LaunchScreen.storyboard\` | Static centered 160pt image; explicit opaque #000000 background |

The generator regenerates these after Capacitor \`add/sync\`, validates their exact binary output in \`--check\`, and writes the source asset size/hash inventory to native evidence. No legacy story-icon aliases, signing secrets, static full-screen art or remote image URLs are added.

## Runtime startup contract

**6 November 2026 update:** Georgi explicitly requested a separate 3-second Kolequant signature: the actual DNA logo disperses into codons, then resolves into the metallic **INFINITY home heading** and moves to its menu position. [The player/QA decision](PLAYER-QA-RELEASE-PREVIEW.md) supersedes the earlier rejection of a brand overlay for this specific owner-approved animation. The native OS splash remains static, and local bootstrap still runs immediately with its independent 1.5-second failure bound. The intro is mounted once per cold page start, with no network dependency or replay on navigation/resume. Reduced motion, backgrounding, resize and cleanup have bounded safe exits. This browser change does not establish native launch acceptance.

The native OS renders its own screen and returns to React when ready. React's first \`loading\` view is a separate lightweight in-app state, using the same logo and dark background. Local checkpoint/preferences are read immediately, **without minimum hold time** or network calls. A failed/hanging local bootstrap has a bounded 1.5-second deadline with accessible \`Retry startup\` and \`Play offline\` actions. Offline fallback keeps existing saved data untouched; running a new practice still displays normal explicit overwrite confirmation where applicable. No ad, analytics, profile, leaderboard or consent service can delay offline practice.

Launch colors are set in native config, Android splash values, iOS storyboard, HTML initial background, React CSS and the brand tokens. Since the 8 November correction, each start surface uses pure black. Keyboard focus, native safe-area padding and reduced-motion CSS remain effective.

## Verification and remaining gates

- Automated: CRC/PNG dimensions, alpha and safe-zone samples, every native density, Android 12+ style/adaptive XML, iOS image/catalog/storyboard, native generation \`--check\`, the three web builds, bounded local bootstrap, and strict Android/iOS startup/lifecycle smoke.
- Testability: Android native emulator proves cold starts and Home/lock/ordinary resume; iOS simulator proves fresh process starts and Settings interruption. These are **not** claims of visual approval on physical devices.
- Manual acceptance still required: 32/48px icon legibility and mask crop on launchers, Android adaptive/themed appearances, iOS icon pixels and OS launch transitions on a real iPhone, cold/warm/offline starts with slow local storage, no white flash, and commercial store/store-policy review.
- Separate features: release signing, rewarded ad SDK, offline rankings, login, privacy consent and app-store publication remain outside CPI-012.

No new game-core rules, scores, revive credits or network authority are introduced.

## CPI-012 Android first-launch Home dispatch race

[CI run 41435454704](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41435454704) built the new splash/icon APK and rendered the offline menu correctly. Its first native smoke attempt timed out at the **ordinary Home key** pause step, with no JavaScript errors or AndroidRuntime crash. The captured `android-attempt-1-diagnostics.json` showed a valid startup bridge snapshot and menu; the prior pre-page Home/pause and resume succeeded. The ordinary `adb shell input keyevent KEYCODE_HOME` exited 0, but ActivityTaskManager had **no HOME launch after that command**, and the screenshot still showed the app in the foreground. SystemUI was restarting immediately before this transition.

The test now requires either the actual ActivityTaskManager HOME launch or the real native `App paused` event after the key. Only if neither arrives within 5 seconds does it explicitly request a HOME activity launch through the Android OS (recorded as `home-key-not-dispatched-launcher-intent` with its command output). It then still requires the **same real native pause within 30 seconds**, a native resume, current page/bridge identities, frozen foreground time, three cold attempts and zero app runtime errors. This is an OS Home navigation delivery fallback, **not** a synthetic pause or unconditional test pass; an actual HOME transition that fails to pause the app still fails.

## 9 November 2026 approved icon and launch handoff

TestFlight `0.1.0 (17)` still used the old prism icon and showed a prism on the native launch screen before Kolequant. The approved artwork shows five glass tiles with cyan and violet lights and one fractured pane. Native generation now copies the reviewed Android exports and the 1024px iPhone icon from `apps/mobile/brand-assets/native/`. The iPhone export stores the same colors in RGB. The Android adaptive layer is inset to keep the panes within the launcher mask. The browser and home-screen shortcut use the matching 180px export.

The iOS storyboard contains a black background. Android uses a transparent icon over its black starting window. The existing Kolequant animation follows on the same background and owns the visible splash. On-device acceptance uses a cold launch and a check of the launcher icon on the new build.

Build 17 showed the clock and signal row above game screens, including Discoveries. The iPhone shell now starts with the status bar hidden and opts into Game Mode through the launch metadata. Safe-area spacing still protects content around the camera cutout and edges. The phone controls Game Mode availability and system gestures. [Apple Game Mode](https://developer.apple.com/documentation/bundleresources/information-property-list/lssupportsgamemode).

## 9 November 2026 · Native touch behavior

The native shell keeps a fixed page scale and disables the iPhone WebView's pinch recognizer. Form fields use a 16 CSS pixel minimum to avoid iOS focus zoom. The game surface suppresses selection and the long-press callout, with normal selection retained for editable fields. Browser accessibility zoom remains available outside the native shell.
