# CPI-004 — Code quality and required checks

**Status: completed and merged in PR #42, 2026-11-01.** The starting main revision was `c6e6185d3c9b40eb073d46436147e7ddff9d9fdd`. Georgi merged [PR #42](https://github.com/georgi-cole/crystal-path-infinity/pull/42) as `1d013c48fa8e8b3dea18dc857a9d39790df60b89`; its tree is identical to tested head `28654fbca9520cd3053f6f994cf7a84b40c5f132`. The PR and [Issue #4](https://github.com/georgi-cole/crystal-path-infinity/issues/4) record the complete verification and artifact digests.

## Purpose and scope

Every PR needs an application quality result that detects real defects and cannot pass merely because a dependent job was skipped. CPI-003 supplied independent builds and minimum-screen launch checks. CPI-004 adds lint/format checks, makes the application gate suitable for branch protection, and investigates the Android bridge exception observed during CPI-003.

At completion of CPI-004, tests exercised the environment contract, native-check routing and startup evidence. The game engine and backend were not yet implemented; CPI-005 subsequently adds the pure game-core workspace and its tests to the same gate. CPI-004 itself does not claim gameplay or API coverage. CPI-002's physical-device, real ad/SSV, Families and deployed-backend work remains open.

## Check structure

| Check | Responsibility |
| --- | --- |
| `Planning manifest and bootstrap` | Validate the backlog, bootstrap guards and upload-plan dry-run |
| `App quality` | Clean lockfile install; typecheck; ESLint; Prettier; application tests; development/staging/production web builds; native routing tests |
| `Development Android build and emulator launch` | Actual unsigned/debug build, identity/permission verification and Android launch diagnostics when native changes require it |
| `Development iOS build and simulator launch` | Locked SPM resolution, unsigned Simulator build, identity/permission verification and iOS launch diagnostics when required |
| `App required checks` | Require successful application quality and successful results from both selected native jobs; accept native skips only after an explicit non-runtime decision |

The mobile workflow has no workflow-level path filter. It always reports `App required checks`, including for documentation-only PRs. A complete Git diff selects native verification. Known documentation, planning, templates and quality configuration can skip the expensive native jobs; application, dependency, native toolchain, workflow or unclassified changes require both platforms. Missing or invalid comparison context fails closed to native verification. Manual dispatch also runs both platforms. Renames are inspected as removal/addition so moving runtime code into a documentation directory cannot hide the runtime change.

The aggregate runs even after an upstream failure. It rejects failed/cancelled quality, absent selection output, an unexpectedly skipped native job, or a native failure. A passing Linux job alone cannot mask a failed selected native build. The routing tests use actual temporary Git histories, including moved and deleted runtime source.

All workflow tokens use `contents: read`; checkouts do not persist credentials. Native checks retain the existing pinned Node/JDK/Xcode/Capacitor toolchain and build unsigned development artifacts. Production secrets, release signing and store submission are outside this workflow.

## Lint and formatting

The root lockfile pins ESLint, TypeScript ESLint, React Hooks/Refresh checks and Prettier. Type-aware lint applies to the mobile TypeScript code; Node correctness rules cover the native scripts and CI gate scripts. Formatting is scoped to the app and new quality configuration/scripts. Generated native output, build artifacts, the independent CPI-002 laboratory and historical documentation are excluded from automatic formatting.

The commands are `npm run lint`, `npm run format:check` and `npm run format`. The existing install, typecheck, test and build commands remain available. No runtime dependency or gameplay rule is added by the lint/format toolchain.

## GitHub settings and demonstration

Before this task, the repository API confirmed Public visibility, squash-only merging, automatic deletion of merged branches, and default branch `main`. Ruleset `26312536` was Active, required a PR with zero independent approvals and resolved conversations, blocked force pushes/deletion, had no bypass actors, and required the strict `Planning manifest and bootstrap` check from GitHub Actions (`15368`).

The additional required context is **`App required checks`**, also bound to GitHub Actions. Its quality and native dependencies remain visible as separate jobs. Saving initially opened GitHub's account re-verification dialog. After the owner completed that step, independent API readback confirmed both `Planning manifest and bootstrap` and `App required checks`, integration `15368`, in the Active ruleset. Strict up-to-date checks, required PRs, resolved conversations, no bypass, and force-push/deletion restrictions remain intact. The account verification barrier is resolved; there is no pending CPI-004 protection setting.

