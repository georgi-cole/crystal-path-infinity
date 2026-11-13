# Production commerce launch · 12 November 2026

## Matching mobile replacements and Pages - 13 November 2026

The owner authorized refreshing TestFlight, both production submissions and Pages
with PR #131 plus the latest Campaign rewards/artwork. Source
`14f7d3a8c1fb4261e20a01a8de58a6443caaeec2` includes PR #131 (`dd8ea96`),
PR #133 reward cinematics and PR #135/#136 browser publication. Marketing version stays
**1.0.1** because the first public releases are still in review; platform counters
are Android **63** and iPhone **72**.

Exact-source full-service checks [43340757079](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43340757079)
passed with native purchases and AdMob enabled. Both startup screenshots were
inspected. Android records three cold-start/lifecycle attempts, iPhone two, with
zero external runtime errors. These are development compatibility checks, not
new phone checkout acceptance.

Android 63 was built locally from that clean source with the registered production
identity, production account gateway, native purchases/ads and `campaign-release`.
JAR signature verification and bundletool validation passed. Signed AAB SHA256:
`c39cd213d16eaa0f80a2e1a5e4a7ee3dd62afd9fea44839543d4ae85730a057a`.
Google Play internal release 9 is Active / Available to internal testers. The same
bundle replaced 62 in production. Google automatic checks passed and Publishing
overview explicitly confirms **Your changes are now in review** for 63. Managed
publishing remains off. The listing, privacy declarations and countries remain
in the existing submission. Supported devices are unchanged; the only validation
warning is an absent deobfuscation file (minification remains disabled). Play's
new-install estimate is 51.7 MB. API preparation could not be validated with the
existing service-account permission, so the reviewed console flow performed the
actual upload, internal publication and production review restart; permissions
were not expanded.

iPhone [upload 43341954534](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43341954534)
succeeded as **1.0.1 (72)**. Apple confirms VALID / APP_STORE_ELIGIBLE. The existing
OS-only encryption answer is saved, the Crystal Path Internal QA group is
assigned, automatic notifications are enabled and status is IN_BETA_TESTING.
Focused notes cover successive purchases, Restore on another device, more than
15 minutes idle, network recovery and mission rewards. Apple console confirms **23 Items Submitted**, now **Waiting for Review**, in
submission `da654c48-01bc-4b64-86ce-c4938960dc71`: iOS 1.0.1 build 72 plus all 22
visible store purchases. The bulk attachment initially added only Bounce
Boulevard and reported a generic retry error for the other products. Each
remaining product was added sequentially and its Ready for Review state verified
before the final 23-item submission. No legacy-only registrations were added.
The older 71 submission was withdrawn by the developer to replace its binary,
which is not an Apple rejection. Automatic release after approval is preserved.
Existing store media, contact information, prices and privacy declarations are
preserved. Apple export compliance and distribution used the signed-in owner
console where the upload API key did not permit the operation; no key permissions
were expanded. Store proof screenshots are retained privately outside Git.

Pages is already published at the same source: `campaign-web`, 30 missions,
production web accounts enabled, browser-local progress, mobile-only purchases
and no browser ads. Deployment [43331901379](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43331901379)
and live metadata/UI checks passed. Documentation-only follow-ups may change the
published source SHA without changing that runtime.

No backend migration or production service setting changed for these client
replacements. No new measured purchase, ad revenue or physical-device acceptance
is claimed. Retest the build 71 incident on 72/63: first purchase, a different
second purchase, same-account Restore on a second device, expiry after15 minutes
idle and recovery after a temporary outage. Store review and approval are not
public availability; previous Sandbox and sign-in acceptance retain their date
and build scope. Game rules, prices and business assumptions are unchanged.

## Subsequent clarification and post-purchase sync correction · 13 November 2026

The owner clarified that all displayed prices become dimmed/disabled after the successful World purchase; another product cannot be selected. The15-minute expiry defect below remains a separately reproduced bug and is not treated as a complete explanation of an immediate lockout. An additional failing regression reproduces the reported shop-wide state transition: a successful grant is followed by an optional offline inventory-sync error, and build71 places the entire shop in error. The correction keeps a loaded shop ready, marks the device sync incomplete, preserves the verified inventory, and prevents automatic repeated sync attempts until explicit reload/retry. Explicit delivery retry still uses the existing allocation acknowledgement/idempotency rules.

