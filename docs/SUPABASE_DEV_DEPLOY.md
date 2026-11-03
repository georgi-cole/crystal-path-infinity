# CPI-017 — manually approved deployment to development Supabase

**Prepared, not deployed.** The successfully completed Supabase Development Connection Preview showed exactly one pending migration, `20261103000100_cpi017_foundation.sql`, for the owner-designated **development** project **`jbyguybxhezjhdbenevh`**. The Supabase CLI labeled its default database branch `production`; this describes the **default branch within that project**, not permission to use a separate future Crystal Path production project. The exact project reference is the authoritative target.

## What is going to change

The reviewed migration creates one public `profiles_public` table (opaque public ID, publishable username/country) and ten `cpi_private` tables: the secret Auth-ID mapping; private age/consent/guardian information; ranked run checkpoint and action ledger; reward intentions, unique signed provider transactions and grants; and unexposed score sources. It enables forced RLS and explicit grants. Only safe public profile fields are readable by mobile roles; direct client modifications to scores, SP, revives, account data and private ledgers remain forbidden.

**This is a real database mutation.** It is appropriate only for the empty, owner-approved development project. The migration has an explicit `BEGIN`/`COMMIT`, but there is **no automatic rollback** workflow. Back up any data you want to keep before the first application and do not apply this to The Big Eye, staging or production.

## What you do in GitHub

1. Review and merge the PR containing `.github/workflows/supabase-development-deploy.yml` only once its **Supabase CLI readiness**, PostgreSQL security, planning and application checks have passed. **Merging does not deploy SQL.**
2. Open **GitHub → georgi-cole/crystal-path-infinity → Settings → Environments → `cpi-development`**. Confirm the two secrets already used by the successful preview are present: `CPI_DEV_SUPABASE_ACCESS_TOKEN` and `CPI_DEV_SUPABASE_DB_PASSWORD`. The scoped Supabase PAT must include **Database → Read** as well as **Project Settings → Read, API Keys → Read and API Key Secrets → Read**. The previous read-only preview did **not** test that extra permission. Restrict this environment to `main`; configure **required reviewers** where available. If you configure approvals, consider disabling administrator bypass for genuine separation. GitHub's limitations may prevent a lone initiator from self-approving if self-review is prohibited. Do not share credentials in chat.
3. Open **Actions → CPI-017 Development Database Deployment → Run workflow** and select **`main`**.
4. Enter both required form inputs **exactly**:
   - **Project reference:** `jbyguybxhezjhdbenevh`
   - **Confirmation:** `APPLY CPI-017 TO DEVELOPMENT`
5. Click **Run workflow** and approve the `cpi-development` environment gate if your configured rules require it. These manual actions constitute explicit approval. No code run or PR merge triggers deployment by itself.
6. Inspect the result. The job's preflight verifies the project and confirmation, then compares the **Git blob SHA** of the only SQL migration to the reviewed `accc66e9e1a539c9527852f95595dacbe39959a7`. If another migration/roles/seed file is added or the SQL changes, deployment stops **before** credentials are exposed to the deployment job. It then checks the remote database does not already contain the CPI tables and confirms a fresh dry run lists **exactly one pending migration** before issuing one `supabase db push --yes --remote=jbyguybxhezjhdbenevh`.
7. After the push, the workflow runs a **read-only** catalog audit: 10 forced-RLS private tables, a forced-RLS public profile, only five safe public columns, no `anon`/`authenticated` access to private schema, no mobile privilege to write SP, scores or revives, and trusted server privileges. The output should say `CPI-017 development schema deployed and catalog privileges verified.`

Supabase CLI v3 requires `--yes` for a hosted write in non-interactive CI. This command appears **only** after the two typed inputs, reviewed SQL hash, optional GitHub environment gate, live schema preflight and second dry run have succeeded. No seed, `db reset`, `migration repair`, arbitrary SQL or production project routing is present. Its project is pinned in the workflow; no user-supplied URL or unreviewed database identifier can be used for deployment.

## Important: the initial deployment failed before SQL

GitHub [run #41641182310](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41641182310) passed the branch/SQL integrity checks and linked to `jbyguybxhezjhdbenevh`, but the read-only `supabase db query` command exited nonzero. The workflow suppressed its raw CLI error, so **missing Database → Read permission is the leading diagnosis, not yet conclusively verified**. All subsequent steps, including `db push --yes`, were skipped.

**Before running the deployment again**, generate a replacement fine-grained Supabase token scoped to `jbyguybxhezjhdbenevh` with Project Settings, API Keys, API Key Secrets and Database **Read** permissions. Replace only GitHub **Settings → Environments → cpi-development → CPI_DEV_SUPABASE_ACCESS_TOKEN**, leave the Postgres password unchanged, and revoke the superseded token after the replacement works. Don't share either token in chat. After the workflow fix has merged, run the **read-only Supabase Development Connection Preview** on `main` first; it now tests actual SQL Read access. Proceed to a new manual deployment invocation only once that preview passes.

## Read-only preflight repair after failed run #41645758506

The [new deployment run](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41645758506) used the updated workflow and still failed before any SQL deployment. The [read-only preview](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41645161639) on the same commit successfully executed `SELECT 1` and listed the CPI-017 migration. Therefore a blanket missing Database Read scope is **not a supported conclusion**. Our previous failure classifier also wrongly grouped PostgreSQL `permission denied` with token authorization errors.

Supabase's separate read-only SQL endpoint is experimental and [requires all entity references to be schema-qualified](https://supabase.com/docs/reference/api/v1-read-only-query). The earlier preflight used unqualified Postgres catalog helper functions. The revised preflight uses only explicitly qualified catalog relations, and the read-only preview now **executes the exact same schema preflight** before claiming readiness. The post-deployment catalog audit also qualifies its PostgreSQL built-in helpers.

**Next:** merge the fix PR after CI, then run the **new** read-only preview on `main`. Only a preview that reports **`Hosted CPI-017 catalog preflight passed`** is a green light for a fresh, separately approved deployment run. Do not alter your GitHub secrets simply because the old classifier said “missing Database Read.” The earlier failure was prior to any database-writing step.

## If any check fails

The workflow fails closed before applying if the ref, phrase, reviewed SQL or single pending migration differs. If the **hosted push** fails or the **post-deployment audit** fails, **do not rerun blindly**: inspect the actual remote migration history and the catalog state first, because the SQL may have applied partially or fully. Ask for targeted investigation. Never run `backend/tests/bootstrap.sql` against a hosted Supabase project.

## What still remains after this deployment

Passing the catalog audit is **not** proof that an actual Auth user A cannot see user B's private data through Supabase Data API. The live guest/account A/account B negative HTTP tests, Auth OTP/privacy flows, verified ranked service endpoints, independent staging/production projects and a tested backup/restore approach remain separate acceptance criteria. **CPI-018 should not turn on real account creation until jurisdiction-appropriate privacy and guardian protections are implemented and tested.**

Sources: [Supabase CLI v3 safety semantics](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3), [Targeted hosted commands](https://supabase.com/docs/guides/local-development/local-and-hosted-projects), [GitHub environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
