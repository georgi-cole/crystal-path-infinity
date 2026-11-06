# Player preview, QA profile and launch signature

Date: 6 November 2026. Branch: `codex/mystery-pacts`. Owner-requested preparation for reviewing the player experience; no merge, signing, store upload, live commerce or backend deployment is implied.

## Player and QA from the same source

| Build | Audience | Output | Local preview |
| --- | --- | --- | --- |
| `npm run build:production` | Player interface | `apps/mobile/dist` | `npm run preview`, port 4174 |
| `npm run build:staging` | Player interface, staging identity | `apps/mobile/dist` | Latest `dist` only |
| `npm run build` | Development with QA tools | `apps/mobile/dist` | Latest `dist` only |
| `npm run build:qa` | Explicit QA | `apps/mobile/dist-qa` | `npm run preview:qa`, port 4177 |
| `npm run dev:qa` | Editing with QA tools | Development server | Port 5177 |

`app-profile.ts` derives the tool gate from the build mode. Production/staging cannot enable it with a query parameter, local preference or guest profile. Development retains the existing testing behavior and data. QA uses staging application metadata but emits a separate `qa-info.json` marker and output directory. A release envelope combined with QA mode fails the build; Capacitor asset copying rejects a QA marker in `dist`.

Player UI omits simulated checkout, test-wallet reset, rewarded-ad simulation, balance tuning and the full mystery lab. The journal still shows only discovered effects and the first-discovery explanation still pauses for at most four seconds. QA retains all 24 demos without adding them to discoveries. Player local progress/settings/tutorial/discoveries use `cpi.player.v1:` keys; historical QA keys remain intact. A copied-in test-wallet or tile-experiment checkpoint is ignored by player startup. Language remains shared. No account credentials are moved into local storage.

**Real billing and rewarded-ad SDKs are still unconfigured.** Player store actions display unavailability and allow world exploration; the final screen offers a free new crossing without a fake ad or fake SP reward. QA continues to disclose simulated purchases and ads. Profile, ranked and other unconfigured services retain their existing honest states. This is a production-like interface preview, not commercial release completion.

## Ending an attempt

Explicit Return to menu from an unclaimed death applies the existing `end` transition with `forfeitGrantedReward: false`, then saves the finished checkpoint before navigation. It records the final result and no longer offers Resume into that modal. This applies equally to ordinary and store-test attempts. Leaving a live paused run still saves it for resumption.

Going to the store from a death is different: it preserves the offer, row and state so Return to your crossing recovers the same attempt. Pending reward requests and already granted unused rewards remain recoverable rather than being discarded. No reroll or automatic credit consumption is introduced.

## Unequip and current store design

An equipped owned world has an enabled Unequip action in its card and preview; it returns to free Black Obsidian without removing ownership. A global Use Black Obsidian control is available while another world is equipped, including when that world's card is off the current page. My collection retains the original free world.

The design-only source is chat **Plan the app store launch**, ID `01a1ad32-0d03-71c1-93e7-0e86de0a0c8a`, from `codex/store-test-mode`, frozen at **`29774c6ac3311c8ba1a0cf979bfaff8bab914f62`**. Its worktree was read without modifying it. Imported changes are the names/localizations, EUR 2.99 price for all six worlds, centered catalogue companion portraits, compact touch-reactive showcase, presentation styles and approved shared soundtrack. Existing image paths/masters remain stable; the update changes their presentation rather than regenerating art.

| Stable ID | English | Bulgarian | Reference EUR |
| --- | --- | --- | ---: |
| chaos | Boltmuffin | Меденко | 2.99 |
| jelly | Squishphony | Жилибон | 2.99 |
| wilds | Rockmallow | Скалинко | 2.99 |
| league | Flipzel | Баткото | 2.99 |
| puppy | Pawrachute | Шарокоп | 2.99 |
| kitten | Purralune | Котерина | 2.99 |

