# Original Infinity scene visual parity — corrective follow-up

## Scope

CPI-011 was merged through [PR #50](https://github.com/georgi-cole/crystal-path-infinity/pull/50). The overlapping [PR #49](https://github.com/georgi-cole/crystal-path-infinity/pull/49) is an unmerged alternative and remains untouched. This follow-up respects Georgi's established premium Infinity minigame, rather than redesigning it. No game-core rules, SP, RNG, clock, saves or native permissions are changed.

## Original artwork, optimized

The original Infinity PNG was checked against the owner's pinned source before any conversion:

- Source repository: `georgi-cole/bbmobilenew-source`
- Source commit: `6ace929a60410e728928aa51eaf80ba9b5cf2262`
- Source path: `src/minigames/crystalPathShattered/infinity-black-hole-bg.png`
- Source Git object: `25e9ceb6f98ac43c2bc15354ce8be7b7e7596cd3`, 1,896,459 bytes
- Source dimensions: 941 × 1672
- Final standalone asset: `apps/mobile/src/infinity-black-hole-bg.webp`
- WebP encoder: pinned Pillow 11.3.0, quality 96, method 6, RGB
- Final Git object: `c8c0458f4f26dcc73a2b42d80663221d629c60a7`, 201,680 bytes

The WebP is **89.4% smaller**, preserves the original resolution, and is bundled offline by Vite. The original large PNG is not shipped. The source PNG transfer and WebP conversion each used a temporary GitHub Actions workflow; both were removed from the branch afterward. The regression test checks the final WebP magic bytes, exact size and Git object identity. Future recompression requires visual approval; the source image's commercial redistribution history remains a separate release gate.

The former CSS procedural black-hole approximation has been replaced with this source-derived artwork. The original perspective, glass panels, overlays, lights and HUD remain intact.

## LED rail clearance

The rainbow side rails are the original `.cps-shell--premium .cps-board::before` and `::after`. They had extended to 97% of board height, crossing the first two transparent tile rows. Their original 3px gradients, glow, anchoring and animations remain, but they now end at 44% of the board height with the lower 28% gradually fading to transparent. Both standard and WebKit masks are specified, and the visual rails remain noninteractive.

Browser geometry checks found approximate clearance of 20px at 390 × 844 and 61px at 640 × 1260. Precise pointer/touch acceptance on physical devices remains a review gate.

## Compact, direct-tile gameplay

The standalone scene no longer renders the redundant bottom `cps-controls` section or separate Left/Right buttons. The glass tiles remain the actual left/right controls, and the optional center mystery tile is still clickable. Hint moves into the compact top toolbar beside Pause with its remaining-count badge. Important announcements remain in a visually hidden `aria-live="polite"` status; pause, error, death and end-of-run retain their visible overlays. Removing the panel frees space for a larger portrait bridge.

A real Chromium mobile touch simulation at 390 × 844 advanced from Row 1 through Row 7 using only the glass tiles, without JavaScript errors. Tests also assert the absence of duplicate controls, existence of accessible tile labels, Hint/Pause, SVG/bitmap integrity and visual rail masking. The 640px emulated mobile hit-testing behavior needs independent device testing; no broad device-touch guarantee is made.

## Verification and release boundaries

The final PR revision must pass TypeScript, lint, Prettier, application tests, all web builds, and Android/iOS native launch checks. Browser screenshots represent the compiled app, not native-device or App Store screenshots. Physical Android/iPhone portrait visual approval, gesture testing, narrow-height layouts, and third-party source image licensing review remain pending.
