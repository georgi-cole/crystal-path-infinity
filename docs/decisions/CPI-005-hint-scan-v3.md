# CPI-005 — Bounded hint scan hold

5 November 2026, explicit owner request in PR #83. Supersedes the v2
no-hint-hold behavior for new local practice only.

`infinity-v3` retains the v2 three-second row grace, five-second Death Clock,
minute bonus and existing balance. A successful hint records
`pacing.hintScanStartedAt` on the canonical active timeline. Row pressure alone
freezes for `HINT_SCAN_MS` (800 ms), then continues from the same remaining
time. This also protects the initial grace when a hint is used early.
It never restarts the countdown. Repeated or rejected hints add no hold;
an already-expired row settles death before accepting input. Crossing a row
clears the scan schedule. Revival gets the existing fresh row grace.

Effects, survival rewards and Time Alive continue during the scan. Explicit
pause, background and recovery still freeze the whole active timeline through
the existing timed-session owner. The persisted scan start preserves a partial
hold across recovery. UI reconstruction uses that start if the ephemeral
visual signal was lost. The clock becomes a restrained mint while held and
its urgency/alarm is suspended unless low SP independently requires an alarm.

The practice owner explicitly selects v3. A living local v2 checkpoint retains
its row entry and bonus boundary; a previously revealed v2 hint receives no
retroactive hold. Living v1 follows the existing upgrade rule (fresh row grace,
future rewards only). SP, hints, route, RNG cursors, score and best record are
preserved. Dead, finished and pending historical runs are not rewritten.

Core/server defaults remain v1; v1/v2 recorded outcomes are unchanged. An
authority may explicitly select v3, and ranked public snapshots whitelist the
optional scan-start field. The strict client accepts it only for v3, within
the current row timeline, with a revealed safe pane. Private state remains
excluded. This PR does not change deployed ranked policy or score grouping.

Tests cover exact scan/resume/death boundaries, grace, late hints, duplicate
commands, row changes, active effects, JSON recovery, explicit pause, legacy
behavior, local upgrades, authoritative server time and strict projection.
