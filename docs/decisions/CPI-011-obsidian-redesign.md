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
