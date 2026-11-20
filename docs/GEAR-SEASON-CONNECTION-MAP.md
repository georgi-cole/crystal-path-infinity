# Gear, seasons, and rewards connection map

**Status:** implemented for new outfitted runs in this branch. The earlier values below serve as a reference for existing checkpoints.

## Weather and gear rebalance (20 November 2026)

The forecast tells you what to pack. An upcoming weather change tells you when to stow it. Each item has a reason to take the single gear slot, and familiar conditions behave the same across worlds. The numbers below are the initial balance for the outfitted rules.

**Save 1/2/3** means 1/2/3 less Stability (SP) lost on a damaging wrong landing. **Extra 1/2/3** means 1/2/3 more SP lost. **Neutral** means the equipped item has no effect under that condition.

| Condition | Glasswing Umbrella | Sunshades | Sun Balm | Frost Runners | Storm Boots | Trail Scarf |
| --- | --- | --- | --- | --- | --- | --- |
| Plain Infinity, clear Spring, Rainbow or clear Autumn | Neutral | Neutral | Neutral | Neutral | Neutral | Neutral |
| Spring Rain | Save 3 | Neutral | Neutral | Extra 1 | Save 1 | Extra 1 |
| Clear Summer | Neutral | Neutral | Restore 1 SP per 2 clean landings | Neutral | Neutral | Neutral |
| Summer Shower | Save 2 | Extra 1 | Neutral | Extra 1 | Save 2 | Extra 1 |
| Heat Surge | Neutral | Direct safe tile cue + save 1 | Restore 2 SP per 2 clean landings | Neutral | Neutral | Neutral |
| Leaf Gust | Extra 2 | Neutral | Neutral | Extra 1 | Save 2 | Save 1 |
| Autumn Squall | Extra 3 | Extra 2 | Neutral | Extra 2 | Save 3 | Extra 2 |
| Clear Winter | Neutral | Neutral | Neutral | Save 1 | Neutral | Save 1 |
| Snow | Neutral | Extra 1 | Neutral | Save 3 | Extra 1 | Save 1 |
| Thaw | Neutral | Neutral | Neutral | Extra 2 | Save 1 | Save 1 |

### Why these tradeoffs work

| Choice | Reason |
| --- | --- |
| **Umbrella or Storm Boots** | The canopy keeps steady rain out of your eyes so you can brace after a bad landing. In a Summer Shower, splash from the deck still makes footing tricky. Wind pulls it sideways in a Gust or Squall. Boot treads are most useful on leaves and rain-slick surfaces, with weak grip on packed snow. The umbrella wins in Spring Rain, both tie in Summer Shower, and boots win in a Squall. |
| **Sunshades or Sun Balm** | Shades cut reflected glare during Heat Surge and dim the view in a shower, snowfall or a Squall. Balm gives a small recovery on hot stretches. It works on dry clear Summer rows as well as Heat Surge, and goes neutral when the shower starts. |
| **Frost Runners or Trail Scarf** | The runners grip firm frost and packed snow, then slide on thawing slush, wet glass and loose leaves. The scarf cuts the chill across clear cold, Snow, Thaw and dry wind so the wearer can keep moving steadily. A soaked scarf makes it harder to recover from a slip. Runners are a strong Snow choice for someone watching the forecast. The scarf is the steady option on mixed winter routes. |

### When the effect applies

- Use the active weather episode when there is one. Otherwise use the clear condition for the selected season. Resolve one table cell per row.
- Decide whether the chosen tile holds using the route's existing odds and marks. Resolve shields and effects that prevent or convert a hit, then adjust any remaining tile damage with gear. Clamp relief at zero damage. The values are before any general SP gain/loss multipliers. A wrong landing stays wrong for mission objectives.
- Heat Sunshades use the existing direct cue on a row with a valid mirror clue. If neither tile holds, the crack cue still applies.
- Only clean landings while wearing Sun Balm count toward its pair. The two landings need not be consecutive. Award at most **3 SP per continuous clear Summer stretch** and **4 SP per Heat Surge**, after other landing modifiers. A standard three-row Heat Surge allows one pair, for 2 SP. Packing and re-equipping pauses progress and preserves the count and cap for that stretch. On a condition change, start a new count. This replaces the current +1 on every clean clear Summer row, which can give 10 SP across ten clean landings.
- Pack one item before crossing. During a run, bring it out or stow it for the next row after clearing the current row. Forecast copy should call out the tradeoff two or three rows ahead, for example, “Squall in 2 rows. Umbrella will cost 3 extra SP on a bad landing.” Store previews should show the same effects.

### Earning gear in Campaign

A first clear unlocks the same item offered in the shop. Ownership follows the saved clear, so players who already completed the mission can equip it immediately. Gear earned through Campaign remains available independently of the paid entitlement.

