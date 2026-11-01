# CPI-009 — Local practice save and recovery

Dependency: CPI-008 scene and CPI-007 lifecycle clock. Scope: **local practice only**. There is no account, server rank, leaderboard assertion or SSV/reward authority in this feature.

## Durable model

- `practice-save.ts` stores the complete bounded reducer checkpoint, including row-stream and mystery RNG cursors, current row, SP, hints, active effects, pending reward identifiers, revive receipts and an explicit finished/dead/playing status. The checkpoint is validated with `assertRunState` and `PRACTICE_RNG` before every write and after every read.
- Keys use `cpi.practice.v1.*` exclusively; the run ID must begin `practice-`. An official/ranked client or server must never consume these records as authoritative time, SP, RNG or revive proof.
- An inactive slot is written and verified first; the tiny versioned commit marker changes last. A crash before the marker commit restores the previously committed snapshot; a crash after it restores the new one. Reads **only** the marked slot. A damaged marked slot, unknown schema or checksum mismatch yields an explicit incompatible-save state, **not** an unannounced rollback to an older run, which could replay spent hints/SP or rewards.
- Checksums detect accidental corruption but are not cryptographic signatures. Local WebView storage may be deleted by operating-system cleanup, user deletion or app reinstalls. This is a best-effort local checkpoint, not a cloud backup. Larger data stores/platform migrations must be evaluated before production release.
- A size cap and the reducer's 8-ahead/2-history default window bound serialization independent of the row number. Row indices remain decimal strings and are never rounded through JavaScript floating-point arithmetic.
- Music/SFX/reduced-motion preferences have a separate `v1` record. Invalid preferences revert to safe defaults with an explicit warning; they never alter or delete a gameplay checkpoint.

## UI integration

The intro shows distinct **Continue practice** and **New practice** actions when a recoverable state exists. Starting new asks before replacing an unfinished checkpoint. An incompatible checkpoint presents a discard warning rather than silent reset. Missing/unavailable storage never blocks offline local play; it instead warns that the current attempt cannot be guaranteed across restarts.

The CPI-007 runtime records accepted gameplay decisions and effect changes synchronously before the React view shows them. Idle ticks are checkpointed at bounded intervals, plus a forced checkpoint at pause, confirmed native background and explicit exit. The stored `activeTimeMs` is authoritative only for this local practice owner; a fresh lifecycle sample on restore excludes menu/background time. A restart creates a different runtime owner, so late callbacks and old pause leases cannot mutate the resumed run. The intro and result views label practice as **not ranked**.

There is no save write from a decorator/renderer component. The view remains a bounded projection without future safe-side exposure. CPI-016 will provide the settings controls; this task supplies their versioned persistence API.

## Verification

Unit tests exercise first save/reload, two-phase interruption at either write stage, incompatible/corrupted markers, no fallback to obsolete SP, isolation of settings and keys, the 350→351 boundary and a long run past buffer allocation. The CPI-007 clock tests cover reinitialization after OS/background suspension and stale async events. GitHub quality gates and native application launch are required on the final PR revision. Actual physical-device process termination/reinstall behavior remains a separate CPI-002/CPI-034 release gate.

## Non-goals

No ranked credential, analytics session, ads, purchase, remote sync, GDPR data transfer, or UI confirmation that an official score was accepted. Continuing a saved local practice cannot create a verified leaderboard entry.
