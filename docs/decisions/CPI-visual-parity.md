# Original Infinity scene visual parity — corrective follow-up

## Decision

CPI-011 **was merged through PR #50**. PR #49 is a separate unmerged, overlapping candidate visual identity; it is deliberately left untouched rather than merging alternative code. This follow-up implements Georgi's visual feedback without replacing his established Infinity minigame design or changing gameplay.

The premium standalone scene originally copied much of `src/minigames/crystalPathShattered/crystalPathShattered.css` but swapped the original black-hole PNG for CSS radial gradients. This was visibly less faithful. The original source asset is now restored byte-for-byte at `apps/mobile/src/infinity-black-hole-bg.png`. Vite bundles it into the offline app; no remote URL, runtime fetch, extra permission, font, or rendering library is needed.

- **Source repository:** `georgi-cole/bbmobilenew-source`
- **Pinned source commit:** `6ace929a60410e728928aa51eaf80ba9b5cf2262`
- **Original path:** `src/minigames/crystalPathShattered/infinity-black-hole-bg.png`
- **Git blob SHA:** `25e9ceb6f98ac43c2bc15354ce8be7b7e7596cd3`
- **Exact size:** 1,896,459 bytes
- **Destination:** `apps/mobile/src/infinity-black-hole-bg.png`

The asset was transferred with a one-time branch-scoped GitHub Actions job using a pinned raw source URL, size and Git object SHA checks; the workflow was deleted after the file was committed. The regression test independently checks the PNG signature, byte length and Git object ID. The reuse manifest records the owner-requested reuse and notes that any third-party/commercial redistribution rights still require separate storefront diligence.

## Minimal LED adjustment

The original premium view draws rainbow side rails using `.cps-shell--premium .cps-board::before` and `::after`. They extended from 4% to 97% of the board, visibly crossing the closest two transparent tile rows.

The standalone scene retains the original rail colors, 3px thickness, glow, location, animation and depth layers. It instead ends them at 44% of the board height and gradually masks their lower 28% to transparent. Browser geometry checks found the rail ends before the second-nearest row by approximately 20px at a 390×844 portrait viewport and 61px at 640×1260, with no overlapping tile hit area. Both standard and WebKit masks are declared; the pseudo-elements remain non-interactive.

No tiles, hitboxes, row perspective, HUD, native clock, RNG, SP, scoring, save format, revives, menu routes or haptics were changed. The Big Eye source repository is not modified.

## Verification

Run existing Vitest + typecheck + formatting and all three web builds, then Android and iOS native checks. The updated test asserts exact bitmap provenance and explicit rail masking. Visually compare portrait start and later rows against Georgi's supplied original: original detailed black hole should be visible, while front two tile rows remain clear of vertical light rails.

Physical-device visual confirmation, responsive small-screen crop and the source image's commercial licensing history are review requirements, **not** implied by a CI pass.

## Optimization and direct-tile UI follow-up

The original 941 × 1672 PNG was verified at Git blob SHA
\`25e9ceb6f98ac43c2bc15354ce8be7b7e7596cd3\`, then converted offline
with pinned Pillow 11.3.0 (WebP quality 96, method 6). The committed
\`apps/mobile/src/infinity-black-hole-bg.webp\` is **201,680 bytes**, compared with
1,896,459 bytes for the original PNG: **89.4% smaller**, same dimensions.
The deterministic output has Git blob SHA
\`c8c0458f4f26dcc73a2b42d80663221d629c60a7\`. Vite embeds it as a local
WebP asset. No remote image and no new runtime dependency. The one-time
conversion workflow and unoptimized PNG are deleted.

The visually redundant bottom \`cps-controls\` instruction panel and duplicate
Left/Right buttons are removed from the standalone React scene. The glass
tiles remain the accessible left/right interaction targets and the actual
mystery tile remains clickable. Hint (with its remaining-count badge) now
sits beside Pause in a compact top toolbar. Important events still reach an
\`aria-live=polite\` visually hidden status, and pause/error/result overlays
remain visible. Freed vertical space expands the bridge view from
\`46dvh\` to \`54dvh\` within the portrait limits. Neither game-core nor native
clock/checkpoint rules are changed.

The corrected WebP/toolbar appearance was reviewed in a real mobile-sized
browser build, not an AI illustration. Physical Android/iPhone visual approval
is outstanding.
