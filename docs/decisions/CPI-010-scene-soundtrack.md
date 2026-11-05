# CPI-010 — Owner-supplied scene music

The owner supplied recordings from `Downloads/Crystal path audio` on
5 November 2026. The home track is Silent Descent (original MP3). Enjoythepath
was supplied as stereo Opus/WebM. The owner subsequently replaced the result
track with `deathrow.mp3`, selecting only its 2:47–3:34 excerpt (167–214 s).
All three current assets are AAC/M4A, 192 kbps, 48 kHz stereo. Home and gameplay
retain their source timelines; only the 47-second result excerpt is bundled as
`run-ended-deathrow.m4a`. Its conversion uses FFmpeg from imageio-ffmpeg 0.8.1;
the original two conversions used FFmpeg 7.1. Conversion cannot recover quality
absent from compressed recordings.
The original Downloads files are untouched. This records delivery by the owner,
not independent verification of third-party commercial rights.

Home and all non-game menus (including Settings, Profile, Rankings and the
crystal rehearsal) share one continuous Silent Descent loop. Changing a menu
does not stop, recreate or seek its source. Starting a run transfers music
ownership to gameplay; returning to a menu starts the home scene again.
The owner subsequently retained upper-left Settings alongside the two quick
audio toggles and replaced bottom-right Settings with Store. Store also shares
the menu soundtrack.
Active local practice starts Enjoythepath at 14 s;
the owner clarified the loop as exactly 181 → 28 seconds. A Web Audio buffer
source schedules that region without HTML media seek gaps. Its final 80 ms
blend into the source material immediately preceding 28 s to soften the join.
The final result/death card starts the deathrow excerpt once, after any fatal
collapse animation. Zero in the bundled excerpt corresponds to 167 s in the
source. Web Audio schedules an explicit 47-second playback duration, excluding
any encoder padding, and resumes only the unplayed remainder after mute or
background. Moving from the death card to the finished card does not restart
it; a new run receives a fresh playback owner. The former temporary-defeat
asset is removed. The final buffer prepares during the fatal collapse or end
confirmation. Decoded buffers are retained only for currently requested scenes
and this imminent result; obsolete decode promises and unused buffers are
released. No soundtrack changes gameplay time or score.

The Music preference controls all three. Pause, confirmation and OS background
stop run music while retaining its play position. Native lifecycle and document
visibility both gate playback. The existing sound-effect/haptic owner remains
separate, with its interim music disabled by the practice adapter.

Browsers may require a first tap/key press to unlock music; the implementation
respects that policy. Source/buffer cleanup and generation checks prevent a late
decode from starting music after leaving the screen. Missing or undecodable
audio does not block play. Existing ranked service behavior is unchanged.

References: [Web Audio loop boundaries](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loopStart)
and [decoded AudioBuffer memory](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer).