Explore is a small portrait with one description and a reaction on touch. It no longer starts a playable store trial or offers an audio audition. Normal purchased-world gameplay and free companion rescue remain. All worlds use the existing Black Obsidian home/run/final `.m4a` tracks, unchanged. Twelve unapproved synthetic loop/ending WAV sketches move to `design/worlds/audio-prototypes`, outside public/native assets. Short themed step, record and rescue effects remain. The generator writes future music sketches to the archive as well.

The import does not merge the source branch's application ownership, native workflow or game logic. It preserves this branch's small resource packs, shared Marketing/paid-SP budget, store-return flow, versioned experiments, 50/50 default, mystery cadence and softened death clock. **No `packages/game-core` files change in this update.** Existing receipt IDs, world IDs and save versions are unchanged.

## Three-second Kolequant signature

The owner explicitly clarified **the metallic INFINITY title from the home screen**, not an infinity symbol. The sequence is bounded to 3,000 ms per cold page start:

1. Show the actual transparent Kolequant DNA mark and wordmark.
2. Disperse the helix into complementary ATGC codon fragments.
3. Converge the codons across the INFINITY word as the actual home title's visual clone appears.
4. Move that visual to the real title's measured menu position, reveal the original heading and remove the overlay.

`brand-launch-model.ts` computes phases/coordinates without a second gameplay clock. The React app bootstraps underneath the inert overlay, and its original heading stays in its React-owned DOM. The visual clone has no ID, tab stop or accessibility heading. Completion, error, resize, backgrounding and effect cleanup all restore the original title. Routes, theme changes and resume do not replay the signature. Reduced motion uses a static brand signature. A non-home cold route gets a bounded INFINITY fallback and then opens its requested route.

Reference: the owner's Genetic age calculator repository, `Genetic age calculator/outputs/geneticage-github/public/launch-screen.mjs` and `.css`. Only its owner-provided `public/assets/kolequant-mark.webp` is copied to `apps/mobile/public/brand/kolequant-dna.webp`. The CPI animation is code-native and uses the existing home title style; no third-party logo, generated replacement mark or calculator code is bundled. Native platform splash assets remain unchanged. The independent local-startup failure bound remains 1.5 seconds.

## Verification

Browser inspection uses separate local production and QA previews, not the owner's existing testing tab. Confirmed: DNA/codon/title phases, exact home title restored once, no player QA controls, compact catalogue/portrait reaction, active-card Unequip, global Black Obsidian from another catalogue page, preserved ownership, free player practice, death → Return to menu without Resume, and QA death → store → same death → menu without Resume. Narrow-layout DOM checks found no horizontal overflow. Temporary viewport/device overrides are reset after inspection.

Automated coverage includes real core death/end transitions for plain/store attempts, checkpoint persistence and pending/granted reward preservation; player-provider gating and separate storage; bounded signature phases and finite coordinates; purchased-world ownership after unequip, approved prices, and a showcase without a playable bridge/audio. Existing gameplay and business simulations are retained unchanged. Exact commands/results and the reviewed revision accompany the branch's delivery.

Local checks on 6 November, using supported Node 24.22.1 (Windows) and Python 3.14:

| Check | Result |
| --- | --- |
| `npm test` | 1,115 pass: mobile 642, game-core 310, server-core 157, simulator 6 |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | Pass |
| `npm run build`, `build:staging`, `build:production`, `build:qa` | All pass; existing large-chunk advisory remains |
| Planning validator and Python unit tests | Valid manifest and 13 pass; Windows `python` used because `python3` is an unavailable Store alias |
| `node --test .github/scripts/app-checks.test.mjs` | 15 pass |
| Compiled preview metadata | `dist` is production without QA marker; separate `dist-qa` includes its marker |
| Store image comparison | All runtime world image Git blobs exactly match source revision `29774c6` |
| `git diff --check`; game-core diff | Clean whitespace; no game-core edits |

Native compilation/launch, physical-device animation performance, live ads, store receipts, localization of actual platform prices, release signing and publication remain separate acceptance gates. Browser previews do not establish them.
