# CPI-010 — standalone audio and optional haptics

Status: implementation candidate. Real-phone audio routing, silent switch, headphones,
OS interruption, and original-music rights remain separate acceptance evidence.

## Provenance and scoped reuse

The four **unchanged** MP3 files were retrieved from the owner's pinned
`georgi-cole/bbmobilenew-source` commit
`6ace929a60410e728928aa51eaf80ba9b5cf2262`:

| Cue | Source (under `public/assets/sounds/minigames/`) | Target | Policy |
| --- | --- | --- | --- |
| Survived safe/wrong glass step | `minigame_gb_safe_step.mp3` | Same file in CPI `apps/mobile/public/assets/sounds/minigames/` | One per accepted row, wrong steps at slower pitch |
| Fatal death | `minigame_gb_death.mp3` | Same | Once per death, never stacked with a fatal crack |
| New personal best on ending | `minigame_gb_winner.mp3` | Same | Only after an actual run-ended event and a strictly higher local best |
| Revive continuation | `minigame_gb_new_turn.mp3` | Same | Once on an actual revive-applied event, not a synthetic start/season turn |

The Big Eye music file `public/assets/music/glass_bridge.mp3` is listed in the
reuse manifest, but could not be transferred through the current connector
(large binary content is unavailable). CPI-010 instead includes
`apps/mobile/public/assets/music/crystal-ambient-interim.wav`: an original,
lightweight twelve-second synthesized ambient loop. It is **not** the original
glass bridge recording. Replace it after obtaining/clearing the original.
The user's ownership of the source repository does not itself establish the
commercial rights of any underlying third-party audio. Verify that before
store distribution. No complete legacy audio catalogue or global SoundManager
was imported.

## Runtime and privacy

- One `createStandaloneAudio` instance per attempt, with five local static
  media resources, injected haptic ports, and no ads, network calls or analytics.
- Music loops only after the first **user interaction**; playback rejection
  never fails a move. SFX and music are independently muted.
- Native and web background changes stop all sound immediately. Pause and ad
  holds stop music/SFX; OS return never creates two owned music loops. A
  terminal death/record cue may finish after gameplay stops *while foregrounded*.
- Fatal input has precedence over step, record and mystery feedback. Accepted
  events are deduplicated with a bounded latest-row/death guard. No row-350
  victory or fixed finish cue exists. Disposal stops everything.
- `CpiFeedback` is a local Capacitor plugin: Android view haptics need no
  additional manifest permission; iOS uses UIKit feedback generators. The
  optional web vibration fallback and all unsupported/error paths are no-ops.
  Three semantics: light step, stronger damage, and distinct end.
- CPI-009 local settings migrate from v1 to v2: `music`, `soundEffects`,
  `haptics` and `reducedMotion`. Older saves retain their choices and
  get an explicit default haptics toggle. No account or age data is collected.
- An optional local `personalBest` key is a practice display preference, not
  an official leaderboard score or ranked proof.

## Verification boundary

Unit tests exercise preference migration, corrupted saves, one-shot events,
mute changes, duplicate events, background/foreground, async playback
interruption and disposal. CI must still compile native plugins and open both
simulators after a clean install, and verify all four MP3s plus the WAV exist.

A successful simulator launch does **not** prove real hardware feedback,
headphone routing, the iPhone silent switch, incoming calls, interrupted ads,
or background music behavior on all OS releases. These require a device walkthrough
before calling the audio experience store-ready.
