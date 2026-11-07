# Player preview, QA profile and launch signature

Update, 7 November 2026: [The live-server candidate](LIVE-SERVER-2026-11.md) adds separately gated account/ad/commerce composition and a public `account.html` self-service page. Default player and QA builds remain unconnected; unsigned release preparation still rejects live VITE configuration. QA demos/simulations are not added to the public account page. Native acceptance must be repeated for the new source; prior evidence is historical.

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

**Update · 7 November 2026:** optional native AdMob/UMP and direct purchase adapters, server receipt verification and a source-only commerce ledger are now prepared. Registered app/ad IDs are recorded, but default activation stays off until the missing trusted host, product mappings, v11 spending/refunds/lifecycle and device acceptance are complete. Player store actions still display unavailability when unconfigured and allow world exploration; the final screen offers a free new crossing without a fake ad or fake SP reward. Configured purchase actions use platform prices, server-verified delivery and restore, never the QA wallet. QA continues to disclose simulated purchases and ads. [Detailed current status](NATIVE-SERVICES-2026-11.md). This is a production-like interface preview, not commercial release completion.

## Ending an attempt

Explicit Return to menu from an unclaimed death applies the existing `end` transition with `forfeitGrantedReward: false`, then saves the finished checkpoint before navigation. It records the final result and no longer offers Resume into that modal. This applies equally to ordinary and store-test attempts. Leaving a live paused run still saves it for resumption.

Going to the store from a death is different: it preserves the offer, row and state so Return to your crossing recovers the same attempt. Pending reward requests and already granted unused rewards remain recoverable rather than being discarded. No reroll or automatic credit consumption is introduced.

## Unequip and current store design

An equipped owned world has an enabled Unequip action in its card and preview; it returns to free Black Obsidian without removing ownership. My collection retains the original free world. The initial build also offered a global Use Black Obsidian banner; the owner subsequently rejected it as redundant and it has been removed.

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

## Follow-up UI and release review — 6 November 2026

Owner feedback identified encoding damage in the tutorial's arrow/check marks and an unwanted decorative hourglass. The symbols now use explicit Unicode escapes; the hourglass is removed and the rehearsal uses the existing `DeathClockBadge` with its real model state. Reading the lesson remains untimed. Actual game-core clock rules and warning effects are unchanged.

The player Practice action starts/resumes the local crossing directly. Profile/Rankings/Play fallback actions also enter practice directly. Old practice-menu hash links recover to home in the player profile; QA retains the full practice hub and balance tuner. Skipping the tutorial returns home; its final start action requests a new crossing through the existing saved-run confirmation. **Discoveries / Открития is a tab inside the existing How to play area, also available from pause. The owner explicitly rejected adding a dedicated home button or placing the journal in Settings.** The redundant QA practice-hub journal entry is removed as well. The journal still contains only discovered effects.

The QA-only `RunReserves` component now independently refuses to render in a player build, even if accidentally passed a store-test checkpoint. The actual server-backed `RewardOffer` remains separate; renaming a simulated button is not an integration. The player's default host still supplies no live account/ad services.

The owner supplied the public support address **support@kolequant.com**. Settings → Help and support now opens a preaddressed email draft with the game's name in its subject. The address is also displayed as selectable text. No email, private checkpoint or diagnostics are sent automatically. This does not provision a helpdesk, test inbox deliverability or publish the separate store-support/privacy pages.

### Next release integration work

This is the next release phase, before public launch. Existing contracts and local/synthetic tests provide a foundation; they do not establish hosted/provider readiness.

| Order | Existing foundation | Required for real acceptance |
| --- | --- | --- |
| 1. Accounts and hosted authority | Gated OTP, protected-session owner, profile/export/delete clients and server adapters | Deploy the approved hosted eligibility/Auth/session services; configure real email delivery; wire App services; verify signup, restart, logout and deletion on Android/iOS. Apply the approved release ruleset and paid-resource rules on the server; do not silently revert to the older official baseline |
| 2. Rewarded continuations | `RewardOffer`/`RewardFlow`, server intent/signature/grant ledger, quota/recovery contracts | Connect the actual native ad/consent adapter and provider units; bind the hosted verification route; test no-fill, close, background/restart and delayed verification. Preserve 10 ad slots, the 200/150 SP schedule and earned rewards |
| 3. Purchases | Approved catalogue and QA wallet/economy behavior | Register real store products and connect native StoreKit/Play Billing plus server receipt/ownership/resource ledger. Use platform-localized prices; verify pending/cancel/duplicate/refund, restored worlds and purchased-resource budgets. A test receipt ID cannot become a real SKU or entitlement |
| 4. Support and beta acceptance | Public in-app email contact and local build profiles | Verify the inbox and publish support/privacy/deletion pages; run the same integration paths with platform test transactions on real phones, then signed TestFlight/Play testing and store submission |