| Gear | Campaign unlock | What the crossing teaches |
| --- | --- | --- |
| Glasswing Umbrella | Mission 5 (`rain-on-glass`) | Repeated Spring Rain |
| Sunshades | Mission 9 (`sun-on-the-cliffs`) | Read the reflected Heat cue |
| Sun Balm | Mission 12 (`ring-the-tower`) | Cross clear Summer, Shower and Heat |
| Trail Scarf | Mission 13 (`first-snow`) | Switch between clear cold and Snow |
| Frost Runners | Mission 15 (`the-long-crossing`) | Multiple Snow windows |
| Storm Boots | Mission 19 (`two-ways-to-the-gate`) | Cross the Squall road or the ridge during Leaf Gusts |

Pack an owned item to use these effects in Infinity. Completed Infinity runs use a shared public leaderboard for signed-in players, regardless of their gear, supplies, or how they obtained them. Campaign offers a distinct replay button when gear is packed and the crossing is cleared. The original mission kit remains the route to Mastery. Resumed attempts keep their original rules.

### Ambience and bridge assets

Keeper’s Torches flutter during wind, Frosted Glass gains a powder highlight in Snow and drips in Thaw, and Cookie Crossing gets a stronger sheen in Heat. Weather decor uses public conditions, and clue shapes stay consistent across styles. A future chocolate deck can reuse the heat treatment.

## Previous gear balance

Older equipped attempts keep the balance below. The table uses the same Save and Extra notation.

| Gear | Current helpful effects | Current drawbacks |
| --- | --- | --- |
| Glasswing Umbrella | Save 3 in Spring Rain and Summer Shower | Extra 2 in Leaf Gust or Squall |
| Sunshades | Save 2 in Heat and show the existing direct cue. Save 1 in Thaw. | Extra 2 in Snow or Squall |
| Sun Balm | Save 3 in Heat. Restore 1 SP on each clean clear Summer landing. | Neutral elsewhere |
| Frost Runners | Save 2 and restore 1 SP per clean Snow landing | Extra 2 in Thaw, Leaf Gust, Rain, Shower, Squall or clear Summer |
| Storm Boots | Save 2 in Rain, Shower or Squall. Save 1 in Leaf Gust or clear Autumn. | Extra 2 in Snow |
| Trail Scarf | Save 2 in clear Winter or Snow. Save 1 in Thaw. | Extra 2 in Rain, Shower or Squall |

Infinity uses the packed wearable. First clears and ordinary Campaign replays use the fixed mission kit. Other Campaign first-clear grants include seasons, supplies and bridge cosmetics. See the [current gear implementation](../packages/game-core/src/journey-gear.ts), [Campaign progression](../apps/mobile/src/campaign-test.ts) and [mission catalog](../apps/mobile/src/campaign-content.ts).

The current Heat renderer already replaces a valid mirror cue with a lens cue on the indicated safe tile when Sunshades are worn. An ordinary mirror cue points to the opposite side. See the [crossing renderer](../apps/mobile/src/infinity-presentation.ts).

### Season and weather reference

All probabilities below are the chance that **each individual tile is broken**. They affect newly generated rows in the selected weather window. A row may therefore have two, one, or no safe tiles. A route may author fixed cues/marks that take precedence for that row.

| Season | Unlocked after clearing | Clear-season broken chance | Weather episode | Broken chance per tile | Length | What changes in play |
| --- | --- | ---: | --- | ---: | ---: | --- |
| Spring | Mission 5, `Puddle Trouble` | 50% | Spring Rain | 60% | 6 rows | Higher break risk; can be followed by Rainbow in Infinity after the Rainbow mission is cleared. |
| Spring | Mission 17, `Chasing Prismtails` unlocks the Rainbow episode | 50% | Spring Rainbow | 50% | 3 rows | Rainbow cue marks a guaranteed safe landing on the indicated side. |
| Summer | Mission 9, `Don’t Trust the Shine` | 55% | Summer Heat Surge | 65% | 3 rows | Higher break risk; reflected glint points to the opposite landing, so follow the mirror cue. |
| Summer | Same unlock | 55% | Summer Shower | 60% | 4 rows | Higher break risk and wet weather. |
| Winter | Mission 13, `Snow Way Across` | 45% | Winter Snow | 29.25% | 6 rows | Lower break risk; snow firms some tiles. |
| Winter | Same unlock | 45% | Winter Sun / Thaw | 50% | 3 rows | Returns to the 50% tile risk. |
| Autumn | Mission 19, `A Squall or a Long Walk` | 55% | Autumn Leaf Gust | 55% | 3 rows | Leaf gust cue appears at the start of the episode. |
| Autumn | Same unlock | 55% | Autumn Squall | 65% | 6 rows | Higher break risk and wet, windy weather. |

Plain Infinity is 50% per tile. In Infinity, selected seasons use rotating weather episodes; Campaign missions can instead set specific episode windows and authored marks. Infinity can cycle through unlocked seasons, and the Unlock All Seasons offer also grants access to the four seasons.
