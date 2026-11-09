# CPI-018 · Apple and Google sign-in on iPhone staging

## 9 November 2026 · Internal review candidate

The Profile entry offers Apple, Google and email. A fresh sign-in still checks age and country before opening a provider. For this beta, sign in with the existing staging email once and link Apple or Google from **Profile → Sign-in methods**. Each provider then signs in to that same account. This keeps staging worlds, purchases, credits and saved runs on their existing owner. Email and guest practice remain available.

The staging gateway validates a short-lived, single-use challenge before accepting a provider proof. Linking requires the active iPhone account session. The server verifies the provider signature, audience, expiry and nonce. Google uses the iPhone system sign-in window with PKCE. Apple uses the native Apple prompt. Linked identifiers are hashed, and Apple’s revocation token is encrypted and used by the existing account deletion workflow. The beta requires explicit linking to an existing staging account.

The client and hosted configuration require the specific staging gateway and isolated Supabase staging project. The staging iPhone review job verifies the current review commit and required checks, uses a separate branch-scoped signing environment, and exports to TestFlight Internal Only. The public web and production account routes remain on their existing sign-in configuration. Production provider rollout needs a separate decision and device and deletion acceptance. Device acceptance covers the native Apple and Google prompts. The local preview covers the layout.

## Review checks

- Inspect Profile and the provider choice layout in the local preview.
- In the internal iPhone build, link both providers from the existing staging account. Sign out and use each button. Confirm the same worlds, purchases and saved runs appear.
- Cancel a provider prompt and check the other options are still available. Confirm an unlinked identity prompts for linking via email.
- Swipe horizontally on Profile, Rankings and Discoveries. Check vertical scrolling on long content.
- Check that Apple revocation completes before the staged account deletion finishes using an explicitly disposable account.

[Apple token verification](https://developer.apple.com/documentation/signinwithapple/verifying-a-user) · [Apple account deletion](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple) · [Google OAuth for installed apps](https://developers.google.com/identity/protocols/oauth2/native-app)

## 9 November 2026 · Receipt verification integration

The signed-in Play review branch includes the Apple Sandbox receipt verifier and the latest launcher and audio updates from main. The account issuer uses both the provider verifier and the staging tester allowlist. The PostgreSQL fixture exercises provider linking and session exchange with the allowlist active, then checks wallet access on the original account.

Build 35 uses the newer staged provider flow. [Its device purchase checks](../RELEASE_SERVICES_SETUP_BG.md#testflight-build-35) cover a world, one consumable delivery and purchase recovery with the same account.
