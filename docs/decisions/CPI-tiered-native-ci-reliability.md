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
React and document readiness, native bridge startup, OS app inactive/active
transitions, native clock boundaries on the same page, successful bridge
round-trip after reactivation, screenshot, and zero unexpected runtime errors. Android also
requires real ordered native Activity pause/resume, process identity across
Home/resume, and no target ANR. The smoke profile reduces the **number of
recreated processes**, not the assertions within one process. It never retries
a failed cold start.

On 8 November 2026 the lifecycle assertion was tied directly to CPI-007's native
foreground snapshots. Capacitor's document pause/resume events remain observed,
but no longer stand in for the native clock transition. On iOS, the Settings
launch command is monitored alongside the actual inactive snapshot; the command
can be stopped after that transition is proven if `simctl` remains blocked.
Earlier workflow artifacts remain unchanged and keep the assertions they ran.

## iOS scene-deactivation gate (8 November 2026)

Required run [42475988431](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42475988431), on head `a4aa719`, compiled the unsigned Simulator app and Android passed. iOS failed before JavaScript page startup: Settings launched, but the prebridge gate never logged its pause observation within the existing 30-second wait. No page or app lifecycle bridge result was recorded, so this is not a passing iOS run.

The gate waited for `UIScene.didEnterBackgroundNotification`, while CPI-007's foreground clock uses `UIScene.willDeactivateNotification`. Align the startup gate to that same native deactivation boundary, keep navigation held until `didActivate`, and observe the gate while Settings launches. This tests the native state transition the clock actually uses; the failed run remains recorded unchanged.

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

## Android SDK system-image ZIP recovery (3 November 2026)