All non-interactive native bridge calls now time out after10seconds, including history lookup, price discovery and finishing already-delivered transactions. A missing native reply therefore cannot keep the shop's operation lock forever. Interactive purchase confirmation has no such timeout: the native checkout retains its lock until the player answers. Tests cover both bounded non-interactive calls and an unanswered interactive purchase remaining locked.

Earlier staging iOS Sandbox deliveries exist for Jelly, Chaos and Wilds. Apple purchase history can persist across builds/devices independently of game login sessions. An old account-bound receipt is therefore a possible additional test-history issue, not proof that this owner's second checkout failed for that reason. A foreign-receipt regression verifies that it cannot block current prices or silently transfer ownership. No account/login data, Apple purchase history or purchase ledger was erased or reassigned. Two devices using the same valid game account must be accepted on the replacement with purchase on one, Restore on the other, and a different second purchase.

The first source revision passed all required CI jobs, including full Android and iPhone simulator launch checks. The subsequent sync/timeout additions require their own exact-source checks and a replacement build; that earlier CI result is not relabelled as validation of the later revision. An authenticated App Store read confirmed1.0.1(71) Waiting for Review with automatic release after approval. Changing its release mode through the existing upload API key returned403 FORBIDDEN_ERROR; no release setting was changed. Manual release requires the owner console. These records do not claim a new TestFlight upload, actual phone reproduction, approval or production checkout acceptance.

## Build71 purchase incident and client correction · 12 November 2026

The owner's build71 report supersedes any assumption that the submitted candidate has passed phone checkout acceptance: initial shop connection failed, Restore temporarily enabled checkout, Pawrachute World completed, then another checkout and Restore failed. Existing build71 is not modified by this source correction. No new signed replacement, Apple approval or successful phone retest is implied.

Read-only production diagnostics at approximately21:32UTC confirmed one iOS Sandbox `theme.puppy` delivery at20:56UTC, retained in its owner's separate review inventory. That owner has one production session, issued on build71; there are no older production sessions for that owner to purge. The review inventory remains preferred and contains the purchased World. `apple.review` reconciliation is fresh and healthy. `apple.production` still has the separately documented pre-first-release authorization failure; it is not represented as healthy. No account, provider link, session or purchase data was deleted during diagnosis. No raw receipt, token, account UUID or email is included in this record.

Four failing regressions were reproduced against build71 source before the correction:

- After15minutes idle, `CommerceFlow` sees a null identity scope and returns before `withAccountRequest` can renew the expired access token; a subsequent buy or Restore cannot recover. The local identity fence now survives access-token expiry, while every authenticated call still renews/validates access and logout/rejected refresh immediately clears the scope.
- A native recovery outage prevents all product loading. Product discovery now proceeds with a visible incomplete-restore notice, without claiming the failed restore succeeded.
- One rejected historical receipt prevents delivery of later valid receipts and product discovery. Recovery failures are isolated per receipt; unverified receipts are never finished or granted.
- If native app-environment detection is initially unavailable, its primary-inventory fallback remains cached for the session. A shop reload now retries an unresolved hint. The hint remains presentation/routing input; the server independently verifies payment environment.

iOS recovery asks for current entitlements plus unfinished transactions and ignores transactions marked revoked, rather than replaying all finished purchase history. Unfinished consumables remain recoverable. The Campaign shop allows another attempt with already-loaded products after a purchase error, using the same authenticated permit and verification gates. No receipt-verification, reconciliation-freshness or cross-account rule is bypassed.

Phone acceptance required for the replacement: Apple sign-in; prices load; buy one World; buy a different item; wait more than15minutes and repeat; close/reopen and Restore; verify permanent ownership; repeat after a temporary network failure. Automated client regressions and native launch checks do not replace that acceptance. Gameplay, prices, revenue assumptions and historical test results are unchanged.

Status: Android62 available internally and in production review with the corrected Google Data safety declaration after successful automatic checks. Apple71 is available in TestFlight and the public app plus22 purchases are Waiting for Review. Latest source and evidence follow; older dated checkpoints remain historical.

## Completed Apple submission and privacy corrections · 12 November 2026

Apple's owner console confirms **23 Items Submitted** in submission `48cbcfd3-beed-4231-92ec-343874da1a5b`: **iOS App1.0.1, build71**, and all **22** products visible in the public shop, each **Waiting for Review**. The nine legacy-only registrations are outside this shop and were not submitted. The app's release setting is automatic after approval. This is submission evidence, not approval, public availability or acceptance of a new production phone purchase.

