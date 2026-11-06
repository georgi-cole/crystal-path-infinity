# World production template

Six original cosmetic worlds form the CPI-013 collection. The
crystal path is always the focal point. Artwork is judged in the playable scene,
with hints, SP warnings, fractures and controls visible.

## References and decisions

- [Monument Valley 3: art and design, with John Lau](https://legacy-activation-v2.unity3d.com/vn/resources/monument-valley-3-blurring-art-and-design):
  its team iterates between playable forms and art, and reuses modular decorative
  components. Our application: one reusable world renderer; validate the bridge
  before judging a standalone illustration. This is an implementation choice,
  not a claim that CPI uses their engine or pipeline.
- [Team Alto's official press kit](https://altosodyssey.com/press/): the developers
  combine distinct biomes, lighting/weather, fluid movement and original audio.
  Our application: pair each environment with coherent materials, restrained
  ambient motion and a companion. All worlds currently share the owner-approved Black Obsidian soundtrack.
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
| Music | Shared owner-approved Black Obsidian scene tracks | Shared owner-approved Black Obsidian scene tracks |

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
  the same scenery and bridge for the store preview. Assets use Vite's base path
  and work under the GitHub Pages project URL and native packages.
- `apps/mobile/scripts/generate-theme-audio.mjs` reproduces short synthesized effect cues and archives unapproved music sketches outside runtime assets. Runtime music uses the existing owner-supplied Black Obsidian files. Local audio loads only
  for the selected world and has bounded ownership.

Future world template: define the emotion and material language, create masters
with an empty bridge corridor, build reusable edge modules, supply three
companion frames and a coherent sound set, then review the combined playable
scene on a phone. Add the asset budgets and recovery checks before publication.

## Acceptance

Check 320/390px phone widths, desktop, all six worlds, their real practice trials,
safe/wrong/hint feedback, motion reduction, mute, pause/resume and path contrast.
The store must remain compact and disclose simulated payments. Full native CI
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
| Rockmallow | Rockmallow: one giant hollow jade geode ear, one blunt basalt ear, amber seed brow | Hollow seed-vaults, fossil reeds, rough basalt seed caches, jade power settings | Hollow reed pulses, offbeat chimes; a crystal seed glider |
| Flipzel | Flipzel: a living orange/graphite folded pennant, silver running shoes | Aerial race fins, incomplete cyan lap ring, angled baton cases and enamel medals | Syncopated plucks and low racing pulses; a folded rescue banner |
| Pawrachute | Pawrachute: wiry charcoal/ivory terrier, one floppy ear, copper eye patch, rescue backpack | Copper courier rooftops, teal utility tags, weathered satchel caches | Swung rooftop plucks and copper clicks; backpack parachute |
| Purralune | Purralune: ink-black kitten, one white paw, ivory brow slash, indigo cape | Narrow slate rooftops, amber window cuts, moonstone weather vanes and folding moon vaults | Sparse minor glass notes and midnight bass; cape opens into a glider |

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
Short themed step, record and gentle rescue effects remain. Unapproved loop and ending music sketches are retained in `audio-prototypes/` outside the application bundle. They are not used as world soundtracks.

Payments remain simulated and local. Continuation packs are 3/5/10/25; SP reserve
packs are 100/500/1000/2500/5000/10000. Theme ownership changes no game rule or
ranked eligibility, and both pet worlds can be tried without buying anything.


Public names are deliberately short and child-friendly: **Boltmuffin, Squishphony, Rockmallow, Flipzel, Pawrachute and Purralune**. Each character and world share a name. Internal IDs and historical generation prompts stay stable so existing test ownership, receipts and reproducible art are preserved.


## Meaningful name system

Names combine a familiar word with a character trait, material or sensory
promise. Sound alone is not the brief. Bulgarian uses the owner-selected names below throughout the store,
home identity, introductions, descriptions, journals and safe endings.
English names are maintained separately. Character and
world share the name, while technical IDs and existing receipts stay stable.

| Name | Wordplay | Character promise |
| --- | --- | --- |
| Rockmallow | rock + marshmallow | A strong geode keeper with a warm, soft heart |
| Flipzel | flip + pretzel | Quick turns, springy jumps and folded ribbon forms |
| Pawrachute | paw + parachute | A rooftop puppy whose rescue backpack always gets him home |
| Purralune | purr + lune (moon) | A moonlit rooftop kitten with an unfolding flight cape |
| Boltmuffin | bolt + muffin | A small mechanical troublemaker with a sweet side |
| Squishphony | squish + symphony | Soft luminous jelly and buoyancy |

Exact-name searches and official-store searches are first-pass creative
screening, not a claim of trademark exclusivity. Historical generation prompts
retain their source aliases for reproduction; `generation-v2.json` records the
current public names and wordplay. No unrelated personal search results are
retained in the repository.


## Approved Bulgarian names

| World ID | Character | Bulgarian name |
| --- | --- | --- |
| jelly | Jelly companion | Жилибон |
| kitten | Kitten | Котерина |
| puppy | Puppy | Шарокоп |
| wilds | Stone creature | Скалинко |
| league | Athlete | Баткото |
| chaos | Copper robot | Меденко |

These spellings are supplied by the owner. Display names follow the selected UI language; technical IDs, asset paths, ownership and receipts stay stable. Historical image-generation prompts retain their original aliases. Purchases remain simulated test-only.


## Catalogue readability and pricing review — 2026-11-06

Catalogue companions are centered horizontally in both two-card and single-world layouts. A restrained center veil and soft silhouette shadow separate them from edge scenery; the playable bridge scene retains its existing focus treatment. Checked at 390px: both card centers and the single-world center align with their artwork container, with no horizontal overflow. Development build/type checking and changed CSS formatting passed.

Six worlds provide enough choice for the first collection. The next art pass should distinguish shape, material, lighting and dominant hue rather than add more similar worlds. Proposed directions (not regenerated artwork): wilds jade/bone and rounded mineral forms; sport electric cyan/navy with racing arcs and stripes; puppy terracotta/cream daylight and worn courier materials; kitten ink/silver moonlight and narrow rooftops; robot copper/mint mechanical circles; jelly rose/opal translucent curves. The path stays dominant and functional warnings retain their meanings.

Observed public retail examples, checked 2026-11-06; USD and EUR are separate storefront prices, not currency conversions or evidence of actual sales:

| Comparator | Listed price | Purchased content | Source |
| --- | --- | --- | --- |
| Crossy Road, US iOS | $0.99 for listed chicken characters | Character unlock | https://apps.apple.com/us/app/crossy-road/id924373886 |
| Monument Valley, US iOS | $3.99 base game; $1.99 Forgotten Shores | Full game; expansion with eight additional chapters | https://apps.apple.com/us/app/monument-valley/id728293409 |
| Minecraft, EU PlayStation | €2.99 texture packs; €5.99 mythology mash-ups | Texture replacement; mash-up adds a designed world, textures, themed UI and soundtrack | https://www.playstation.com/en-mt/games/minecraft/ and https://store.playstation.com/en-us/product/UP4433-CUSA00744_00-KMP0000000000006/ |
| Sky, official indexed web catalogue | $2.99 Feline Friend; $14.99 Impish Wings; $19.99 Cat Costume Pack | Cosmetic accessory, wings or costume pack, rather than an entire new game | https://store.thatskygame.com/ |

Working recommendation: consider €2.99 per current world at launch, €3.99 for a visibly more distinctive finished premium world, and retain €4.99 as a possible future flagship price rather than the default for all six. This is product judgment, not a measured optimum. Our worlds bundle companion reactions/rescue, background, UI and props, but do not add a new gameplay mode or authored level campaign. Established games' higher cosmetic prices do not establish equivalent willingness to pay for a new title. The owner approved €2.99 per world as the accessible launch price. All six theme products now use this reference price in the simulated checkout; resource prices are unchanged. Purchases remain simulated.


## Compact world showcase — owner direction

Explore opens a touchable companion portrait with world artwork, one short world-specific description, a compact inclusion summary and an Unlock world / EUR 2.99 action. Touch changes the companion's expression. There is no audio audition button. All worlds use the same owner-approved Black Obsidian soundtrack, with separate home, active-run and final tracks.

The shop no longer exposes Try in practice or constructs a trial GameOwner. The showcase has no playable bridge, staged run, scripted jump/box reveal, starting-screen gallery or safety promotion. Actual free rescue and normal unlocked gameplay remain intact. Cards omit repeated Original world and feature labels; reserve balances appear on the resource/collection tabs. Test-mode disclosures remain visible. Historical trial runtime helpers are not a purchase entry point.


## Approved shared soundtrack

Owner direction: use the existing Black Obsidian music for every world. `soundtrack.ts` supplies `home-ambient.m4a` on the home screen, `gameplay-tension.m4a` during an active run and the existing 47-second `run-ended-deathrow.m4a` excerpt on the final screen. Existing playback offsets, looping, mute and OS background/resume behavior remain. The original media files are unchanged. Themes do not provide exclusive music and the shop offers no listening control.

The earlier programmatically synthesized music was not owner-approved. Its six loop sketches and six 2.1-second ending cues are archived outside public/native assets in `audio-prototypes/`; generation writes music sketches there as well. Short themed sound effects, including gentle pet rescue, are distinct from the shared soundtrack and remain. Historical art-direction sound ideas in the table above describe abandoned sketches, not current paid features.
