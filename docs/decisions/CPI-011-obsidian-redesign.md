# CPI-011 follow-up — Obsidian glass redesign

Date: 5 November 2026. References: CPI-008, CPI-011 and CPI-013.

## Result

The app uses a reflective black metal shell with pink interface accents and pink,
cyan and mint lighting around the bridge. The glass keeps its transparent faces,
beveled edges, depth and specular reflections. LED colors follow row identity,
never the safe side. The centered home hub has a wordmark, a short tagline and
compact actions. Guest Play opens a new practice or resumes a saved practice;
a configured ranked client retains its existing route.

The in-game HUD is one opaque rail above a separate bridge viewport. Row and
cleared count sit on the left, a short numbered stability meter sits in the
middle, and hint/pause controls sit on the right. Continue/grant/quota details
remain available in the pause dialog. Settings, tutorial, account panels and
outcome dialogs share the black materials and typography.

## Forward movement

The renderer uses one projective camera for glass, rails and hit regions. After
an adjacent, confirmed row advance, the surviving row identities move toward the
player over 420 ms. Panes and LEDs travel together; current panes accept the next
choice after settling. SVG timing is reset only inside this renderer so a new
animation cannot start at the end of an old document timeline. No camera state
enters the reducer, checkpoint, score, gameplay clock or network protocol.

Nonadjacent recovery, initial load and same-row ticks do not fake a step. System
and in-app reduced motion skip camera animation. Visual cleanup timers are
bounded, cancelled on unmount, and never pause or advance gameplay time. Large
row indices retain exact BigInt arithmetic.

## References and assets

- [Netflix: the making of the glass bridge](https://www.netflix.com/tudum/articles/squid-game-glass-bridge-making-of-behind-the-scenes-video): visual reference for illuminated glass against a dark theatrical environment.
- [Unity: game UI and UX](https://unity.com/blog/video-game-ui-ux-basics): clear hierarchy, responsive feedback and space for gameplay.
- [Accessible Game Design: HUD](https://accessiblegamedesign.com/guidelines/HUD.html): numeric and graphical resource information, readable controls, non-color feedback.
- [MDN: SVG animation start times](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/begin) and [SVG local timeline](https://developer.mozilla.org/en-US/docs/Web/API/SVGSVGElement/setCurrentTime): explicit renderer animation timing.

The stage and bridge are original code-generated SVG; no Netflix imagery ships
in the app. Manrope is bundled offline in six Unicode subsets with its SIL
Open Font License ([font source](https://github.com/google/fonts/tree/main/ofl/manrope)). Existing brand and audio assets retain their established
provenance. The app adds no runtime font/CDN requests or rendering dependency.

## Verification

- Mobile: all 367 tests pass with two workers. The default highly parallel local
  runner hit the existing five-second native icon rasterization timeout; the
  complete same suite passes with reduced worker contention.
- Game core: 182 tests pass. Server core: 149 tests pass.
- Added projective symmetry/convergence, handset hit-region size, exact large row
  identifiers, current-only input, decorative preview and adjacent-step tests.
- Browser checks cover hints, safe progression, visible camera animation,
  temporary input fencing, pause/resume, saved practice and compact phone HUD.
- Browser and web builds are distinct from physical-device performance testing.
  Native emulator/simulator results belong to the PR checks; no physical-device
  or live ranked/ad-service verification is claimed here.

## Cinematic follow-up — 5 November 2026

Choices now have a 110 ms contact beat, a visible result on the selected pane,
then camera travel. Safe glass settles for 430 ms total; wrong glass gets 820 ms
before travel so the fragments can fall. A presentation director holds only the
old renderer-safe row projection. The canonical command, checkpoints and clock
settle immediately, with input fenced until the visual beat ends. Fatal wrong,
mystery and drain events cascade through the whole bridge for 1.8 seconds before
the original result card appears. Background/unmount cancels presentation work.
Reduced motion skips the travel, fragments and score animation.

Glass fractures use deterministic closed impact meshes. Near glass has 24
irregular pieces, distant collapse panes use eight. Their initial combined area
equals the pane area; independent drift, rotation and accelerating fall leave
an actual gap. The decorative home flight uses a bounded 30 fps canvas with
continuous projective travel, curved rails, slowly changing camera angle and
LED reflections. It stops in the background and has a static reduced-motion
frame. No scene animation changes the route or rules.

Mysteries are projected wire holograms. Each rolled effect creates its own
original line symbol, bloom and readout, then sends the symbol toward the upper
left effect indicator. Hostile outcomes have a stronger red treatment. The
elapsed-time instrument reports actual active time; it introduces no deadline,
countdown to death or idle penalty. Below 15 SP the stage enters a red emergency
state and a restrained original alarm loops. Pause, background, mute, recovery
above the threshold and disposal stop the alarm.

The home utilities occupy the upper left header, the tagline is “Don't look
down”, and the home footer is removed. Step captions are limited to the first
row; hinted glass retains its accessible feedback. Row numbers are removed from
between panes. Persistent guidance sits below the bridge. Warning instruments
are short side indicators rather than banners.

Settings follows the inspected Big Eye flat row pattern: right-aligned switches,
one language row and short tutorial/privacy/account/help actions. Long service
and privacy explanations are available in closed-by-default semantic details.
Existing setting persistence, account controls and confirmations remain owned
by their original components. The inspected source paths and commit are in the
reuse manifest. No Big Eye source file is modified.

Dead checkpoints without pending/earned rewards no longer advertise Resume.
Leaving that death finalizes the attempt, saves its local record, and returns to
Play. Pending verification and granted but unapplied rewards keep their recovery
path. Result numbers count from zero with exact integer interpolation, including
values beyond Number precision. The heading uses an original broken-bridge
sigil on the same line as the title.

Original synthesized mono WAV cues are reproducible with
`node apps/mobile/scripts/cinematic-audio.mjs`; no sampled recordings are used.
They add approximately 148 KB. [MDN SVG transforms](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/animateTransform)
and [reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
were consulted for the presentation behavior.
