# World production template

Chaos Workshop and Jellyverse are original cosmetic worlds for CPI-013. The
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
  ambient motion, a companion and an arranged local soundtrack.
- [Sky's art-development account](https://thatskyshop.com/blogs/designer-insight/the-art-of-sky-designer-insight):
  concept work and retained iterations communicate a world's identity. Our
  application: retain source masters, generation prompts and this design record
  alongside optimized runtime assets. No third-party art is bundled.

## Art direction

| Layer | Chaos Workshop | Jellyverse |
| --- | --- | --- |
| Emotion | Warm mischief, curiosity, a handmade place | Gentle wonder, buoyancy, a dreamlike place |
| Silhouette | Copper observatories, toothed rings, hanging lanterns | Floating reefs, opal plants, ringed moon |
| Material | Brushed copper frames, champagne crystal, mint light | Opal crystal, lilac facets, cyan edges |
| Ambient motion | Very slow edge cogs, drifting steam, sparse sparks | Swaying edge tendrils, haze, sparse bubbles |
| Companion | Pip, an asymmetric copper robot with a mint heart | Lumi, an opalescent jelly with a cyan star |
| Audio | Warm bell melody, bass, sustained harmony, soft ticks | Spacious glass melody, long harmony, light bubble notes |

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
  settle. In play the small actor rests behind the next actionable row. A hop
  starts only after a resolved choice; safe landings celebrate; a surviving wrong choice makes a quick escape onto
  the now-public intact pane. The companion stays on that pane through camera
  travel and checkpoint recovery. At zero SP it falls, then disappears. Its
  square frame measures 56–104 CSS pixels, with both axes corrected to retain
  its proportions at any board aspect ratio.
  The actor follows the shared perspective geometry and camera travel. It never
  offers a route suggestion or creates an additional input target.
- Hidden/native-suspended scenes freeze decoration. Pause and reduced-motion
  settings freeze it too. CSS transforms/opacity avoid per-frame React state.
  Sound follows the existing mute, foreground and disposal lifecycle.

## A complete crossing

The original raster environments and reaction sheets are paired with lightweight,
code-native SVG props in `world-treasures.tsx`. Chaos uses a riveted copper cache,
mint energy lens and mechanical power settings. Jellyverse uses a pearl capsule,
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
- `apps/mobile/scripts/generate-theme-audio.mjs` reproduces original synthesized
  WAVs; no samples or streaming services are involved. Local audio loads only
  for the selected world and has bounded ownership.

Future world template: define the emotion and material language, create masters
with an empty bridge corridor, build reusable edge modules, supply three
companion frames and a coherent sound set, then review the combined playable
scene on a phone. Add the asset budgets and recovery checks before publication.

## Acceptance

Check 320/390px phone widths, desktop, both worlds, their real practice trials,
safe/wrong/hint feedback, motion reduction, mute, pause/resume and path contrast.
The store must remain compact and disclose simulated payments. Full native CI
still gates the PR; browser inspection does not prove physical-device frame rate
or Apple/Google billing. Pricing remains a test reference while the owner judges
the worlds' quality and value.
