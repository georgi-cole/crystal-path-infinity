# Crystal Path Campaign and Infinity proposal

## Current offline build — 0.7.2

11 November 2026 · CPI-039 / #109. This supersedes the earlier assisted-Campaign supply/gear/No Clock policy; it does not rewrite historical playtest results.

- **Campaign:** every new attempt snapshots the mission kit and `-mission-kit` rules. Store stock, purchased gear effects and No Clock cannot improve a mission. The core rejects shop supply commands for these attempts; the UI offers no shop supplies or purchased continues in Campaign, including older saves. Mission-provided caches, hints, shields and other scripted effects still work. Restarting from the generic end-of-crossing modal now calls the Campaign factory, preserving the mission identity/kit and drawing a fresh route instead of falling back to a generic Infinity run. Existing started snapshots keep their already captured route/rules. Cosmetics stay shared.
- **Infinity:** new attempts snapshot `-supplies`. The main hint counter includes free run hints plus the current inventory (2 + a 10-pack = 12). Free hints are spent first. The same button then spends one stored hint and guarantees a safe tile. Starting/retrying a run never replenishes or consumes stored hints. Stability restores 25 SP per use; a shield protects one crack within five active seconds. A stored continue restores 150 SP on the same row, subject to the existing per-run revive cap.
- **Save safety:** the inventory, Campaign checkpoint and Infinity checkpoint share one local-storage envelope. A supply callback must successfully save both the debit and resulting run before the transition commits. Failed writes leave both unchanged; stale/double callbacks do not debit twice. Legacy Infinity checkpoint keys are read until the new slot is created. The slots remain separate when switching modes, claiming an offer or earning a first-clear reward.
- **Rewards/shop:** Campaign first-clear supplies remain one-time rewards for Infinity; cosmetics remain available to both modes. Shop copy names Infinity, including functional Gear and No Clock. Proposed prices and the one-time free test-claim policy are unchanged; no real purchase integration is claimed.
- **Verification:** automated coverage checks the 12-hint HUD, two free hints before stock, one-time reserve debit, a protected double-crack landing, failed-write rollback, restart/save/resume, both save slots, accepted Stability/shield/continue debits and rejection of purchased supplies for all 30 Campaign missions. All 30 supplied-kit feasibility fixtures remain required.


### 0.7.2 local validation · 11 November 2026

Node 22.23.4: mobile 784/784, game-core 315/315, server-core 211/211 and balance 6/6 tests passed. The focused Campaign/scene run passed 76 tests, including 58 Campaign cases. Workspace typechecking, lint, formatting and Campaign QA, development, staging and production builds passed. A browser test restored previously claimed stock and observed 12 hints at the start of a fresh Infinity crossing; native checks for the final commit remain required on the PR.


## Integration update · 0.7.1 · 11 November 2026

