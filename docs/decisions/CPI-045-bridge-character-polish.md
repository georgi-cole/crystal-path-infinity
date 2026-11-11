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
