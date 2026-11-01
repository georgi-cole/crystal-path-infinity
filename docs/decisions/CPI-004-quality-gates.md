# CPI-004 — Code quality and required checks

**Status: implementation complete; native CI and the settings handoff are in progress, 2026-11-01.** Georgi merged [PR #41](https://github.com/georgi-cole/crystal-path-infinity/pull/41) and requested the next task. The starting main revision is `c6e6185d3c9b40eb073d46436147e7ddff9d9fdd`; work is isolated on `cpi-004-quality-gates` in [PR #42](https://github.com/georgi-cole/crystal-path-infinity/pull/42). [Issue #4](https://github.com/georgi-cole/crystal-path-infinity/issues/4) owns acceptance and the current handoff.

## Purpose and scope

Every PR needs an application quality result that detects real defects and cannot pass merely because a dependent job was skipped. CPI-003 supplied independent builds and minimum-screen launch checks. CPI-004 adds lint/format checks, makes the application gate suitable for branch protection, and investigates the Android bridge exception observed during CPI-003.

The current tests exercise the environment contract, native-check routing and startup evidence. The game engine and backend have not been implemented; their tests will join the same gate when the corresponding tasks introduce that code. This task does not claim gameplay or API coverage for nonexistent features. CPI-002's physical-device, real ad/SSV, Families and deployed-backend work remains open.

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

The intended additional required context is **`App required checks`**, also bound to GitHub Actions. Its quality and native dependencies remain visible as separate jobs. The existing planning requirement and protection settings are retained. The addition was prepared in the existing ruleset through GitHub's settings interface, but **Save changes opened GitHub's account re-verification dialog**. The API still reports only the existing planning requirement. The new requirement is therefore pending the owner's confirmation and a fresh API readback; configuration code or an unsaved settings form is not evidence of an active rule. The PR handoff will record the final verified state.

The controlled draft PR first introduced a real app metadata type mismatch at [commit `5ffcdc13`](https://github.com/georgi-cole/crystal-path-infinity/commit/5ffcdc13ae3f7ef70d1dc72a589d67e2d5612912): string `schemaVersion: '1'` where `BuildInfo` requires numeric literal `1`. In [run 41335551139](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41335551139), TypeScript rejected it with `TS2322`, **App quality failed**, both native jobs were skipped, and **App required checks failed**. The independent planning check passed. This demonstrates normal compiler enforcement and failure propagation without a fake failing test or bypass.

The next revision restores numeric `schemaVersion: 1` and supplies the finished diagnostic implementation. Local verification passed a clean lockfile install, typecheck, lint, formatting, all 40 application tests (19 environment tests plus 21 startup/parser tests), all 9 routing/aggregate tests, and all three web builds. The final parser tests also reject replacement page sessions after an apparently successful resume. Staging and production bundles omit the development diagnostic marker and failure text. The corrected revision must also pass the actual applicable GitHub checks before review; the PR records exact run and commit links.

## Android startup observation

CPI-003's [final Android evidence](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41333537388/artifacts/13094945498) recorded an early `window.Capacitor.triggerEvent` exception before the React ready marker. The minimum screen nevertheless opened and no AndroidRuntime crash was recorded. The pinned Capacitor compatibility layer contains unguarded lifecycle-event dispatch, but that brief log did not identify the precise event or ordering.

CPI-004 extends the evidence through startup and a real background/foreground transition, with timestamps, page/session identifiers, ordered lifecycle observations and a native `WebView.getServerBasePath()` round-trip. The local path returned by that read-only call is not logged by the diagnostic helper. Android performs three cold process starts in one emulator, each with Home followed by resuming the same activity. iOS opens Settings and returns to the existing app. Every attempt is retained; success cannot discard a failed earlier attempt.

Unexpected JavaScript exceptions remain visible and fail the stronger check, including exceptions before the React marker or later in the observation window. Error listeners do not cancel original reporting or modify SDK behavior. A passing render marker alone does not establish reliable lifecycle delivery; a non-reproduced exception must not be called fixed. Findings and any narrowly justified correction will be recorded with the actual CI evidence before this task is handed off.

## References

- [GitHub ruleset status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)
- [App setup](../../apps/mobile/README.md)
- [CPI-003 build and launch record](CPI-003-app-foundation.md)
- [Repository settings record](../REPOSITORY_SETUP.md)
