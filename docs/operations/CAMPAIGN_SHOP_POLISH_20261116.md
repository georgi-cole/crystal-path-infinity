# Campaign movement, landing and shop fit — 16 November 2026

CPI-045 follow-up to #121 and PR #146, based on main `a783a446b12d019bebe6f7421fee0bb32fac6054`. The owner tested iPhone TestFlight 1.0.2 (79) positively and reported choppy atlas movement plus clipped shop characters. Those observations describe the released baseline; this entry describes a new candidate.

## Native atlas movement

The authored asymmetric route and exact SVG-to-marker coordinates remain. A fixed-scale world sits in a two-axis native overflow scroller. Touch movement has no pointer/touch/scroll handlers, camera React state, animation-frame loop or wheel interception. iOS owns scrolling, momentum and boundary handling. Desktop trackpads use native scrolling; mouse dragging changes native scroll offsets without React state. Only mission selection, initial layout and resize recenter the viewport. Custom zoom, zoom math and +/- controls are removed. Two explicit SVG icons expand/collapse the map and locate the current crossing, retaining accessible names and 44px touch targets. No library, new artwork or remote request is added. The existing map still has an initial DOM/image rasterization cost; zero GPU or memory cost is not claimed.

## Crossing landing

Both authored tiles of the designated row have a layered gold outline and gentle surface tint. This is a static destination signal, including with reduced motion; it exposes no safe-side answer and does not replace the bridge material. The actual final hop/travel finishes before the existing World-specific signature runs once on the standing character. The happy pose, gear and character stay attached to the real resolved footing. The complete cue and subsequent music sequence remain; the minimum presentation hold now accommodates a recovered wrong step, travel and the 1250ms signature. Muted, missing or blocked audio still advances, and the existing 6-second media fallback remains. Reduced-motion and background handling disable the signature. Failure does not trigger a victory pose or change mission evaluation.

## Shop layout

World cards use distinct character-display and copy rows instead of absolute offsets inside a fixed-height scene. The display reserves motion/headroom for the existing signature and joy poses. Names, mood, story, ownership text and the native purchase/equip action follow in normal flow. World dots sit below the artwork in their own row. Small screens and larger text may scroll the shop vertically; they cannot shrink the character area under the copy. Background art remains behind both rows. The heading, department controls, recovery notices and Restore spacing are more compact. The duplicate numeric price line is replaced with ownership/one-time-unlock text; the purchase button continues using the native store's localized price. Buying, equipping, restore recovery and ownership checks are unchanged. Browser previews are local fixtures, not evidence of a native transaction.

## Validation and remaining acceptance

- Local application suites passed (1,007 mobile, 315 core, 236 server and 6 balance checks), followed by all 22 focused Campaign checks including two new destination-renderer cases. Workspace typecheck, lint, format, development/staging/production builds and 17 workflow-selection tests passed. The planning validator and Python unit suite use `python` locally because the Windows `python3` app alias is unavailable. Native CI results are tracked on the PR.
- A same-profile Campaign release build compared with the delivered Android 64 web assets adds 539 gzip bytes across all JavaScript/CSS combined, with no added image/audio assets or dependencies. This is compressed web-code size, not a measured store-download delta.
- Renderer coverage checks both destination panes, correct display-row indexing and absence of a landing marker in Infinity. Audio coverage includes an immediately-ended cue, muted playback, missing media, backgrounding and cancellation.
- Browser layout checks cover all seven World cards at small and standard iPhone widths, larger text and tablet width, with card/character/copy/navigation bounds inspected. A local React Profiler checks that native atlas scrolling in both axes does not produce component commits; selection still updates normally.
- Real iPhone WebKit swipe feel and native storefront acceptance require the next signed build. No measured iPhone frame rate or physical-device pass is claimed here.

No gameplay rules, prices, grants, inventories, commerce APIs, revenue assumptions or simulations change. `docs/BUSINESS_PLAN.md` is therefore unchanged. No production rollout or new TestFlight/Play build is claimed by this source record. Historical delivery records remain intact.
