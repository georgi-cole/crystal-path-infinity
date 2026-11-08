# World production template

Six original cosmetic worlds form the CPI-013 collection. The
crystal path is always the focal point. Artwork is judged in the playable scene,
with hints, SP warnings, fractures and controls visible.

## Current owner-approved presentation — 2026-11-06

Design-only synchronization from `codex/store-test-mode` at `29774c6ac3311c8ba1a0cf979bfaff8bab914f62` keeps existing artwork/technical IDs and applies the current names, centered catalogue portraits and compact touch-reactive showcase. All six worlds have the approved EUR 2.99 reference price; resource prices are unchanged. The free Black Obsidian is always reachable through Unequip, without losing owned worlds.

| ID | English name | Bulgarian name |
| --- | --- | --- |
| chaos | Boltmuffin | Меденко |
| jelly | Squishphony | Жилибон |
| wilds | Rockmallow | Скалинко |
| league | Flipzel | Баткото |
| puppy | Pawrachute | Шарокоп |
| kitten | Purralune | Котерина |

Explore shows artwork, one short description and a companion expression on touch. It does not construct a playable trial or offer music audition. Every world uses the original, unchanged Black Obsidian home/run/final `.m4a` tracks. Twelve unapproved synthetic loop/ending WAV sketches are retained in `audio-prototypes/`, outside runtime assets; the generator archives future sketches there. Short themed step, record and rescue effects remain. Historical audio concepts below are not paid music features. Earlier names in source-generation prompts remain aliases for reproducibility.

Simulated checkout and test disclosures belong only to development/QA. Player staging/production shows unavailable purchases until real billing is connected. See [the player/QA decision](../../docs/decisions/PLAYER-QA-RELEASE-PREVIEW.md) for current behavior and verification boundaries.

**Later owner review on 6 November:** guide tabs and support use the shared menu control styling; the outer tutorial controls/progress and final continuation panels inherit each world's materials. The owner subsequently requested one exception: the bridge demonstration inside Rules always uses Black Obsidian, including its SP/hint instruments, without the equipped world's scenery or companion. This local scope does not unequip the world; the outer guide page keeps its design. Discoveries is a tab in How to play and a pause action, with no separate home/settings/practice-hub button. Its explanations use short English/Bulgarian paragraphs and simple examples, with demonstrations only in QA. Only Unequip is needed to return to Obsidian; the extra global banner is removed. Original Crystal Path step/collapse MP3s now replace the synthetic step/rescue selection for every world. Box opening uses the existing owner-source `ui_wildcard_draw.mp3`; falling glass and shared background music are unchanged. Earlier short synthetic step/rescue files remain for reproduction, not as current playback promises.

**Settings follow-up:** actual settings panels, language selection, disclosure rows, custom switch tracks/thumbs and keyboard focus now share world materials and corner shapes, including Obsidian. The visible sound heading sits inside its panel; long labels wrap beside fixed-size icons/switches. The pause sound group stays collapsed by default. Tutorial entry text is How to play / „Как се играе“; mobile store actions use concise labels such as „Използвай“ and „Свали“ without hiding price or ownership context.

## References and decisions

