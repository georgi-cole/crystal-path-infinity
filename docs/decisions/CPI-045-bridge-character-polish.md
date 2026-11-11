# CPI-045 — Bridge character and gear presentation

11 November 2026 · issue #121 · working branch, not a distributed native release.

## Changes

- Increase all bridge character sizing from 68–112 px to 88–144 px. Body, seasonal dressing, gear and shields share one scale rooted at the existing path footing; no independent gear-size increase.
- Replace the rejected procedural Black Metal body with a transparent generated steel-and-smoked-glass explorer. Appears only when gear is worn, so the unequipped default World remains character-free.
- Replace all paid gear line drawings with rendered wearable versions of the actual shop merchandise: teal/amber umbrella, teal sunglasses, gold sun-cream tin, emerald knitted scarf, individual purple roller skates and blue rain boots. Original generated atlas and optimized alpha-preserving sprite extractions are versioned under `assets/campaign/wearables`.
- Register all six gear items for Black Metal separately from Boltmuffin: face, neck, hand/umbrella and foot anchors; the same rendered market materials. Paid characters retain their pose-specific registrations. Store gear previews now cycle through all seven Worlds, including Black Metal.
- Raise world artwork visibility and saturation on Home/in play, preserving the existing central readability veil and emergency treatment.
- Tighten shared non-Home headers and the top margins of adventure pages, standard panels and Profile; retain native safe-area padding.
- Fit Campaign into the remaining viewport, removing outer gaps/footer overflow. Selected details use bounded text scrolling with a fixed action; a second click on the selected mission restores the full map.

## Artwork

Built-in image generation produced `apps/mobile/src/assets/world-previews/black-metal-traveller-v1.png`. Art direction: premium small explorer in charcoal steel and smoked glass with muted teal eyes, silver reflections, neutral planted pose and transparent background. One calm sprite follows existing path motion; this is not a new animation/reaction sheet. The generated original is retained locally. No gameplay or purchase contract changes.

## Scope

This PR starts from main 40ca8bc and deliberately excludes the unfinished CPI-044 native account/commerce work. Its original working checkout remains intact so that integration can continue separately. Existing run snapshots, official server rules, historical economy results and real store product status remain unchanged. Offline QA purchases remain free local simulations.

## Validation

Before the rendered-gear replacement, local workspace checks passed: 1,334 application tests, 6 balance tests, typecheck, lint, formatting, planning validation and 13 planning tests; development, staging, production and Campaign QA bundles. Final checks and rendered-gear matrix are recorded below. Native CI evidence is reported in the PR separately. Web screenshots do not prove a native-device launch or real checkout.

## Wearable generation

Built-in generation used the actual shop atlas and Trail Scarf as references, requesting a transparent 4×2 atlas: umbrella, front sunglasses, gold sun-cream tin, emerald scarf, left/right purple roller skates and left/right blue boots. Preserve reference materials/colours, no characters, no text, no line-art placeholders. Sprite cells are extracted, transparent borders trimmed and optimized to WebP; each is attached to the existing per-character, per-pose anatomical anchors. Umbrella is layered behind the body; face, neck and feet are layered in front. Seasonal free dressing remains separate.

## Final local visual acceptance

All 42 calm-pose gear/character combinations were captured and inspected after the rendered replacement, including all six items on Black Metal. Final rendered sprite bundle, TypeScript, lint and formatting passed. The earlier full workspace tests and environment bundles passed; CI repeats the complete required checks on the committed source. New wearable assets total about 333 KB of optimized WebP plus the 1.6 MB original atlas retained as editable source; the source atlas is not imported into the runtime bundle.

Phone gear page: header-to-content gap approximately 10 CSS px and no document overflow at the 390×844 override. Campaign action remained visible with no outer document overflow at 390×844, 375×667 and 844×390. Temporary viewport overrides were reset. Native safe-area handling is retained; browser checks do not prove a physical notch/device result.

Review evidence: [rendered gear matrix](../verification/CPI-045/rendered-gear-matrix.webp), [phone gear spacing](../verification/CPI-045/phone-gear-spacing-rendered.webp), [selected mission](../verification/CPI-045/phone-campaign-details.webp). The matrix covers the static showroom pose; existing paid-character happy/worried frame anchors are retained, rather than claiming all animated frames were exhaustively viewed. No real payment or native-service integration is claimed by this PR.

## Owner rejection and second visual revision — 11 November 2026

The owner rejected the 8da90a5 shared wearable overlays: footwear floated beside animal paws, glasses were oversized/displaced, and scarves sat on chests. The earlier captured matrix and functional checks above are retained as history, not current visual approval. PR #122 was returned to draft while replacing this approach.

