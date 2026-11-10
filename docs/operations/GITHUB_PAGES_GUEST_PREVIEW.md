# GitHub Pages guest game preview

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