- [Monument Valley 3: art and design, with John Lau](https://legacy-activation-v2.unity3d.com/vn/resources/monument-valley-3-blurring-art-and-design):
  its team iterates between playable forms and art, and reuses modular decorative
  components. Our application: one reusable world renderer; validate the bridge
  before judging a standalone illustration. This is an implementation choice,
  not a claim that CPI uses their engine or pipeline.
- [Team Alto's official press kit](https://altosodyssey.com/press/): the developers
  combine distinct biomes, lighting/weather, fluid movement and original audio.
  Our application: pair each environment with coherent materials, restrained
  ambient motion and a companion, with the approved shared Black Obsidian soundtrack.
- [Sky's art-development account](https://thatskyshop.com/blogs/designer-insight/the-art-of-sky-designer-insight):
  concept work and retained iterations communicate a world's identity. Our
  application: retain source masters, generation prompts and this design record
  alongside optimized runtime assets. No third-party art is bundled.

## Art direction

| Layer | Boltmuffin | Squishphony |
| --- | --- | --- |
| Emotion | Warm mischief, curiosity, a handmade place | Gentle wonder, buoyancy, a dreamlike place |
| Silhouette | Copper observatories, toothed rings, hanging lanterns | Floating reefs, opal plants, ringed moon |
| Material | Brushed copper frames, champagne crystal, mint light | Opal crystal, lilac facets, cyan edges |
| Ambient motion | Very slow edge cogs, drifting steam, sparse sparks | Swaying edge tendrils, haze, sparse bubbles |
| Companion | Boltmuffin, an asymmetric copper robot with a mint heart | Squishphony, an opalescent jelly with a cyan star |
| Music | Shared Black Obsidian scene tracks | Shared Black Obsidian scene tracks |

## Focus and animation rules

- Scene masters reserve the middle and lower center for the path. Architecture
  lives mainly at the edges; detailed scenery is subdued during actual play.
- A separate center veil reduces contrast behind the path. The foreground bridge
  is rendered afterward, using the same renderer as the original game. No painted
  fake path, hint, choice or result is part of the background.
- Decorative slots never read the secret route, RNG or gameplay clock. Both
  sides receive the same material details. Hit areas, timing, scans, outcome
  colours and fracture geometry retain their existing gameplay meaning.
- Twelve tiny motes are bounded to the outer edges. Two foreground modules add
  depth. Ambient movement takes 14–85 seconds, with only a few pixels of drift.
  There is no flashing scenery, camera shake or full-screen perpetual effect.
- Companion sheets contain three equal square frames: calm, happy, worried.
  Reactions select frames; short celebration/worry animations run twice, then
  settle. In play the actor is 68–112 CSS pixels, corrected on both axes, and
  rests behind the next actionable row. A hop starts only after a resolved
  choice; safe landings celebrate; a surviving wrong choice escapes onto
  the now-public intact pane. The companion stays on that pane through camera
  travel and checkpoint recovery. At zero SP free safety equipment lifts it
  away from the broken path. The run still ends and no damage is refunded.
  The actor follows the shared perspective geometry and camera travel. It never
  offers a route suggestion or creates an additional input target.
- Hidden/native-suspended scenes freeze decoration. Pause and reduced-motion
  settings freeze it too. CSS transforms/opacity avoid per-frame React state.
  Sound follows the existing mute, foreground and disposal lifecycle.

## A complete crossing

The original raster environments and reaction sheets are paired with lightweight,
code-native SVG props in `world-treasures.tsx`. Chaos uses a riveted copper cache,
mint energy lens and mechanical power settings. Squishphony uses a pearl capsule,
star clasp and opal charms. Lids, cores and bases are separate layers; opening
and power release fit inside the existing 1.45-second mystery beat. No hidden
reward or route affects an unopened box's appearance.

The reveal object becomes the same glyph in the timed effect HUD. Shielding
adds a restrained field around the companion; other active effects add at most
a small positive charm and one negative accent. Names, remaining time, SP damage
and outcomes keep their canonical gameplay meaning. Negative powers retain red
warning accents. No ornament grants a gameplay benefit.

Run summaries use a compact environment crop, a companion portrait and the
world's materials around the actual result. The pause sheet stays compact.
English and Bulgarian labels, controls, local/unverified qualifications and
resource disclosures remain present. Original Obsidian presentation is retained.

## Asset organization and reproduction

- `source/*-v1.png`: four original, full-resolution masters from built-in
  **image_gen**. `generation.json` contains the final prompt set and encoder
  settings. Environment masters are 1024×1536. Companion masters are 2160×720.
- `apps/mobile/public/assets/worlds/{chaos,jelly}/environment-v1.webp`: runtime
  scenery, 1024×1536, encoded with `sharp-cli@5.2.0`, WebP quality 84.
- `.../companion-reactions-v1.webp`: runtime three-pose sheet, 1536×512, WebP
  quality 88 with alpha preserved. The four runtime images together are under
  1 MB; masters are outside the public web/native asset directory.
- Encode an environment with `npm exec --yes --package=sharp-cli@5.2.0 -- sharp
  -i design/worlds/source/chaos-environment-v1.png -o
  apps/mobile/public/assets/worlds/chaos/environment-v1.webp -f webp -q 84`.
  Encode a companion with the equivalent paths, `-q 88 resize 1536 512`.
- `apps/mobile/src/world-assets.ts` binds each world to its runtime artwork.
  `theme-art.tsx` supplies layers and reactions; `world-experience.tsx` composes
  the touch-reactive portrait for the store preview. Assets use Vite's base path
  and work under the GitHub Pages project URL and native packages.
- `apps/mobile/scripts/generate-theme-audio.mjs` reproduces short synthesized
  effect WAVs and archives unapproved music sketches outside public assets. Local audio loads only
  for the selected world and has bounded ownership.

Future world template: define the emotion and material language, create masters
with an empty bridge corridor, build reusable edge modules, supply three
companion frames and a coherent sound set, then review the combined playable
scene on a phone. Add the asset budgets and recovery checks before publication.

## Acceptance

Check 320/390px phone widths, desktop, all six worlds, their portrait previews and unlocked runs,
safe/wrong/hint feedback, motion reduction, mute, pause/resume and path contrast.
The store must remain compact and disclose simulated payments in QA and unavailable real purchases in player builds. Full native CI
still gates the PR; browser inspection does not prove physical-device frame rate
or Apple/Google billing. Pricing remains a test reference while the owner judges
the worlds' quality and value.


## Collection direction v2

The four new worlds use sculptural cut-paper contours, matte planes against
translucent crystal seams, controlled asymmetry and an open diagonal prism cut.
The initial round of generic soft mascots was rejected. A retained direction
board defines the cast before the environment and three-pose production sheets.
The open cut repeats in character clasps/chests, pane inlays, icon settings,
sealed mystery props and power charms. No official character, costume, mark or
world from Pokémon, Halo or other franchises is bundled.

| World | Recognizable signature | Environment and props | Sound and safety |
| --- | --- | --- | --- |
| Rockmallow | Rockmallow: one giant hollow jade geode ear, one blunt basalt ear, amber seed brow | Hollow seed-vaults, fossil reeds, rough basalt seed caches, jade power settings | Crystal seed glider; short mineral effects |
| Flipzel | Flipzel: a living orange/graphite folded pennant, silver running shoes | Aerial race fins, incomplete cyan lap ring, angled baton cases and enamel medals | Folded rescue banner; short race effects |
| Pawrachute | Pawrachute: wiry charcoal/ivory terrier, one floppy ear, copper eye patch, rescue backpack | Copper courier rooftops, teal utility tags, weathered satchel caches | Backpack parachute; short copper effects |
| Purralune | Purralune: ink-black kitten, one white paw, ivory brow slash, indigo cape | Narrow slate rooftops, amber window cuts, moonstone weather vanes and folding moon vaults | Cape opens into a glider; short glass effects |

Puppy and kitten are separate purchases and environments. Their safety is never
an entitlement or a consumable. Zero SP, a wrong pane, a mystery and an idle
clock all end the crossing normally; the pet is visibly rescued and appears
safe at home in the result. Continuations extend the run, not the pet's safety.
Boltmuffin and Squishphony also return safely through their own equipment. A nonfatal wrong
choice still lands on the publicly resolved intact pane, including after resume.
Reduced motion uses a static protected pose; hidden/native-suspended and paused
states freeze the actor and decoration. No new clock, route or RNG is introduced.

The equipped world now carries through home identity, home buttons, utility and
navigation icons, practice/settings/profile panels, confirmations, store dialogs,
bridge, caches, power HUD, companion shielding and the outcome journal. Account,
privacy and score qualifications keep their original meaning. Pet ending and
pause copy is reassuring in English and Bulgarian.

`source/cast-direction-v2.png` and the eight `source/*-v2.png` files are retained
built-in image_gen masters. `generation-v2.json` records exact prompts, reference
purpose, cleanup and encoder settings. Runtime art for the new worlds lives in
`apps/mobile/public/assets/worlds/{wilds,league,puppy,kitten}` with `v2` names.
The whole six-world runtime art collection is approximately 2.1 MB, bounded to
500 KB per plate + companion pair and 3 MB overall. Source PNGs are never shipped
in the web/native bundle. Only the selected world and visible catalogue cards
load art; category filters and two-card pagination bound catalogue scrolling.
All four new sound sets retain short step, record and gentle rescue WAVs.
The deterministic synth script keeps the earlier loop/ending sketches in the archive.

QA payments remain simulated and local. Continuation packs are 3/5/10/25; SP reserve
packs are 100/500/1000/2500/5000/10000. Theme ownership changes no game rule or
ranked eligibility, and both pet portraits can be explored without buying anything.


Public names are **Boltmuffin, Squishphony, Rockmallow, Flipzel, Pawrachute and Purralune**, with owner-selected Bulgarian names in the current table above. Each character and world share a name. Internal IDs and historical generation prompts stay stable so existing test ownership, receipts and reproducible art are preserved.

### Mobile run controls on 8 November 2026

Seven original engravings in the mobile app's run-control SVG collection depict
Obsidian facets, Boltmuffin's riveted copper, Squishphony's opal ripples,
Rockmallow's jade leaf, Neo Striker's enamel stripes, Pawrachute's canvas
stitching and Purralune's moonlit trim. The app bundles the vector masks and
colors them with each world's material palette. The result uses the entire
existing companion frame inside a dedicated portrait slot. Choice offers
reuse the matching bridge cache in its open state.
