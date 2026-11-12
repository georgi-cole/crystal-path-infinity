# Campaign reward cinematics · 12 November 2026 · revision 2

CPI-047 · [tracking issue #132](https://github.com/georgi-cole/crystal-path-infinity/issues/132).

Status: local feature branch `codex/campaign-reward-vortex`; not a store release. This replaces the initial CSS medallion and large oval portal presentation. Gameplay grants and existing saves retain their contracts.

## Reference and art direction

Reference research: [Supercell's Starr Drop reveal interaction](https://supercell.com/en/games/brawlstars/blog/game-updates/how-to-get-all-the-angelic-and-demonic-drops/), [Clash Royale chest reward structure](https://support.clashroyale.com/hc/en-us/articles/49484890560283-Chests), visual reward-screen references from [Brawl Stars](https://www.deconstructoroffun.com/blog/2024/2/11/brawl-stars-to-the-moon), and [Housemarque's Returnal VFX breakdown](https://housemarque.com/news/2021/9/15/returnal-vfx-breakdown). The visual-screen reference is secondary analysis; mechanics references are from the developers. These inform our interpretation rather than establish universal animation rules: isolate a tangible object, build anticipation, hold its name and quantity, show collection, then perform the exit. We do not copy their assets or add random reward rarity to fixed mission grants.

The shared scene has one 7.8-second timeline. The reward rises during the opening second, settles and remains readable until about 3.4 seconds, collects by 4.5 seconds, and gives way to a small vortex and character jump. The illustrated vortex turns slowly and closes after the character reaches its centre. Following owner feedback, the traveller is substantially larger and the reward slightly smaller; both stay clear of the caption. Reduced motion in the actual game bypasses this scene. Replay clears use just the exit portion. The saved first-clear grant precedes presentation, so replaying or seeking the preview never grants anything.

| Mission | Actual reward presentation | Staging |
| --- | --- | --- |
| 1 · The Coast Is Clear-ish | +25 reserve SP | Existing shop bottle, warm light and quiet lift |
| 2 · Lens, Actually | +1 reserve hint | Existing shop crystal pouch, cooler lens light |
| 3 · Two Sparks Ahead | +1 reserve hint | The same actual hint reward, with two converging light paths; it does not award two hints |
| 4 · Light It Up, Keeper! | Keeper’s Torches and restored Lighthouse | New paired torch illustration, warm illumination and landmark message |

The preview at `/src/reward-preview.html` is a separate local Vite entry, available in `campaign-qa`/development only and absent from normal build inputs. It renders the same `CampaignClearCelebration` and reward-presentation function as actual completion, with first-four selection, Replay, Pause/Play, scene cues and scrubbing. It imports no save or commerce UI and writes no progress. Run with `npx vite --host 127.0.0.1 --port 5182 --strictPort --mode campaign-qa` from `apps/mobile`.

### Mission 1 collection experiment · 12 November 2026

Following owner feedback, only mission 1 now replaces the small corner confirmation with a centred dimensional gold “Reward / Saved!” treatment at the bottle’s original position. Between about 3.4 and 4.4 seconds, the bottle narrows, becomes warm light and cross-transforms into the lettering; the lettering settles and stays readable before fading during the portal exit. This is a staged visual transformation, not a geometric mesh morph. Missions 2–4 retain their previous collection presentation for comparison. The local screening room adds a mission-1 “Saved” cue at 4.8 seconds. This alters neither the +25 reserve SP grant nor its saved timing.

## Asset provenance and prompts

Both new assets were produced with the built-in image-generation tool, with transparent backgrounds, then encoded losslessly as WebP. Originals remain in the generation output directory; project assets are `apps/mobile/src/assets/campaign/keeper-torches-reward-v1.webp` and `apps/mobile/src/assets/campaign/escape-vortex-v2.webp`. SP and hint artwork reuse the existing shop supply atlas. Black Metal now uses the existing generated traveller artwork in this sequence rather than the earlier primitive SVG figure.

Torch prompt:

> Use case: stylized-concept. Production game inventory asset for a premium cozy fantasy adventure game. A matched pair of elegant lighthouse keeper torches, upright, slightly splayed, carved dark bronze and aged gold with tiny turquoise crystal collars, richly dimensional sculpted metal, realistic tactile material, warm amber flame with pale luminous center, clean beautiful silhouette. Two torches only, grouped centrally, whole objects visible with generous clear margin on all sides. Three-quarter view like a polished mobile adventure collectible, painterly 3D rendering, sophisticated lighting and restrained ornament. Genuine transparent background, no scenery, no frame, no text, no pedestal, no coin badge. The flames should look like soft real fire, not a flat symbol. Asset intended to float in a mission reward reveal, large readable at phone size.

Vortex prompt:

> Use case: stylized-concept. A production VFX sprite for a refined fantasy adventure mobile game: one small luminous circular vortex, viewed straight on, isolated on genuine transparent background. Perfectly centered circular opening with generous transparent padding. Delicate flowing filaments of antique gold, ivory and muted turquoise spiral inward like luminous fine silk caught in a current, physical depth, cinematic volumetric light, rich subtle texture. The rim is organic fluid light, not a metal frame, not a hard geometric ring, not neon tubes. Center is a dark deep teal void with a tiny soft distant warm glow. Sparse pinprick embers caught in the flow, absolutely no big starbursts or lightning, no graphic symbols, no characters, no scenery, no text. Restrained elegant magical portal with asymmetric spiral detail suitable for very slow rotation in compositing. Beautiful high fidelity 3D game VFX render, smooth alpha edge, whole effect visible.

## Full campaign rollout - 13 November 2026

The approved centred dimensional confirmation now applies to every mission. Supplies resolve as Saved, styles/seasons/weather as Unlocked, and a landmark-only clear as Restored. Each uses its actual reward names, avoiding undefined SP amounts or supply claims for permanent unlocks. Bundles show secondary tangible rewards beside the main artwork; restored landmarks remain named in the caption. Artwork dimensions are 90% of the previously reviewed frame. The preview now exposes all 30 missions under seven compact chapter tabs. Both actual completion and preview derive their presentation from the same reward definitions. No grant, save, price, ruleset or business assumption changed.

New transparent built-in-generated cosmetic and season atlases are encoded losslessly at apps/mobile/src/assets/campaign/reward-cosmetics-v1.webp and reward-seasons-v1.webp. Existing shop artwork supplies bottles, hint pouches, continues, shields and Season Changes. Torches and the vortex retain their approved generated assets.

### Actual source reward coverage

| # | Mission | First-clear outcomes shown | Confirmation |
| --- | --- | --- | --- |
| 1 | The Coast Is Clear-ish | +25 reserve SP | Saved |
| 2 | Lens, Actually | +1 reserve hint | Saved |
| 3 | Two Sparks Ahead | +1 reserve hint | Saved |
| 4 | Light It Up, Keeper! | Keeper’s Torches; The Lighthouse is shining | Unlocked |
| 5 | Puddle Trouble | Spring Rain in Infinity | Unlocked |
| 6 | Dry Socks, Please | +25 reserve SP | Saved |
| 7 | The Hint Heist | +1 reserve hint | Saved |
| 8 | One Good Turn | Copper Rails; +1 Continue; The Mill is turning | Unlocked |
| 9 | Don’t Trust the Shine | Summer and Heat Surges in Infinity | Unlocked |
| 10 | One Hint Wonder | +25 reserve SP | Saved |
| 11 | Six Steps, No Stumbles | Echo Footsteps; Jelly Path | Unlocked |
| 12 | For Whom the Glass Tolls | Amber LEDs; The Tower is ringing | Unlocked |
| 13 | Snow Way Across | Winter and Snow in Infinity | Unlocked |
| 14 | Crack Me If You Can | +1 reserve shield | Saved |
| 15 | The Frost Mile | +1 Continue | Saved |
| 16 | The Great Thaw-Through | Frosted Glass; Frostbank is alight | Unlocked |
| 17 | Chasing Prismtails | Lily Drift; Rainbow weather in Infinity | Unlocked |
| 18 | Make Mine a Rainbow | +25 reserve SP | Saved |
| 19 | A Squall or a Long Walk | Autumn and Leaf Gusts in Infinity | Unlocked |
| 20 | One Last Light | The Far Gate is open | Restored |
| 21 | A Letter from the Stars | +1 reserve hint | Saved |
| 22 | Pack Light, Shine Bright | +25 reserve SP | Saved |
| 23 | Handle with Scare | +2 reserve shields | Saved |
| 24 | A Fair Trade in Starlight | +1 Continue | Saved |
| 25 | Wish Upon a Bridge | Comet Footsteps; The Observatory sees the stars | Unlocked |
| 26 | Special Delivery: Dry-ish | +25 reserve SP; +1 reserve hint | Saved |
| 27 | Mind the Melt | +2 reserve hints | Saved |
| 28 | Rainbow Relay | +1 Continue | Saved |
| 29 | The Night Watch | +2 reserve shields | Saved |
| 30 | Bring the Dawn Home | Pearl Lanterns; +2 Season Changes; The Harbour lights are home | Unlocked |

### Validation

The focused reward-presentation and Campaign suites passed 97 tests, including rendering every actual mission, matching every earned style to an illustration, bundle coverage, truthful collection wording and replay behavior. A browser pass stepped through all 30 reward holds at the current narrow viewport; after tightening the long season captions, none overlapped the character bounds or caused horizontal overflow. This is local browser evidence, not native-device or store-release acceptance.

### CPI-047 integration verification · 13 November 2026

The real `App.onCheckpoint` route was inspected: the landing/goal decision computes `firstClear`, calls `grantCampaignClear`, and commits the resulting inventory and cleared checkpoint before opening `CampaignMissionResult`. The result now renders the shared celebration with that mission snapshot and selected World, then opens its existing completion dialog. Its completion callback is stable, so unrelated parent updates cannot restart the exit timer. Reduced motion and failed goals go directly to their existing result; replay runs only the portal exit. Saved missions with gear retain the real character-specific equipped sprite sheet rather than dropping the gear during the exit.

The Campaign suite now has 142 tests. Added integration cases demonstrate an actual core clear for every mission, write/read its real Campaign save, verify every supply increment, verify earned styles can equip and seasons are unlocked, and verify replay grants do not repeat. They render the real result component for first clears and check reduced-motion/failure behavior. All 30 scenes are also rendered for each of the seven Worlds, and every supported equipped appearance is checked against its real asset. Browser screenshots inspected Black Metal, Boltmuffin, Squishphony, Rockmallow, Flipzel, Pawrachute and Purralune; these establish browser appearance, not physical-device acceptance. The screening room now includes a Character control. Its source-only entry moved to `/src/reward-preview.html` and remains outside release build inputs.

Node 22.23.4 local checks passed: workspace typecheck and lint; 952 mobile, 315 game-core, 234 server-core and six balance tests; development, staging, production and Campaign QA builds; planning validation, 13 Python bootstrap tests and 17 CI routing tests. The normal local formatting command encountered an existing ignored `apps/mobile/dist-release-preview` build from release work. Formatting passed with only that generated directory excluded (`npm run format:check -- '!apps/mobile/dist-release-preview/**'`); its files were preserved. The generated directory is absent on clean CI. Required Android smoke and unsigned iOS compilation are left to the PR workflow under the repository's content-change policy; simulator launch and physical-device checks have not been claimed locally.

### Additional built-in image prompts

Cosmetic atlas prompt (transparent background):

> Use case: stylized-concept. Production sprite atlas for Crystal Path, a premium cozy fantasy mobile adventure game. One square transparent canvas divided into a precisely aligned 3 by 3 grid, no visible grid lines. Nine separate polished 3D collectible reward illustrations, one centered in each equal cell, objects entirely inside their own cell with at least 16 percent transparent margin; no crossing cell boundaries, no text, no frames, no badges. Consistent elevated three-quarter camera, rich tactile materials, warm cinematic edge light, jewel tones, highly detailed yet readable at 160 pixels. Row 1 left: short elegant copper bridge rail segment with two bronze posts and a timber base, riveted refined copper. Row 1 middle: two pale luminous translucent footprints with concentric echo ripples floating below, blue pearl glow. Row 1 right: a short sleek row of three rich amber luminous LED jewels mounted on a thin dark metal bridge edge. Row 2 left: one elegant thin translucent blue ice stepping tile with delicate frost crystals, glasslike thickness, not a thick block. Row 2 middle: one beautiful broad lily pad with a small pink waterlily blossom, dew, lifelike veined leaf. Row 2 right: a pair of gold comet-shaped footsteps with delicate stardust tails, a refined wearable trail symbol. Row 3 left: two pearl and brass hanging lanterns suspended from a small curved dark bronze support, rich soft warm light. Row 3 middle: a small majestic fantasy coastal gateway made of slate and bronze, two slender pillars and a glowing warm doorway, restored gate architectural diorama. Row 3 right: a glossy berry jelly stepping tile with tiny layered jelly bubbles, luminous raspberry and violet, elegant thin cushion and gentle wobble silhouette. True transparent background in every cell; no scenery, no floor planes, no shadows stretching beyond cells. All nine objects comparable visual size. This is game production art, not flat SVG iconography.

Season atlas prompt (transparent background):

> Use case: stylized-concept. Production game reward atlas, four premium seasonal unlock illustrations on one square transparent canvas in precisely aligned equal 2 by 2 cells, no grid lines. One beautiful dimensional glass orb in each cell, centered and fully contained with 15 percent clear padding, no object crosses a cell boundary, no text, badges, frames or pedestals. Same size and camera for all four. Sophisticated hand-painted 3D fantasy adventure game art, luxurious tactile glass with subtle gold thin rim accents and rich natural miniature landscapes suspended inside. Top left SPRING: tiny green mossy coastal island with delicate pink flowers, a little drifting rain cloud and shimmering raindrops inside a clear pale aquamarine glass orb, fresh green and rose. Top right SUMMER: tiny warm golden coastal island with glowing sunshine, blue turquoise water and sun rays inside clear honey gold glass, bright welcoming rich amber. Bottom left AUTUMN: tiny russet woodland island with three lovely maple leaves caught in a breeze, copper orange crimson gold and muted moss green, clear rich amber glass. Bottom right WINTER: tiny beautiful snowy island and frost crystals with a little snowflake inside a pale icy sapphire glass orb, soft white and glacial blue, jewel-like clarity. These are seasonal unlock emblems for earned weather, not equipment. Strong 3D depth, exquisite detailed lighting but clean silhouettes, no extra stars floating outside the cell. True transparent background. The entire four-orb atlas should be consistent with premium fantasy inventory reward art.
