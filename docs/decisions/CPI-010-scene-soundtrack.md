# CPI-010 — Owner-supplied scene music

The owner supplied three recordings from `Downloads/Crystal path audio` on
5 November 2026. The home track is Silent Descent (original MP3). Enjoythepath
and temporary defeat were supplied as stereo Opus/WebM recordings. All three
are bundled as AAC/M4A, 192 kbps, 48 kHz stereo, converted using FFmpeg 7.1
without trimming their timelines. Conversion cannot recover quality absent
from the supplied compressed recordings; original WAV masters remain preferable
if the owner supplies them later.
The original Downloads files are untouched. This records delivery by the owner,
not independent verification of third-party commercial rights.

Home loops Silent Descent. Active local practice starts Enjoythepath at 13 s;
the owner clarified the loop as exactly 181 → 28 seconds. A Web Audio buffer
source schedules that region without HTML media seek gaps. Its final 80 ms
blend into the source material immediately preceding 28 s to soften the join.
The final result/death card starts temporary defeat at 14 s, once, after any
fatal collapse animation. Moving from the death card to the finished card does
not restart it. The final buffer prepares during the fatal collapse or end
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