The controlled draft PR first introduced a real app metadata type mismatch at [commit `5ffcdc13`](https://github.com/georgi-cole/crystal-path-infinity/commit/5ffcdc13ae3f7ef70d1dc72a589d67e2d5612912): string `schemaVersion: '1'` where `BuildInfo` requires numeric literal `1`. In [run 41335551139](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41335551139), TypeScript rejected it with `TS2322`, **App quality failed**, both native jobs were skipped, and **App required checks failed**. The independent planning check passed. This demonstrates normal compiler enforcement and failure propagation without a fake failing test or bypass.

Revision `a72a5cd2` restored numeric `schemaVersion: 1` and supplied the diagnostic implementation. [Run 41336328215](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41336328215) passed clean install, typecheck, lint, formatting, 40 application tests (19 environment tests plus 21 startup/parser tests), all 9 routing/aggregate tests, and all three web builds. Parser tests also reject replacement page sessions after an apparently successful resume. Inspection of that run's web artifact confirmed the development diagnostic marker and failure text are absent from staging and production. Its subsequent native findings and corrections are recorded below. The PR records exact final revision/run links and the expanded process-attribution test result.

## Android startup observation

CPI-003's [final Android evidence](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41333537388/artifacts/13094945498) recorded an early `window.Capacitor.triggerEvent` exception before the React ready marker. The minimum screen nevertheless opened and no AndroidRuntime crash was recorded. The pinned Capacitor compatibility layer contains unguarded lifecycle-event dispatch, but that brief log did not identify the precise event or ordering.

CPI-004 extends the evidence through startup and a real background/foreground transition, with timestamps, page/session identifiers, ordered lifecycle observations and a native `WebView.getServerBasePath()` round-trip. The local path returned by that read-only call is not logged by the diagnostic helper. Android performs three cold process starts in one emulator, each with Home followed by resuming the same activity. iOS opens Settings and returns to the existing app. Every attempt is retained; success cannot discard a failed earlier attempt.

Unexpected JavaScript exceptions remain visible and fail the stronger check, including exceptions before the React marker or later in the observation window. Application and unattributed native runtime errors also fail; conclusively unrelated process crashes are retained separately with their process evidence. Error listeners do not cancel original reporting or modify SDK behavior. A passing render marker alone does not establish reliable lifecycle delivery; a non-reproduced exception must not be called fixed.

### First instrumented Android run

In [run 41336328215](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41336328215) at revision `a72a5cd29d38042761ffab892f86dd786e71f950`, all three app starts completed their startup and resumed bridge calls, kept one page session per attempt, and recorded no application JavaScript exception. The earlier `triggerEvent` exception **did not reproduce and is not claimed fixed**. The [Android evidence](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41336328215/artifacts/13095249795), digest `79944083105fb145579be3a548f20550ee644dbcbb9c0b45fc6f686d3684db2c`, preserves the complete observation.

That Android job still failed: 27 captured AndroidRuntime entries belonged to a crash of **`com.google.android.gms.persistent`, PID 1365**, while the application's three PIDs were 2230, 2967 and 3603. This is a checker attribution defect, not evidence of an application crash. The correction associates runtime messages with their process evidence, records conclusively unrelated crashes separately, and continues to fail on application, ambiguous or unattributed runtime errors. It does not filter JavaScript errors by message or change the SDK. Raw device logs remain available.

The first trace also shows delayed native pause delivery. In attempts 1 and 3, the original fixed wait let the driver request resume before the native pause callback appeared. The corrected Android driver waits for a new native pause after the Home action before requesting resume. The iOS driver similarly waits for a new pause in the current page session after opening Settings. Their short background dwell begins only after that observed event. This avoids treating elapsed host time as proof of a background transition.

The same run's iOS job passed: its [Simulator evidence](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41336328215/artifacts/13095328606), digest `6ad3db10c8922fe1351a36860535ffb9737b837a28b6171961612bd6bc499721`, records a matching startup marker, one page session, ordered pause/resume, both native bridge acknowledgements and no JavaScript/runtime exception. Both native screenshots were inspected. The aggregate still failed on Android's failed result, proving that successful quality and iOS cannot conceal a selected native failure.

These checks send Home after startup bridge acknowledgement. They do not establish behavior when interruption happens before bridge creation, nor that JavaScript lifecycle callbacks arrive promptly enough to govern gameplay time. [CPI-007](https://github.com/georgi-cole/crystal-path-infinity/issues/7) explicitly carries early Home/lock interruption, process/WebView recreation and stale-event handling before gameplay/audio relies on lifecycle. CPI-002's physical-device checks remain separate. No SDK race fix is claimed from a non-reproduction.

## Final corrected verification

At head `28654fbca9520cd3053f6f994cf7a84b40c5f132`, [Mobile app run 41338065917](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41338065917) and [Planning run 41338065901](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41338065901) passed. All five check contexts reported success. Quality included 66 application tests, 9 routing/aggregate tests, types, lint, formatting and the three web environments.

The final three Android cold starts and fresh iOS launch each recorded an observed pause before resume, successful startup/resumed native bridge acknowledgments, one page session, complete observation and zero runtime errors. Both native screenshots were inspected, and evidence ZIPs were SHA256-verified before their JSON/logs were checked. The earlier `triggerEvent` exception did not reproduce across the six instrumented Android starts in the two corrected runs; that remains a non-reproduction, not an SDK fix. CPI-007 and CPI-002 retain the follow-ups described above.

## References

- [GitHub ruleset status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)
- [App setup](../../apps/mobile/README.md)
- [CPI-003 build and launch record](CPI-003-app-foundation.md)
- [Repository settings record](../REPOSITORY_SETUP.md)
