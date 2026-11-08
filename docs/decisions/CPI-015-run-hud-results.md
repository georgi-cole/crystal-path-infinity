# CPI-015 — Live HUD, explicit End run, death and local result

## Implemented standalone scope

CPI-015 builds on the merged M2 premium bridge. The active HUD now shows the existing survival-points meter, current row, hints and time-limited effects, plus **last cleared row**, **revives actually applied**, **reward grants earned** and **grant quota remaining** as four separate values. Row indices remain decimal strings and are rendered without lossy JavaScript Number conversions. A surviving wrong choice still advances progress; a fatal row does not. No row-350 victory condition is added; crossing 350 continues to 351.

The pure `presentRunOutcome` function renders one of five phases:
- **Playing:** movement, hint and optional mystery inputs and direct End run/pause actions.
- **Dead:** all movement is locked. Display death cause, last cleared and fatal row, and (only when eligible) the exact next successful revive ordinal/SP. Restore SP **replaces** the current value; it does not add to it. The proposed rewarded choice is *informational and unavailable* because AdMob/SSV will be integrated in CPI-026–030. No pretend ad, fake grant, or forced opt-in exists. End run or save-and-leave remain available.
- **Verification pending:** `pendingReward` blocks End run, new ad offer, final result and Rankings actions. The only exit is **Save and leave · Pending**, keeping the checkpoint recoverable and unpublished. There is no fabricated verified state.
- **Grant ready:** a confirmed but unapplied reward uses quota (`revivesGranted`) but is **not** counted as an applied continue (`revivesApplied`). No second offer appears for the same death. Until CPI-029 connects apply/recovery, a player can save and leave or explicitly confirm End run and forfeiture.
- **Finished:** terminal `RunResult` is shown as **OFFLINE PRACTICE · NOT VERIFIED**, with cleared rows, fatal row, applied continues, active time, personal best, **Next run**, **Rankings (not live)**, and Return to menu. No official submission or server-authenticated Top 100 is claimed. Rankings opens the existing honest unconfigured/offline screen.

## Explicit finishing versus recovery

The End run control is available while alive, not only after death. It obtains the existing user pause lease **before** showing the confirmation: active time and timed-effect damage remain frozen while considering the action. The `end` core command is allowed during that lease (movement/tick/hint/mystery stay blocked). The confirmation identifies the last actually cleared row and warns before forfeiting a granted but unused reward. The final transition is owned by the existing `createPracticeRuntime`, including one `run-ended` event, checkpoint write and the existing practice-only best-record update. No second result is created by a repeated tap.

**Save and leave is not End run:** the existing recovery hold commits the checkpoint and returns to the menu, without changing status or creating a result. Pending SSV remains recoverable. The exit callback now ignores concurrent submissions and writes the latest runtime checkpoint. Restarts are guarded against rapid duplicate taps. The overlay makes the background inert and focuses the first available button; Escape cancels End confirmation without resuming the clock.

A finished practice run is committed *locally*. The word “submit” in CPI-015's future ranked flow can only be implemented against the server authority in CPI-017–025. There is no ranked API, signed receipt, production rewarded provider or client-supplied official score in CPI-015. A pending intent cannot be silently submitted or counted as a personal best.

**Confirmation layout on 8 November 2026:** The End run confirmation stacks two full-width actions, with the safe return action first. Clock recovery uses the same stack. The result action groups opt into columns for their additional destinations.

## Tests and remaining acceptance

The new unit and rendering tests verify active/dead/pending/grant-ready/finished phases; fatal wrong/mystery/drain labels; 5th=200, 6th=150 and 10th=150 SP restore presentations; no-fill/no-grant retaining the same ordinal; granted versus applied counters; no premature End during pending; explicit End during a paused timed session; frozen active time and idempotent terminal result; no hidden ending on dispose; long decimal scores; row 350→351; and clear routes to New run/Rankings. Existing game-core native pause/clock and engine tests must remain green.

Manual acceptance still requires: narrow portraits (320/390px), large text, actual Android Back / Home and iOS background/resume, VoiceOver/TalkBack and focus behavior; death caused by a real mystery/drain effect; a first-time player's understanding of outcomes; server-verified and SSV callbacks after those services are implemented. Platform CI cannot prove physical-device or provider readiness.

The original game-core ruleset, seeded infinite route, current native lifecycle/graphics safeguards and reward counters were not modified.
