# CPI-012 — Native icons, platform splash and bounded offline bootstrap

## Contract and inherited decisions

CPI-011 Midnight Prism is the baseline for launch branding, not a copy of the original The Big Eye icon or global splash overlay. Android, iOS and React use the same dark starting color **#060a18**. The transparent prism icon asset belongs to CPI-011; its binary exports are generated deterministically by CPI-012. All UI text remains live HTML; no fake ranking, season reward or "win at 350" content is introduced.

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
| iOS launch storyboard | \`Base.lproj/LaunchScreen.storyboard\` | Static centered 160pt image; explicit opaque #060a18 background |

The generator regenerates these after Capacitor \`add/sync\`, validates their exact binary output in \`--check\`, and writes the source asset size/hash inventory to native evidence. No legacy story-icon aliases, signing secrets, static full-screen art or remote image URLs are added.

## Runtime startup contract

The native OS renders its own screen and returns to React when ready. React's first \`loading\` view is a separate lightweight in-app state, using the same logo and dark background. Local checkpoint/preferences are read immediately, **without minimum hold time** or network calls. A failed/hanging local bootstrap has a bounded 1.5-second deadline with accessible \`Retry startup\` and \`Play offline\` actions. Offline fallback keeps existing saved data untouched; running a new practice still displays normal explicit overwrite confirmation where applicable. No ad, analytics, profile, leaderboard or consent service can delay offline practice.

Launch colors are set in native config, Android splash values, iOS storyboard, HTML initial background, React CSS and the brand tokens. Keyboard focus, native safe-area padding and reduced-motion CSS remain effective.

## Verification and remaining gates

- Automated: CRC/PNG dimensions, alpha and safe-zone samples, every native density, Android 12+ style/adaptive XML, iOS image/catalog/storyboard, native generation \`--check\`, the three web builds, bounded local bootstrap, and strict Android/iOS startup/lifecycle smoke.
- Testability: Android native emulator proves cold starts and Home/lock/ordinary resume; iOS simulator proves fresh process starts and Settings interruption. These are **not** claims of visual approval on physical devices.
- Manual acceptance still required: 32/48px icon legibility and mask crop on launchers, Android adaptive/themed appearances, iOS icon pixels and OS launch transitions on a real iPhone, cold/warm/offline starts with slow local storage, no white flash, and commercial store/store-policy review.
- Separate features: release signing, rewarded ad SDK, offline rankings, login, privacy consent and app-store publication remain outside CPI-012.

No new game-core rules, scores, revive credits or network authority are introduced.