[PR #67](https://github.com/georgi-cole/crystal-path-infinity/pull/67) encountered an infrastructure download failure **after** the development APK compiled: Android's `sdkmanager` rejected the Android 16 AOSP x86_64 system-image ZIP (`Error on ZipFile unknown archive`). The aggregate correctly failed because the emulator never launched. This was not a failed application build.

The Android provisioning step now invokes `.github/scripts/android-sdk-system-image.sh`, a single-purpose installer for exactly `system-images;android-36;default;x86_64`. A verified ZIP/extraction error permits up to **three** attempts with a short bounded delay; between attempts only an **incomplete** copy of that exact image may be deleted. An unrecognized SDK error, completed-but-invalid installation, or three corrupt downloads is always fatal. Every attempt is saved in the CI artifact with a combined log, and the failure classifier now recognizes the SDK corruption signature. Focus/boot/ANR/pause/resume tests still execute once under the same strict profile and are **never retried, skipped, or marked successful** by this remediation.

Five mocked-SDK integration cases check success without retries, recovery from the exact corrupt ZIP, three-attempt exhaustion, non-archive immediate failure, and sdkmanager success without a valid image. This is a preventive CI robustness change, **not** a claim that GitHub's SDK mirror or network is always healthy. Full Android + iOS CI must still pass on the PR head before merge.

## Optional UIAutomator sidecar crash in Android full-mode CI (3 November 2026)

[PR #68](https://github.com/georgi-cole/crystal-path-infinity/pull/68) compiled Android and passed the official AOSP SDK provisioning but failed the native runtime gate after its third cold-start observation. The captured AndroidRuntime exception reported `FATAL EXCEPTION: UiAutomation` with `java.lang.RuntimeException: Bad file descriptor`, not an application-owned stack. The previous harness invoked optional `adb shell uiautomator dump` at the end while its strict logcat capture was active. That instrumentation spawns a separate Android process capable of producing an unrelated runtime crash, which was conservatively treated as blocking when complete PID attribution was unavailable. The aggregate gate correctly failed.

The optional `uiautomator dump` was replaced with `adb shell dumpsys window windows` for a **passive** window-state artifact (`android-window.txt`). This eliminates the additional accessibility-instrumentation process without weakening any required native acceptance: the full profile still requires **three distinct cold starts**, verified in-app React/Capacitor readiness, Android Home/lock interruptions, native pause/resume and bridge clock evidence, screenshot captures, target-app ANR detection, and zero unexplained runtime errors. No application crash is reclassified or suppressed. If a runtime exception appears in a future run, the job still fails and retains the logs for review.

The new regression test checks absence of the UIAutomator sidecar and presence of passive window diagnostics and the original strict lifecycle assertions. This is a source-level prevention measure; success must be confirmed by a subsequent full Android emulator job and the unchanged aggregate check.

## iOS post-migration provisioning (4 November 2026)

[PR #79's initial run](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41830327114)
failed twice before any CPI process started. On attempt 1, Apple Settings launch
timed out; on attempt 2, installation timed out after a six-minute first boot.
The second failure screenshot nevertheless showed the installed CPI icon on the
Home screen, demonstrating that a command timeout does not mean installation
never started. Neither failure supplied application lifecycle evidence.

The harness now completes migration on its fresh device, shuts down that same
device once, and performs a separate bounded warm boot. It requires Settings to
launch with a real process identifier and terminate successfully **before**
installing CPI. This keeps first-boot service congestion outside the application
test. Settings gets a 180-second launch and 60-second termination budget; cold
boot remains bounded at 900 seconds and warm boot at 180 seconds. Both boot logs
and the command transcript are retained. Any failed step immediately fails the
check; there is no retry loop, replacement simulator, or retry of a game launch.

The full profile still executes both distinct CPI cold starts and every existing
prebridge, background/resume, bridge round-trip, screenshot and runtime-error
assertion. Unit tests exercise each provisioning failure boundary and malformed
Settings responses. Required native CI must pass on the updated PR head; this
provisioning change does not claim a measured long-term reliability rate.

## iOS host pressure and smaller framebuffer (6 November 2026)

Store PR #84's two failed attempts still failed before CPI installation. Its
second `ios-host-pressure.log` reached 281 load average, effectively 0% CPU idle,
91 MB free memory and 2.3 GB of compressed memory on the 7 GB hosted Mac. Even
terminating Settings and taking a screenshot timed out. More app retries or
larger application timeouts would not establish healthy startup behavior.

The disposable GitHub runner now mounts the runtime and disables **host** search
indexing before simulator boot, retaining hardware and indexing diagnostics.
The harness creates its own iPhone SE (3rd generation), with a 750×1334 framebuffer
instead of the iPhone 17's 1206×2622. It selects the device type directly rather
than requiring a precreated runner device. iOS 26.5, Xcode 26.6, the fresh device,
post-migration restart, Settings control round trip, two distinct CPI processes,
prebridge interruption, native bridge checks, actual background/resume, runtime
error rejection and screenshots remain required. Guest services are not disabled.

The implementation must be verified by full native CI on the final store head;
these pressure reductions alone are not a passing iOS result or a reliability
measurement. Physical-device testing remains separate.

That first pressure reduction still failed the Settings termination control on
head `3d168fe`, before CPI installation. The SE run reached 333 load average,
effectively no CPU idle, 136 MB free and 2.1 GB compressed memory. Its cold boot
was shorter, but the 7 GB host remained unhealthy. The job now uses the standard
`macos-26-intel` runner with 14 GB RAM and four CPUs, as documented by
[GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job).
It retains the same pinned Xcode 26.6 and iOS 26.5 (both installed on that image),
all budgets and assertions, the fresh owned SE and every required lifecycle step.
This is the standard runner class for this public repository, not a paid larger
runner. Native execution is still required to establish success.

## iOS screenshot allowance wiring (8 November 2026)

Required run [42478841638](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42478841638), on head `8051bed`, observed the native prebridge interruption, same-page inactive/active clock snapshots, successful resume bridge checks and no unexpected runtime errors. It then failed the required screenshot because the smoke harness still used its generic 60-second control timeout, despite the separately documented 180-second screenshot budget. The screenshot remains mandatory. The harness now passes `iosProvisioningBudgetsMs.screenshot` to that capture; this is a timeout wiring correction, not a change to lifecycle acceptance. The historical run remains failed.

On head `2394190`, required [run 42480817872](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42480817872) passed the full native profile. Both iOS cold starts completed the required screenshot, native inactive/active observations and resumed bridge checks on the same page, with zero unexpected JavaScript or runtime errors. The evidence reports two cold-start attempts and `screenshotCaptured: true` on a fresh iPhone SE (3rd generation) simulator running iOS 26.5. This is simulator launch evidence, not physical-device acceptance.

## Simulator toolchain alignment (8 November 2026)

The workflow on `2394190` and `e0bdf0b` selected Xcode 26.3, while the smoke harness selected iOS 26.5. Its startup message still named iOS 26.2. PR #87 aligns the workflow with Xcode 26.6, the installed iOS 26.5 SDK and simulator, and the TestFlight archive toolchain. The native lifecycle and screenshot checks retain the same acceptance criteria. [GitHub macOS 26 image](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md).

[Run 42503667708](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42503667708) reached the simulator app launch and failed native bridge readiness with Xcode 26.3. The tester PR's [run 42503684590](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42503684590) timed out while `simctl launch` returned to the app from Settings before bridge setup. The two simulator resume commands now use the existing 180-second system-launch allowance. The readiness and lifecycle observation deadlines still apply after those commands. Validation requires a new full native run.

**Verification on 8 November 2026.** Required [run 42505058620](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42505058620) passed at `644b815`. The Mac reported Xcode 26.6 and ran the full launch, Settings resume and screenshot checks on a fresh iPhone SE (3rd generation) with iOS 26.5. The [unsigned iPhone archive](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42505058657) also passed at the same revision.
