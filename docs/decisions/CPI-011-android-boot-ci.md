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

## Second failed run and revised emulator image

The first boot-readiness fix passed all web tests, but [run 41419851956](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41419851956) **still failed** on exactly the same genuine Home focus-loss ANR. Evidence artifact `13130490244` contains the actual `BOOT_COMPLETED user #0` event and `All broadcast queues are idle!` acknowledgment, recorded **before** the app cold-launch. Android then rendered React and completed the pre-page interruption, yet the Google APIs image reported significant CPU and I/O contention from its bundled Google setup services. The native pause never arrived and the application process was killed. Therefore waiting for broadcasts alone is insufficient; do not call this regression fixed by a timing gate.

The offline native lifecycle smoke is now moved **from Google APIs API 36 x86_64 to the Android 16 AOSP `default` API 36 x86_64 system image**. The API level, Pixel 7 device profile, real native plugins, prepage Home and lock tests, three fresh processes, native foreground clock verification, 30-second ordinary Home pause deadline, and runtime error detection are unchanged. This prevents third-party GMS first-run setup from dominating an offline standalone app lifecycle test; **it does not verify Google Play, AdMob or reward SDK compatibility**, which must be performed in separate Google-services/device tests at the appropriate CPI-002/ads milestones. The image choice is an emulator test infrastructure change only, not production app behavior.

Sources: [Android system-image variants](https://developer.android.com/tools/releases/platforms); [AOSP vs Google API emulator services](https://chromium.googlesource.com/chromium/src/+/main/docs/android_emulator.md); [the exact API-36 AOSP image in a public Android project](https://github.com/OutlineFoundation/outline-apps/blob/master/client/src/cordova/android/README.md).

The AOSP change requires its own complete green native run and evidence inspection before this incident can be considered resolved.
