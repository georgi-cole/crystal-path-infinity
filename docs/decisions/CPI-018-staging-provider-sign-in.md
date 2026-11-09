# CPI-018 · Apple and Google sign-in on iPhone staging

## 9 November 2026 · Internal review candidate

The Profile entry offers Apple, Google and email. A fresh sign-in still checks age and country before opening a provider. For this beta, sign in with the existing staging email once and link Apple or Google from **Profile → Sign-in methods**. Each provider then signs in to that same account. This keeps staging worlds, purchases, credits and saved runs on their existing owner. Email and guest practice remain available.

The staging gateway validates a short-lived, single-use challenge before accepting a provider proof. Linking requires the active iPhone account session. The server verifies the provider signature, audience, expiry and nonce. Google uses the iPhone system sign-in window with PKCE. Apple uses the native Apple prompt. Linked identifiers are hashed, and Apple’s revocation token is encrypted and used by the existing account deletion workflow. The beta requires explicit linking to an existing staging account.

The client and hosted configuration require the specific staging gateway and isolated Supabase staging project. The staging iPhone review job verifies the current review commit and required checks, uses a separate branch-scoped signing environment, and exports to TestFlight Internal Only. The public web and production account routes remain on their existing sign-in configuration. Production provider rollout needs a separate decision and device and deletion acceptance. Device acceptance covers the native Apple and Google prompts. The local preview covers the layout.

## 9 November 2026 · Build 29 tester feedback

The tester reached the provider prompts with Bulgaria selected. Build 29 displayed other countries in the form, even though the staging account policy only allows adults with both residence and connection country in Bulgaria. The follow-up limits the staging form to Bulgaria and explains the requirement before submission. The beta sign-in screen also shows the one-time linking instructions before Apple and Google open. Direct provider sign-up for new players remains a separate production rollout.

## 9 November 2026 · Direct signup review

The next internal candidate asks a first-time Apple or Google player to confirm **Create account** after the provider and the age and country check succeed. It uses the provider-verified address and stable identity to create a fresh account without an email code. The player can choose **Use my existing account** before creating anything. A matching email on an existing Crystal Path account requires sign-in to that account before linking. A provider already linked to an account signs in to that same owner. Purchases, progress and regions remain tied to their original account IDs.

Direct signup is enabled only in the isolated staging project and only for the verified addresses approved for each provider. Bulgaria and adult eligibility still apply. Build 29 continues to use its original linking contract. The existing email test allowlist stays separate from new provider signup. Real Apple relay signup requires an approved relay address. The existing Apple address exercises the account collision check.

A signup confirmation expires after five minutes or when its eligibility permit expires. The server stores the temporary proof encrypted. A concurrent or interrupted Auth write can be recovered only by the same verified provider identity. The Apple refresh credential stays encrypted for account deletion. The app asks providers for email and keeps only the verified address and the identity data it needs for the account. Before public rollout, validate both providers, account export and deletion, and Apple relay email delivery on a device.

## Review checks

- Inspect Profile and the provider choice layout in the local preview.
- In the internal iPhone build, link both providers from the existing staging account. Sign out and use each button. Confirm the same worlds, purchases and saved runs appear.
- Cancel a provider prompt and check the other options are still available. Use an approved unused provider address and create an account without receiving a code. Sign out and verify the same account opens on the next provider sign-in.
- Use the existing Apple email and confirm the account links only after signing into the existing profile. Check that the existing worlds and purchases are still there.
- Swipe horizontally on Profile, Rankings and Discoveries. Check vertical scrolling on long content.
- Check that Apple revocation completes before the staged account deletion finishes using an explicitly disposable account.

[Apple token verification](https://developer.apple.com/documentation/signinwithapple/verifying-a-user) · [Apple account deletion](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple) · [Google OAuth for installed apps](https://developers.google.com/identity/protocols/oauth2/native-app)