Build71's OS-only encryption answer is saved (`usesNonExemptEncryption=false`). The existing internal QA group has the build, focused What to Test notes are saved, automatic tester notification is enabled, and the API confirms **IN_BETA_TESTING**. Both Apple screenshot sets contain six current images in the same order: Adventure, Infinity, companions, bridges, gear and Mystery. Verified dimensions are1206×2622 and1320×2868. Old gallery entries were removed with their recoverable originals retained in Asset Library; no historical source evidence was deleted. The public description and reviewer notes explain guest play, optional provider sign-in, verified native purchases, separate review inventory and Infinity-only bought supplies.

Apple's published privacy label now includes the account and purchase data described by the existing privacy policy: Name, Email Address, User ID, Purchase History and Other Data Types, alongside the seven existing SDK disclosures. These five are linked to the account and not marked as tracking; purposes are App Functionality, plus Analytics for Other Data Types. This corrects store metadata and does not add collection to the app.

Google's corrected Data safety questionnaire is saved. It declares OAuth and email/one-time-code account creation, the public account-deletion URL, and no separate partial-data-deletion feature. Name, email address, user IDs, other personal info and purchase history are optional, retained first-party collection, not third-party sharing. Names support app functionality/account management; email and IDs also support security; other info covers eligibility/compliance and optional age-group analytics; purchase history supports functionality and fraud/security checks. Existing approximate-location, diagnostics, app-interaction and device-ID SDK disclosures remain unchanged. Store providers handle card details; no card-data collection was added.

The owner-authorized **Submit1 change for review** and **Restart review** actions included the correction in the Android62 production submission. Google initially moved it from **Changes not yet submitted for review** into **Changes in review**, while stating that forwarding followed successful automatic checks. Subsequent confirmation on12 November: those new checks completed, and Publishing overview explicitly says **Your changes are now in review**, with the corrected Data safety row and **1.0.1(62) · Campaign adventure** in the submission. There are no remaining unsubmitted changes in this flow. Managed publishing stays off; approval/public availability remain pending. Proof screenshots and catalog/media audits are retained outside Git.

Physical-device purchase/Restore acceptance for these production-profile candidates and Campaign interstitial presentation remain unverified. The previous accepted staging sign-ins/purchases retain their dated scope. Apple live reconciliation still needs verification after its first public release; the independent Sandbox review reconciliation does not mark live history healthy. No prices, gameplay rules, paid revenue or business assumptions changed.

Subsequent confirmation on12 November: Google's quick checks completed. Publishing overview explicitly says **Your changes are now in review**, and the production row identifies **1.0.1 (62) · Campaign adventure**. The final review-status proof image is saved outside Git. This supersedes the queued/checking status below; it is not approval or public availability.

## Corrected production candidates and store submission · 12 November 2026

PR129 merged as `271261e8a92fca7bb2e948e1f904240483d2a992`. Exact-main manual full-service checks [43254538909](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43254538909) passed quality, PostgreSQL access controls and both native build/launch jobs. Inspected screenshots show the expected development baseline; these checks do not claim Campaign phone checkout. Reports record Android three cold starts and iPhone two cold starts, real OS lifecycle round trips and zero unexpected runtime errors. No simulator gate was bypassed.

Android **1.0.1 (62)** is compiled and signed from this source with native billing/ads and the production gateway. Its manifest records `campaign-release`, no simulated purchases and no demonstration ads. Signature and bundletool validation passed. SHA256: `09312f6da2c864f22f843ea6d2d17e12fb944e97647c961056bf634061f5f992`. Google Play internal release8 is **Active / Available to internal testers**. The public candidate was promoted from this exact uploaded bundle; previous44 is excluded. Supported devices are unchanged. Nonblocking warnings concern the larger artwork package and an absent deobfuscation file; minification is disabled.

Google's old44 review was withdrawn into editable changes, preserving the app declarations and territories. The replacement **1.0.1 (62) · Campaign adventure** and13 changes were sent using the production review flow. Publishing overview shows **Changes in review** while automated quick checks run, with forwarding to review contingent on their success. Managed publishing remains off. This is a queued review submission, not approval or a public rollout already completed.

Six new screenshots use current Campaign, Infinity, companions, bridges, fitted gear and Mystery assets. Google received the1080×1920 JPEG set in that order; its AI asset declaration accurately labels generated/edited artwork. The current30-mission description and new images are saved. Apple1206×2622 counterparts are prepared and visually checked but not uploaded yet. The older Revised screenshots depict an obsolete shop and are superseded. Local originals, captures and proof images remain outside Git under the protected production StoreMedia directory.

