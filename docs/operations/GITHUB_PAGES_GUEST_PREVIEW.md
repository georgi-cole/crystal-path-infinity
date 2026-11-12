# GitHub Pages guest game preview

**13 November 2026 publication correction.** Main run `43329745995` correctly blocked publication because account-enabled compilation retained unused native demo-ad inventory. `campaign-web` now statically returns account-only services, removing native billing/ad paths from the browser bundle. Validate both existing account opt-ins with the same Pages script and unchanged no-demo/no-simulated-wallet assertions; no ad flags are enabled. The failed run did not replace the live site.

## Current publication contract - 13 November 2026 (CPI-048)

This dated update supersedes the classic guest-only game description below; the
older rollout notes remain historical. The owner authorized publishing the current
Campaign and Infinity game at the same public URL.

The Pages script builds Vite mode `campaign-web`, with the existing project asset
base. It enables the current 30-mission Campaign, Infinity, rewards/cinematics,
Discoveries, weather, character artwork and store previews. It does not publish QA
controls or free test claims. `campaign-web-info.json` records this contract, and
`deployment-info.json` records the deployed commit and account configuration.

Paid offers show mobile-app reference prices and disabled **Available in the app**
actions. There is no browser billing provider, restore operation, native entitlement
import, mock checkout, rewarded ad, interstitial or synthetic ad reward. Earned
Campaign items can still be equipped. Native checkout and advertising are unchanged.

The existing main-only production account opt-in and exact-origin gateway check
remain in place, including the separate web-provider opt-in. Sign-in availability
is still governed by the live account service. It does not synchronize this local
Campaign progress or restore native entitlements. Browser saves use
`cpi.campaign-web.v1:`; old classic and QA saves remain untouched. Clearing site data
removes the local save. These are local results, not official ranked records.

Configuration validation rejects native billing, ad inventory, ranked services,
release metadata and test-service switches in this profile. The Pages output is
checked for the public-browser metadata contract and absence of QA wallet/test
controls. Only reviewed main publication uploads `dist-pages`; PRs validate only.

Source acceptance: 1,513 application tests, 18 Pages policy/account tests, typecheck,
lint, formatting and development/staging/production/Pages builds passed. Local
project-base browser checks cover current Campaign navigation, mission start, hint,
pause/save and resume after reload. Browser acceptance does not verify mobile
purchases or native ads. Live commit/metadata and UI acceptance must follow merge.

## Historical rollout notes

Related release work: [CPI-038 / #38](https://github.com/georgi-cole/crystal-path-infinity/issues/38).

The owner authorized a public browser preview for clicking through and testing
guest practice. This does not approve accounts, ranked services, ads, or a store
release. The policy drafts remain private review documents.

The game URL is <https://georgi-cole.github.io/crystal-path-infinity/>. GitHub
Pages must use **GitHub Actions** as its publishing source, replacing the legacy
main-root README publication. The Pages workflow builds the actual Vite app and
uploads only `apps/mobile/dist-pages`, with the `/crystal-path-infinity/` asset
base. A QA build is checked separately and is not included in that artifact.
Native builds retain their existing asset paths and environment identities.

## Verification and deployment

Every PR validates the guest Pages build without deploying it. Main pushes and
manual runs on main deploy through the protected `github-pages` environment.
Required app and planning checks still apply to the PR before merge; this
workflow does not weaken or replace them. Actions are pinned to commit SHAs.

With the pinned Node version and installed workspace dependencies:

```sh
npm run typecheck
node --experimental-strip-types .github/scripts/build-pages.mjs
```

The build rejects public `VITE_*` configuration from local env files and the
runner. By default, the player build receives no account, leaderboard, ranked,
or rewarded-ad service configuration. Production email accounts are an explicit
opt-in through the `CPI_PAGES_ACCOUNTS_ENABLED` repository variable. That option
works only for a main publication and the build must first verify that the fixed
production gateway allows the exact Pages origin. It passes only the public API
URL and enable flag to the player build; no credentials are published. The QA
build receives none of that production account configuration. The script also
checks the output for demo ad IDs, tester controls and the simulated wallet, and
`deployment-info.json` records the source SHA and account-service state.

The production signup policy currently approves no countries, so accounts stay
unavailable and guest play remains the public default until policy and real
mailbox acceptance are complete. Public rankings, ads and web purchases remain
disabled.

After deployment, verify the main menu, new practice, gameplay input, settings,
profile/account state, hash navigation and reload. Saved practice is local to
that browser and origin; it is not a verified online result. Browser testing
does not replace native-device acceptance. Supabase anonymous sign-ins, ranked
starts and ad rewards remain disabled.

For rollback, rerun the Pages workflow from a reviewed revert on main. To stop
publication, disable the Pages workflow and unpublish the site in repository
Pages settings; do not enable account or ad services as a workaround.
