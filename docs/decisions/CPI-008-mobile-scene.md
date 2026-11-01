# CPI-008 — Standalone Infinity scene (mobile)

Dependency: CPI-007, merged via PR #45. Source inspected: `georgi-cole/bbmobilenew-source@6ace929a60410e728928aa51eaf80ba9b5cf2262`, `CrystalPathShatteredGame.tsx`, `crystalPathShattered.css`, and the current [reuse manifest](../../planning/reuse-manifest.json).

## What ships

A playable **practice preview** is reachable from the existing development shell. It is intentionally marked local and not ranked; resumable storage belongs to CPI-009 and real ads/reward verification belong to later tasks. The existing CPI-007 lifecycle/active-time runtime owns all input and timing. React renders a bounded projection, not the core state or a copy of the original source's AI/season logic.

The visual scene reuses the original perspective glass bridge, warm/cool glass tones, crack/safe/collapse feedback classes, particles, edge lighting, SP bar and the Infinity rings. The source PNG black-hole background is tracked for later asset provenance/rights review and not embedded; a built-in, offline CSS black-hole atmosphere provides the background. Sound assets and their lifecycle belong to CPI-010. No Pixi/WebGL, extra UI framework, ad SDK or backend connection was introduced.

## Data and performance contract

- `presentInfinityScene(state)` returns at most **5** rows: one resolved previous row, current and three future. It maps strictly via decimal BigInt absolute indices; it does not assume 350 is a finish line.
- The projection deliberately has **no future safeSide field** and no RNG cursor. Current reveal/hint and past resolved selections use their own public-facing view fields. Future tile answers remain in the practice core's private state, outside the rendered object.
- Original reducer-owned `rows`/`resolutions` remain bounded (default policy 8 ahead, 2 history), including at batch and large-index boundaries. View renders at most 10 tiles, 5 centre slots, two decorative reflection rows, and 6 particles. No new JS animation/score timers are created; CSS-only animation is disabled by reduced-motion settings.
- Effects use `state.activeTimeMs`, not `Date.now()`; the host's single serialized runtime owns clock ticks, pause leases, native sampling and cleanup.
- Touch actions are directly on two large one-hand left/right buttons and on the active row tiles; mystery and hint have separate accessible controls. All interactive controls have accessible names. System safe areas and narrow/short-height portrait styles are explicit; large decimal numbers wrap rather than truncate.
- Styling is selected by `INFINITY_SCENE_SKIN`, separate from the reducer, command API and checkpoint. Future tile/background skins can preserve existing state and accessibility contracts.
- Source media/AI feed, standings, VIP and season-prize claims are intentionally excluded. No synthetic online opponents or official result mutation.

## Validation

Tests exercise bounded projection, no secret fields, 350→351, arbitrary-length decimal row numbering, active-time effects and static accessible markup. Development/staging/production builds and native emulator/simulator checks remain required. Native CI currently launches the development intro (not an automated touch walkthrough of the preview); full visual viewport/device walkthrough and performance soak still require the explicit CPI-008/CPI-034 checks.

## Follow-on integration

CPI-009 will replace this disposable practice preview with versioned local recovery and explicit continue/new actions. CPI-010 supplies sound/haptics. CPI-011/012/013 will refine the final art system, splash and menu; CPI-021 owns ranked authority. This scene does not import or expose future ranked answers.
