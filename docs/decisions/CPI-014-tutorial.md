# CPI-014 — Read the crystal

Updated 5 November 2026, owner-requested revision in PR #83.

## Rehearsal and voice

The optional `#tutorial` route uses the actual perspective bridge, crystal
fracture, row scan and mystery hologram. Five compact chapters replace the
flat mock panes and rules article: footing, fracture, insight, pursuit and
temptation. The player tries a safe left crystal, survives a wrong left crystal,
uses a hint, escapes the Death Clock and either opens or leaves a mystery.
The closing invitation returns to Practice; it never silently starts a run.

English and Bulgarian use short, dark field notes, including “Crystal clear?
Not quite.” and “Death hates to be kept waiting.” The guide explains SP as a
lifeline, finite hints and the need to move. It does not disclose an endpoint,
exact deadlines, mystery probabilities, stacking rules or continuation quotas.
The continuation card says “Borrowed breath” and shows the promised SP value,
without explaining the implementation. Account, consent and privacy controls
remain explicit. Other languages use the established English fallback for
new keys; existing translations are retained.

## Isolation and live rules

`practice-rules.ts` selects the same ruleset for the actual local run and the
rehearsal. The deterministic demo uses the real `transitionRun` reducer with
five curated initial rows; it reads starting resources, damage, hint cost,
pacing and mystery resolution from current game rules. Its clock advances
only through lesson actions, so reading cannot kill the player. A survived
wrong step still clears its row. Mystery is voluntary on the fifth row.

The demo owns no live clock, network, music, practice checkpoint, personal
best, advertisement or ranked result. It persists only the existing tutorial
completion flag and the shared first-hint-caption preference. Skipping after
completion retains completion. Home, Practice, Settings and Back keep their
existing router behavior.

## Future rule changes

`crystal-guide-contract.ts` classifies every ruleset field, reducer event and
mystery effect as an essential lesson or deliberate discovery. Exhaustive
TypeScript maps and runtime tests fail when a new mechanic has no policy.
The demo reads mechanical values live rather than copying numbers into prose;
behavioral tests exercise the current reducer, including hint holds, pursuit
death and minute survival awards. Existing numerical changes update the demo
automatically. New mechanics require an explicit guide review in a later PR.
CI does not generate or silently rewrite narrative copy.

## Hint presentation

The 800 ms scan is clipped to the two current crystal faces. A perspective
matrix and short surface sweep resolve into mint corner locks. There is no
floating eye, button-to-row connector, ray or curve. Reduced motion reveals
the correct pane without a sweep. “This one holds” appears visually once per
device, shared by rehearsal and gameplay; the revealed pane retains its
accessible description on every use. Preference storage failure is nonfatal.
The bounded Death Clock hold is specified in
[the v3 decision](CPI-005-hint-scan-v3.md).

## Verification

Tests cover actual safe/wrong/hint/pursuit/mystery/skip/end transitions,
invalid and repeated actions, isolation, live rule coverage, accessible
rendering, first-caption persistence and reduced motion. Browser review covers
desktop and 390/320 px layouts plus a real practice scan/countdown observation.
Exact test counts, screenshots, built revision and native launch results are
recorded in PR #83. A physical-device or unfamiliar-player review is not
implied by automated or browser checks.
