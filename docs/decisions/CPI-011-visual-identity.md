# CPI-011 — Midnight Prism identity

Status: **working visual direction for Georgi's review**, not an approved app-store icon. Crystal Path Infinity retains the premium glass bridge, dark void, cyan crystal and restrained violet accent, without The Big Eye, LOH/POS, seasons, VIP or simulated rivals.

## Reviewable implementation

- [Static icon, intro and HUD board](../previews/CPI-011-brand-board.svg): simulated row/SP are illustrative, not game data.
- [Original 512x512 SVG icon concept](../../apps/mobile/public/assets/brand/icon-concept.svg): faceted crystal over two paths. View at 48/96/180/512px before choosing native exports. No text, fonts, scripts or external resources.
- [Theme tokens](../../apps/mobile/src/brand/theme.css) and [glass button](../../apps/mobile/src/brand/CrystalButton.tsx): now used by real Continue/New Practice actions on the intro. Profile, Hall of Fame and Market remain future navigation, not fake working links.
- [Source reuse decisions](../../planning/reuse-manifest.json) and [asset inventory](../../planning/visual-assets.json) distinguish original, copied, adapted and excluded assets.

## Colors and type

CSS is the source of truth: void #080c1b, surface #102034, raised surface #172e47, cyan #79def2, violet #a78cf6, text #ecf9fe, muted #abc7da, safe #55edb0, danger #ff7b90 and focus #d6ffff. System sans fonts avoid extra licensing and platform surprises. Wordmark is live HTML: small-spaced Crystal Path and prominent Infinity. Safe/danger/hint must remain distinguishable by text and states, not color alone. Cosmetic skins must never alter game logic or reveal ranked routes.

## Adaptation from The Big Eye

- src/components/GameButton/GameButton.tsx and GameButton.css: reuse the **interaction pattern**, glass gradients, focus/disabled/pressed affordances, not its holiday modes, SVG-mask files, Redux or season flags. Standalone CrystalButton is a pure accessible button with 48px min target.
- src/screens/HomeHub/HomeHub.tsx and HomeHub.css: narrow portrait hierarchy is a reference, **not** a source of weather/Redux/VIP/menu routes.
- src/components/IntroSplash/IntroSplash.tsx: bounded logo wait useful for CPI-012; do not copy Kolequant branding.
- src/components/ui/GameBackButton/GameBackButton.tsx: vector idea for CPI-013, but original 2rem target is too small and must be enlarged.
- src/components/GameControlDock/GameControlDock.tsx: do not import host-specific portal/season/audio logic.
- src/screens/Profile/Profile.tsx and src/screens/Settings/Settings.tsx: reference future screen patterns only; native account/data and CPI-010 settings remain standalone.
- public/assets/intro_hub_icons/play.svg and hall_of_fame.svg: original eye symbolism is deliberately excluded.

## Asset export brief

| Element | Format and dimensions | Adaptation and fallback | Next task |
| --- | --- | --- | --- |
| App icon | Original 512x512 SVG concept; review at 48/96/180/512 | Keep important geometry within ~80% inner area, no tiny text. Produce Android adaptive layers and opaque Apple 1024px raster only **after visual sign-off**. Current native icon remains unchanged. | CPI-012 |
| Intro emblem | Local vector, up to 216px wide and 26svh high | Shrinks on short phones; CSS midnight backdrop and HTML wordmark remain if image unavailable. | CPI-011 |
| Background | Layered CSS navy gradients | Avoid full-screen WebGL/blur; flat #080c1b if reduced. Original black-hole bitmap pending rights. | CPI-013 |
| Bridge | Existing bounded DOM/CSS tile renderer | Keep safe areas, focus, reduced-motion and explicit SP feedback. | CPI-008/CPI-034 |
| Buttons | Native semantic React/CSS controls | Primary/secondary/quiet, >=48px target, keyboard focus/disabled state, no external SVG masks. | CPI-011/CPI-013 |
| Typography | System sans and real text | Test 320px screens and 200% zoom; no font binaries. | CPI-011 |

## Rights and acceptance boundaries

The user owns the source repository and directed reuse, but that alone does **not** establish third-party rights for source audio/photo. The four copied MP3s in CPI-010 remain pending commercial license review, while the original glass_bridge.mp3 and infinity-black-hole-bg.png are untransferred/excluded until cleared. This task adds no generative imagery and no external fonts. Every copied/adapted item retains pinned source path, commit and rights status in the asset inventory.

Automated tests can prove local-only icon references, accessible button markup, traceability and build integrity; they cannot prove aesthetic approval or hardware readability. Before closing CPI-011, review the board and 48px icon, real intro vs bridge, narrow portrait, device insets, large text, and reduced-motion mode. CPI-012 owns splash and native icon exports; CPI-013 owns navigation; CPI-016/019/024 own the future full Settings/Profile/Hall of Fame.
