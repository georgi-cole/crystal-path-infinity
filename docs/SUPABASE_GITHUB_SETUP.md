# Supabase CLI in GitHub — no installation on your computer

**Step 3 is repository-hosted.** The project has an initialized `supabase/config.toml`, retains the CPI-017 migration in `supabase/migrations/`, and installs a pinned Supabase CLI **on a GitHub Actions runner** using the official `supabase/setup-cli` action. This intentionally avoids changing the mobile workspace dependencies and `package-lock.json` solely to operate a cloud database.

## What works now

In GitHub, open **Actions → Supabase CLI readiness → Run workflow** (once this change is merged). The workflow uses Supabase CLI 3.0.0, verifies the CLI and migration commands, checks that `config.toml` is valid TOML, and confirms the existing CPI-017 migration is intact. It does **not** require GitHub secrets, contact a remote project, install anything on your PC, run a local Docker stack, or apply migrations.

The `project_id = "crystal-path-infinity"` value is **only a local workspace identifier**, not the Project Reference in your Supabase dashboard. **Do not replace it with a secret.** The local API exposes only the configured public/storage schemas; `cpi_private` is never permitted in the Data API configuration. The hosted Dashboard's **Exposed schemas** is a *separate* setting and must still be verified in step 2.

The CLI version is pinned to the current stable v3 line rather than using floating `latest`. Supabase CLI v3 differs from old examples: hosted database commands must explicitly specify `--remote`, and writes require explicit approval (`--yes` in unattended CI). This workflow deliberately contains **no hosted writes**.

## Next step: connect your development project (separately)

Once the repository workflow is green, we can prepare a **development-only GitHub Actions** workflow for a read-only migration preview. For that step, you will set the following through GitHub **Settings → Secrets and variables → Actions** or a protected **development** environment:

- A GitHub *variable* holding the **development Supabase project reference** (a non-secret identifier).
- A GitHub *secret* for a narrowly scoped `SUPABASE_ACCESS_TOKEN` used by the official CLI.
- Only if required by the validated connection route, an environment-scoped `SUPABASE_DB_PASSWORD` secret.

Never paste passwords, access tokens, service-role keys or connection strings into a chat message, source file, a PR comment or the mobile app. Never point the CLI at The Big Eye project, staging or production during this development step. Deploy the CPI-017 SQL only after confirming the target reference and viewing the **dry-run** output; hosted deployment requires a separate approval and workflow.

## Files

- `supabase/config.toml`: the local project's non-secret CLI configuration.
- `supabase/.gitignore`: keeps CLI local state and environment files out of Git.
- `supabase/migrations/20261103000100_cpi017_foundation.sql`: existing backend migration (unchanged).
- `.github/workflows/supabase-cli.yml`: installs and checks the CLI on GitHub-hosted infrastructure.

Official references: [Supabase CLI setup](https://supabase.com/docs/guides/local-development/cli/getting-started) and [Supabase CLI v3 changes](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3).
