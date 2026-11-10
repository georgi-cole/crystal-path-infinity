# CPI-018 · Public browser sign-in

## 11 November 2026 · Preparation, not live acceptance

The owner requested Apple, Google and email account creation on the GitHub Pages game, and approved a 13+ starting account age with higher local thresholds. Guest play has no account age check. That product approval is not a claim that every country's policy has been researched or that the web service is already live.

The public Pages build currently has accounts disabled. The iPhone staging provider integration cannot be enabled on the website by a build flag: it uses native prompts, a staging OAuth audience, approved tester addresses and an adult Bulgaria policy. Those rules stay separate.

This branch adds a production browser flow using the existing account issuer and production project `wtldjvzvpcfkwfacgsqj`. It reuses the account eligibility screen, then opens a provider popup. The server validates provider signatures, audience, expiry and a consumed challenge; Google also uses PKCE. New provider accounts are created without an email code. An existing email account requires one code before linking, preserving its owner, purchases and progress. A new account may skip the optional profile screen and return home. Provider identities do not promote local results to ranked scores.

The fixed OAuth callback is `https://crystalpath-api.kolequant.xyz/cpi/identity/web-callback`. Its no-store, script-restricted response sends proofs only to the initiating Pages window. The client checks the callback origin, popup reference and random state. No access or refresh token goes in a URL or persistent browser storage. Apple refresh credentials remain encrypted on the server and are revoked by account deletion.

## Separate provider registrations

- Google project and client created: **Crystal Path Production Login**, `crystal-path-production-login`, with the exact Pages origin and API callback. The owner approved the public Google support address and the Google API Services User Data Policy. Credentials were saved encrypted outside Git. The game/privacy links are saved and the audience shows **In production**. Only `openid email profile` is requested; no sensitive Google API access is requested.
- Apple Services ID configured: **Crystal Path Production Web**, `com.georgicole.crystalpath.infinity.web`, grouped with the Crystal Path primary App ID and the Pages/API domains. The owner approved production access and a dedicated key. That key was created, downloaded and saved encrypted outside Git. The staging key is not reused.
- Production runtime configuration uses `CPI_WEB_IDENTITY_ENABLED`, `CPI_IDENTITY_GOOGLE_WEB_CLIENT_ID`, `CPI_IDENTITY_GOOGLE_WEB_CLIENT_SECRET`, `CPI_IDENTITY_APPLE_WEB_KEY_ID`, and `CPI_IDENTITY_APPLE_WEB_PRIVATE_KEY`. Keys belong only in the private server configuration and hosted secrets.

## Activation and acceptance

### Approved initial age settings · 11 November 2026

The owner approved a 13+ starting age with higher local limits, and then approved the temporary 18+ fallback for other countries while their teen-specific requirements are checked. The [deployed policy](account-policy-20261111.json) has version `cpi-web-accounts-20261111-v1`. Eighteen is a rollout setting, **not a claim that every such country legally requires 18**. China and Vietnam remain closed for account signup because the required identity/player-verification methods are not integrated. The stricter rule for connection and residence applies. Unknown connection countries stay closed.

| Minimum age | Country codes |
| --- | --- |
| 13 | BE, DK, EE, FI, GB, IS, LV, MT, NO, PT, SE, US |
| 14 | AT, BG, CY, ES, IT, LT |
| 15 | CZ, FR, GR, SI |
| 16 | DE, HR, HU, IE, LI, LU, NL, PL, RO, SK |
| Temporary 18 | Remaining supported countries, except the closed contexts below |
| Account signup closed | CN, VN |

Evidence: [OECD government policy mapping, privacy section and Annex D](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/06/the-legal-and-policy-landscape-of-age-assurance-online-for-child-safety-and-well-being_cdf49a15/4a1878aa-en.pdf), [GDPR Article 8](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), [Bulgarian Act, Article 25c](https://cpdp.bg/wp-content/uploads/2023/08/ZZLD_26_02_2019_En.pdf), [UK Data Protection Act section 9](https://www.legislation.gov.uk/ukpga/2018/12/section/9), and [FTC neutral age-screen guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions). This mapping does not establish a completed worldwide legal assessment or verified age assurance.

The closed contexts follow [China's published real-name game-registration rule](https://english.court.gov.cn/2017-05/02/c_761645.htm) and [Vietnam's government guidance on Decree 147/2024](https://game.gov.vn/tin-tuc/current-regulations-on-online-video-games-government-decree-1472024nd-cp-on-the-management-provision-and-use-of-internet-services-and-cyber-information-decree-147-38n3). No identity-document collection was added to the game.

### Hosted preparation verified on 11 November 2026

The three provider migrations from 9 November were applied to the separate production project. The server and Cloudflare OAuth callback are deployed from source `988b98a`. `/identity/config` returns the two public production identifiers with the exact Pages CORS origin; the callback returns a no-store page restricted to the initiating Pages window. Live eligibility probes from a Bulgarian connection rejected age 13 for BG, admitted 14 for BG, rejected 17 for the temporary CA setting, admitted 18 for CA and rejected CN. No email or account was created by those probes.

The production Worker had no maintenance schedule. A one-minute schedule is now configured; an authenticated maintenance invocation returned HTTP 200 with no failures and zero pending mail, purchase completions or deletions. Existing advertising/service flags and private gateway keys were preserved. The public Pages build remains disabled until the source checks and main publication complete. Real provider sign-in, mailbox receipt and export/deletion acceptance are still pending; these setup checks do not replace them.

Before publication, complete the registrations; apply the approved account territory policy to production; verify email delivery, both provider ceremonies, existing account linking, export and Apple revocation/deletion using an explicitly disposable account. Review the privacy notice against the deployed data path. No production account was deleted as part of this preparation.

Pages activation uses `CPI_PAGES_ACCOUNTS_ENABLED=true` and `CPI_PAGES_WEB_PROVIDER_SIGN_IN=true` on publication from main. The provider flag alone does not enable accounts. Only public client identifiers are fetched from `/identity/config`; secrets remain on the server. The API accepts the production web protocol only when the pinned production project enables it. Native staging keeps its original protocol and tester lists.

This does not enable native production account sign-in, web ads, web billing, tester controls, demo ads or simulated purchases. Game rules, the ten-continuation contract and existing run rules do not change.

## Local evidence

On 11 November 2026, the focused issuer and identity suite passed 24 checks on the working branch, including a new teen web signup, a browser session, replay rejection, native/staging separation and proof of the existing email before linking. The callback/gateway suite passed six checks. These use synthetic provider responses and a local database; they do not establish successful Google/Apple production login or live email delivery. Record the exact committed revision and live acceptance separately before activation.

[Web signup policy](WEB_SIGNUP_ROLLOUT.md) · [Release setup](../RELEASE_SERVICES_SETUP_BG.md)