The replacement uses seven character-specific masters under `design/equipped-characters-v2`, each with six outfit rows and three expression columns. The existing characters and actual shop items are explicit references (full prompts are versioned beside the masters). Gear is rendered into each body's anatomy, perspective and occlusion rather than composited onto runtime anchor points. Quadrupeds receive paw-shaped footwear; the animals' umbrella shafts attach to a harness/backpack. Other characters grip umbrellas. Scarves wrap necks, sunglasses follow eyes and sun-cream tins attach to belts/straps or are held.

The authoring-only `scripts/build-equipped-sprites.py` extracts complete equipped sprites, retains alpha, applies one common scale per outfit row to preserve relative pose proportions, and registers their feet on a shared baseline. Runtime uses 42 three-frame WebP rows from `public/assets/worlds/equipped`; the seven source masters are not packaged into the app. No separate paid-gear overlays remain in the renderer. Additional procedural seasonal clothing is omitted on equipped bodies so a second flat scarf/visor cannot cover the outfit; world weather/season art and all gameplay effects remain unchanged. Unequipped characters retain their existing base and seasonal presentation.

Asset contract tests require every character/item combination, alpha and all three frame slots, preventing missing images from silently compiling. New render evidence and final checks are recorded after verification. Previous screenshot files remain the rejected first revision; do not use them to assess the replacement. Neither art generation nor browser screenshots prove native-device or payment acceptance.

Earlier CI at 8da90a5 passed App quality, backend, web and Android build/launch, but iOS launch failed before acceptance on a 60-second simulator termination timeout (`ios-launchservice-terminate.txt`, run 43090416840). That failure is preserved; it is not counted as an iOS pass. New source receives a new CI run.

## Stacking readiness — current contract and future extension

Current: players may own all six gear items, but a run has exactly one selected `JourneyGear.item`. Changing the next-run selection must preserve ownership of the previous item. During a run only wear/stow is queued, at the existing landing boundary; it never adds a second item. Resume restores the same selected item, wear state and queued action. Charged shields and temporary Mystery shields are separate from clothing: a temporary shield takes precedence, a protected landing does not also apply gear damage, and a loaded charge is spent once only when needed. Weather still affects the worn item's benefit/penalty. Campaign keeps its own mission equipment/supplies.

New regressions check buying two items then switching/saving without losing ownership, and the intersection of harmful umbrella weather, multiple loaded shields, queued stow and a temporary Mystery shield. Existing Kit tests cover repeated loads, undo/refunds, stock limits, persistence and one-time consumption.

Future proposal only: if multi-gear is introduced, use explicit compatible slots—eyewear (sunshades), neck (scarf), held/back-mounted (umbrella), belt (sun cream), footwear (boots OR skates). Boots/skates are mutually exclusive. Intrinsic hats/capes and free seasonal dressing also need compatibility rules. The existing composed sprites must not be stacked on top of one another: a combination requires a reviewed compatible full outfit or a proper character-specific rig. Unsupported combinations must be blocked clearly before checkout/equip, preserving inventory, rather than silently hiding gear or replacing paid items. Introduce versioned saved loadouts and an explicit effect-combination order before enabling multiple slots; old started runs retain their original single-item rules. No new multi-gear feature or stackable paid bonus is enabled by this art PR.

## Replacement verification — 11 November 2026

All 126 extracted poses (seven characters × six items × three reactions) were inspected as dark-background contact sheets after atlas registration. Authored rows use measured gutters rather than assuming the generator placed every cell on an exact grid; Purralune's tightly packed source uses connected-subject extraction to avoid bringing adjacent-row paws/tails into the frame. Final sprite rows preserve transparent alpha and align the lowest foot/sole/wheel to the same registration. The 42 runtime rows total approximately 3.52 MB, including the manifest. Old generic wearable assets are historical source files only and are not imported by the renderer.

Live browser verification checked Pawrachute skates, Purralune skates/scarf and Black Metal glasses using the same companion renderer as crossings. The phone preview uses the complete body sprite, without extra free seasonal clothing on top. Viewport overrides were reset and the updated local preview was left open. New reference images: [Pawrachute poses](../verification/CPI-045/v2/puppy-poses.webp), [Purralune poses](../verification/CPI-045/v2/kitten-poses.webp), [Black Metal poses](../verification/CPI-045/v2/obsidian-poses.webp), [phone scarf](../verification/CPI-045/v2/purralune-scarf-phone.webp), [phone glasses](../verification/CPI-045/v2/black-metal-glasses-phone.webp). Other character contact sheets are in the same revision folder. These replace the rejected v1 visuals for review.

Campaign QA TypeScript/bundle, lint, formatting and planning checks passed after the body renderer change. The complete workspace suite passed with the seven new asset-contract checks; the two added stacking regressions then passed in the 15-test targeted run. Final full-suite repetition and commit CI are reported in the PR, rather than counted as successful before completion. iOS/Android compilation or native launch on the new source is not established by web screenshots.

Final full workspace repetition passed: 817 mobile/config tests, 315 game-core tests, 211 server-core tests (1,343 total), plus six balance tests. Workspace typecheck and formatting passed again after both stacking regressions were added.
