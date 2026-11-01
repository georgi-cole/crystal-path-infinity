# CPI-006 — death, endless progress and input ownership

Issue: [CPI-006 / #6](https://github.com/georgi-cole/crystal-path-infinity/issues/6). Base: [CPI-005 / PR #43](https://github.com/georgi-cole/crystal-path-infinity/pull/43), merged as `f770e5931c836729a9e3e63aef2b6735aa0fe1e4`.

## Scope and existing behavior

CPI-005 already supplied shared wrong-tile, mystery and drain death transitions; survived-only progress; endless generation; the 0–400 SP boundary; and the agreed revive schedule. CPI-006 verifies those paths against its acceptance criteria and adds the missing owner for application callbacks. The focused review did not establish a new arithmetic defect, and this work does not claim to repair one.

The rules remain `infinity-v1`, with run schema version 1: 300 starting SP, two hints, a 400-SP ceiling, the original damage bands and mystery outcomes, and restores 1–5 at 200 SP / 6–10 at 150 SP. A fatal row earns no progress. Surviving row 350 continues to 351; the original Big Eye implementation is unchanged.

The distinction matters because a pure reducer accepts the state supplied by its caller. Calling it twice with the same historical state legitimately computes two independent outcomes. Row/life checks also cannot identify a callback from another run when both happen to be at row 1 in life 0. Application input therefore needs one owner of the latest state and an explicit callback lifetime.

## Session API

`createRunSession(initialState, rng)` is exported by `@crystal-path-infinity/game-core`. It validates the trusted initial checkpoint and owns its latest immutable state in one JavaScript context. It exposes only:

| Method | Behavior |
| --- | --- |
| `getState()` | Returns the latest readonly `RunState`, including a checkpoint after disposal. |
| `bind(command)` | Captures an action's identity now and returns a `BoundRunCommand`. The returned callback accepts `{ activeTimeMs, achievedAt }`. |
| `dispose()` | Invalidates all callbacks belonging to this owner and returns the latest checkpoint. It does not end the run. |

`SessionCommand` omits row/life from `choose`, `hint` and `mystery`; the session captures those values from its displayed snapshot. Other commands keep their existing core fields. The RNG is injected once when the session is created; time remains an explicit argument at delivery. There are no internal clocks, timers, listeners, storage calls, SDK callbacks or network operations.

Each callback closes over its own session. It cannot be redirected to a different owner by passing another state. There is no in-place replacement method: a new or recovered run gets a new session, and the previous owner must be disposed when handing off ownership.

## Captured identity and replay

All bindings capture the current life and status. Additional scope depends on the command:

| Command | Additional scope | Delivery |
| --- | --- | --- |
| `choose`, `hint`, `mystery` | Current row | At most one returned core transition per binding. |
| `end` | Current row and control-phase epoch | At most one returned core transition per binding. |
| `tick` | No row or control-phase epoch | Reusable while the same life/status remains active. |
| Reward commands | Explicit death, ordinal, grant and/or intent identity, checked by the core | At most one returned core transition per binding; independently recreated requests still require the core's receipt/identity checks. |

Binding happens when presenting the action, not when an old animation or promise eventually completes. An old choice cannot acquire the latest row or life at delivery. An End confirmation also becomes stale after progress advances to another row; the host presents a fresh confirmation from the current snapshot.

Tick is deliberately reusable across survived rows, hints and mystery/effect changes. A scheduler does not need to rebind after each movement. Death, revival and disposal invalidate its old scope. Actual pause/resume scheduling and active-time accumulation belong to CPI-007.

The session consumes a non-tick binding after **any returned core transition**, including `accepted: false`. A later delivery of that same binding returns no events. If the core throws, the checkpoint and consumed flag are unchanged, so a corrected invocation can retry. Separate bindings are not a request ledger; the existing core remains responsible for row/life, mystery consumption and reward receipt invariants.

## Control-phase changes and pending rewards

End confirmations also capture a private control-phase identity. That identity changes when status, death identity, pending reward, granted count or applied count changes. It is an opaque object rather than an ever-increasing numeric counter.

This prevents an old End confirmation from becoming valid again after a pending reward starts and then clears. Even if the run returns to the same `dead` status, row and life, its control phase has changed. The same protection covers a grant that arrives while an older End confirmation is waiting. A fresh explicit forfeiture confirmation must be bound from the state that contains the unused grant.

The core still enforces pending and forfeiture rules. A pending reward blocks finalization; a granted but unused reward requires `forfeitGrantedReward: true`; duplicate grants/restores do not create another reward or reset SP. The session is not evidence that an advertisement was watched and does not authenticate an intent or receipt.

## Transition ordering and returned events

Delivery checks occur in this order:

1. Disposed owner: `session-disposed`.
2. Finished run: `finished`.
3. Already delivered non-tick binding: `command-consumed`.
4. Changed captured identity: `stale-command`.
5. The ordinary core transition and its validation.

The first four outcomes return the current state, `accepted: false` and an empty event list. They do not inspect old clock values or settle effects. An obsolete callback consequently cannot throw solely because it retained a timestamp older than the current state. A valid delivery still receives the core's normal clock validation; invalid or backward clocks are not silently corrected.

After the core returns, the session always commits the returned state before returning its result. This includes a rejected action that carries due effect events or death. For example, a hint delivered at a lethal drain pulse returns `died-before-command`, but the owned state is now dead and the hint was not consumed. Ignoring the state merely because `accepted` is false would lose that death.

An End delivered at a due fatal pulse follows the same existing core ordering: the death is committed and the End input is rejected. The host renders that state and can bind a fresh explicit End choice; the session does not automatically retry the old command or forfeit a reward.

Events are returned directly for that delivery. The session does not retain a growing event queue or replay log, and it does not invoke subscribers. Consumers render the current state and handle the returned events once; event handling must not dispatch an already handled result again.

## Disposal, recovery and UI lifetime

Disposal is an input-owner operation, not a gameplay command. It emits no progress, death or final result, and it does not clear a pending reward. `getRunResult()` remains null for a recoverable checkpoint. Save the latest `RunState` and initialize a new session from it when ownership resumes; session bindings and control-phase identities are not serialized.

An application keeps one session across ordinary rerenders and binds new displayed actions from the latest snapshot. When that owner is removed or replaced, its callbacks must be disposed. Actual React mounting, development StrictMode setup/cleanup behavior and the renderer are CPI-008 work; this decision deliberately provides no unverified React hook example. Native lifecycle timing remains CPI-007, and durable checkpoint handling remains CPI-009.

The authority processing reward verification must have a lifetime appropriate to the reward flow, independent of a disposable view. Removing the view does not establish that a pending reward failed. The retained checkpoint and later trusted recovery must preserve it. Actual SDK/SSV integration, server concurrency, leases and request idempotency belong to their later tasks.

`RunState` remains private authoritative/practice data, including future safe sides and RNG state. A session is neither a ranked-client projection nor a concurrency guard across processes, devices or servers. Readonly types and internal checkpoint assertions do not authenticate an untrusted JSON payload.

## Verification record

CPI-006 acceptance covers wrong/mystery/drain death, survived and fatal paths around rows 349/350/351, exact progress/event counts, SP boundaries, finalization and pending-reward recovery. Session checks cover rapid or repeated delivery, stale identity, reusable ticks, pending-phase round trips, disposal, recovery and rejected transitions carrying effects.

Exact test counts, commands, tested revision, GitHub workflow links and any remaining limitations are recorded in the issue/PR verification record after execution. Simulator/emulator shell checks do not demonstrate a playable renderer, physical-device behavior, real rewarded ads or server verification.
