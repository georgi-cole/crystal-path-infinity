# Solid Campaign landing and finale - 16 November 2026

CPI-045, issue #121 follow-up to PR #147. Baseline: merged main `775237bef34a9946db7c3bb190d8bab912330150`, delivered as TestFlight 1.0.2 (81). The owner requested an unbreakable golden landing, a clearly visible jump/spin, and a transition into the success background. This entry describes a new source candidate; it does not retroactively change PR #147 or its validation.

## Rules and saved attempts

New attempts carry content revision `0.6` and a bounded `JourneyRoute.landingRow`. The deterministic generator makes both destination tiles intact after applying weather and authored marks. It consumes exactly the same random draws; every other row remains identical for a matching seed. The safe final choice does not consume a shield. Stability and objective evaluation still decide success, and revision 0.5 early-impossible-objective behavior also applies to 0.6. The landing is not an unconditional win.

The optional landing field is absent from historical snapshots and endless routes. Old 0.1-0.5 checkpoints resume their original behavior, while a new/restarted attempt uses 0.6. Save matching verifies the landing rule against the snapshot revision. Rotating Infinity routes cannot declare a Campaign landing. No official server ruleset, Ranked score validation, grant, price, supply inventory, revenue assumption or historical simulation changes. `docs/BUSINESS_PLAN.md` is unchanged for that reason.

## Presentation

The settled companion now plays an 1800ms jump with a lift of roughly half its SVG body height, squash, rebound and landing. Flipzel/Purralune make a full airborne turn. Existing character art, gear and footing remain attached to the actual actor. Reduced-motion, paused and background states suppress movement.

The success cue and minimum landing hold precede a 900ms expanding reveal from the gold landing area into the existing chapter artwork. The artwork and landmark lighting match the reward/result scene; a fading gold glow bridges the surfaces. The clipped overlay contains its effect layers. No assets, dependency or network request are added. This is a visual transition, not a simulation of physical tile deformation. Muted/missing/blocked media keeps the bounded audio fallback; failure never plays a victory move.

## Validation

- Route coverage checks every authored main and alternate approach across four seeds, both safe destination choices, identical non-destination rows/RNG state, no shield spent, old 0.5 checkpoint equality, and invalid/rotating landing declarations. Existing objective and mission-clear tests remain in the suite.
- Full mobile suite: 1,013 passed; core: 315 passed; balance: 6 passed. The default server rerun hit host memory exhaustion (PGlite WebAssembly/worker allocation), after an earlier 236-test server pass. The complete server suite then passed all 236 tests with `--maxWorkers=2`; no server source was changed.
- Focused Campaign, saved-revision and mission-audio suites: 169 tests passed, including muted/missing/stalled media and cancellation.
- Workspace typecheck, lint and formatting passed. Development, staging and production web builds passed. Planning validation, all 13 Python tests and all 17 workflow-routing tests passed. The Windows planning check uses `python` because the `python3` App Execution Alias is unavailable.
- Chromium at 390px CSS width: the actual puppy companion visibly lifts from its footing; the kitten actor makes the full turn. A paused transition midpoint exposes the chapter artwork beneath the expanding mask. These are storage-free local fixtures, not a new native-device acceptance result.

Native device acceptance remains pending a signed build; desktop Chromium checks do not establish iPhone WebKit frame rate or final audio synchronization on hardware.
