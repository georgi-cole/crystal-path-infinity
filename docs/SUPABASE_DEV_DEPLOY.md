# CPI-017 — development database deployed; security audit pending

**Status: migration applied, hosted security audit not yet verified.** On 3 November 2026, the approved manual [deployment run #41672961735](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41672961735) executed `20261103000100_cpi017_foundation.sql` on the separate Crystal Path: Infinity **development project** `jbyguybxhezjhdbenevh`.

The GitHub job reported **`Applying migration 20261103000100_cpi017_foundation.sql...`**, then **`Finished supabase db push.`**. The job's *later* read-only post-deployment security query failed because Supabase's experimental read-only SQL validator rejected an entity reference. A red GitHub job status therefore does **not** mean the migration failed. It means we have **not completed live verification**.

**Do not rerun the one-time CPI-017 Development Database Deployment workflow, repair migration history, reapply the SQL, reset the database, or change the database password.** None of those operations is warranted by the evidence.

## Next: run the independent read-only security audit

After the [postdeployment audit PR](https://github.com/georgi-cole/crystal-path-infinity/pulls) is reviewed, passes CI and merged:

1. Open **GitHub → Actions → CPI-017 Development Security Audit (read-only)** and select **Run workflow** on `main`. This is a **new workflow**, separate from both the old preview and the database deployment.
2. The workflow uses the existing protected **`cpi-development`** GitHub environment and its secrets. No new token, Supabase project or local terminal is needed.
3. The workflow pins the hosted project to `jbyguybxhezjhdbenevh`, links only in temporary GitHub-runner state and issues only small, fixed, **`supabase db query ... --read-only`** SQL statements.
4. It verifies all **11 tables** exist, all **11 have RLS enabled and FORCE RLS**, `cpi_private` is not usable by guest or mobile-account roles, its private tables give those roles no direct DML/read permissions, `profiles_public` is readable but not writable by those roles, the public profile has exactly five intended columns and `service_role` has the expected trusted server permissions.
5. Every result is named **PASS**, **SECURITY CHECK FAILED** or **QUERY REJECTED / INCONCLUSIVE**. It prints no token, password, SQL response or private data. A failed API query makes the whole audit fail, not pass. More than three rejected queries cause early exit to avoid unnecessary API calls.

Only a final **`CPI-017 read-only hosted security audit: PASSED`** with all individual checks passing completes this catalog-level audit. The deployed schema remains unchanged regardless of the result.

### If the audit fails

A **SECURITY CHECK FAILED** result means the read-only endpoint returned a definite negative security assertion; investigate that specific table, role or RLS setting before using the schema. **QUERY REJECTED / INCONCLUSIVE** means the strict SQL endpoint would not verify the specific property, *not* that security is correct or incorrect. Do not relax the checks or grant additional app permissions merely to make them pass. If catalog access is limited, prepare an alternative trusted read-only verification path.

You do **not** need to rerun the original schema deployment to complete verification.

## Scope and outstanding acceptance criteria

The CPI-017 migration creates the trusted data ownership, privacy, score and reward foundation, but it does **not** create account onboarding, public ranked RPCs, verified score submissions, payment/revive endpoints or production deployment. It uses one intentionally readable `public.profiles_public` table and ten RLS-protected tables in `cpi_private`. The user identifiers in `auth.users` are not published through `profiles_public`.

A passing catalog audit is not the same as live **guest / account A / account B** HTTP-level denial tests using real Auth tokens. Those integration tests, appropriate minors/guardian privacy safeguards, backup/restore testing and separate staging and production Supabase projects remain required before enabling CPI-018 public account creation or ranked play.

Official references: [Supabase read-only Management API](https://supabase.com/docs/reference/api/v1-read-only-query), [Supabase CLI hosted targets](https://supabase.com/docs/guides/local-development/local-and-hosted-projects), [GitHub environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
