# Crystal Path source baseline

These are independent expectations for CPI-005. They are not generated from `packages/game-core/src` and do not import its rule constants. Baseline tests use the package's public API and compare its results with these literals.

## Provenance

The source is `georgi-cole/bbmobilenew-source` at immutable commit **`6ace929a60410e728928aa51eaf80ba9b5cf2262`**. `source-baseline.ts` records Git blob and SHA-256 hashes for all five inspected files. On 2026-11-01, GitHub's read-only contents API was queried at that exact commit, returned base64 content was decoded, and each Git blob hash was recomputed. The local inspection copies differ only by one extra trailing newline; line references are unchanged. No original source was modified.

- [Pure logic](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/minigames/crystalPathShattered/shatteredLogic.ts)
- [Gameplay component](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/minigames/crystalPathShattered/CrystalPathShatteredGame.tsx)
- [Source RNG](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/store/rng.ts)
- [Original logic tests](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/tests/crystalPathShattered.logic.test.ts)
- [Original async-flow tests](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/tests/crystalPathShattered.asyncFlow.test.tsx)

Route vectors were captured by executing the original pure `createRowStream(mulberry32(seed)).take(20)` for seeds 0 and 12345. Other expectations were transcribed from source branches and checked arithmetically. The weights sum to **100**; checking all 100 interior probability bins is deterministic verification, not a statistical gameplay-balance claim.

The exact source RNG draws are also captured and replayed through the core's injected RNG interface. This checks route/cadence consumption independently of the new practice RNG algorithm; it does not require different RNG algorithms to produce the same route from the same numeric seed.

Probability-range checks use interior values. Two additional captured source cases preserve the floating-point edge: `0.57 * 100` is `56.99999999999999` and selects lucky; `0.5700000000000001` selects hurt-10. The mathematical interval labels are not assertions that every decimal fraction is exactly representable.

## Preserved behavior

| Source | Expectation |
| --- | --- |
| Logic 31–41, 157–160 | Start at 300 SP and two hints; one-based damage bands 10/15/20 at rows 1–10/11–25/26+. |
| Logic 125–143 | Initial mystery zero-based index 3–6 means displayed row 4–7. Later gaps are 3–6. Draw ordering: initial gap, each row's side, then next gap if that row contains mystery. |
| Logic 168–196 | Effects are alive only at `expiresAt > now`. Priority is shield, lucky, inversion, fragility. Shield/lucky/fragility consume only the first matching instance; inversion persists and heals `floor(baseDamage / 2)`, including 7 for damage 15. Preempted lower-priority effects remain. |
| Logic 202–251 | Twelve ordered mystery weights and deltas as in the fixture; temporary effects last 5,000 ms. |
| Logic 255–268 | Prune before merging. At capacity two, remove the soonest expiry; equal expiry removes the older insertion. Duplicate kinds are allowed. |
| Component 369–391 | Regen/drain contributes +2/−2 per effect instance at a 500-ms interval. Sum simultaneous contributions before the SP clamp. |
| Component 487–495, 507 | A hint consumes one unit and identifies the safe side. The original visual highlight lasts 3,500 ms or until the next step; that flash timing is renderer work, not a current pure-core timeout. |
| Component 603–642 | Mystery does not advance, is consumed immediately even if fatal, floors hints at zero, and cannot be taken again for another reward. |
| Async test 92–131 | A survived wrong step consumes SP and advances. Animation pacing belongs to the renderer. |

## Deliberate standalone changes

These follow the [accepted CPI-001 contract](../../../../docs/decisions/CPI-001-product-contract.md). Historical behavior is evidence, not a standalone expectation.

| Original behavior | Standalone expectation |
| --- | --- |
| Component 189–191 pre-generates 350 rows; logic 138 stops mystery at the hidden limit; component 574–587/670–704 finishes the run. | Bounded incremental route with persistent cursors, mystery beyond 350 and no hidden victory. Decimal absolute indices remain exact beyond 32-bit and safe-number boundaries. |
| Component 551–563 advances `furthestRow` after the wrong-step animation even when fatal. All-wrong play from 300 SP reaches row 23 with 5 SP, then dies on row 24. | Fatal row 24 leaves `lastClearedRow = 23`. Due damage is resolved before a new action; fatal attempts never earn progress. |
| Component 517 and 624 only clamp wrong-step/mystery SP at zero. Only overtime healing has a 400-SP cap. | Every SP change uses the accepted range 0–400. |
| The 250/500-ms component effects depend on `players`, restarting intervals on state changes, and use `Date.now()`. Drain does not itself mark elimination. | Supplied active time gives deterministic timing and immediate death. First pulse is +500 ms, then every 500 ms strictly before +5,000-ms expiry: nine opportunities, totaling ±18 SP before caps or other effects. Expiry precedes input at equality. This is an explicit technical rule, not a measured guarantee of the old timers. |
| Source has wall-clock countdowns and no rewarded revives. | Pause freezes active time. Revive preserves route, consumption and known information, clears temporary effects, sets 200 SP for restores 1–5 and 150 for 6–10, and adds no progress. |
| The component's hint highlight disappears after 3,500 ms; its hint handler can charge again on the same row. | The core retains discovered safe-side knowledge for the unresolved row and its revive snapshot. A duplicate hint on a known row rejects without another charge. Future renderer flash timing is separate from retained knowledge and is not covered by these pure-core tests. |
| The gameplay RNG also serves AI decisions; source ranking uses SP, survival order and a secret-winner category. | Separate serializable route/reward cursors; single-player state without AI or season rewards. Public ranking/ad verification belongs to later adapters. |

Seed zero is a valid explicit pure-generator input. The old component replaces zero with a random seed; the seed-zero vector tests the pure generator, not that wrapper.

## Limits

These unit/reference checks do not validate animation pacing, native lifecycle, ad callbacks, server authority, anti-cheat, device performance or player enjoyment. Stream/save-resume/buffer stress tests are separate from the small source vectors. Fixture changes require pinned-source evidence or a documented versioned standalone rule change.