Provider guidance checked on 6 November 2026: [AdMob rewarded testing](https://developers.google.com/admob/android/rewarded), [Apple Sandbox purchases](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox), [Play Billing license testing](https://developer.android.com/google/play/billing/test) and [Supabase production SMTP](https://supabase.com/docs/guides/auth/auth-smtp). Test ads and platform test payments precede live monetization; they exercise actual provider integrations rather than this QA wallet. Dates depend on the configured provider projects, registered products and device acceptance, so this review does not promise a release date.

Early follow-up automated verification: 1,116 application/core/server/simulator tests passed (mobile 643, core 310, server 157, simulator 6). Regression coverage checked corrected arrows, player-vs-QA legacy navigation, an independently gated simulated continuation panel, guide-only journal placement and the approved mailto destination. The initial 1,115-test result above remains the historical result for `9b59c28`.

### Consistent world controls and original sound cues

Later owner feedback shortened the journal label to Discoveries and requested the same button geometry, font and sizing as home. The guide tabs now reuse `MenuAction`, including its material/hover/active states and shared responsive typography. Tutorial actions and the support link reuse the same control styling. World radius/accent/panel tokens apply to the outer tutorial controls/progress, discoveries cards, and final result/continuation panels and secondary actions. A subsequent explicit owner correction isolates the tutorial's bridge demonstration in an Obsidian `ThemeScope`: its SP/hint instruments, glass and effects always use Black Obsidian, with no world environment or companion. The surrounding guide page retains the equipped world, which is not changed by this local scope. Warning/rarity semantics retain their functional colors. The original game rules are untouched.

The global Obsidian banner was removed; Unequip remains on the active card/preview. The original Crystal Path step and collapse files already matched the owner source byte for byte, but cosmetic worlds were selecting synthetic alternatives. Runtime now uses the original `minigame_gb_safe_step.mp3` and `minigame_gb_death.mp3` for every world. The existing falling-glass sound is unchanged. Theme record cues remain; historical synthetic step/rescue assets are retained but are no longer selected for these actions. Shared background music is unchanged.

For box opening, `ui_wildcard_draw.mp3` is copied unchanged from the owner's asset collection at the pinned `bbmobilenew-source@6ace929a60410e728928aa51eaf80ba9b5cf2262` (confirmed identical to the current source at `654cd9f`; Git blob `9684c72a4f3cd33f6b1c4f3040eb173d23dd39ff`, 51,827 bytes). Its use is recorded in `planning/reuse-manifest.json` with the existing owner-source provenance qualification. The same draw/reveal cue applies to all nonfatal mystery outcomes, including choice offers, without revealing their result. A run/life/row key suppresses duplicate callbacks; mute, pause, foreground loss and disposal use the existing audio owner. The fatal collapse cue retains priority over other cues. No source repository is edited.

### Clear discovery explanations

The owner expects children to understand the discoveries. English and Bulgarian summaries now lead with the resource change and duration. Expandable **How does it work? / Как действа?** details use short paragraphs, plain verbs and worked examples for timed effects and trades. Soul exchange separates its two offers instead of presenting a compressed equation; trade refusal costs and the difference between one-use Borrowed luck and repeatable Twisted fate remain explicit. SP-cap implementation text is removed from effect descriptions. This is a copy/presentation change, without changing probabilities, prices, timers or random draws.

The journal uses a provided run's ruleset, or the current v11 rules for a standalone menu visit. This preserves the distinction between a classic oracle's safe-side arrow and an independent-risk experiment's lower-risk arrow; neither is a guaranteed hint. Marketing's purchased-hint conversion shares the existing 200-SP reserve budget only in business rules. These qualifications are explained in the expanded text, not added as extra steps. Only discoveries already found are listed; the first-introduction pause remains bounded to four seconds and Try it remains QA-only.

### Compact pause audio controls — owner follow-up

Sound and feedback in the pause overlay is now a native disclosure, initially closed, sharing the exact `cpi-run-ledger` styling and plus/minus indicator with Run details. Expanding it exposes the existing four persisted toggles. Its fieldset legend remains available to assistive technology without duplicating the visible summary. Closing and reopening pause starts collapsed again; the main Settings page remains expanded. This changes layout only, not audio preferences, playback, clocks or gameplay.

Verified after this small follow-up: 38 existing scene/audio/player-profile tests pass, changed files pass lint/format checks, and development/staging/production/QA builds pass. Browser inspection confirmed the default plus, expanded minus and four visible controls, a working preference change restored to its original value, collapse on reopening pause, and the unchanged expanded Settings page. No additional tests or game-rule changes were introduced for this reversible presentation edit.

### Final follow-up verification — 6 November 2026

The final follow-up adds 16 mobile cases to the initial revision: current mobile 658, game-core 310, server-core 157 and balance simulations 6, totaling **1,131 passing tests across the suites**. The mobile command is `npm run test --workspace @crystal-path-infinity/mobile -- --maxWorkers=4`. Unrestricted `npm test` hit the existing five-second native icon export timeout on this Windows machine; its game-core/server suites passed. Limiting mobile concurrency passes the full suite without changing the test timeout or export assertions. The earlier 1,115/1,116 results above remain historical results, not updated totals.

`npm run typecheck`, `lint` and `format:check` pass. Development, staging, production and the separate QA builds pass, with the existing large-chunk advisory. Final `dist/build-info.json` identifies production and has no QA marker; `dist-qa` retains its separate marker. The planning validator, 13 Python tests and 15 CI-routing tests pass. `git diff --check` is clean; game-core/server-core have no implementation edits.

Documentation updated with this follow-up: this release-preview contract, `docs/CURRENT_GAME_RULES.md`, the public-contact note in `docs/decisions/CPI-032-037-operations.md`, `design/worlds/README.md` and the audio provenance entry in `planning/reuse-manifest.json`. `docs/BUSINESS_PLAN.md` was checked; no pricing, quota, probability, simulation result or business assumption changed, so its historical figures are retained.

Browser checks used an isolated local QA origin, separate from the owner's playing tab and wallet. All six equipped worlds retain their outer guide design while the internal demo is Obsidian with zero scenery/companion images. Guide tabs match home button radius/font/weight/size in every world. The Boltmuffin death screen's continuation panels and secondary buttons use copper world materials. A genuinely found Marketing box appears alone in Discoveries; its expanded English/Bulgarian explanation has separated paragraphs, the exact trade example and purchased-hint limit. Support exposes the approved mailto address without sending a message. The production preview has the renamed guide tab and no visible QA controls. The isolated QA inspection tab/server is disposable; player and owner QA previews remain at 4174/4177. No physical-device audio, real ad, receipt, signup or support-inbox delivery is claimed.

### Settings materials and mobile wording — subsequent owner review

The owner found residual fixed-purple settings controls and a fieldset legend straddling the panel edge. The settings presentation now styles the actual sound fieldset, language section, guide link and privacy/account/support group with the same world panel/radius/accent tokens used by menu controls. Stale selectors for older component names are removed. Custom switch tracks/thumbs and focus indicators use the active world rather than relying on `accent-color`, which cannot recolor an appearance-free switch. They also inherit the world in the collapsed pause disclosure.

The sound fieldset keeps an accessible hidden legend; its visible heading is inside the panel, and pause continues to hide that extra heading. Labels may wrap without squeezing the switches or icons. The language field has its own contained row. English and Bulgarian use How to play / „Как се играе“ consistently for all tutorial entry states and its eyebrow. Mobile action labels are shorter: Bulgarian „Използвай“, „Свали“, „Разгледай“, „Към играта“, „+1 подсказка“ and English Equip. Explanations, ownership, prices and confirmation context remain available. No rules, business assumptions or save schema changed.

Verification for this settings review: all 658 mobile tests pass with `--maxWorkers=2`; the native icon export's existing five-second limit again timed out when a four-worker run overlapped a build, without a content assertion failure. After the final short-label edit, 57 existing store/menu/guide/player-profile cases pass. Full lint/format checks and development/staging/production/QA builds pass. Browser DOM/layout checks at an actual 320 CSS-pixel viewport pass for Obsidian and all six purchased worlds: no horizontal overflow or clipped labels, heading inside the sound panel, distinct world panel/thumb colors and matching corner tokens. Expanded Bulgarian support text and email stay contained; keyboard toggling works and restores the original preference with a world-colored focus indicator. Temporary viewport overrides are cleared. No new tests, core/server edits or physical-device acceptance claim are added for this reversible styling/copy change.
