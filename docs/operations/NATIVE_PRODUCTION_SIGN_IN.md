# CPI-018 · Production mobile account entry

## 11 November 2026 · Implementation and candidate preparation

The owner requested the same Apple, Google and email login in the iPhone and Android apps as on the public website. This record supersedes the native-login limitation in the browser preparation record; it does not change historical device results or claim that a new store build is already available.

Production mobile clients use project `wtldjvzvpcfkwfacgsqj` and `https://crystalpath-api.kolequant.xyz/cpi`. Both offer Apple, Google, email and guest entry. The approved age/country policy applies before account entry; optional profile choices remain skippable. Guest play requires neither an account nor an age answer. A linked identity returns to the original production owner across website and mobile. An email collision requires proof before linking; staging users, purchases and provider audiences are not imported into production.

The provider ceremony uses iOS `ASWebAuthenticationSession` or Android system Auth Tab (Custom Tab fallback), never the game WebView. Production web clients use the additional fixed callback `https://crystalpath-api.kolequant.xyz/cpi/identity/mobile/callback`. Google uses PKCE; both providers use server challenges, expiry and state. Provider responses remain encrypted on the server during the five-minute flow lifetime. The app return URL contains state only, no provider token, code, email or game session. Completion needs the separate app-held token, the screened permit or original account family, and the original connection country. Claims are consumed once. Scheduled maintenance removes expired attempts.

Applications opt in with `VITE_NATIVE_PROVIDER_SIGN_IN=true`, the production account gateway and a native build number. Server opt-in is `CPI_MOBILE_IDENTITY_ENABLED=true` on the pinned production project; browser identity must also be configured. Generated `account-services-info.json` records the selected production gateway and providers for binary inspection. Refresh sessions use the existing device-protected production vault; the staging vault remains separate.

Enabling accounts does not silently enable ranked admission. Production candidates keep normal full local gameplay unless `VITE_RANKED_SERVICES_ENABLED=true` is separately selected. Live guest AdMob units and the ten-continuation rule are unchanged. This change does not enable simulated purchases, demonstration ad units or tester controls, nor does it open the currently disabled production purchase verifier. Commerce and ranked rollout require their own live acceptance.

## Verification status

Local synthetic issuer tests cover Android/iPhone teen sessions, cross-platform owner continuity, existing-account proof, replay rejection, unknown/expired handoffs and cancellation. They do not establish a physical-device provider ceremony. Native compile and signed-package checks verify the selected gateway, return scheme, app identity and absence of QA/simulated assets. Record exact candidate versions, hosted deployment and device results separately as they complete.

Store metadata and signed iOS packaging helpers were selectively carried forward from the separate store-candidate proposal in PR #105; its older whole branch must not be merged over newer main. No icon, marketing image or unrelated application source was copied from it.

Platform references: [Apple authentication sessions](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession), [Android Auth Tabs](https://developer.chrome.com/docs/android/custom-tabs/guide-auth-tab), [OAuth for native applications](https://www.rfc-editor.org/rfc/rfc8252.html).

Before activation: register the additional callback with both production providers; apply the additive handoff migration; deploy the production function; add only `capacitor://localhost` and `https://localhost` to the existing production CORS origins; set the mobile flag without overwriting unrelated service flags. Test provider handoffs, cancellation, email delivery, cold restart and owner continuity on actual devices. A server deployment cannot update an installed binary: a new TestFlight/Play package and subsequent store review/distribution are required.

The owner previously requested phone testing before merge. The production-account preview therefore stays on `codex/native-production-sign-in` until that test. Only a manual run on the exact current PR #108 head, with an open PR against current main and passing required checks, may sign this preview. The TestFlight upload is internal-only and cannot replace the App Store build under review. Normal store candidates still require current main. The existing staging TestFlight route keeps its original checks and configuration.

### Preparation evidence · 11 November 2026

Both production provider consoles saved the additional mobile callback, retaining the website callback; Google Audience remains In production. Local production Android generation/check and `assembleRelease`/`bundleRelease` completed on JDK 21.0.10 with the live guest ad SDK. Local lint and the complete suites passed: mobile 733, game core 315, server core 215 and balance 6. These are working-branch results; iPhone compilation, required Actions, signed package distribution and physical-device login remain pending. No production account was created or deleted by these checks. The existing production purchase/reward service switches remain untouched.

### Hosted preparation on source 8598e55 · 11 November 2026

The additive handoff migration and function were deployed to production. Only the mobile identity flag and the two exact native CORS origins were added. Preflight responses are HTTP 204 for Android, iPhone and Pages, the native begin route is recognised, and the website provider configuration remains HTTP 200. The production purchase and ranked reward switches remain false. Automated live signup/cancellation was not completed: automatic approval review blocked that scripted probe without a more specific reason. No real sign-in or email delivery is claimed. The cloud production iPhone compile and Android launch passed on this source; the generic iPhone lifecycle check was still running when this record was added.

Android 1.0.0 build 45 was signed with the existing Play upload certificate and its APK/AAB signatures verified. Inspection of both packages found the production account manifest and live guest inventory, without demo IDs, simulated wallet, tester controls or private credential markers. Receipts and signed packages are stored privately outside Git. Apple still shows build 44 in review; this work has not replaced it or changed its release setting.
