# CPI-011 — Midnight Prism visual identity (candidate for review)

**Status:** implemented visual direction, awaiting Georgi's design approval and physical-device review. **Scope:** the offline standalone app with the premium Infinity glass bridge, cosmic fog and crystal atmosphere. No change to RNG, SP, effects, checkpoints, ads or scoring.

## Single direction: Midnight Prism

The ice-and-iris prism frames a dark, endless corridor. It is not an eye or a Big Eye television asset. CRYSTAL PATH remains tracked uppercase live text; Infinity is a larger live text line. The text-free graphic is used at small sizes, while labels and numbers stay selectable, accessible DOM text.

The following original assets are available for review, not native release claims:

- [Prism mark](../../apps/mobile/public/brand/prism-mark.svg) — transparent, vector 256×256 viewBox.
- [App icon concept](../../apps/mobile/public/brand/app-icon-preview.svg) — opaque, vector 512×512 viewBox.
- [Concept board](../brand/midnight-prism-board.svg) — schematic icon, menu and HUD; **not** an app screenshot.
- [Color and type tokens](../../apps/mobile/src/brand-tokens.css) — offline system-font stack and semantic CSS.

| Token | Hex | Use |
| --- | --- | --- |
| Night | `#060a18` | App/launch foundation |
| Abyss | `#020711` | Cosmic bridge falloff |
| Ice | `#82dff1` | Crystal and focus-adjacent decoration |
| Iris | `#ac9aff` | Secondary gem reflection |
| Text | `#edfaff` | UI foreground |
| Muted | `#b6cbdb` | Secondary copy |
| Safe | `#67efc5` | Success, alongside text and tile state |
| Risk | `#ff7389` | Danger, alongside cracking/words |
| Focus | `#d8faff` | Visible keyboard navigation |

The intro and gameplay HUD now use the same mark and core tokens. The original bounded CSS bridge renders offline: no new bitmap, WebGL, remote fonts or expensive per-frame image filters. Tile shape/cracking and hints are retained, not reduced to color alone. Touch controls, native safe-area constraints and both OS/in-app reduced motion remain in place. Very large decimal row indices remain ordinary text, not a graphic.

## Format, fallback and export handoff

The small mark is transparent SVG; the 512-unit concept has an opaque dark background with the important silhouette concentrated near the center. At 32/48px, confirm the corridor reads without depending on the tiny rung detail; at 128px check facets and text-free recognition. The in-app fallback is the existing dark CSS atmosphere and live brand text; there is no online image request. The source background bitmap (`infinity-black-hole-bg.png`) is **not** bundled: its rights and size/color comparison are unresolved.

**CPI-012**, not this task, will generate and test native Android adaptive icon foreground/background layers and OS splash, and iOS icon catalog/required store icon formats. Android 12+ OS splash is icon plus background, not an arbitrary full-screen scene. Confirm platform-specific safe zones, warm/cold startup and physical devices before calling these production exports.

## Source UI pattern review

Inspected in proprietary `georgi-cole/bbmobilenew-source` at the pinned commit `6ace929a60410e728928aa51eaf80ba9b5cf2262`; see the [file-by-file reuse manifest](../../planning/reuse-manifest.json) for verified source path, commit, intended target, rights and optimization for each entry.

| Source | Decision |
| --- | --- |
| `src/styles/gameDesignSystem.css` | Adapt the semantic token organization; create independent `--cpi-*` variables rather than copying the global Big Eye stylesheet. |
| `src/components/GameButton/GameButton.tsx` + `.css` | Preserve glass-surface, press/focus affordance; do not import the holiday theme or SVG mask/button assets. Shared button extraction belongs to CPI-013. |
| `src/components/GameTopChip/GameTopChip.tsx` + `.css` | Adapt stretch-safe HUD/chip semantics; preserve unlimited score/row text. The reusable component belongs to CPI-013. |
| `src/components/ui/StatusPill.tsx` + `.css` | Reject duplicate chip vocabulary and season-specific variants. |
| `src/components/ui/GameBackButton/GameBackButton.tsx` + `.css` | Vector arrow/accessibility for CPI-013; enlarge 2rem source tap target to at least 44px. |
| `src/screens/HomeHub/HomeHub.css` | Reference portrait safe-area frame/menu hierarchy for CPI-013, not weather/season identity. |
| `src/components/IntroSplash/IntroSplash.tsx` | Reference bounded logo fallback, but reject forced 1.8s intro delay. Native splash integration is CPI-012. |
| `src/screens/Settings/Settings.css` | Reference surface/form grouping for CPI-016, not privacy/account assumptions. |
| `src/screens/Profile/Profile.css` | Reference textual hierarchy for CPI-019, not seasonal avatars. |
| `src/screens/Leaderboard/Leaderboard.css` | Reference tab/card layout for CPI-024; results must come from a new verified read model. |

The original repository LICENSE is proprietary, copyright © 2026 Georgi Kolev. Owner-directed internal adaptation does not establish any third-party commercial license. In particular, **four original MP3 SFX were copied under CPI-010 but their commercial provenance still needs verification**. The large source `glass_bridge.mp3` remains unimported, while the separate bundled ambient WAV is interim. No new copyrighted bitmap, art pack or external font is imported in CPI-011. The original game/repo is unchanged.

## Review checklist and acceptance boundary

Review the icon at 32/48/128px, the concept board and actual narrow/mobile intro/HUD; inspect contrast, focus, short viewport, large labels, reduced motion and tile outcome readability. Visual direction is not considered approved until Georgi signs off. Device appearance, source raster and audio rights remain separate release gates. CPI-013 takes over the full menu/component system, CPI-016 Settings, CPI-019 Profile and CPI-024 Top 100.

This is a working design implementation for PR review, **not** a claim of finished store icons, native splash, commercial asset clearance or visual sign-off.
