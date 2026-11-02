# CPI-014 — Short, optional interactive tutorial

## Scope and lifecycle

The tutorial is an independent local demo route (`#tutorial`) accessible from Home, Practice, and Settings. It is not an InfinityPractice runtime and is never an official attempt, local practice checkpoint, personal-best result, ranked result, ad impression, or revive. It performs no network, native clock, audio or consent operation. Browser/Android Back returns through the existing menu router; a cold deep link can display the demo but never silently creates or destroys a practice run.

Five short sections teach (1) a safe row, (2) a *survived* wrong row, (3) a limited hint, (4) an optional mystery, and (5) the score and end-run contract. Players interact with clearly labeled, large glass touch targets rather than a blocking instruction overlay. A skipped tutorial returns to Practice. Completing the explicit End training run shows a choice to open Practice, without starting or overwriting an existing checkpoint.

The underlying transitions are actual `@crystal-path-infinity/game-core` `transitionRun` commands, applied only to a separately created, deterministic training `RunState`. Four initial rows are curated for teachability (safe left, wrong left, hinted safe left, optional centre mystery on row 4). The tutorial does **not** change gameplay RNG, live scene, snapshots, timers, or source rules.

## Exact score behavior

- Start at 300 SP, 2 hints, 0 cleared rows.
- Safe crossing of Row 1 keeps 300 SP; `lastClearedRow = 1`.
- Wrong crossing of Row 2 costs 10 SP, leaves 290 SP, **and clears Row 2** because it was survived.
- A hint on Row 3 reveals the safe left pane, consumes exactly 1 hint, and changes no SP. A correct crossing credits Row 3.
- Mystery is voluntary on Row 4. Opting in calls the real mystery resolver, which can be positive or negative; skipping changes nothing.
- The optional fatal example puts the scripted run at exactly the current row's base wrong-tile damage, removes any example-only timed effects, then selects the wrong pane. SP falls to 0. `fatalRow = 4`, but `lastClearedRow = 3`.
- An explicit **End training run** commits only the demo's terminal state; there is no natural final row. No run result leaves the component.

The current tutorial completion flag (`cpi:tutorial:v1`) stores only `skipped` or `completed` in a key distinct from practice settings, checkpoint and best score. Completing persists, and replay/skip after completion does not erase it. Unavailable storage is nonfatal, though completion cannot be retained across reloads in that case.

## Acceptance evidence

Unit tests cover the actual reducer results for safe/wrong/hint/mystery/skip/fatal/end, out-of-order/repeated input, distinct storage key, accessible rendered controls, replay actions and reduced-motion CSS. Existing route tests include `#tutorial`. Main-menu startup and game checkpoint contracts are unchanged.

Manual device review remains necessary: use a fresh install; finish, skip and replay from Settings; press Android Back while in the tutorial; verify focus and one-hand touch targets at 320px, 390px and large text; check VoiceOver/TalkBack and portrait/short viewport. The observed-first-play acceptance criterion requires an actual player not familiar with the minigame.

This implementation is rebased on the merged premium visual-parity PR #53. It retains its original Big Eye SVG menu resources and existing Android ANGLE/SwiftShader compositor safeguards, with no reduction to native lifecycle coverage.