CPI-039 · [tracking issue #109](https://github.com/georgi-cole/crystal-path-infinity/issues/109). The owner approved the reviewed playtest and requested integration into main through a PR.

World browsing retains the six personal signature moves and the calm expression. Selecting a World plays a separate character-specific cheerful move, a happy pose and three brief sparkles. The selection expression lasts longer than the signature beat. Reduced-motion and inactive-card behavior remain supported.

New Campaign attempts use fresh browser-crypto entropy instead of an index-derived fixed seed, with separate route and Mystery cursors. Infinity already draws fresh entropy on new starts. Saved attempts retain their buffers and RNG positions. The mission's required encounter kinds/rows, marked clue sequences and weather schedule remain fixed, so procedural retries cannot remove a required objective. Deterministic seed injection exists only as an explicit fixture/diagnostic argument; all existing feasibility fixtures now name their seed intentionally.

New Journey identities end with `-safe-hints`, including geared/clockless variants. A hint reveals a genuine intact tile when one exists. On a double-broken row it protects one landing for that row without redrawing the hidden route or changing future RNG. It consumes exactly one local or reserve hint. The opposite tile retains its original outcome. The protected landing is saved in the current-row checkpoint and survives reload. The renderer hides competing route cues once a hint is shown. Pre-guarantee saved attempts still validate/resume on their original identity; retry/new attempts use the new hint policy. Official ranked and server rules are unchanged.

The PR includes the complete approved 30-mission playtest, seasonal gear/supplies, material previews and associated documentation. It does not activate live purchases or promote local results into ranked records.

## Current offline build · 0.7 · 11 November 2026

This version adds ten crossings beyond the Far Gate, taking the route to 30 missions and seven chapters. The original twenty mission IDs, rewards, routes and revision-0.3 attempts remain intact. New missions use content revision 0.4 and resume with their saved goals and partial progress. The map still reveals only the current crossing and the next one. An old completed twenty-mission save naturally continues with mission 21; Gatekeeper remains the mission-20 milestone, and Dawnkeeper marks mission 30.

### Missions 21–30

| # | Mission | Season · landing · starting SP / minimum finish | Specific goal | First-clear reward |
|---|---|---|---|---|
| 21 | A Letter from the Stars | Spring · 52 · 180 / 50 | Open both chart caches, rows 9 and 31; rain and a later rainbow on the approach | 1 hint |
| 22 | Pack Light, Shine Bright | Summer · 54 · 185 / 50 | Spend no hints and land the Mirror steps 18–20 cleanly | 25 SP |
| 23 | Handle with Scare | Winter · 56 · 180 / 50 | Use the free row-15 shield cache to block its crack; open the lens cache at 38 | 2 shields |
| 24 | A Fair Trade in Starlight | Summer · 60 · 195 / 55 | Sell one of the two starting hints at 12; follow the remaining hint at 34 | 1 continue |
| 25 | Wish Upon a Bridge | Summer · 72 · 245 / 70 | Open alignment caches 14 and 45; take final beacon steps 70–72 cleanly | Comet Footsteps; Observatory restored |
| 26 | Special Delivery: Dry-ish | Autumn · 56 · 190 / 50 | Collect all three caches, 8, 26 and 46, through gust and squall | 25 SP + 1 hint |
| 27 | Mind the Melt | Winter · 58 · 190 / 55 | Save and use hints at thaw rows 17 and 41; land safely on both | 2 hints |
| 28 | Rainbow Relay | Spring · 64 · 205 / 60 | Link three rainbows: all nine marked steps 12–14, 32–34 and 52–54 after showers | 1 continue |
| 29 | The Night Watch | Autumn · 68 · 230 / 65 | Open free shield caches and block both separate cracked rows, 18 and 47 | 2 shields |
| 30 | Bring the Dawn Home | Spring · 88 · 300 / 85 | Open caches 13 and 51, spend at most one hint and clear final beacons 86–88 | Pearl Lanterns + 2 Season Changes; Dawnkeeper |

All ten permit optional existing supplies/gear. Their mandatory hints and shields are included in the starting kit or placed in free caches on the same row as the challenge. Composite goals require every clause. Repeating one shield row cannot substitute for the other. Unrelated hints do not count as either required hinted landing. Each reward is issued only on the first clear; replay can still earn Mastery under the existing clock, gear and supply restrictions.

The two new cosmetics are independent of the paid Cosmic Style Kit. Comet Footsteps leaves gold comet strokes on cleared panes; Pearl Lanterns hangs small warm lights outside the playable path. Both can be equipped immediately from the completion modal and later from Store → Bridges → Earned on your travels. A whole bridge style can still be selected normally. Existing style IDs and purchases are preserved.

### Preview and character presentation

The preview companion is now a sibling of the bridge inside the same inset scene, with the same 900×700 projection. Its ground point is the current right pane, not the gameplay rest point on the preceding row. Measured calm-pose foot padding is corrected per character; boots/skates register at their sole. This removes the old full-SVG percentage translation and stays aligned at different aspect ratios and across all eight surface outlines.

One shared material-depth function drives both the intact deck and break pieces: wood 11, ice 16, jelly 14, biscuit 12, cosmic 9, original glass 8 scene units. Thickness extends below the existing top surface and does not move hit geometry or change tile outcomes. Cosmic Crossing uses a new dark nebula texture, a slim metallic bevel and delicate star inlays. The gameplay companion/gear layer is fully opaque, with modest saturation/contrast to strengthen the existing artwork without changing the environmental veil. World-card motion now has smaller anticipation, lift, contact and settling beats, synchronized happy poses, a contact shadow and subtle idle breathing. Reduced-motion settings disable the added motion.

The following 0.6.x notes and original twenty-mission outline are retained as dated history.

**0.6.2 presentation and materials · 11 November 2026.** World companions move higher without moving the in-card story and action. Bridge details now use a single full-height illustrated showroom with an in-card title, description, price and actions. The selected mission marker toggles its briefing off on a second click; Full map is removed. Supplies anchors its main action consistently and names the permanent clock product No Clock. Existing IDs and ownership are preserved.

The trampoline is drawn as a projected circular padded rim, individual springs and a stitched fabric bed. Its torn flaps hang inside the surviving frame. Break fragments clip the original full tile face so textures no longer restart on each piece. Timber separates into thick splintered strips; ice retains deep blue faceted sides; biscuit halves expose their cream filling along the jagged crack; jelly keeps its row color and volume while stretching; lily pads curl below their ripples; cosmic tiles collapse through a small ring into dust; original glass scatters brief glints alongside its existing shards. All hit geometry, random outcomes and reduced-motion safeguards remain unchanged.

Trail Scarf completes the six-item Gear collection at a proposed €1.99. It saves 2 SP on a broken step in clear winter/snow and 1 SP during winter thaw. Rain, summer showers and thunderstorms make it heavy and add 2 SP lost per broken step. It has no effect elsewhere. The existing single-item equip, next-run snapshot, ownership, preview-weather and put-away flows apply. Scarf art is character-colored and neck-anchored for all six companions. It suppresses the seasonal neck accessory to avoid overlap. Claims remain free local simulations; no billing or server rules change.

**Offline Beacon Route playtest 0.6.2 · 11 November 2026**

Campaign gives players a place to reach and a bridge they can make their own. Infinity is the endless crossing. The first Campaign follows the light from the Lighthouse to the Far Gate through 20 short missions. Both modes use the same bridge, controls, Mystery system and world art. The missions change the job, starting kit and conditions. Each chapter lights a landmark on a simple route strip.

The new tile baseline is **two independent 50% break chances per row**, with seasons and weather changing those odds. The row targets, Stability budgets, rewards, weather values and proposed prices below are starting points for tests. The [current rules](../CURRENT_GAME_RULES.md) describe the v11 test balance and its scope. The [business plan](../BUSINESS_PLAN.md) contains the existing catalogue references and historical simulations.

<a id="current-offline-build--03"></a>
<a id="current-offline-build--04"></a>

<a id="current-offline-build--05"></a>

<a id="current-offline-build--06"></a>

## Historical offline build · 0.6

**0.6.1 layout and navigation feedback · 11 November 2026.** Open bridge and gear pages allocate the available viewport height to their preview. Bridge descriptions have more room and the main purchase/equip action occupies a full row below the two trial controls. Gear shows its live weather effect once, followed by a compact price and ownership bar. Supply amounts sit next to their titles, and the permanent boost uses a padlock or ownership checkmark beside its title. The artwork has no counter overlay. The World card contains the story, price and selection button in one expanded illustration, with the separate description tray removed. The permanent clock preference is controlled from its own product page. Tab changes replace the current menu history entry and retain its originating menu. Back therefore returns to the entry menu. Older/deep-linked tab history falls back to Home. The menu grouping regression test and Campaign suite passed 46/46 before the final text-only panel simplification.

**Store and material update · 11 November 2026.** Bridges and Gear open a collection, followed by a focused item page with the shared BackButton. A season wheel and illustrated weather medallions change the gear preview. The verdict reads the actual gear effect and shows SP saved, SP lost and safe-step gains. Worlds uses small navigation dots and a character story. Weather & Seasons uses more of the available height.

The eight bridges are World Bridge, Mill Trestle, Frostbank Causeway, Lily Drift, Jelly Path, Bounce Boulevard, Cosmic Crossing and Cookie Crossing. Saved `aurora` and `prism-kit` ownership now equips the replacement trampoline and cosmic designs. Cookie Crossing is a separate proposed €1.99 style. Jelly uses stable per-row colors and a landing wobble. Trampolines flex and give the companion three diminishing bounces in the existing landing beat. Broken trampolines tear, cosmic tiles dissolve into stardust and cookies snap into crumbs. Rain uses individually timed drops, splashes and mist, with rare lightning and a static treatment under reduced motion.

| Offer | Proposed EUR price | Grant |
| --- | --- | --- |
| 500 Stability | €1.49 | 500 reserve SP for eligible 25 SP transfers |
| 10 Hints | €2.49 | Ten single reveals |
| 3 Continues | €0.99 | Three eligible Campaign continues |
| Glasswing Umbrella | €1.99 | Permanent gear |
| Sunshades | €1.99 | Permanent gear |
| Sun Cream | €1.49 | Permanent gear |
| Frost Runners | €2.49 | Permanent gear |
| Storm Boots | €2.49 | Permanent gear |
| Cookie Crossing | €1.99 | Permanent style |
| Play Without the Clock | €7.99 | Permanent unlock with stored on/off choice |

SP, hint and continue prices reuse the existing catalogue. Gear sits below the €2.99 World price, with Sun Cream as the lower entry point. The Irish App Store lists Crossy Road characters around €0.99 and Piggy Bank at €2.99, while Subway Surfers lists €0.99 entry packs and Double Coins at €5.99. These are comparison points for proposed tiers. Crystal Path willingness to pay has not been measured. The owner explicitly selected the permanent €7.99 clock unlock. Preview claims are free, local and one-time per offer. Live billing, ownership verification and restore require separate commerce work. [Crossy Road App Store](https://apps.apple.com/ie/app/crossy-road/id924373886) · [Subway Surfers App Store](https://apps.apple.com/ie/app/subway-surfers/id512939461)

The clock unlock applies when creating new Campaign or Infinity attempts. Its version adds `-clockless` after the optional `-gear` suffix. The core returns no death clock, including after a long idle wait. Tile damage and timed Mystery effects still settle. Supplies can turn the clock on again. Clock-free scores use their own local version key and these runs do not grant Campaign Mastery. Saved attempts retain their snapshot after purchase or preference changes. Tests cover ownership persistence, an idempotent grant, save/resume, an idle wait, old clock behavior and distinct versions.

Campaign and Infinity are the primary home actions. How to Play and Discoveries have separate home entries. The Beacon Route opens as a viewport-height painted map. The large current waypoint and smaller upcoming waypoint open compact briefings. The upcoming crossing is a preview until the current crossing clears. Later stops stay in fog. The two most recent clears are selectable on the map, and the crossing journal opens earlier briefings and replays. An unassisted clear marks Mastery. The Squall road and Echo ridge still share one reward key. The waypoint approach follows [Nintendo’s world map](https://en-americas-support.nintendo.com/app/answers/detail/a_id/63381/).

A successful clear and its reward are saved before a short portal exit. The equipped companion enters the portal, then the translucent results card appears. Black Metal uses the wayfarer figure for this sequence. Reduced motion opens the results directly. Playtest 0.3 used a single revealed waypoint and a manual weather picker. In-progress attempts retain their saved rules.

The map background was generated as a single landscape illustration and saved to `apps/mobile/src/assets/campaign/beacon-archipelago.png`. The brief called for a hand-painted aerial view at blue hour, a warm lighthouse among mossy slate cliffs, dark teal water and crystal outcrops, and blue and lavender fog hiding the undiscovered coast. An open diagonal leaves space for the route overlay and supports a phone crop. Mission and route elements are separate from the illustration.

| # | Crossing | Landing and goal | First clear |
| --- | --- | --- | --- |
| 01 | The Coast Is Clear-ish | Row 24, ≥240 SP | +25 reserve SP |
| 02 | Lens, Actually | Row 36, ≥210 SP, open the lens cache at row 8 | Lens and +1 reserve hint |
| 03 | Two Sparks Ahead | Row 48, ≥200 SP, reveal tiles on two different rows | +1 reserve hint |
| 04 | Light It Up, Keeper! | Row 60, ≥175 SP, final beacon cues | Keeper’s Torches and Lighthouse lit |
| 05 | Puddle Trouble | Row 50, ≥145 SP, three Spring Rain windows and an authored double crack | Spring Rain in Infinity |
| 06 | Dry Socks, Please | Row 34, ≥30 SP, use and follow a hint on wet row 12 | +25 reserve SP |
| 07 | The Hint Heist | Row 37, ≥35 SP, sell exactly one hint at a Marketing deal | +1 reserve hint |
| 08 | One Good Turn | Row 42, ≥65 SP, two rain windows | Copper Rails, +1 continue, Mill restored |
| 09 | Don’t Trust the Shine | Row 36, ≥35 SP, clean Mirror rows 11–13 | Summer in Infinity |
| 10 | One Hint Wonder | Row 40, ≥35 SP, spend at most one hint | +25 reserve SP |
| 11 | Six Steps, No Stumbles | Row 43, ≥40 SP, clean Echo and Mirror phrases | Echo Footsteps and Jelly Path |
| 12 | For Whom the Glass Tolls | Row 50, ≥55 SP, clean final Echo phrase after Shower and Heat | Amber LEDs and Tower restored |
| 13 | Snow Way Across | Row 38, ≥35 SP, two snow windows | Winter in Infinity |
| 14 | Crack Me If You Can | Row 43, ≥45 SP, consume the supplied shield on the marked crack at row 14 | +1 reserve shield |
| 15 | The Frost Mile | Row 64, ≥55 SP, three snow windows | +1 continue |
| 16 | The Great Thaw-Through | Row 56, ≥75 SP, Thaw and Snow | Frosted Glass and Frostbank restored |
| 17 | Chasing Prismtails | Row 42, ≥40 SP, clean prism rows 16–18 | Lily Drift and rainbows in Spring Infinity |
| 18 | Make Mine a Rainbow | Row 53, ≥55 SP, rain then clean rainbow | +25 reserve SP |
| 19 | A Squall or a Long Walk | Row 48 Squall road or row 58 Echo ridge, ≥50 SP | Autumn in Infinity |
| 20 | One Last Light | Row 72, ≥70 SP, clean final three beacons after Squall and Gust | Gatekeeper emblem and Far Gate open |

The route grants **100 reserve SP, three reserve hints, two continues and one shield** over the route. Eligible crossings allow one 25 SP transfer, reserve hints after supplied hints run out, one shield, and one continue on a fall. A double crack preserves the reserve hint. A continue keeps the same route and objective progress, clears active effects, and returns half the starting Stability rounded up. The active mission definition, route cursor, objectives, spends, and first clear are committed together in one local save. Existing 0.1 and 0.2 in-progress crossings keep their saved rules and goals.

Plain Infinity uses independent 50% odds. Earned seasons use Spring 50%, Summer 55%, Winter 45%, and Autumn 55% in clear conditions. The eight episodes below use versioned odds and cues, with at least 24 clear rows between Infinity episodes. Spring Rain can lead to Rainbow after two clear rows once earned. Discovered seasons rotate on new runs in spring, summer, autumn, winter order. Clear Sky applies until the first unlock. Each season has its own local record. A Season Change advances the next new Infinity run by one unlocked season. Active and saved crossings retain their weather. Heat glints point to the opposite landing; left and right inputs always select the tile tapped. Authored mission cues can guarantee a safe or cracked tile independently of ambient weather.

Store opens on the swipeable Worlds carousel with Black Metal and the six companions. Each companion has a signature move on arrival and a happy animation on selection. The chosen World stays visible beneath seasonal scenery, lighting, weather and companion accessories. Foreground assets stay to the sides of the active path. Bridges previews the same deck textures, supports and break animations used in crossings. Mill Trestle splits into jagged boards, Frostbank ice sheds chunky shards, Lily Drift plunges with ripples and droplets, and Jelly Path stretches and splats. Wood, ice and jelly have shaded depth faces. Bridge selection symbols are small material models with the same texture atlas. Ivy Lantern Walk was available in 0.4 and was removed in 0.5 at the owner’s request. Earned Keeper’s Torches remain lighting on the equipped bridge. Jelly Path is earned alongside Echo Footsteps at mission 11, including profiles that already cleared that mission. Saved attempts retain their mission snapshots. Aurora and Prism keep their distinct glass architecture. The style-part mixer is available in the offline playtest. Deck geometry and decoration preserve tile outcomes and interaction areas. The art direction draws on the Sackboy development team’s use of physical materials and Ember Lab’s woodland setting. [Sackboy materials](https://blog.playstation.com/2023/04/13/platformer-multiplayer-and-music-fans-why-sackboy-a-big-adventure-is-a-must-play/) · [Kena environment](https://emberlab.com/bridge/)

The built-in image tool made the atlas from this art brief: a 2-by-2 canvas of four wide glass-bridge environments joined at their center lines. A copper watermill above a misty teal river, a bell tower on amber cliffs at sunset, a blue observatory across a snowy gorge, and a warm gate among russet and violet ridges. Upper-center landmark silhouettes, open space below for labels, luminous facets, dark ink-blue shadows, and atmospheric perspective. No text, borders, people or UI in the image.

### Trail Outfitters and weather copy

Discoveries includes Weather & Seasons. In 0.5 it shows unlocked seasons and short descriptions of their visible effects. The Season Change balance and use action are in Store → Supplies. The guide omits cycle timing and sequencing. The forecast and crossing HUD use short player-facing remarks and visible cues. Thunderstorms add a soft distant flash, with a static treatment under reduced motion. Discovery card emblems gently float and turn when both app and operating-system motion preferences allow it.

| Equipment | Helpful | Drawback |
| --- | --- | --- |
| Glasswing Umbrella | Reduces a wrong step’s damage by 3 SP in Spring Rain and Summer Shower. | Adds 2 SP damage in a Leaf Gust or Autumn Thunderstorm. |
| Sunshades | Correct the reflected clue and reduce wrong-step damage by 2 SP in Heat. They reduce it by 1 SP in Thaw. | Add 2 SP damage in Snow or Thunderstorm. |
| Sun Balm | Reduces wrong-step damage by 3 SP in Heat. A clean step on a clear Summer row gains 1 SP. | Neutral outside those conditions. |
| Frost Runners | Reduce wrong-step damage by 2 SP and give 1 SP per clean step in Snow. | Add 2 SP damage in wet weather, Thaw, Leaf Gust and clear Summer. |
| Storm Boots | Reduce wrong-step damage by 2 SP in wet weather and by 1 SP in Leaf Gust or clear Autumn. | Add 2 SP damage in Snow. |

Pack one owned item before a run. Bringing it out or packing it away on the bridge takes effect after the next successful landing. Weather still draws both tile outcomes independently before display. Gear affects landing Stability or the readable glare cue and never rerolls the row. Shield effects settle first. Campaign uses gear on crossings that allow supplies, and a supplied-kit mastery clear starts without gear. Infinity keeps a separate Outfitted record for each forecast. Gear previews use the same scene renderer. The companion, season and weather controls show how the item looks and behaves under the selected conditions.

Bridges previews Aurora Glass and the Prism Style Kit at proposed prices. Supplies shows owned reserves, with an Add more action per resource. Each action opens a separate Restock view with a large product illustration, quantity, benefit, proposed price where defined, and a clearly labelled free local test claim. A compact illustrated shelf browses the other offers. The split draws on Supercell’s separation of stored magic items and its Trader, plus Brawl Stars’ product previews. Test grants are one-time per local profile and free. Listed prices are proposed release prices. Billing, verified entitlements, restore and refunds are separate release work. [Magic items and the Trader](https://support.supercell.com/clash-of-clans/en/articles/magic-items-and-the-trader.html) · [Brawl Stars skins](https://support.supercell.com/brawl-stars/en/articles/skins-8.html)

Gear uses the existing companion pose anchors. In 0.5 the umbrella shaft renders behind the body, with its canopy and grip in front. Shaded lenses follow the eyeline and the footwear scales for each companion. The offline Campaign Profile explains that its saves are local. This mode starts App without account services, while the player entry point retains its account-service and native-identity path.

| Offer | Proposed price | Playtest behavior |
| --- | --- | --- |
| 10 Shields | €0.99 | Add ten reserve shields. Activate one in an eligible assisted Campaign crossing to absorb one crack while active. |
| 10 Season Changes | €1.99 | Requires two unlocked seasons. Each charge advances the season of the next new Infinity run. |
| Unlock All Seasons | €4.99 | Unlock all four seasons and make Season Changes available. Campaign objectives and other rewards still use Campaign progress. |

### Generated playtest assets

**0.6.1 final browser verification.** The merged World card, in-card selection button, unobstructed supply illustrations, inline amounts and locked padlock were checked in the served preview. The larger bridge/gear previews and single live gear warning were checked on a phone viewport. The Home → Discoveries → Weather & Seasons → Back flow returned directly to Home. The integrated World selection button was exercised in the isolated test profile. Formatting, targeted lint, mobile typechecking and the Campaign build passed. Browser screenshots are stored with the task verification artifacts.

**0.6 verification · 11 November 2026.** Node 22.23.4 mobile tests passed 758/758 and core tests passed 315/315. After adding coverage for gear together with clock-free play, the focused Campaign suite passed 34/34. Workspace lint and formatting passed, and Campaign plus production web builds passed. The final Campaign build includes the material support-bar cleanup. Browser checks covered the collection/detail navigation, eight bridge options, trampoline contact animation, cookie break, colored jelly, revised gear art, changing weather benefits and drawbacks, and the permanent clock claim with reload and on/off control. The served preview metadata is 0.6 on base `3e82d72`. Native-device acceptance and live purchases require separate release checks.

**0.6 generated materials and shop props.** The built-in image tool created the following workspace assets. PNG outputs were encoded as lossless WebP. The prop sheet uses a second background-removal edit, with zero-alpha corners verified before integration. The two new synthesized cues are `trampoline-tear.wav` and `cosmic-break.wav`. Cookie breaks reuse the wooden crack at a higher pitch.

- `apps/mobile/src/assets/campaign/playful-material-atlas.webp` uses this generation prompt. Create ONE production texture atlas for a premium whimsical fantasy mobile bridge game. Perfectly square image, exact 2 by 2 grid of four equally sized seamless material squares. Each cell completely full-bleed, touching adjacent cells at exact center divisions, no borders, words, labels, icons, text, frames, gaps or perspective. Camera straight overhead orthographic. TOP LEFT deep midnight indigo cosmic glass, subtle nebula in purple and teal, small fine bright stars and drifting stardust, readable broad dark areas, richly tactile polished stone depth. TOP RIGHT warm golden baked butter biscuit surface, delicate pores, toasted edges implied only through texture, tiny chocolate flecks, subtle waffle embossing, appetizing credible baked material. BOTTOM LEFT taut dark midnight blue trampoline woven elastic fabric, fine dense realistic textile weave with a restrained central gold stitched circular ring, broad clean middle, no metal frame. BOTTOM RIGHT smooth translucent fruit jelly in soft coral-pink, believable tiny suspended bubbles, soft subsurface lighting and glossy micro highlights, no actual objects. Polished painterly 3D game surface materials that read on a phone, coherent soft lighting from upper left, high material clarity. Only four material surfaces. Runtime code provides tile shape, depth, animation and perspective. Jelly uses the fourth material cell with bubble geometry and per-row hue variation.
- `apps/mobile/src/assets/campaign/gear-shop-atlas.webp` uses a 3-column, 2-row transparent sheet with six props. The generation prompt specified exact cell centers, generous padding, handcrafted 3D materials, warm brass details and upper-left light. The top row contains an open teal and amber cloth umbrella with curved bronze handle, chunky green sunglasses with dark blue reflective lenses and gold hinges, and a round amber sun cream tin with a sun motif. The bottom row contains violet and pale-blue roller skates with frosted wheels and brass buckles, blue rubber rain boots with gold trim and a leaf buckle, and a brass pocket watch with a glowing infinity symbol in place of hands and a burgundy ribbon. No characters, words, price tags, borders or ground planes.
- The final edit prompt for the prop sheet was to remove the entire pale white background, preserve all six objects and their precise cell placement, make the background, corners, cell gaps, handle holes and spaces through the glasses and ribbon fully transparent, and preserve the exact 3:2 composition without recoloring or moving the props. This cleaned sheet supplies the collection illustrations and permanent clock-unlock artwork.

**0.5 art, sound and verification · 11 November 2026.** The new Restock sheet uses true alpha and six equally sized cells. The existing material atlas supplies bridge textures and miniatures. Jelly uses live shaded geometry and contact animation. Original synthesized `jelly-break.wav` and `wood-break.wav` accompany nonfatal failed landings. Ice uses the existing crack cue at a lower playback rate. Material cues respect mute and foreground lifetime. The summer visor gives way to equipped sunshades, preserving seasonal rain clothing in showers.

The branch was fast-forwarded to `3e82d7298dd40c91bbd2c8b7749d6103d5a6c17c`, including the new web email-code sign-in work, while preserving the Campaign changes. On Node 22.23.4, mobile tests pass 755/755, core tests pass 315/315, server-core tests pass 207/207, and balance checks pass 6/6. Workspace typechecking passes. Browser checks covered 390×844 and desktop layouts, all four material previews and break actions, fitted umbrella and sunshades, the weather guide, and the explicit offline Profile. A local test pack moved Hints from 0 to 10 and disabled the already-claimed offer. In the served preview the Discovery emblem reports `cpi-journal-emblem-drift` with a running animation. Device-native visuals, live sign-in and real purchases require their own release checks.

**0.4.1 art and sound pass.** Autumn reuses the textured maple leaf and adds small vector silhouettes for oak, birch and willow. Copper, gold, rust and olive leaves drift at different rates. An edge mask keeps the center clear. The lily texture is mapped onto the projected pad silhouette inside the standard lane. The rendered pad has a raised edge and soft water beneath it, and a failed landing sinks it through two expanding ripples. The original short synthesized `apps/mobile/src/assets/campaign/lily-splash.wav` plays for nonfatal missed Lily Drift landings and respects the usual audio settings. Hit areas and rules carry over from 0.4.

The built-in image tool generated these assets. The workspace copies use lossless WebP encoding.

The final 0.5 checks passed workspace lint, formatting, typechecking, the Campaign build, and development, staging and production web builds. The CI routing tests passed 15/15, the Pages account-configuration tests passed 2/2, and planning validation plus 13 Python tests passed using the installed `python` executable. The Windows `python3` alias was unavailable. An initial production build overlapped another build’s output copy and failed with a file lock. The subsequent sequential production build passed. The Campaign preview was refreshed at port 4178 and its metadata confirms version 0.5 on base `3e82d72`.

- `apps/mobile/src/assets/campaign/supply-pack-atlas.webp` · One game asset: a transparent 3-column by 2-row product illustration sprite sheet for the Wayfarer's Market in a premium handcrafted fantasy bridge game. EXACT six equally sized SQUARE cells on a 3:2 canvas, centers at x=16.67%, 50%, 83.33%, y=25% and 75%. Each cell has one independent game-shop prop, centered, with very generous true transparent safety space on all four sides, no overlap, no border or gridlines, no background, no words, no labels, no prices. Three-quarter view with lovely tactile painted textures, dark ink shading, bright dimensional highlights and warm gold details. Top-left: a rounded amber glass stability elixir with cork and tiny sun charm. Top-middle: a cluster of ten small pale mint and lilac guide crystals, neatly tied in a pouch with star clasp. Top-right: a brass rewind watch with a coral ribbon and two little engraved return tokens. Bottom-left: a cute stack of three chunky celadon and violet enchanted shields, bright gold edge, shield motifs only. Bottom-middle: a hand-sized amber hourglass cradled by a maple leaf and snowy charm. Bottom-right: a beautiful little four-season compass in bronze, four enamel motifs showing spring blossom, golden sun, red leaf, frosted snowflake. Illustrated game icon pack, friendly and collectible, interesting readable silhouettes, no characters, no price tags, avoid clutter. Transparent alpha; each cell must fit within 76% of its own square.
- `apps/mobile/src/assets/campaign/bridge-material-atlas.webp` · Create ONE production game texture atlas as a perfectly square 2x2 grid of four equal square seamless texture swatches with ZERO gutters or borders, no labels, no text, no perspective, straight overhead orthographic. TOP LEFT: richly detailed hand-hewn cedar planks with iron rivets and restrained gold light, planks running left to right with obvious wood grain. TOP RIGHT: stone stepping surface overgrown with pale green ivy and round velvet moss, distinct visible leaves around edges. BOTTOM LEFT: solid opalescent icy turquoise ice block surface, luminous pale internal veins, snow dust in corners, high clarity at game size. BOTTOM RIGHT: a single broad round jade lily pad centered taking up almost the entire square, notched green leaf, tactile branching veins, dew drops with very dark teal water in corners. Four equal full-bleed quadrants tightly abut exactly halfway, clean consistent 2x2 grid. Polished painterly 3D environment game materials, clear large detail for a phone screen, dramatic micro-surface lighting. Neutral even overall illumination so live status markings can be read. No other objects, signs, or characters. This is for the actual bridge tile surfaces, with code supplying tile shape and perspective.
- `apps/mobile/src/assets/campaign/maple-leaf.webp` · A single isolated premium 3D game sprite of a realistic Canadian maple leaf with an elegant small curved stem, amber red tip and orange center, intricate believable veins, gently curved edges as if tumbling sideways in soft light. Camera mostly overhead with one pointed lobe raised and a little foreshortening. Detailed but readable as a small flying leaf in a fantasy adventure environment. One solitary leaf, tightly framed with transparent margin, true alpha background. No shadow on the ground, no other objects, no letters, no additional leaves.
- `apps/mobile/src/assets/campaign/season-dressing.webp` · Create a single true-alpha TRANSPARENT square atlas of 4 separable hand-painted premium fantasy game edge-dressing assets, arranged in a precise 2 by 2 grid of four equal square quadrants. Each quadrant contains ONE separate independent cluster, centered within its quadrant with at least 6% empty padding on all sides, no touching between clusters. They are near foreground set dressing that will appear at the outer edges of an adventure game's bridge, never as a background. Top-left SPRING: irregular stone base covered in soft velvet moss, ferns and small pink ivory blossoms, curved emerging tender vines. Top-right SUMMER: handsome sun-warmed sandstone with golden tall summer grasses and small warm flowers, glowing dusty light highlights on the grass. Bottom-left AUTUMN: slate base with beautiful copper maple leaves and dark russet shrubs, layered fallen leaves, moody lighting. Bottom-right WINTER: dark rocky slate dressed with physical white snowbanks and three icicles, soft powder and blue ice. Each object clustered silhouette, three-quarter view, edges clearly defined, base broad and low. Polished painterly render with cinematic material depth, credible shapes, light source above left. No game UI, text, icons, characters, borders or backgrounds. True transparent alpha around all four silhouettes. Atlas cells are at exact square quarter positions.

## Offline playtest implementation · 10 November 2026

**Historical first cut · `campaign-qa` 0.1.** The following records the first implementation before its goals and home presentation were revised.

The first slice is now implemented behind the separate Vite mode `campaign-qa`. It is a browser/offline playtest profile and does not replace v11, production, ranked, account, ad, purchase or server behavior. Its local save prefix is `cpi.campaign-qa.v1:`. The standard QA wallet/provider is deliberately not mounted in this mode.

| Playtest piece | Implemented behavior |
| --- | --- |
| Home | A temporary standalone Campaign/Infinity mode picker. This was superseded by the 0.2 home integration below. |
| Infinity | New runs use `infinity-v12-tiles-50-50-plain`: every tile independently has a 50% break chance. Per row, 25% are both intact, 50% mixed, and 25% both broken. The ruleset stays fixed on restart. |
| Missions 1–4 | First Steps: row 8, +25 reserve SP; The Lost Lens: resolve a Mystery and reach row 12, lens marker and +1 reserve hint; Focus the Beam: use hints on two different rows and reach row 14, +1 reserve hint; Light the Lighthouse: reach row 18, unlock Keeper’s Torches and light the beacon. |
| Mission 5 | Rain on Glass: reach row 18 under Spring Rain. Rain raises each independent tile break chance to 60%, giving 16% both intact, 48% mixed and 36% both broken. A cool, low-opacity rain pass leaves tiles and controls visible. Clear completion unlocks Rain as an optional Infinity weather preset. |
| Local loadout | The player may load one earned +25 SP reserve or one reserve hint into a mission start. Torches can be equipped or removed freely after mission 4 and decorate the bridge rails in either mode. |
| Mission flow | Route order is gated; each mission has a stable route seed and free retry. Objective events distinguish hints and Mystery resolutions. First-clear rewards are idempotent; replay cannot grant them twice. In-progress mission checkpoints and Infinity checkpoints have separate local slots. |
| Build commands | `npm run dev:campaign-qa`, `npm run build:campaign-qa`, and `npm run preview:campaign-qa`. The standalone build outputs to `apps/mobile/dist-campaign-qa`. |

This slice intentionally contains five missions, one weather, reserve SP/hint loadouts, and the torch cosmetic. The larger table below remains a proposal: no full season calendar, scripted tile moments, continues, paid boosts, paid tiles, trail/stack store or online service is implemented here. The first four routes currently use the same 50/50 independent tile rules; only Mission 5 and the optional Infinity rain preset use 60/60. Rewards are device-local test inventory, not purchasable entitlements or a production economy. All test attempts preserve the ruleset they started with.

## Historical offline playtest · 10 November 2026 · `campaign-qa` 0.2

The first build showed how the five tests played. This iteration raises their goals and integrates them into the existing game shell. It does not change v11, production, server or store behavior.

| Playtest piece | Current behavior |
| --- | --- |
| Home | Retains Crystal Path’s existing bridge art, Infinity title, record panel, header controls and navigation layout. The existing main action starts or resumes Infinity; its second action opens Campaign. |
| Infinity | Uses the shared crossing renderer and controls with independently generated 50% break odds per tile. Spring Rain, once unlocked by Campaign, uses 60% per tile. |
| Lighthouse missions | First Steps: row 24 and at least 240 SP; The Lost Lens: resolve a Mystery, reach row 36 and keep 210 SP; Focus the Beam: use hints on two different rows, reach row 48 and keep 200 SP; Light the Lighthouse: reach row 60 with 175 SP. Each uses 50% independent tile odds. |
| Rain crossing | Rain on Glass: cross Spring Rain, reach row 50 and keep 145 SP. Each tile has 60% break chance. First clear unlocks Spring Rain as an Infinity option. |
| Mystery ladder | Cleared stops remain as compact lit marks. Only the next mission shows its name, objective and first-clear reward. Further stops are sealed caches with no exposed mission names, conditions or prizes; each cache opens into the next mission after a clear. |
| Atmosphere | A bespoke crystalline coast illustration anchors the route. Recovering the lens adds its glint; clearing the Lighthouse projects a beam; equipped Keeper’s Torches mark the bridge in the preview; the rain mission darkens the sky and adds restrained diagonal rain. Gameplay rules and tile cues remain unobscured. |
| Mystery assets | Locked stops use the same sealed Mystery Cube artwork as the crossing. When a box becomes the next mission, its existing open animation accompanies the revealed name, goal and reward. Later boxes remain identical and reveal no contents. |
| Cosmetics | Keeper’s Torches have an on-map preview and appear along the bridge in both modes when equipped. Tile, rail and trail shop items remain future work; they should preview on the same actual bridge renderer before purchase, not as detached swatches. No cosmetic purchase is active in this build. |
| Rewards | The existing test inventory grants +25 reserve SP; a lens marker and +1 hint; +1 hint; optional Keeper’s Torches; and Spring Rain. Supplies are local, first-clear only, and not paid entitlements. |
| Attempt versioning | Each started crossing stores its mission goal, Stability floor, weather, ruleset, objective and reward. An unfinished attempt keeps that snapshot through a playtest update; new attempts use the current content. Existing 0.1 saves migrate with the original row 8/12/14/18/18 goals and no Stability floor. Historical scores are not recalculated. |
| Build commands | `npm run dev:campaign-qa`, `npm run build:campaign-qa`, and `npm run preview:campaign-qa`; output remains in `apps/mobile/dist-campaign-qa`. |

The 0.1 and 0.2 tables record the first two implementations. The current 0.3 goals appear above.

## What to borrow from other games

| Example | Design decision for Crystal Path |
| --- | --- |
| SYBO separates Classic Endless from City Tour. A City Tour level has three objectives, preserves partial objective progress, and Normal clears unlock harder levels with higher rewards. [SYBO on missions and rewards](https://sybo.helpshift.com/hc/en/9-subway-surfers-city/faq/261-missions/) · [SYBO on its two modes and difficulty unlocks](https://sybo.helpshift.com/hc/en/9-subway-surfers-city/faq/292-classic-endless-run-vs-city-tour-new-game-styles/) | Keep the endless score chase and finite Campaign distinct. Show a goal and its reward before a level, then reveal the next step through progress. |
| Vampire Survivors Adventures remix existing content into short chapters with their own setup, win conditions and unlock path; completed Adventures can be ascended for a fresh pass with adjusted rewards. [Poncle’s Adventures FAQ](https://poncle.games/adventures-faq) | Reuse the bridge and route engine. Vary the objective, starting kit and forecast instead of commissioning a new level for every mission. Keep later missions sealed until the current signal is reached. |
| Team Alto uses distinct biomes with their own visuals and gameplay, plus changing lighting and weather, inside a one-touch endless runner. [Alto’s Odyssey official press kit](https://altosodyssey.com/press/) | Give each season a cohesive horizon, palette and ambient layer. Let a weather episode briefly modify the familiar bridge and make its rules readable before it matters. |
| ustwo’s Monument Valley team treated each screen as a composed work of art and approached game design as user experience; visual detail and animation stay restrained so discovery carries the emotion. [ustwo’s design notes](https://ustwo.com/blog/monument-valley-out-now/) | Give the mission hub one strong focal scene, one clearly active goal and low-noise supporting detail. Keep the existing Home composition and controls recognizable. |
| Hill Climb Racing 2 adds a Vehicle Styles collection where cosmetic effects can be mixed, including tire marks, trails, name effects, auras and gauges. [Fingersoft’s Vehicle Styles notes](https://fingersoft.com/news/2026/05/26/patch-notes-hcr2-v1-73-0/) | Build a small set of bridge-style slots—tile surface, rails, lighting and trail—with real-time bridge previews. Sell durable looks and avoid selling odds or hidden mission outcomes. |
| Jetpack Joyride offers different utilities at the points where they help, including Quick Revives after a loss. [Halfbrick’s utilities guide](https://halfbrick.helpshift.com/hc/en/4-jetpack-joyride/faq/707-what-are-utilities-and-how-do-they-work?s=utilities) | Show a continue at a fall and a hint at a tile. Let the player see their balance and spend explicitly. |

## What the player sees

- **Home.** Preserve the existing Crystal Path home: bridge preview, record panel, controls and familiar action layout. Infinity remains the main endless action; Campaign occupies the existing secondary action in the offline test build.
- **Missions.** The crystalline coast illustration gives the route a place and mood. Cleared missions become compact lit marks. The next mission alone is fully revealed with its objective, Stability floor and first-clear reward. Everything farther along the route uses the game’s own sealed Mystery Cube art. Each cache opens into one mission after its predecessor is cleared, and no future prize is exposed early.
- **On the bridge.** The HUD gives one short goal with progress, such as **Reach the mill with 40 Stability** or **Chords 1 of 2**. A forecast shows the rows affected. On success the run stops at the landing, the reward is recorded, and **Equip** or **Next mission** is available immediately. If a required goal is missed at the landing, the result says which one and offers a retry.
- **After the Lighthouse.** Lighting it equips nothing automatically. The player can put their new torches on the bridge, then follow the beam to the Mill’s first rain crossing. After mission 20, the map shows the restored chapter, replay mastery and a link to Infinity. Future missions arrive in ordinary app updates.

The first route is local and playable in airplane mode. A mission uses a fixed starting kit and a fixed route on retries. Ordinary completion earns the listed reward with any assistance the mission allows. The Lighthouse introduction and shield lesson use their supplied kits. Longer missions such as 15, 19 and 20 are the first candidates for optional paid assistance once verified spending is available. Optional mastery uses the supplied kit and zero continues. It can add a displayed target, such as finishing mission 20 with at least 25 Stability. Built-in clues and hints count as part of the kit. Mastery grants a visible mark, with the consumable budget tied to first clears.

## Original 20-mission outline

A row target means that many cleared rows in the attempt. A clean step means selecting an actually intact tile. A shield can protect Stability on a wrong step, which still counts as a break. Every mandatory Mystery result or pattern uses a scripted setup or a tested seed. Each main mission must demonstrate a free clear using its supplied kit before release. The harder missions make a continue or a reserve useful by giving the player a longer crossing worth saving.

| # | Mission | Clear condition and change to the bridge | First-clear reward |
| --- | --- | --- | --- |
| 01 | First Steps | Reach row 8 on a forgiving stretch. | +25 reserve SP |
| 02 | The Lost Lens | Open the guaranteed Mystery box and reach row 12. | Lighthouse lens appears on the map |
| 03 | Focus the Beam | Follow both supplied hints on two different rows and reach row 14. | +1 reserve hint |
| 04 | Light the Lighthouse | Reach the lighthouse landing at row 18. The final stretch has a visible approach cue. | Keeper’s Torches lighting and Lighthouse lit |
| 05 | Rain on Glass | Reach row 18 through Spring Rain. A scripted moment teaches that two cracked tiles can still be crossed at a Stability cost. | Rain in the offline weather rotation |
| 06 | Dry Foothold | Use a supplied hint on a wet row, take the revealed tile, and reach row 22. | +25 reserve SP |
| 07 | A Bargain at the Mill | Sell one starting hint at a guaranteed Marketing deal, then reach row 24. | +1 reserve hint |
| 08 | Turn the Mill | Reach row 28 with at least 40 of 70 starting Stability. The route has readable wet stretches. | Copper Rails, +1 continue and Mill restored |
| 09 | Sun on the Cliffs | Cross three reflected clue rows in a Summer Heat Surge and reach row 20. | Summer and Sun in the offline weather rotation |
| 10 | Save a Hint | Reach row 26 after spending at most one hint. Use the free row cues to plan the other steps. | +25 reserve SP |
| 11 | Two Clean Chords | Play one three-step Echo pattern and one three-step Mirror pattern cleanly, then reach row 28. | Echo Footsteps trail |
| 12 | Ring the Tower | Reach row 34 through a Summer Shower and a Heat Surge. Cross the final three Echo steps cleanly to ring the tower. | Amber LEDs lighting and Tower restored |
| 13 | First Snow | Reach row 22 through Winter Snow. | Winter and Snow in the offline weather rotation |
| 14 | Trust the Shield | Take the guaranteed shield, let it absorb the marked training crack, then reach row 30. | +1 Shield charge |
| 15 | The Long Crossing | Reach row 44 across alternating clear and snowy sections. The fixed route makes retries learnable. | +1 continue |
| 16 | Frostbank Landing | Reach row 40 with at least 30 of 65 starting Stability through Winter Sun and Snow. | Frosted Glass tile finish and Frostbank restored |
| 17 | The First Rainbow | Follow three rainbow-lit safe tiles and reach row 28. | Rainbow in the offline weather rotation |
| 18 | After the Rain | Cross a rain window, follow the next rainbow span cleanly, and reach row 38. | +25 reserve SP |
| 19 | Two Ways to the Gate | Choose a 38-row route through an Autumn Squall or a 46-row route with readable patterns and a Leaf Gust. Clear either approach. | Autumn and Leaf Gust in the offline weather rotation |
| 20 | Light the Far Gate | Reach row 52 through Squall, Gust and Squall windows with clear stretches between them. Cross the final three marked steps cleanly. | Gatekeeper emblem and Far Gate restored |

The two approaches in mission 19 are two presets on a single mission card. Either completes the same mission ID and unlocks mission 20. An initial balance target is roughly a minute per early mission and a few minutes per late mission, measured on phones before committing to the row counts. Campaign can set starting Stability and starting hints per mission. Short missions at the v11 test start of 300 SP would often be too forgiving for a resource goal.

## Rewards and Bridge Style

| Reward | Grant, use and limits |
| --- | --- |
| Reserve SP | Four grants of +25 SP across the route. Store the balance in the Campaign satchel. A player taps **Use 25 SP** while alive, and one charge is deducted when applied. Start with one transfer per attempt. |
| Reserve hints | Two single-charge grants. A player explicitly chooses the reserve after the mission supply is exhausted. Deduct a charge only when a new safe tile is successfully revealed. Ordinary supplied hints are separate, and missions with a fixed hint budget count all reveals used from either supply where applicable. |
| Continue | Two earned credits total. At a fall, offer **Use 1 continue** alongside **Retry free**. On success it returns to the same row on the same route with a published mission revive amount, provisionally half the starting Stability rounded up. It keeps completed objectives and clears temporary effects. One successful continue per Campaign attempt. |
| Shield | One charge after the shield lesson. The player activates it explicitly. Spend the charge when the existing five-active-second shield is applied. It blocks one wrong-step hit during that window and expires visibly. A second shield cannot stack on an active one. |
| Style and emblem | Save ownership permanently on the device after the first clear. Preview the result and optionally equip it immediately for the next crossing. The style can be removed and re-equipped freely. Emblems appear on the map and results. |
| Weather and season | Clearing an introduction adds that weather to local Infinity. Winter and Autumn add new forecast presets when earned. Choose an unlocked season or cycle through them across new local runs. Campaign uses the season and weather named on each mission card. |

The full route grants **100 reserve SP, two reserve hints, two continues and one Shield**. A single save update records the first clear and its reward together, so reopening, retrying or replaying a completed mission keeps one grant. Campaign has its own power inventory. Both modes can use the same cosmetic loadout.

**Bridge Style** has a World preset and four override slots. **Tiles** changes the glass texture, edges and break animation across the whole bridge. **Rails** changes the bridge walls. **Lighting** swaps torches and LEDs. **Trail** changes the footsteps behind the player. A single bridge preview updates instantly when selecting a look, with a reset to the chosen World preset. Palette, materials and trailing effects sit underneath fixed cracked, hinted and weather symbols. Each tile finish shows the same states using the same readable symbols. Mechanical odds come from the mission or Infinity forecast. Frosted Glass and paid tile finishes fit any forecast.

## Weather and seasons

Each ordinary tile is drawn independently before the row appears. Under the clear Spring forecast, **25% of rows have two intact tiles, 50% have one of each, and 25% have two broken tiles**. A blind pick still breaks 50% of the time, with a 5 SP base hit for a brittle tile. A player can survive a broken step and advance. When a hint finds two broken tiles, it tells the player both are cracked and keeps the charge. When both hold, the hint can still point out one valid tile. The existing [QA comparison](../analysis/tile-balance-2026-11-06/README.md) already includes independent 50% / 50% for an entire run. Per-row weather and season profiles extend that generator.

### Season ambience

| Season and clear odds per tile | What the crossing looks and sounds like | First appearance and ownership |
| --- | --- | --- |
| **Spring · 50%** | Cool green morning light, dew along the rails, a little mist below the bridge, and soft water sounds. Small petals drift outside the path. | Default for the Lighthouse and Mill. |
| **Summer · 55%** | Amber rock, clear views, heat shimmer on the horizon, and a warm air hum. Glass edges take on a warmer reflection. | Mission 09 teaches Summer. Clearing it adds Summer to Infinity. |
| **Autumn · 55%** | Copper dusk, dry leaves on the outer corners of some tiles and along the rail, and low gusts that send the leaves skittering outward. The center of each tile stays clear. | Mission 19 teaches Autumn. Clearing either approach adds Autumn to Infinity. |
| **Winter · 45%** | Blue twilight, frosted rail tops, flakes drifting behind the bridge, and quieter wind. Frost outlines the tile edges. | Mission 13 teaches Winter. Clearing it adds Winter to Infinity. |

Use a season layer over the chosen World. Its palette and ambience apply to the surroundings. A weather layer animates within it. Tile symbols and the HUD draw on top. A small leaf at a tile corner is decoration and can appear on either side independent of the route. Cap decorative density, keep the tap area legible, and use the existing sound and reduced-effects controls for ambience. Reduced effects can substitute static badges for moving particles and glare. Glyphs and text carry the rules in both settings.

### Short weather profiles

| Season and window | Rows | Break chance per tile | What changes |
| --- | --- | --- | --- |
| **Spring Rain** | 6 | **60%**, +10 percentage points | Fine rain and drips at the bridge edge. Glass breaks more often. Both tiles break on 36% of ordinary rows in this window. |
| **Spring Rainbow** | 3 | **0%** on the prism side, **50%** on the other | A rainbow forms after a rain window and guarantees one intact tile on each of three rows. A prism glyph marks each side in turn. The free reveal preserves the hint balance. |
| **Summer Heat Surge** | 3 | **65%**, +10 percentage points | The horizon shimmers and a Mirror glyph warns of reflected clues. The clue points opposite one intact tile, when available. Read it and tap the side you want to land on. If both are brittle, the cue shows cracks. A regular hint still marks a true safe side when one exists. |
| **Summer Shower** | 4 | **60%**, +5 percentage points | A brief shower with warm reflections and drops at the rail. Its forecast shows a shorter, gentler wet window than an Autumn Squall. |
| **Autumn Leaf Gust** | 3 | **55%**, the clear Autumn odds | Leaves sweep off the tile edges and out of view. On the first row, a separate gust glyph marks one intact side if available, or shows two cracks. The other rows play normally. |
| **Autumn Squall** | 6 | **65%**, +10 percentage points | Wind pushes rain diagonally beyond the bridge and the rails darken. The rule uses the same wet-glass system as Spring Rain, with the Autumn baseline. |
| **Winter Snow** | 6 | **29.25%**, because ice hardens 35% of otherwise brittle tiles | Frost spreads along the edges and the bridge gets quieter. Each side can benefit independently. Both tiles break on about 8.6% of ordinary rows in this window. |
| **Winter Sun** | 3 | **50%**, +5 percentage points | Low white sun and receding frost show a brief thaw. Thaw raises break odds from the Winter baseline. The forecast calls it **Thaw** to distinguish it from a Summer Heat Surge. |

The season supplies the base odds, and one weather profile adjusts them for the named rows. For Winter Snow, 45% × 65% gives 29.25%. Keep the hit size separate. The HUD shows a short forecast such as **Winter Sun in two rows · Thaw for three rows**. Details show the exact per-tile chance. The forecast and its draw schedule are set by the saved season, version and seeds. Keep the already-generated outcomes across pause, resume and retry. Draw both sides independently for ordinary rows. Use a separate presentation layer for gusts and particles.

The eight profiles share the same palette, particles, audio, tile-odds and clue components. Summer and Winter sun use the same light layer with different amounts, colors and rules. Rain uses one effect with different direction and intensity. Leaf Gust and Rainbow share the existing safe-reveal presentation. For Rainbow, pick the prism side independently of the two break draws, then make that side intact. The other side keeps its Spring odds.

Mandatory clean phrases and training setups use prevalidated seeds or explicitly authored rows. A required clue sequence must have an intact solution, and a required hint needs a real tile to reveal. The mission builder accounts for unavoidable hits on ordinary double-brittle rows. For example, the test route for the Mill has to leave enough Stability to reach the goal using the supplied kit after paying for every unavoidable break. The forecast and goals should identify special Rainbow or tutorial rows.

Solo Infinity can offer **Weather on** after mission 05. Pick an earned season or use **Cycle** to rotate earned seasons across new runs with a saved counter. A season lasts for the crossing. New runs snapshot the unlocked weather families and choose from profiles for that season. Start the next episode at least 24 cleared rows after the last one ends. Once Rainbow is unlocked, one in three eligible Spring Rain episodes can end in a rainbow after two clear rows. A rain-and-rainbow pair counts as one episode. The rotation runs on the phone and follows progress through the crossing. Plain and each Weather season have their own local bests under the new version. Older attempts and scores retain their rule version. A switch for verified Infinity needs a separate server ruleset and published leaderboard policy.

## What to sell

| Timing | Offer | What the player gets |
| --- | --- | --- |
| First offer after the verified purchase flow is ready | **Existing worlds at the documented €2.99 reference** | A coordinated permanent backdrop, companion and bridge look. Preview it in motion, then buy and equip through the existing World catalogue. |
| After Bridge Style earns regular use | **Aurora Glass at a proposed €1.99** and later a distinct **Prism Style Kit at a proposed €4.99** | Aurora Glass is a single permanent tile finish. The kit has its own tile finish, LEDs and trail. One purchase unlocks the displayed items, with previews, re-equipping and restore. |
| After Campaign assistance has a verified spending flow | **Existing small packs** of continues, SP and hints | Convenience on a long run. Start with the existing 3-continue, 500-SP and 10-hint pack references, then review which packs players actually use. Respect the same mission spending limits across earned and paid assistance. |
| After people finish the free route and ask for more | **A separate optional puzzle chapter** | A one-time purchase for additional designed missions, scenery and a cosmetic. Price and content depend on production cost and measured demand. |

The first 20 missions are the free Campaign. The hardest ordinary clears can use a paid save if eligible, while their mastery marks show a supplied-kit clear. Present exact items and prices in the shop, with fixed-price contents. Use the actual store price per market. Evaluate spending against free clear rate, retries after a fall, chapter completion and seven-day return, alongside net sales. [Current price references](../BUSINESS_PLAN.md) · [Apple In-App Purchase rules](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase) · [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)

The current commerce model recognizes worlds as its durable purchase type and verifies spending through the account wallet. Separate tile or kit purchases need new catalogue entries, ownership, equip and restore handling. Campaign-earned items use the local save. Selling or spending purchased boosts in Campaign is a later commerce integration, including purchase verification, spend reconciliation and refunds. An equipped paid style can be available offline after verified ownership is cached for the right account, with store restore and refund checks on reconnection. [Google Play Billing verification](https://developer.android.com/google/play/billing/security) · [Apple StoreKit entitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)

## How to build it in stages

1. **Prove the first chapter.** Add the two Home entries, one Missions screen, four Lighthouse cards, a row-target finish line, local first-clear rewards and the torch equip preview. Reuse the existing renderer, crossing controls and result screen. Use the independent QA tile behavior as the starting point for a new local ruleset. Test that opening a Mystery, following a hint, taking a safe step and surviving a wrong tile are recorded distinctly. The lighthouse lighting and reveal of the Mill are the end-to-end demonstration.
2. **Build the common mission engine.** Define each card with a stable ID, prerequisites, fixed route or seed, starting kit, row target, goal checks, forecast and first-clear grant. Read accepted row, choice, hint, Mystery, pact and continue events from the existing engine. Materialize odds and cues when each row is generated, including buffered rows. Store forecast, route seed, version and objective state with the attempt. Check save and resume at result and reward boundaries. Give Rainbow reveals and ordinary paid or free hints distinct progress events.
3. **Finish the 20 with shared pieces.** Build Spring and the first rain window as the model. Add the season palettes, row odds and one readable clue system for Echo, Mirror, Leaf Gust and Rainbow. Make each debut predictable. Use short tested pieces for later mixed missions and the two approaches. Ship the 20 as one local mission pack. Append 21 onward via app updates with stable IDs and versioned mission definitions. Preserve the definition used by any attempt already in progress and keep existing clears and first-clear grants.
4. **Expand cosmetics and sales after the core loop is measurable.** Reuse the World shop first. Add the independent style slots and permanent paid products in a separate increment. Validate entitlement restore, ownership across account switches, and refunds before offering new purchases. Paid-boost integration is its own increment.

Acceptance checks include a clean-save airplane-mode clear and replay, a free clear for every mission, correct outcomes at forecast boundaries and across different generation batches, one reward per first clear through a crash or retry, correct balance after a failed spend, and a content update that preserves progress. Check the four possible tile combinations and confirm that two brittle tiles preserve a requested hint. Balance separately for first-time Campaign players and solo Infinity using the new odds. Compare the share of players starting another crossing and returning on a later day with a bridge-only build. Track Campaign completion by chapter as well. Use playtest observations first and authorized analytics where available.

### Trail Scarf asset receipt · 0.6.2 · 11 November 2026

Generated with the built-in image generation tool as a transparent PNG, then encoded as a 512×512 WebP with alpha. The game asset is `apps/mobile/src/assets/campaign/trail-scarf.webp` (79 KB). Character equipment is a separate neck-anchored SVG with world colors, cloth folds, fringe and a leaf clasp; the product illustration is not pasted onto the character.

Final prompt:

> Use case: stylized-concept. Create one premium mobile adventure-game inventory item illustration, a cozy thick teal wool Trail Scarf with folded padded collar, two short overlapping tasselled ends, a small polished golden leaf clasp and delicate stitched stars. Cute luxurious collectible, substantial tactile knit, softly rounded sculpted 3D form, rich emerald-teal, muted warm gold highlights, high-quality game shop asset, isolated centered with generous transparent margins, fills 75 percent of square. View from slightly above, warm upper-left studio light. Real transparent background, no floor or box, no text, no other objects. The scarf must read instantly at 64px.

### 0.6.2 verification · 11 November 2026

On Node 22.23.4, the full workspace run passed mobile 760/760, core 315/315, server-core 207/207 and balance 6/6. Workspace typechecking, lint and formatting passed. Campaign and production web builds passed. After the final trampoline surface refinement, targeted lint and Campaign tests passed 35/35, followed by a fresh Campaign build. The existing large-chunk advisory remains; this is not native-device performance acceptance.

Phone browser checks covered the raised World companion with its text/action inside the card, all eight individual bridge previews and break actions, the six-item Gear grid and new scarf illustration, scarf cold benefit/rain penalty, local claim/equip persistence, and equal vertical positions for Season Changes Add more and No Clock View boost. Tapping the current mission marker opened its briefing; tapping it again removed the briefing and restored the full map. Store Back returned directly to Home. The illustrated bridge showroom was also checked at a wide viewport.

The regular preview on port 4178 serves 0.6.2 on base `3e82d7298dd40c91bbd2c8b7749d6103d5a6c17c`. Claims and gear changes were exercised only in the isolated port-4180 test profile. No player save was reset, no billing was activated, and no branch was merged or remotely deployed. Proof images are stored with this task's `verification` artifacts: `world-card-062.jpg`, `bounce-showroom-062.jpg`, `cookie-break-062.jpg` and `supplies-062.jpg`.

Final trampoline detail: the padded rim has a shaded front wall and short metal supports. Only the landing mat flexes in the step preview; the ring stays still. Reduced-motion and static-art modes disable this added fabric animation.

### 0.7 generated assets · 11 November 2026

All three assets were generated with the built-in image tool and encoded to WebP without semantic image edits. Paths are relative to the repository; the original generated PNGs remain in Codex's generated-image folder.

| Asset | Integrated file | Encoded size |
|---|---|---|
| Cosmic material v2 | `apps/mobile/src/assets/campaign/cosmic-material-v2.webp` | 768×768; 37 KB |
| Starfall Observatory | `apps/mobile/src/assets/campaign/starfall-observatory.webp` | 1200×614; 215 KB |
| Cloudrest Harbour | `apps/mobile/src/assets/campaign/cloudrest-harbour.webp` | 1200×600; 232 KB |

Cosmic material final prompt:

> Use case: stylized-concept. Premium mobile adventure game material texture, a perfectly top-down square swatch for a thin dark cosmic stepping tile. Full bleed seamless deep midnight sapphire enamel, a graceful wispy turquoise and amethyst nebula curling diagonally, fine restrained pin-point stars, a subtle large swirling galaxy off center. Main center remains dark and readable. Luxurious pearlescent astronomical material, rich colors with depth, polished but no white specular streaks. No border, no rim, no tile silhouette, no UI, no text, no planets, no grids, no perspective, no extruded sides. We will clip this flat material onto a hexagonal tile and build its bevel and constellation in code. Not a densely packed purple cloud: elegant contrast, dark negative space and delicate luminous detail.

Observatory final prompt:

> Use case: illustration-story. Premium cozy mobile adventure game chapter landscape, wide landscape composition. Starfall Observatory on an island beyond a magical bridge: a charming brass and ivory domed telescope observatory on a dark blue rocky promontory, delicate gold armillary rings, warm welcoming door light, a few fireflies, a deep teal and midnight-blue sky with a single graceful comet and faint constellations. Lush low plants along edges, tiny stone stairs and narrow approach bridge in foreground, colorful but calm storybook 3D hand-painted game environment, rich tactile detail, polished soft lighting, believable stone and brass, no characters, no text, no UI. Keep the observatory in middle-right and open sky around the center. Designed to crop as a wide mission banner.

Harbour final prompt:

> Use case: illustration-story. Premium cozy mobile adventure game chapter landscape, wide landscape composition. Cloudrest Harbour, a small magical island harbour at soft dawn: a cozy mint and cream harbour signal house with a golden bell, curved wooden jetty and little paper-sail boats, pearl-colored hanging lanterns, pale turquoise water below low fluffy clouds, a luminous warm peach horizon. A narrow stepping-stone approach in foreground, ivy and dune flowers at outer edges, colorful calm storybook 3D hand-painted game environment, rich tactile wood and water detail, polished lighting. A destination to restore after a long adventure. No people, no text, no UI. Signal house in middle-right, lantern-lit pier leads from lower center. Designed to crop as a wide mission banner.

### 0.7 verification · 11 November 2026

The checkout was fast-forwarded to current main `be3e3e7fef0362f23224751d8b843d007440b9de` (production Apple/Google web sign-in), preserving all Campaign work. On Node 22.23.4, workspace typechecking, lint and formatting passed. Tests passed mobile 775/775, game-core 315/315, server-core 211/211 and balance 6/6. Campaign and production web builds passed. The existing large-bundle advisory remains; native-device performance and live purchases were not tested as part of this offline change.

The 50-case focused Campaign suite includes possible supplied-kit clears for every one of the 30 main routes plus the existing alternate route. Its oracle can inspect private tile states and acts at a controlled pace; this establishes feasibility, not a player completion probability. Additional cases cover composite-goal failure, hint rows, distinct shield saves, one-time Season Changes/cosmetic rewards, revision-0.4 partial save restoration, old-revision preservation, continuation beyond the old Far Gate and hiding all but the current/next new mission.

At a phone viewport, the character ground point was inside the actual current right-tile outline for all eight bridge models; the companion and bridge reported the same viewport and no full-root translation. All six companions were checked in the shared preview with their individual foot registration. Actual Infinity play reported opacity 1 for the character/gear layer and the intended saturation filter. Store World selection, World-card reactions, gameplay pause/save-and-leave and home return were exercised only in the isolated port-4180 test profile. Player progress on port 4178 was not reset or edited. No remote deployment, merge of the feature branch or real commerce activation is part of this result.

Final served-preview check: port 4178 reports playtest 0.7 on `be3e3e7`. The updated Cosmic Crossing was checked on phone and wide viewports; its companion and bridge retain the same viewport at both sizes. Proof: `verification/cosmic-footing-07.jpg` in the task visual artifacts. The final text-only refinement calls the frost material ice tiles and states the zero-hint goal directly.

### 0.7.1 integration validation · 11 November 2026

Node 22.23.4: mobile tests 779/779, game-core 315/315, server-core 211/211 and balance 6/6 passed. Workspace typechecking, lint and formatting passed, as did the Campaign build, the 13 planning/bootstrap tests and 15 required-check routing tests. The 54-case Campaign suite covers guaranteed hint charges/landings, reserve consumption, checkpoint restore, pre-guarantee compatibility, fresh default entropy and explicit deterministic fixtures. A browser check observed distinct signature/calm and cheerful/happy selection states. Native development build/launch acceptance is performed by the required PR workflow and recorded on the PR; no local browser result is presented as a native pass.
