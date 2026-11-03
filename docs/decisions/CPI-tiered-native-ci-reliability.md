# CPI native CI reliability policy

## Why the gate changed (3 November 2026)

Repeated required-check failures on ordinary PRs originated in the Android
emulator focus/lifecycle test rather than APK compilation. Real target-app ANRs
were observed in earlier runs and must **never** be silently treated as
infrastructure-only. The corrected ANGLE-on-SwiftShader Android configuration
passed two successive executions of the prior three-cold-start gate, but that
does not prove every future runner will be stable.

The old workflow used the exhaustive three-start Android and two-start iOS
lifecycle suite for all application diffs. This duplicated heavyweight
first-boot transitions on simple UI/gameplay changes and made developer
feedback unnecessarily sensitive to emulator setup.

## PR policy and failure semantics

The *same stable* required status remains: **App required checks**.

| Changed files / trigger | Mode | Android | iOS |
| --- | --- | --- | --- |
| Only docs, planning, quality config or isolated mobile-spike files | `none` | Intentionally skipped | Intentionally skipped |
| Known app UI/assets/game-core changes | `smoke` | 1 real cold start, bridge and Home/resume | 1 real cold start, bridge and Settings/resume |
| Native code, native integration/lifecycle, toolchain, CI routing, dependencies or unknown paths | `full` | 3 distinct cold starts, including pre-WebView Home and lock | 2 distinct starts, including pre-WebView interruption |
| Scheduled nightly or manual workflow dispatch | `full` | Full | Full |

The selector compares **all** changed paths using a complete diff, including
deletions and the old side of renames. An unavailable comparison, an unexpected
event or any unclassified path defaults to `full`. Native-looking files inside
`apps/mobile/src` are explicitly escalated to `full`. The multi-platform
aggregate only passes when App quality succeeded and both native jobs either
succeeded for `smoke/full` or were explicitly skipped for `none`.

Both native profiles require the same *real* launch and lifecycle observations:
React and document readiness, native bridge startup, OS background/foreground,
document pause/resume, native foreground clock boundary, successful bridge
round-trip, screenshot, and zero unexpected runtime errors. Android also
requires real ordered native Activity pause/resume, process identity across
Home/resume, and no target ANR. The smoke profile reduces the **number of
recreated processes**, not the assertions within one process. It never retries
a failed cold start.

## Nightly regression and manual escalation

The workflow runs a full native regression from `main` every day at
**02:23 UTC**, and a manual `workflow_dispatch` also forces `full`.
Scheduled failures remain failures and should be investigated as regression
signals; they do not rewrite already-completed PR results. Nightly execution
may be delayed by GitHub scheduling. Device and Google Play compatibility,
rewarded ads, gameplay progression and store validation still require
separate physical-device/acceptance checks.

## Failure evidence and triage

On any failed native job, an `if: failure()` step writes
`android-ci-failure-classification.json` or
`ios-ci-failure-classification.json` and a short GitHub Actions step summary.

Categories:

- `app-anr`: an explicit ActivityManager ANR for the target app. **Always
  block**; inspect ANR and window/CPU traces.
- `app-runtime`: JavaScript/native runtime error. **Always block**.
- `lifecycle-or-readiness`: real transition/bridge/readiness timed out.
  Review app and emulator evidence; do not assume host flakiness.
- `native-build`: compilation or dependency failure. **Always block**.
- `emulator-provisioning`: observed runner/device setup failure. Diagnose
  host and SDK image before changing application logic.
- `unclassified`: no reliable signature; manual investigation required.

Classification is **advisory only**: it does not skip assertions, rerun
automatically, change the failed job status, or allow the aggregate to pass.
Existing screenshots, logs, activity/WindowManager dumps, emulator pressure
measurements and native diagnostic captures remain in the uploaded artifacts.

## Acceptance and reliability measurement

For this CI-policy PR, require all routing unit tests, application quality,
all web builds, a full Android three-launch run, full iOS two-launch run,
and the stable required-check aggregate on the PR head.

Track at least 50 successive native-run outcomes before declaring any
reliability target met. Classify failures by reproducible application defect,
emulator/provisioning, timeout and unknown, measuring both the overall
successful-run rate and the **false-failure rate** on known-good code. The
initial operational target is 98–99% success on known-good changes—not a
guarantee or an excuse to ignore genuine ANRs. Reevaluate timeout or emulator
configuration only with supporting diagnostics rather than rerunning until green.
