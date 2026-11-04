# CPI-035 — unsigned beta preparation

This prepares reproducible unsigned candidates. CPI-035 remains open: no signed binary, beta-channel upload, external-device installation or store-account prerequisite has been verified. The user has not approved live services. Accounts, ranked endpoints and ads stay disabled in every candidate from this workflow.

## Inputs and identity

Ordinary development and existing native checks retain package version `0.1.0`, native build `1` and the development identity. Release metadata is an explicit opt-in through all five `CPI_RELEASE_*` inputs; a partial configuration fails before native generation mutates a project.

| Input | Validation |
| --- | --- |
| Version | Canonical numeric `major.minor.patch`; each component is 0–9999; no suffix, whitespace or shell content |
| Native build | Canonical integer 1–9999; Android `versionCode`, iOS `CURRENT_PROJECT_VERSION` and public receipt must agree |
| Source | Exact lowercase 40-character commit SHA matching the checked-out HEAD |
| Workflow identity | Canonical run ID, matching run number, first attempt only |
| Environment | `staging` or `production`; no caller-supplied application ID |

The 1–9999 common build range is this project's conservative policy. Android requires increasing version codes and limits their value; the workflow must not be deleted/recreated or its counter reset to reuse a candidate number. Before future store submission, compare the selected number with the actual store history rather than assuming the workflow counter proves store uniqueness. [Android versioning](https://developer.android.com/studio/publish/versioning)

iOS receives the same integer as its build string. This policy stays within the documented numeric `CFBundleVersion` form; it does not establish store acceptance or registration. [Apple CFBundleVersion](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleversion)

The generated source identities are fixed:

| Environment | Application/bundle ID |
| --- | --- |
| Development | `com.georgicole.crystalpath.infinity.dev` |
| Staging | `com.georgicole.crystalpath.infinity.staging` |
| Production | `com.georgicole.crystalpath.infinity` |

These are standalone project identities. No legacy Big Eye listing, signing identity or installed application is a release target. Actual ownership and registration of the new store records remain external work; no team ID, publisher ID or credentials are invented here.

## Manual preparation

The new `unsigned-beta.yml` workflow runs only by manual dispatch on `main` in this repository and uses the `cpi-beta-preparation` GitHub environment. It has read-only contents/checks permissions and no signing or upload credentials. Environment approval rules, if desired, must be configured by the repository owner; naming an environment in YAML does not configure its protection rules.

1. Merge reviewed source and obtain successful latest **App required checks** and **Planning manifest and bootstrap** results on that exact `main` SHA. Preflight reads those check runs and fails immediately for missing, pending, failed or wrong-source results. It does not trigger a deployment or wait indefinitely.
2. Dispatch a fresh workflow run, select the standalone environment and enter the numeric version. The workflow run number becomes the native build number. A rerun fails; dispatch a new candidate after a failed preparation. Reaching build 10000 requires a reviewed versioning-policy change, never wrapping the counter.
3. Build the selected web assets, generate/check native projects, compile unsigned Android release AAB/APK and an unsigned generic-device iOS archive. There is no simulator archive represented as a device build.
4. Inspect the APK's actual native metadata/permissions and the iOS device archive's native metadata/privacy configuration, then check signature absence and copied public metadata within the scope below. Retain artifact hashes and matching crash-symbol evidence. Only the fixed unsigned artifact directory is uploaded to GitHub Actions, for seven days.

Preflight emits `candidate.json` and a minimal `source-checks.json` receipt with source SHA and the accepted check-run IDs. Platform receipts contain the source/build/environment identity, fixed artifact names, byte lengths and SHA-256 hashes. They explicitly record `unsigned`, no store upload, no verified device installation and no privacy approval. These receipts are ordinary build evidence, not signed attestations.

`build-info.json` keeps its existing five-field public schema. Opted-in builds add `release-info.json`, which contains public source/run/build metadata and an explicit all-services-disabled manifest. Every nonempty custom `VITE_*` value is rejected, including values loaded from mode-specific env files. No public endpoint, ad unit, service-role key or development reward bypass is accepted by this preparation mode. The underlying native permissions, lifecycle fences and privacy manifest remain required checks.

## Artifact and secret boundaries

The workflow accepts no keystore, certificate, provisioning profile, signing password, account credential, ad identifier or arbitrary command input. Version strings are validated data. Public text assets are scanned for private-key material and server secret-key markers. Archive inspection also rejects private-key files, signatures, encrypted/duplicate ZIP entries, path traversal and unexpected symbolic links. These checks complement fixed inputs; they do not claim to detect every possible secret.

Android is compiled with the generated unsigned release configuration. APK inspection checks the compiled package/version/build through `aapt`, the merged release manifest restrictions, copied public metadata and absence of JAR/APK signatures. AAB inspection checks only its copied public metadata and absence of JAR signatures: its compiled native manifest is **not inspected**, and the per-artifact receipt explicitly records `nativeMetadataVerified: false`. Before using that AAB in a later signing/distribution job, add authoritative native-manifest inspection and compare its identity/version/permissions. Minification is currently disabled, so there is no R8 mapping to upload. A later minified build must add verified mapping retention/upload before claiming symbol readiness.

iOS is archived with signing disabled. In addition to rejecting signature directories and provisioning files, the verifier identifies each Mach-O image inside the application and uses `otool -arch all -l` to reject embedded `LC_CODE_SIGNATURE` commands, including ad hoc signatures. Apple documents the embedded command as the storage location for Mach-O code signatures. [Apple code-signature storage](https://developer.apple.com/documentation/technotes/tn3126-inside-code-signing-hashes)

The iOS archive retains its dSYM and the verifier compares binary and dSYM UUIDs. Keeping the matching archive/symbol pair enables later crash investigation, but no crash-symbol service upload is performed. [Apple missing-symbol guidance](https://developer.apple.com/documentation/xcode/locating-a-missing-debug-symbol-file)

For a future signing pipeline, first verify new-product store ownership, authorized signing identities and access to the existing secret store. Supply signing credentials only through a separately reviewed, environment-scoped signing job with short-lived files and cleanup. This unsigned workflow does not accept or consume those credentials and cannot distribute an installable signed beta.

## Executed evidence and remaining gates

Local checks on 2026-11-04 passed: four release-input tests plus nineteen environment tests; three workflow/source-check guard tests; three synthetic archive/Mach-O verifier tests; staging build with build 42 and Android/iOS generation/check; normal development build with both native generation/check restored to build 1. Lint/type checking is part of the required source checks. Local generation is configuration evidence, not native compilation, signing or device execution.

The manual unsigned packaging workflow has not been dispatched. Its Android device compilation, iOS device archive, binary inspection and resulting artifact receipts therefore remain unexecuted until the reviewed source is on `main`. Existing required emulator/simulator checks remain in place.

See [the release evidence ledger](../release/READINESS.md) for CPI-027, CPI-034, CPI-035, CPI-036, CPI-037 and CPI-038 gates. No hosted deployment, SDK activation, account issuer activation, beta upload or public release is authorized by this change.
