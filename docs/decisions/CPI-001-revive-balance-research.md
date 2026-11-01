# CPI-001 — revive balance research

**Final owner decision — 1 November 2026: successful revives 1–5 restore to 200 SP; revives 6–10 restore to 150 SP.** Georgi selected this schedule so implementation can proceed, with the option to revisit balance later. The [product contract](CPI-001-product-contract.md) is authoritative. The amount is set, not added; failures do not advance the schedule, each run/intent retains its promised rule and amount, and the tenth reward restores to 150 SP before the next death ends the run. There is no remaining owner revive decision blocking CPI-001; implementation and downstream tests are still required.

**Historical exploration follows.** Before this decision, Georgi suggested considering 200, 180, 160… SP as food for thought. The comparisons and experiment candidates below preserve that research history; they are superseded as current configuration recommendations and are not a request to choose again. Endless play, all ages and the other accepted rules remain unchanged.

## What comparable games actually document

### Defined resource restoration — closer to the SP question

| Game / primary source | Verified mechanic | Limit of the comparison |
| --- | --- | --- |
| [Candy Crush Saga — King Boosters guide](https://candycrush.zendesk.com/hc/en-us/articles/360000750998-What-are-Boosters) | An end-game Extra Moves ×5 booster supplies five additional moves after the player runs out. | This documents a specific continuation budget, not a universal five-moves-per-ad offer or the right SP amount for our game. |
| [Pokémon GO — publisher item guide](https://scopelyexplore.helpshift.com/hc/en/5-pokemon-go/faq/1094-types-of-items-and-their-effects/) | A Revive restores half a fainted Pokémon's HP; a Max Revive restores all HP. | Inventory items, not rewarded-ad continuations. This demonstrates defined partial/full restoration, not an optimal percentage. |

These are useful structural comparisons: the restored resource is explicit, while what the player accomplishes with it depends on the game. Neither source validates a decreasing schedule for Crystal Path.

### Repeat-use cost and caps — a different question

| Game / primary source | Verified mechanic | Limit of the comparison |
| --- | --- | --- |
| [Subway Surfers — SYBO Keys FAQ](https://sybo.helpshift.com/hc/en/5-subway-surfers/faq/148-keys/) | Successive Save Me uses cost 1, 2, 4 keys and continue doubling. | Escalating currency cost does not establish declining restored health or a particular ad-revive cap. |
| [Subway Surfers — SYBO Ad Tickets FAQ](https://sybo.helpshift.com/hc/en/5-subway-surfers/faq/217-skip-ad-tickets/) | A ticket can replace an ad used for benefits including reviving during a run. | Confirms ad-based revival; does not state how many video revives every run receives. |
| [Jetpack Joyride — Halfbrick Quick Revives FAQ](https://halfbrick.helpshift.com/hc/en/4-jetpack-joyride/faq/763-how-do-i-purchase-and-use-quick-revives/) | Up to nine Quick Revives per run; cost rises with successive uses and resets in a new game. Coins, sponsored videos and rewards are acquisition routes. | Nine total revives does not mean nine guaranteed video revives. The FAQ does not publish a weakening-health schedule or exact cost formula. |

These publisher pages were checked on 1 November 2026; they are not claims that every platform, account or future update behaves identically. The useful pattern is limiting repeated continuation or making it progressively more expensive. A declining SP reward is our own design hypothesis, not a mechanic established by these examples.

**Georgi's comparison correction:** an endless-runner save does not calibrate the health budget of a Crystal Path revive. In this game we must explicitly define the SP restored and its ordinary damage allowance. The runner examples above only inform repeat-use economics and caps; they are not evidence for 200 SP, a decrement or a floor.

## There is no verified universal number in these sources

The research did not find a publisher-backed universal optimum for revive counts or restored health. [Google AdMob recommends experimenting with reward types and amounts](https://admob.google.com/home/resources/monetize-mobile-game-with-ads/). [Unity LevelPlay supports reward-amount experiments and retention/engagement measurements](https://docs.unity.com/en-us/grow/levelplay/platform/fundamentals/ab-test); its [testing guidance](https://docs.unity.com/en-us/grow/levelplay/platform/best-practices/ab-testing) recommends isolating the changed variable.

This supports a testing method, not a claim that one candidate has already won. Published monetization advice also does not establish that maximizing ad views maximizes the quality of this particular game.

## Exact arithmetic for the approved policy and historical candidates

Starting SP remains 300. The following totals assume all ten rewards are applied. They count fresh SP allocations before healing and other effects; they are **not forecasts of distance, session length or retention**.

| Candidate | Revive SP, first through tenth | Reward SP total | Including starting 300 |
| --- | --- | ---: | ---: |
| **Approved: first five 200, next five 150** | **200, 200, 200, 200, 200, 150, 150, 150, 150, 150** | **1,750** | **2,050** |
| Fixed 200 | 200, 200, 200, 200, 200, 200, 200, 200, 200, 200 | 2,000 | 2,300 |
| Decrease 20, no floor | 200, 180, 160, 140, 120, 100, 80, 60, 40, 20 | 1,100 | 1,400 |
| Decrease 20, floor 100 | 200, 180, 160, 140, 120, 100, 100, 100, 100, 100 | 1,300 | 1,600 |
| Decrease 20, floor 120 | 200, 180, 160, 140, 120, 120, 120, 120, 120, 120 | 1,400 | 1,700 |
| Decrease 10, no reached floor | 200, 190, 180, 170, 160, 150, 140, 130, 120, 110 | 1,550 | 1,850 |

The unrestricted decrease removes 45% of the revive SP supplied by fixed 200. Its tenth reward is 20 SP. Under the source's [20-SP base wrong-step damage from row 26 onward](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/minigames/crystalPathShattered/shatteredLogic.ts), the next ordinary unprotected wrong step would be fatal.

With no healing or modifiers, the fatal wrong-hit number is `ceil(restoredSP / 20)`: the approved 200 SP dies on hit 10, and 150 SP on hit 8; for the historical candidates, 120 dies on hit 6, 100 on hit 5, and 20 on hit 1. The player survives one fewer wrong hit. A 10-SP decrement changes that basic allowance every other revive; mystery damage/healing can still make the intervening 10 SP meaningful.

After a fatal wrong-tile choice, the accepted contract preserves the revealed information, so the player can retry that known row safely before facing an unseen choice. A fatal mystery or drain does not always reveal a tile. Consequently, distinguish a known-row retry from a newly encountered, unrevealed choice when evaluating the reward. Both successful crossings count toward `lastClearedRow`; their uncertainty differs.

Define the reward as an SP budget, not a promised distance or duration. Correct steps have no base SP cost, and healing/mystery effects can extend survival. A specified starting budget therefore does not impose a fixed endpoint on an otherwise endless run. With base damage 20 and no modifiers, a design target of surviving `m` wrong hits needs more than `20m` SP; using multiples of 20, `SP = 20(m + 1)` makes the following wrong hit fatal. This arithmetic helps express a test hypothesis; it does not select the right `m`.

## Design hypotheses recorded during exploration

A decreasing reward could add tension because later lives tolerate fewer mistakes. It also gives a struggling player less help precisely when they are repeatedly dying. Under strict minus 20, later ads may be followed by very little useful play; this is a risk to investigate, not a measured prediction.

A minimum floor preserves a minimum health budget; whether that recovery feels useful remains a playtest question. A candidate floor of 120 still permits five survived ordinary wrong hits after row 25; 100 permits four. Neither value is an industry standard. The current choice between unrevealed tiles is heavily affected by chance, so reducing SP changes endurance more directly than it creates new skill-based difficulty.

The existing ten-revive cap already limits recovery. Smaller SP does not make ad availability equal across players, and the fewer-revives tie-breaker only applies when distance is equal. Keep these effects distinct from the question of whether each individual reward feels worthwhile.

## Historical private experiment proposal — superseded by the owner decision

The research proposed comparing **A: fixed 200** with **B: 200, 180, 160, 140, 120, then 120**. That proposal retained the decreasing-reward idea without making the last reward a one-wrong-hit life. Georgi subsequently selected **200 for five revives, then 150 for five**, superseding this proposed next experiment. The 300-SP reference and other candidates remain historical comparisons; any future experiment should isolate the changed variable rather than change damage, mystery probabilities and rewards together.

The historical candidate B used `SP(k) = max(120, 200 - 20 * (k - 1))`, where `k` is the successful continuation number from 1 through 10. The approved rule is instead `SP(k) = 200` for `1 <= k <= 5` and `SP(k) = 150` for `6 <= k <= 10`. Failed, unavailable or unearned ad attempts do not move the sequence. Show the promised SP before each ad and bind it to the run's ruleset and reward intent so delayed verification or later configuration cannot change that amount.

Metrics retained for downstream balance review; they do not reopen the CPI-001 owner decision:

1. Active play time and new rows after each revive, separating known-row retries and death causes.
2. Death on the first or second new unrevealed choice, and whether the player leaves after that death.
3. Whether later offers are accepted, declined or unavailable; separate gameplay value from no-fill and verification failures.
4. Whether the continuation felt worth the ad, whether the player starts a new run, and later return when there is enough real data.
5. Whole-run distance and duration, ad time versus active play time, and SP/resource trajectories.

Use private rulesets and appropriate test ads; do not mix scores from different variants in an official leaderboard or change a run's rules mid-session. Small initial playtests can expose obvious frustration but cannot prove a retention optimum. Report sample sizes, and do not infer the experience of all players from the selected few reaching revive ten. Controlled late-revive scenarios can provide qualitative feedback and should be reported separately from natural runs.

**Decision recorded:** implement the approved **200 SP for revives 1–5, then 150 SP for revives 6–10**. The earlier fixed-200 versus floor-120 research recommendation is historical and superseded. CPI-001 can be finalized after its document/CI checks; later balance review belongs to the downstream tasks or a separate versioned change, without modifying existing runs or requesting the same decision again.
