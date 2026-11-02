# CPI-011 Android CI first-boot incident

The original PR #50 Android run [41413807563](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41413807563) **failed**. Do not classify it as an app pass or suppress its evidence.

- The APK compiled and embedded the development identity successfully. React rendered, `page-load` and `bridge-ready` completed, and a genuine pre-page Home/pause/restart completed.
- Immediately after the regular Home action, the Android 16 emulator logged an ANR: `Input dispatching timed out`, waiting for `FocusEvent(hasFocus=false)`. Android killed the app. Thus no real `App paused` arrived, and the strict smoke test timed out at 30 seconds.
- The failed evidence showed extreme fresh-boot CPU contention, Google setup-cover activity, and crucially `ActivityManager: Posting BOOT_COMPLETED user #0` **after** the ANR. The former preflight waited only for `sys.boot_completed=1`, which was not enough to ensure user-0 system initialization had drained.
- The App required checks gate correctly failed as the dependent Android job failed. iOS, application tests, lint, formatting and three web builds passed.

## Fix and verification boundary

The Android smoke driver now waits, with an explicit 180-second limit, for the *actual* `ActivityManager` user-0 `BOOT_COMPLETED` posting line in the fresh emulator's log, before clearing logcat or launching the app. It then runs Android's `am wait-for-broadcast-idle` with another 180-second bound and requires the exact idle acknowledgment. Both checks produce artifacts. Their matching contracts are covered by deterministic tests using the failed run's event order; a user-10 or locked-boot event cannot satisfy the gate.

This is a **test-environment provisioning fix**, not a bypass of the ANR. Any new ANR, missing native pause, failed page/bridge handshakes, background-time accrual, or replaced process during ordinary Home/resume still fails exactly as before. We do not extend the 30-second app pause check or exclude runtime errors. No changes were made to game logic, branding, the Android activity, iOS, or the production app.

If the updated run still reports an ANR after the user-0 and broadcast-idle gates, treat it as a separate genuine performance defect; collect traces rather than accepting a retry. No device/store readiness is claimed.

Reference: AOSP [ActivityManagerShellCommand.wait-for-broadcast-idle](https://android.googlesource.com/platform/frameworks/base/+/master/services/core/java/com/android/server/am/ActivityManagerShellCommand.java), Android [BOOT_COMPLETED and LOCKED_BOOT_COMPLETED](https://developer.android.com/reference/android/content/Intent).
