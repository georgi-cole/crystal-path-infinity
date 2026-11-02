# CPI-013 — Home menu, safe resume and navigation

## Implemented contract

The standalone Midnight Prism menu exposes Play, Practice, Rankings, Profile and Settings as working local destinations. The primary Play action is visually dominant but explicitly labeled as ranked/account-dependent. Since accounts, ranked runs and verified leaderboards are not integrated, it opens an honest explanation and a functional Practice path instead of starting a fake official attempt.

Practice runs fully offline for guests of every age without an account, analytics permission or age questionnaire. It uses the existing CPI-009 checkpoint with exact route, resources and RNG. The home screen offers Resume at the saved current row and a separate New action. A saved or damaged checkpoint can only be replaced after an explicit dialog confirmation; cancellation, Escape and Back preserve it. A finished run is not offered as an unfinished resume.

The personal best is read from the practice-only persistent key introduced by CPI-009 and validated before display. Large decimal row indexes are kept as strings and formatted without numeric coercion. The label visibly states “Practice only” and never implies a verified ranked score.

Profile reports Guest (no fabricated account), and Rankings shows unconfigured or offline status (no fabricated data). Device connectivity is only a hint, not proof that an API is live; Recheck connection reads device connectivity but does not claim a backend request succeeded. Settings contains real music, SFX, haptics and reduced-motion controls from CPI-010. All service-backed profile, rankings, privacy/parental and maintenance signals are future integrations.

## Navigation and session ownership

Known hash routes: #home, #play, #practice, #rankings, #profile and #settings. Unknown routes land on home. A cold or reloaded #practice-run and #new-practice safely open Practice without auto-creating a session or deleting data. Browser history popstate and hashchange support Android WebView Back; a direct-linked subview’s visible Back returns home even without in-app history.

A game is a single InfinityPractice runtime with a guarded start. Browser/Android Back while a run is active sends an exit request to that existing runtime, which uses its original confirmation, native pause lease and exact checkpoint commit. Cancel returns to the same game; it does not create a second session. Explicit Exit also returns to the menu. No additional native dependency or permission is introduced. Menu navigation does not import season/AI/store state from the source game.

Destructive confirmation is a labeled modal; the background becomes inert and focus moves to Cancel. Menu buttons have accessible names, 44px or larger touch targets, keyboard focus rings, safe-area insets, low-viewport scrolling and reduced-motion behavior. Cold launch still uses the CPI-012 immediate bootstrap and native diagnostic marker.

## Owner-source review: adaptation, not a full copy

Big Eye source: georgi-cole/bbmobilenew-source pinned at 6ace929a60410e728928aa51eaf80ba9b5cf2262. Source files are proprietary and only inspected for owner-directed patterns:

- src/components/GameButton/GameButton.tsx + .css: accessible glass button hierarchy, press and focus cues → new self-contained MenuAction; holiday theme, SVG mask art and “Surprise Me” bypass are rejected.
- src/components/GameTopChip/GameTopChip.tsx + .css: semantic, stretch-safe status chip → standalone guest/offline status pill without fixed-width estimates or season state.
- src/components/ui/StatusPill.tsx + .css: reviewed but rejected, to avoid a second redundant chip system.
- src/components/ui/GameBackButton/GameBackButton.tsx + .css: accessible vector back affordance → 44px standalone button with browser-history navigation instead of source navigation.
- src/screens/HomeHub/HomeHub.css and HomeHub.tsx: portrait layout/menu hierarchy → adapted without weather, live-season selection, character cast, store, VIP or remote services.
- src/screens/Settings/Settings.css: layout reference for CPI-016; functional audio toggles are already available under Settings.

The planning reuse manifest retains exact source paths and pinned rights information. The new implementation is standalone React/TypeScript/CSS and uses only the original Crystal Path brand assets.

## Review walkthrough

1. Fresh install or offline boot: guest status, personal best “—”, prominent ranked Play and functioning Practice; no age/login/analytics prompt.
2. Start a practice, cross several rows, exit or restart. Resume uses exact checkpoint state; New requires explicit confirmation when saved data exists.
3. Press native Android Back or browser Back in subpages, new-run confirmation and live gameplay. Confirmed exit checkpoints; canceled exit keeps the same session. Cold return from stale game URLs never starts a run.
4. Rankings and Profile explain unconfigured services instead of blank screens. Settings toggles persist across relaunch. Recheck connection does not claim remote authorization.
5. Verify accessible focus, 320px width, large system font, short portrait and reduced motion.

Automated tests cover route normalization, guest/online/offline states, dialog content, personal best precision and native Back integration. Android/iOS build and lifecycle CI remain required. Full device visual testing, screen reader acceptance and backend integration are separate outstanding milestones.

CPI-014 owns tutorial, CPI-016 localization/privacy/settings completion, CPI-017–021 account and ranked backend, CPI-024 Top 100.