iPhone upload [43257735888](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43257735888) succeeded as **1.0.1 (71)** from exact source `271261e`. App Store Connect confirms **VALID / APP_STORE_ELIGIBLE**. Its OS-only encryption answer, internal tester assignment and public submission remain pending; successful processing does not establish distribution. Earlier70/61 are superseded candidates, not public releases.

Apple purchase metadata was completed through the signed-in owner console with existing prices, all-country product availability, item review screenshots and reviewer navigation notes. English World names now identify the actual companions; legacy immutable product IDs are preserved. A subsequent authenticated API read confirms **20 READY_TO_SUBMIT / 11 MISSING_METADATA** across31 registrations: the remaining visible products are **Hints10 and Sunshades**; the other nine are legacy-only products outside this public shop. Availability and ready metadata are not approval. Authentication expired before the last two and the app submission; the owner was asked to sign back in. Google authenticated catalog audit confirms all six World titles already identify their companions, so no redundant catalog write was made.

The production backend remains source `a17d866`, unchanged by PR129's client label correction. Hosted canonical Sandbox verification and failure-path checks retain their earlier scope. Production phone purchase/Restore acceptance, Campaign interstitial presentation and Apple live reconciliation after the first public release remain unverified. No new payment, revenue, price change or historical acceptance is inferred from this distribution work.

## Subsequent deployment and candidate checkpoint · 12 November 2026

PR128 is merged as `a17d8665df217006bfcbfd09fc42e580c0ad8d02`. Full exact-main checks with both service SDKs passed in `43248446888`: Android three cold starts and iPhone two cold starts plus OS lifecycle round trips, zero unexpected runtime errors; both screenshots were inspected. These are development launch checks, not production purchase acceptance. The earlier PR source `166c989` also passed its required checks and real PostgreSQL access tests.

The additive review migration and `cpi-live` source `a17d866` are deployed only to the separate production project. The protected production configuration now has62 validated registered mappings, same-app store verification credentials, the independent Apple helper key and enabled purchase/review switches. Existing sign-in settings were preserved; staging was unchanged. The prior encrypted configuration is retained for rollback. Temporary plaintext exports were removed. Ranked rewards remain disabled; the public client separately uses registered guest rewarded/interstitial units and fail-open ad presentation.

Hosted helper verification accepted an existing canonical Apple Sandbox receipt, and rejected wrong environment422, altered signature422 and missing authentication404. No receipt, private key or transaction identifier was logged. This tests cryptographic/canonical verification, not a new device checkout or a paid production grant. Hosted maintenance succeeds for Google production, Google review and Apple review. Apple production history still returns401 before the first public release, so that task remains failed and live iOS checkout stays closed by its own freshness gate; review checkout uses separate fresh review reconciliation. This known pre-release restriction is not reported as healthy production verification.

Android **1.0.1 (61)** is compiled and signed from `a17d866`, with registered identity, native services, the production gateway, no simulated shop or demonstration inventory. Bundletool validation and signature checks passed; SHA256 `ca72cb65ca4f8a3b6bd0ad452fbd1b1271b3367f4875da987232aad084435633`. iPhone public-candidate upload workflow `43250641846` succeeded as **1.0.1 (70)**; App Store Connect processing/distribution is still to be verified. Neither candidate is publicly submitted. A public-only Infinity label correction follows in the current branch; final submissions will use the corrected source rather than treating the internal Playtest label as finished presentation.

New current-game captures include Campaign, all companions, bridges, gear and supply detail pages; editorial Apple/Google layouts are under visual verification and are not uploaded yet. The older Revised set depicts an earlier store and will be replaced. The Apple API confirms31 registered entries with missing metadata; the visible public shop exposes22 of them (six Worlds plus sixteen Adventure offers), while nine legacy-only entries remain outside that interface. Complete the relevant products' availability/review images and attach them to the app review. Catalog registration alone does not make them purchasable in production.

The owner confirmed Google and Apple sign-in on TestFlight 1.0.1 (69), after updating from62. Server records show two new iOS69 sessions. The earlier failed report was from62 and does not establish a69 regression. Purchase/Restore happy paths on Android59 and iPhone62 and rewarded-ad presentation remain accepted as previously reported. Campaign completion interstitials still await a phone presentation report.

