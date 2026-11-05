# CPI-005 — Deterministic single-player core

The historical behavior below describes `infinity-v1`. The owner-requested
[infinity-v2 follow-up](CPI-005-row-pressure-v2.md) adds row pressure and survival
bonuses without changing v1 fixtures or authoritative historical runs.

**Status: implementation for review, 2026-11-01.** Georgi merged [PR #42](https://github.com/georgi-cole/crystal-path-infinity/pull/42) and requested the next task. The base is `main@1d013c48fa8e8b3dea18dc857a9d39790df60b89`; work is isolated on `cpi-005-game-core`. [Issue #5](https://github.com/georgi-cole/crystal-path-infinity/issues/5) and its linked PR record the exact checked revision and CI results.

## What this task delivers

`@crystal-path-infinity/game-core` is a standalone TypeScript workspace, with no runtime package dependencies. It extracts the single-player rules from the original pure module and React handlers into immutable transitions. The mobile and future authoritative server adapters can use the same rules, supplied active clock and RNG interface. The package itself does not authenticate players, verify ads, run timers, persist checkpoints or publish scores.

The [package API and example](../../packages/game-core/README.md) describe `createRun`, `transitionRun`, `getRunResult`, the resumable row stream and the private state types. A transition returns a new state, emitted events and an accepted/rejected result. Rejection can still include due time effects: callers must retain the returned state and events even when a gameplay command is rejected because a due drain killed the player.

The code has no React, Redux, DOM, native, season, AI-profile or LOH/POS imports. The old AI simulator is not copied. The app's visible minimum screen remains unchanged; subsequent tasks connect the core to gameplay, lifecycle, persistence and presentation.

## Source and retained rules

The source is `georgi-cole/bbmobilenew-source@6ace929a60410e728928aa51eaf80ba9b5cf2262`. [Independent baseline fixtures](../../packages/game-core/test/fixtures/README.md) include immutable file links, Git blob/SHA256 hashes, original generator execution vectors and explicit differences from the standalone contract. Fixture expectations do not import the new implementation's constants. The original repository is unchanged.

| Rule | Core behavior |
| --- | --- |
| Starting resources | 300 SP, two hints |
| SP bounds | Every change stays in 0–400 |
| Wrong-step damage | 10 on rows 1–10, 15 on 11–25, 20 from 26 onward |
| Mystery distribution | All twelve original ordered outcomes and weights, totaling 100 |
| Mystery placement | Initial zero-based index 3–6, hence displayed row 4–7; later gaps 3–6 |
| Temporary effects | Five seconds of active time, at most two; duplicates are allowed |
| Wrong-step priority | Shield, lucky, inversion, fragility; inversion heals half the base damage rounded down |
| Effect replacement | Remove the soonest expiry when full; equal expiry removes the older insertion |
| Mystery consumption | Applied once on the unresolved row, including a fatal outcome; does not advance |
| Progress | A survived side choice clears a row, including a shielded, damaging or healing wrong choice |

The source's hidden finish and mystery cutoff at 350 are removed in this standalone ruleset. A fatal side choice does not inherit the old animation callback's progress increment. The accepted universal 400-SP cap also applies to mystery and lucky/inversion healing. Known information persists in the current-row snapshot; a repeated hint on an already known row consumes no second hint. The old 3.5-second hint flash is a presentation concern for the renderer, separate from retained knowledge.

## Endless route and exact progress

Rows, score, buffer offsets and RNG draw positions use canonical non-negative decimal strings in JSON. BigInt arithmetic increments and compares them internally. A row can pass both the 32-bit boundary and `Number.MAX_SAFE_INTEGER` without rounding, wrapping or changing the rules. Only bounded array positions are converted to Number. Consumers must compare decimal indices numerically, not lexicographically.

`lastClearedRow` starts at `"0"`; `currentRow` is its one-based successor. `BridgeRow.index`, `bufferOffset`, `stream.nextIndex` and `stream.nextMysteryIndex` are zero-based. `stream.nextIndex` is the next row to generate, which can be ahead of the player's current row because of prefetching.

The default buffer contains the current row and seven ahead, with at most two completed rows retained. The combined configurable ahead/history window is capped at 256 rows. `takeRows` separately caps each allocation at 256. These are allocation limits, not finish distances. Each survived step drops old rows and resolved records, then refills the short window. Effects remain capped at two; revive receipts remain capped at ten. Decimal strings grow with the number of digits, but the core never retains the entire visited route or an ever-growing event log.

The route cursor preserves its next absolute index, next mystery index, RNG algorithm, serialized state and draw count. The reward RNG has a separate cursor, so changing the prefetch batch cannot change the next mystery reward. Both streams continue after JSON save/resume. No special branch exists at row 350.

`PRACTICE_RNG` is a reproducible SplitMix64 implementation for local practice and tests. It is **not cryptographic**. The injected RNG adapter must match the saved algorithm, return a finite sample in `[0, 1)` and advance its draw count exactly once. A future ranked service requires its own appropriate secret generator and safe client projection. Keeping a predictable seed private is not a sufficient anti-cheat design.

## Deterministic active time

The original React intervals restarted when player state changed; their timing is not a stable reference for a shared engine. CPI-001 delegated exact first-tick and equality ordering to this task. `infinity-v1` makes the following choices explicit:

1. The host supplies accumulated active milliseconds and a monotonic observation timestamp. The core never reads `Date.now`, `performance`, browser timers or host randomness.
2. A regen/drain instance starts its own first pulse 500 ms after it is granted, then every 500 ms strictly before its 5,000-ms expiry. This gives nine pulse opportunities: +500 through +4,500, for +18/−18 SP before caps, replacement or death.
3. At a shared timestamp, expired effects are removed first. Remaining simultaneous regen/drain deltas are summed, then clamped once. A temporary intermediate zero from processing one side first cannot create a false death.
4. Due effects are settled before a valid gameplay input. If drain kills the player, that input consumes no hint/mystery and earns no row. Expiry at the exact input timestamp occurs before that input.
5. A delayed tick catches up only outstanding effects, with bounded work; it does not loop over every millisecond of idle time. With no effect, waiting alone does not drain SP or kill the player.

The adapter freezes the active clock during confirmed pause, death, ads, verification and recovery. A normal pause preserves remaining durations. Revive clears all temporary effects. While dead, a different active clock value is rejected. CPI-007 owns actual native lifecycle ordering and pause/resume integration; this pure clock contract does not prove a reliable operating-system callback.

Clock values and hint counters use safe integer Numbers. Invalid, backward or overflowing values fail explicitly rather than round or silently add a new gameplay cap. Rows and RNG draw counts use lossless strings. These technical limits do not create a hidden finish distance.

## Death, revival and final results

The same immutable state describes choice, hint, mystery, ticks, death, end and authorized revival. Gameplay commands carry the expected row and `life` (`revivesApplied`). A delayed callback from before revival is rejected even though revival repeats the same unresolved row. This provides a core boundary for CPI-006's later UI/callback integration; it is not an HTTP idempotency ledger.

Death records the unresolved `fatalRow` and cause (`wrong_tile`, `mystery` or `drain`). It keeps current hints, consumed mystery outcome, known side, route and RNG cursors. Grant and apply are separate commands, bound to the run's death identity, ordinal and grant ID. At most one grant and one application exist per death; late duplicates cannot add quota or reset SP after later play.

The accepted schedule is unchanged: restores 1–5 set SP to 200; restores 6–10 set SP to 150. The tenth restore resumes play; the next death finalizes with `revive-limit`. `revivesGranted`, `revivesApplied` and `revivesToReachScore` are distinct. The score's revive count and achievement timestamp change only when a row is cleared, so an unused later revival does not worsen an earlier score.

A minimal pending-reward marker blocks finalization while verification is unresolved. Clearing it requires the matching intent and represents a trusted adapter's confirmed non-reward decision. It is not an SDK timeout. A granted but unapplied reward requires an explicit forfeiture flag before ending. These guards prepare the state model; SSV authentication, provider retries, retention and account leases remain later tasks.

`getRunResult` returns null until finalization. A result records exact cleared distance, fatal row/cause when applicable, end reason, all three revive counters and score timestamp. Death awaiting a choice, paused state and pending verification are not publishable final results. The core's entire `RunState` is private authoritative/practice data; it contains future safe sides and generator state and must never be sent as a ranked-client response.

## Verification and scope

The core workspace joins the existing root typecheck, lint, formatting and test commands. Existing mobile tests and all three web builds remain in `App quality`; package/lockfile changes also select the existing native builds. No workflow protection or failure handling is weakened.

The focused tests cover pinned-source rule vectors and all mystery bins; damage boundaries; effect priority/expiry and replacement; fatal/survived progress; revival ordinals, replay and score accounting; pending and forfeited rewards; complete serialized continuation; 350→351 mystery/progress; exact large indices; and a controlled 10,000-row run that retains only its configured rows/resolutions. The test run controls safe choices to measure technical behavior; it does not claim that players naturally reach 10,000 rows or that balance has been playtested.

Exact final test counts, revision and GitHub run links belong to the issue/PR verification record. This task does not claim playable mobile screens, physical-device performance, production ads, verified leaderboard submissions or completed backend authority. CPI-006, CPI-007, CPI-008 and CPI-009 continue the gameplay/lifecycle/renderer/persistence work; CPI-002's outstanding device/ad/backend checks remain open.
