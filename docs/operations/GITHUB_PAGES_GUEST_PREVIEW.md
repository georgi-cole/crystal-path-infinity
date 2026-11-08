# GitHub Pages guest game preview

Related release work: [CPI-038 / #38](https://github.com/georgi-cole/crystal-path-infinity/issues/38).

The owner authorized a public browser preview for clicking through and testing
guest practice. This does not approve accounts, ranked services, ads, or a store
release. The policy drafts remain private review documents.

The game URL is <https://georgi-cole.github.io/crystal-path-infinity/>. GitHub
Pages must use **GitHub Actions** as its publishing source, replacing the legacy
main-root README publication. The Pages workflow builds the actual Vite app and
uploads only `apps/mobile/dist`, with the `/crystal-path-infinity/` asset base.
Native builds retain their existing asset paths and environment identities.

## Verification and deployment

Every PR validates the guest Pages build without deploying it. Main pushes and
manual runs on main deploy through the protected `github-pages` environment.
Manual runs on `codex/store-test-mode` and the dedicated `codex/phone-preview`
branch also publish the guest build for owner-authorized phone testing. The
phone-preview branch is a snapshot of `codex/mystery-pacts`; it publishes only
the same guest web bundle. Required app and planning checks still apply to the
PR before merge; this workflow does not weaken or replace them. Actions are pinned
to commit SHAs.

With the pinned Node version and installed workspace dependencies:

```sh
npm run typecheck
node --experimental-strip-types .github/scripts/build-pages.mjs
```

The build rejects nonempty public `VITE_*` configuration, including local env
files and inherited runner variables. It uses the existing production identity
and the default app entry point, which injects no account, leaderboard, ranked,
or rewarded-ad services. It verifies the compiled entry point, project asset
paths, existing files and build identity before upload. No backend credentials
or repository source directory is published. `deployment-info.json` records the
source SHA and the guest-only service scope.

After deployment, verify the main menu, new practice, gameplay input, settings,
profile/account-unavailable state, hash navigation and reload. Saved practice is
local to that browser and origin; it is not a verified online result. Browser
testing does not replace native-device acceptance. Public signups, anonymous
sign-ins, ranked starts and ads remain disabled in Supabase.

For rollback, rerun the Pages workflow from a reviewed revert on main. To stop
publication, disable the Pages workflow and unpublish the site in repository
Pages settings; do not re-enable account or ad services as a workaround.
