# Step 4: Connect Crystal Path development Supabase through GitHub

**Approved development project reference:** `jbyguybxhezjhdbenevh`.

This is a public project identifier, **not** an access token, database password, or mobile publishable key. It is pinned to this exact development project in `.github/workflows/supabase-development-preview.yml` so the workflow cannot silently switch to The Big Eye or another environment.

**Nothing needs to be installed or run on your computer.** Once the workflow PR is merged, complete these one-time browser-only settings:

1. In **GitHub → georgi-cole/crystal-path-infinity → Settings → Environments**, click **New environment** and name it **`cpi-development`** exactly. Restrict deployment branches to `main`. Where supported, add required reviewers so anyone running this job needs your approval before environment credentials are available.
2. In **Supabase → Account → Access Tokens**, generate a **project-scoped personal access token** for this *development project* (not the existing Big Eye project). A scoped token that allows reading **Project Settings**, **API Keys**, and **API Key Secrets** is needed for `supabase link`. Grant **Database → Read** as well: `supabase db query --read-only` uses the Management API and otherwise fails with HTTP 403, even if `db push --dry-run` succeeds. Scope the token to this project only and give no Management API write permissions. This token is not the Supabase public `sb_publishable_` key and is not a database role key.
3. In the **GitHub cpi-development environment → Environment secrets**, add `CPI_DEV_SUPABASE_ACCESS_TOKEN` with that Supabase access token. Only enter the value into GitHub's secret UI.
4. In the **same GitHub environment**, add `CPI_DEV_SUPABASE_DB_PASSWORD` with the **Postgres database password for this development project**. This is not your Supabase account login password. If you no longer know it, use the official development project's **Database Settings → Reset database password** controls. This credential is powerful even though the present workflow only runs read-only commands; never put it in `VITE_*`, a code file, a PR comment or this chat.
5. After the PR is merged, open **GitHub → Actions → Supabase Development Connection Preview → Run workflow**. Select `main`. Review the protected-environment approval if prompted.

## What the workflow will do

- Verify it is running on `main` with approved development project reference `jbyguybxhezjhdbenevh` and both environment secrets present.
- Install the pinned Supabase CLI 3.0.0 on GitHub's hosted runner.
- Link the runner's disposable local Supabase directory to **only that development project**.
- Verify Database → Read permission with `supabase db query "select 1 as cpi_readonly_probe" --read-only --remote=jbyguybxhezjhdbenevh`.
- Run `supabase db push --dry-run --remote=jbyguybxhezjhdbenevh`. The command **prints migrations that would be applied but never runs them**. The CPI-017 foundation migration is `20261103000100_cpi017_foundation.sql`.
- Finish with “Preview complete. No migration was deployed.” No account table, leaderboard or backend feature becomes live from the preview.

The workflow is **manual-only**, with an explicit main-branch check, environment-scoped secrets and read-only GitHub permissions. There is no `--yes`, `db reset`, `migration repair`, remote seeding or CI auto-deployment, including on PR merges. Static security assertions run in the existing Supabase CLI readiness workflow.

## Before applying the migration

Review the dry-run output for the exact development project ID and CPI-017 migration. The next action is an explicitly approved, **manual-only** CPI-017 schema deployment. Follow [the exact project and confirmation instructions](SUPABASE_DEV_DEPLOY.md). **Merging its PR does not deploy anything.** Deploying SQL is not reversible by simply rerunning a dry-run.

Also verify your **hosted Supabase Data API → Exposed schemas** excludes `cpi_private` and `auth`. Local `supabase/config.toml` does not automatically change that hosted setting. The CPI-017 PostgreSQL tests are disposable simulated roles and do not replace later live Supabase negative access tests.

References: [Supabase CLI v3 target/dry-run behavior](https://supabase.com/docs/guides/local-development/local-and-hosted-projects), [Supabase access-token scopes](https://supabase.com/docs/guides/platform/personal-access-tokens).
