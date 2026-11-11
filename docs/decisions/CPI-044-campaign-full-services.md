# CPI-044 · Full-game service acceptance builds

11 November 2026 · [issue120](https://github.com/georgi-cole/crystal-path-infinity/issues/120)

Status: implementation in progress on `codex/campaign-full-services`; not accepted, merged or distributed. Existing Android57 and iPhone55 are offline Campaign0.7.4 builds and retain free simulated claims. Registered store entries alone do not implement checkout.

### Public-release decision and current integration · 11 November 2026

Owner requested both testing and public distribution, then explicitly chose **finish purchases before public release**, rather than hiding the shop. Public submission stays gated on actual provider checkout, receipt delivery, restoration and resource-use acceptance. Signing an offline beta is not completion of this requirement.

Before updating the service checkout, all unfinished changes were preserved in the named Git stash `CPI-044 preserve unfinished services and superseded presentation before latest main`. Service/configuration files were selectively recovered on current main; superseded artwork/layout files were not copied over newer presentation work. The archive is retained for recovery.

The additive `20261111000200_adventure_commerce.sql` migration adds shield and season-change balances, a strict list of eleven permanent entitlements and immutable entitlement details on purchase deliveries. Receipt verification keeps the existing account-token binding and transaction replay barrier. A shared server helper selects consumable SQL columns from an explicit allowlist. Permanent products are not consumed by StoreKit. Separate payments stack supplies; refund and reversal processing handles all new types, preserving an entitlement if another nonrevoked purchase supplies it. Own-data export includes balances and entitlement names without raw provider proofs. The mobile wire parser recognizes the registered catalog and rejects invented or duplicate entitlements and unsafe balances. Older server responses normalize missing new fields to zero/empty, never a grant.

Validation at this checkpoint: complete workspace TypeScript passed; all 27 server suites passed, **216 tests**, including real embedded PostgreSQL migrations and new repeat-purchase/replay/refund/reversal cases. Three focused mobile suites passed, **16 tests**, covering the commerce flow, wire contract and offline-profile boundary. Full mobile validation follows the remaining UI wiring. Migrations have not been applied to any live environment and the thirteen new store products remain inactive/draft.

Remaining acceptance work: staging provider callbacks and account-scoped Campaign progress; native-priced Campaign checkout and restore screens; durable resource spending linked to Infinity checkpoints; optional ad placements; exact-source signed builds and physical-device sandbox transactions on both platforms. These are not implied by the server tests above. Current official ranked spending remains server-authoritative and unchanged.

## Intended acceptance profile

A distinct `campaign-services` profile keeps the current illustrated Campaign/Infinity UI, while requiring native ads/billing SDKs, an isolated staging account/commerce gateway and Google demonstration ad inventory. It is separate from the frozen offline beta and normal production release. Sandbox receipts must never fund production wallets or official records. Old saves and already earned/bought cosmetics remain intact. Physical-device provider login, test-ad presentation and signed sandbox transactions must be recorded separately from compilation/synthetic tests.

The production mobile login work from PR108 is being carried forward selectively, preserving newer Campaign main. The old PR's production-only gateway/callback assumptions need explicit staging equivalents before enabling the integrated profile.

## AdMob audit · 11 November

The authenticated AdMob console reports the publisher account approved and payment profile complete. Both Crystal Path Android/iOS app records exist with two active rewarded units each; both still show Requires review / Limited ad serving and Add store to lift limit. Account approval does not imply app approval or unrestricted paid impressions. Tests use official demo inventory. The Big Eye records are outside this task.

Campaign monetization target: preserve meaningful earned bridge rewards, allow optional paid early unlocks, and offer voluntary rewarded mission bonuses. Interstitials belong at completed-crossing transitions with frequency/session caps, never over a live crossing or navigation control. A failed/unavailable ad must not block earned completion. Exact placements, caps and bonus amounts must be tested and recorded before activation. New early-unlock offers are not yet registered or implemented.

## Campaign viewport correction

The Campaign route owns the remaining dynamic viewport after its compact header and native safe areas. The illustrated map fills that area without fixed viewport subtraction or outer margins. Selecting a mission reserves map and briefing space inside the same viewport. Long mission text scrolls within the briefing, while its action button stays visible; the crossing journal has a bounded internal scroll area. The generic footer is omitted on Campaign. Short landscape screens place map and briefing side by side. Visual acceptance across phone sizes/landscape remains in progress.

## Sources

- [Google interstitial placement](https://support.google.com/admob/answer/6201350)
- [Google Android test ads/interstitials](https://developers.google.com/admob/android/interstitial)
- [Apple sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox)

### Viewport and World presentation validation — 11 November 2026

Campaign outer page height matched the viewport at 390×844, 375×667 and 844×390 responsive settings; selected mission actions remained inside it. Only mission details may scroll when necessary. Local Campaign QA typecheck and production bundle passed. Black Metal equipped Sunshades were verified visually on the new glass traveller, and the Kit reported Wearing with Pack away available. The marker shares the existing resolved-path motion/footing and gear rendering; it appears only with worn gear. World gameplay artwork opacity increased from 0.38 to 0.76, with modest saturation/brightness grading; Home colour suppression was reduced. This is working-branch preview evidence, not native release or real checkout acceptance.

### Black Metal character artwork replacement — 11 November 2026

Owner rejected the procedural glass figure. Replaced it with a generated transparent rendered sprite, `apps/mobile/src/assets/world-previews/black-metal-traveller-v1.png`. Art direction: charming small explorer in polished charcoal steel and smoked glass, silver reflections and muted teal eyes; neutral planted pose with a clear face/neck for existing equipment overlays. Generated with the built-in image tool; original retained under the Codex generated-images directory. The previous SVG body is removed. This is one calm sprite, not a newly generated reaction sheet; it follows existing path motion and reduced-motion settings. Gear effects, ownership, purchase and Campaign rules do not change.

Validation: Campaign QA TypeScript compilation and Vite bundle passed after the replacement. Desktop and 390×844 responsive gameplay previews visually checked with Sunshades worn on Black Metal; feet remain on the resolved tile. Local preview opened at http://127.0.0.1:4182/#practice-run. This does not constitute a native-device test or a distributed build.