Production audit found purchase/reward flags disabled, an empty unconfirmed product mapping and no valid payment verification keys in the encrypted production configuration. The reviewed age/country policy and separate production browser sign-in registrations already exist. No new age policy or store price is proposed here.

The two existing, tested additive migrations `20261111000200` and `20261111000300` were applied atomically to production project `wtldjvzvpcfkwfacgsqj`, including migration history, then verified read-only. The current merged `cpi-live` source (`79c1a83`, same runtime as `c9bb373`) was deployed to that project. Both hosted synthetic cancellation ceremonies pass eligibility, begin, HTTP303 app return and cancelled completion, including a Google-shaped query with encoded spaces. No account was created and this is not production provider-login acceptance. Purchases and rewards remain disabled.

## Review purchase isolation implemented in this branch

Apple evaluates purchases in its [sandbox environment](https://developer.apple.com/help/app-review/before-submitting-for-review/configure-in-app-purchases). A public candidate therefore needs authenticated sandbox verification as well as live verification. Review transactions must retain their sandbox ledger classification and must not fund the primary wallet used for official server spending.

The implementation preserves the existing primary wallet and its billing account token. A private owner mapping points to a separate review wallet whose `user_id` is null. Existing official resource queries therefore cannot find it. The authenticated owner lock guards creation/access, and only a fully verified sandbox purchase may grant to this review wallet. The client may choose which of its own inventories to view; that choice never proves payment. Both inventories use the same immutable provider account binding, preserving restore and cross-account rejection.

The review wallet has a distinct inventory token for local save ownership and offline allocations. Test cosmetics, supplies and progress must stay in that separate local inventory. Refund/reversal fingerprints retain their verified environment, exports include review inventory and transfers, and deleting the account removes its review-owner mapping. The normal primary wallet contract remains compatible with existing Android/iPhone test clients. No historical grants or results are relabelled.

The new `20261112000100` migration is additive and does not rewrite historical deliveries. It is included in real PostgreSQL CI before adversarial role tests. `CPI_PURCHASE_REVIEW_ENABLED=true` is accepted only with enabled production commerce. iOS uses the existing native SDK's verified app environment as a view hint; the server still fully verifies both the device receipt and the latest canonical provider transaction before granting. Android follows the last verified receipt's inventory. Explicit view choices cannot mint resources. A live receipt always grants the primary inventory, independently of the request hint.

The separate production Apple helper uses `backend/apple-receipt-verifier/wrangler.production.json`, an independent 64-hex `CPI_APPLE_VERIFIER_KEY` secret and the matching `CPI_APPLE_PRODUCTION_VERIFIER_KEY` in the production issuer. Only exact authenticated `/production/transaction`, `/sandbox/transaction` and corresponding `/notification` routes are accepted. Apple's SDK validates the certificate chain, online revocation, bundle/app ID and environment. Existing staging helper paths/key remain unchanged. Logs/traces are enabled; raw receipts and credentials are not logged. The local Wrangler version is pinned to4.161.0; dry-run packaging passed. The existing Vite8.0.16 development-server advisory reported by npm audit is pre-existing and was not introduced by the helper dependency; no unrelated dependency upgrade is included.

Hosted helper deployment and its independent protected secret are now installed; production issuer integration is still disabled. Google authenticated catalog preflight confirms31 active products, with no next page. Apple's existing same-app payment key succeeds against Sandbox notification history but Production returns401. The app has not yet had a public release: an [Apple App Store Commerce Engineer confirms production API access is unavailable until a production release](https://developer.apple.com/forums/thread/806452). This is consistent with that prerequisite, not proof of invalid credentials or working live payments. Review checkout therefore checks fresh `apple.review` reconciliation independently; it does not mark `apple.production` healthy or bypass verification. Live checkout retains its own freshness requirement. The helper and production canonical receipt checks still need hosted validation. Apple console inspection confirms31 drafts; the inspected new shield product still needs availability and its review screenshot. Public submission has not occurred.

Local checks passed all 873 mobile,315 core,232 server and6 balance tests before the final configuration regression was added; final totals/checks follow in the PR. Pinned Deno live bootstrap check and3 smoke tests passed. The helper's2 route/auth/unsigned-receipt rejection tests passed, and CI now runs them. Synthetic fixtures do not prove provider payments. Remaining: final source checks; provision and validate hosted production verification and canonical product mappings; verify store metadata and purchase review requirements; build exact-main public candidates; attach products/builds and submit both stores. Runtime configuration and signed archives alone do not establish real production purchases or review approval.
