# CPI-043 · Adventure store launch prices

11 November 2026 · [issue 118](https://github.com/georgi-cole/crystal-path-infinity/issues/118)

The current catalog is `apps/mobile/src/adventure-catalog.json`. It maps existing offline offer IDs to store product IDs, quantities, permanent/consumable types and launch EUR reference prices. Its 16 offers contain 13 new products and reuse three existing packs (500 SP, 10 hints, 3 continues). The original 18-product proposal remains a dated historical document. These records do not enable checkout or server grants.

| Offer | Launch EUR | Purchase |
| --- | ---: | --- |
| Six gear items | 1.49 each | Permanent; wear one at a time |
| Bounce Boulevard / Cookie Crossing | 1.99 each | Permanent style |
| Cosmic Style Kit | 2.99 | Permanent tiles, lights, trail bundle |
| No Clock | 2.99 | Permanent optional Infinity timer removal; separate record |
| Unlock All Seasons | 3.99 | Permanent Infinity seasons unlock |
| 10 Shields | 0.99 | Repeatable consumable; Infinity only |
| 10 Season Changes | 1.49 | Repeatable consumable; at least two seasons unlocked |
| 10 Hints | 1.49 | Existing repeatable pack, same SKU and quantity |
| 500 SP / 3 Continues | 1.49 / 0.99 | Existing repeatable packs |
| Six worlds | 2.99 each | Existing permanent unlocks |

Wood, frost, lily and jelly bridges, torches and other earned-only campaign rewards receive no new paid SKU. Old local IDs `aurora` and `prism-kit` remain save-compatible while the store names describe Bounce Boulevard and Cosmic Style Kit. Sun Cream is a permanent gear entitlement, not a consumable cream refill. Campaign uses its own mission resources and clock. Existing runs retain their rules and stocks.

## Price rationale and limits

Official Ireland App Store listings checked 11 November 2026: [Crossy Road](https://apps.apple.com/ie/app/crossy-road/id924373886) lists many character purchases at €0.99 and Piggy Bank at €2.99; [Stack](https://apps.apple.com/ie/app/stack/id1080487957) lists 10 extra lives at €0.99 and Remove Ads at €3.99; [Vampire Survivors](https://apps.apple.com/ie/app/vampire-survivors/id6444525702) lists content packs around €0.99–€3.99. These are price anchors, not evidence of conversion or willingness to pay in this game. The owner's direction is to choose the lower amount whenever current game/store prices disagree. No Clock moves from the historical €7.99 proposal to €2.99; Cosmic Kit €4.99 to €2.99; All Seasons €4.99 to €3.99. Gear is uniformly €1.49; 10 hints and 10 season changes are €1.49.

Prices are customer-facing EUR references. Actual checkout must show the provider's localized, tax-inclusive price, never a hardcoded reference. Google bulk EUR pricing can add local VAT: entering 1.49 produced 1.79 in Bulgaria. A 1.24 input produced the intended final 1.49, also verified in Ireland. Regional tax/charm rounding may vary. Never publish a higher price merely to match another surface. Verify final regional prices before activation.

## Registration and rollout

Apple records are drafts, not submitted purchases. New Google options must remain inactive until receipt verification, permanent entitlement restoration, repeatable pack grants and idempotent delivery are implemented and tested. Existing 18-product live allowlists and server product kinds are not extended by this change. The offline beta continues free simulated claims; build 1.0.1 (54) predates this pricing update.

Initial console audit: Apple 18 Prepare for Submission drafts; Google 18 existing products. Google saved the existing 10-hint pack at final Bulgaria EUR 1.49 on 11 November. Creation of all 13 new products was rejected: “Can't create product. To fix, request billing permission.” The active Android internal login preview is 1.0.0 (45); the old billing-enabled 0.1.0 (1) has been deactivated. A new billing-capable Android artifact is needed to register products; do not replace the active tester release with the old build. Further verified console results are appended below.
