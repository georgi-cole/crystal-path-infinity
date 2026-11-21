# Moonpatch Grove, Candy World and the Beacon Crown

## Source candidate dated 20 November 2026

| World | Companion | Bridge and mystery props | Reference price |
| --- | --- | --- | --- |
| Moonpatch Grove | Patch, a stitched plush fox-bat with a leaf ear | Jade-tinted glass and stitched acorn satchels | €2.99 |
| Candy World | Nougat, a toasted marshmallow dragon with wafer wings | Segmented chocolate bars and candy-filled goodie bags | €3.99 |

Moonpatch Grove uses an original woodland collectible design for the Labubu brief. The worlds include separate scenery, companion art, outfit art, rescue props, and landing and break cues. Patch swings on a crescent and Nougat flutters through a sugar ribbon. The shop previews the moves, Campaign clears use the full version and every 12th clean step shows a short version.

Moonpatch's moonrise cycles through crescent, half and full phases at cleared rows 13, 37, 61 and every 24 rows thereafter. The Candy World sugar shower starts at row 17 and repeats every 24 rows. The effects use resolved progress and stay at the edges. They honor pause, foreground and reduced-motion settings.

Candy World renders its chocolate bridge whenever it is equipped. Other bridge styles stay in the collection and can be previewed in the workshop. Both sides use the same chocolate surface before a choice resolves. The candy bag artwork is shared by every Mystery reward or penalty.

## Campaign

| Crossing | Earlier earned accents | Main objectives | Landing | First clear |
| --- | --- | --- | --- | --- |
| 31. Read the Comet’s Wake | Comet Footsteps from 25 | Open caches at 12 and 46, follow a hint at 33, and take the rainbow at 53–55 | Row 64 with 70 SP | 50 reserve SP and 1 hint |
| 32. Lanterns in the Squall | Pearl Lanterns from 30 | Follow Leaf Gusts at 11–13 and shield the scripted cracks at 26 and 58 | Row 72 with 75 SP | 2 reserve shields |
| 33. Light the Beacon Crown | Comet Footsteps and Pearl Lanterns | Trade a hint at 12, follow one at 33, shield the crack at 56, and cross the beacons at 94–96 | Row 96 with 90 SP | Crown restoration, 1 continue, and 2 Season Changes |

A completed mission 30 save continues at crossing 31 with its previous progress intact. The three routes reuse the mission kit and objective snapshot format. Each requires the preceding clear and the listed earned accents. The accents are fitted for that attempt and the player's saved bridge choice is retained. The first-clear awards go to Infinity reserves. Replays remain available for Mastery. The final crossing is exempt from first-clear interstitials, and the existing exemption at the Harbour remains.

## Commerce

The two offers are permanent world entitlements. Their proposed identifiers and reference prices are in [the 20 November catalog](../../backend/commerce-products.worlds-20261120.proposed.json). The native shop uses platform-localized quotes for checkout after the new offers are registered and verified. The database migration expands the wallet constraint before either SKU can deliver its entitlement. Builds with the expanded catalog receive both new offers and their full wallet state. Older builds receive their supported catalog and equipped-world fallback. Their purchase records and the underlying entitlements remain intact. This candidate does not change live platform configuration or activate checkout for either offer. Campaign progress is available independently of these offers.

## iPhone TestFlight · 21 November 2026

[Run 89](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/44898127804) built and signed the offline Campaign beta from PR #155. App Store Connect rejected the upload because the 1.0.2 release train was closed. The mobile version advances to 1.0.3 for the next internal TestFlight upload. The offline Campaign profile uses simulated shop claims to let testers try the two Worlds. Successful upload and tester availability are pending.

## Candy World bridge art · 21 November 2026

The bridge uses one illustrated texture atlas for four chocolates: milk, dark with cocoa nibs, hazelnut praline and white chocolate with caramel. The finish cycles by absolute row, with matching tiles on the left and right. It stays consistent as the camera moves and does not change safe sides or the random number generator.

A nearby break reveals the matching cross section. Milk chocolate splashes and throws droplets, dark chocolate throws cocoa nibs, hazelnut praline scatters nut pieces and white chocolate scatters caramel chips. Distant collapses retain textured chocolate fragments with fewer effects. Reduced motion suppresses animated breaks.

## Automatic internal TestFlight · 21 November 2026

[Run 92](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/44900727718) successfully uploaded the signed offline Campaign build 1.0.3 (92). The automatic workflow uses that same profile after a main push passes the mobile, iOS simulator launch and Planning checks on the exact current commit. Changes that only need documentation checks do not upload. The automatic build uses simulated shop claims and internal distribution. Apple processing and tester group availability are separate from the upload step. Rankings require a build with the relevant backend enabled.
