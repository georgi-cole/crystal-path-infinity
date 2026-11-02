# CPI Android native CI: recurring focus-loss ANRs and prevention

## Evidence and common failure mechanism (2 November 2026)

Several pull requests failed the *same downstream required check* because Android's
native emulator launch step failed. The aggregate `App required checks` is a
dependent gate, **not an independent defect**.

Archived examples:

- [CPI-011 run 41413807563](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41413807563):
  Google APIs API 36 first-boot service contention; `ANR in ...MainActivity`,
  `FocusEvent(hasFocus=false)` timeout after HOME, target app killed.
- [CPI-012 run 41419851956](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41419851956):
  waiting for user-0 `BOOT_COMPLETED` and drained broadcast queues did not
  prevent the same emulator focus-loss ANR on the Google APIs image.
- [CPI-012 run 41435454704](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41435454704):
  Android compiled and launched but an injected HOME key was not delivered to
  the foreground activity; the strict pause proof failed. A subsequent bounded
  explicit HOME intent only addresses this distinct **lost-key** case.
- [PR #53 run 41486268669](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41486268669):
  the AOSP API 36 emulator passed two cold starts; on the third Home/resume it
  produced `Activity top resumed state loss timeout`, delayed native pause
  and resume, and never completed the page's native bridge round-trip within
  30 seconds. **No successful lifecycle evidence may be inferred.**
- [PR #53 run 41488018826](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41488018826),
  [artifact 13163272354](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41488018826/artifacts/13163272354):
  target rendered React and completed first native bridge handshake in 28ms,
  then HOME dispatched `FocusEvent(hasFocus=false)` immediately as the
  emulator was still rendering. At 5s Android emitted an actual app ANR and
  killed the process. Android's ANR dump reported **CPU some PSI avg10=70.92**
  and **IO some PSI avg10=12.71**, with heavy software graphics composer,
  SurfaceFlinger and system-server load.

The failing GitHub AVD configuration was Pixel 7 / x86_64 API 36, default 2
virtual CPU cores, 1536MB RAM and a 1080x2400 SwiftShader software-rendered
display (2.59 million pixels). Android `sys.boot_completed`, the user-0
`BOOT_COMPLETED` broadcast, idle broadcast queues and the first successful
Capacitor bridge handshake **do not guarantee the renderer/WindowManager is
ready for an immediate HOME focus transition**.

This evidence supports substantial **emulator first-boot graphics/OS-load
contribution**, but does **not prove that all future target app ANRs are
infrastructure-only**. On real devices the same symptoms would still be a
serious app defect.

## Changes in this PR

1. **Lower software-renderer pressure.** Keep the pinned official AOSP Android
   16/API 36 x86_64 image and Pixel 7 profile, but configure 4 emulator CPU
   cores, 3072MB RAM, 720x1600 portrait display and 320 DPI *for CI only*.
   This preserves a realistic 360dp-wide portrait viewport while requiring
   substantially fewer pixels to be rendered in software. The AVD's resolved
   `config.ini` is attached to every CI run.
2. **Explicit measured readiness before every HOME.** After *real* app
   `react-ready`, `page-load` and native `bridge-ready`, a bounded maximum
   120-second test-only gate waits for the local WebView asset request stream
   to be quiet for four seconds and for at least three consecutive samples
   with Linux kernel PSI `cpu.some.avg10 <= 48` and
   `io.some.avg10 <= 8` when accessible. The gate is repeated after actual HOME pause and
   before resuming the same activity. Thresholds are initial conservative
   heuristics based on the attached failed-run pressure evidence, **not
   general Android performance requirements**. On Android 16, `/proc/pressure`
   is not readable by the ordinary `adb shell` UID; the test therefore uses
   live Android Toybox `top -b -n 1` measurements normalized by the virtual CPU count (busy CPU <= 75%, IO wait <= 10%).
   Neither an unavailable metric nor an unparsable CPU report is treated as idle.
3. **Never mask a genuine ANR.** The log observer recognizes
   `E ActivityManager: ANR in <appId>` and fails immediately. There are no
   synthetic `App paused` / `App resumed` events, no skipped bridge checks,
   no increase to the ordinary native pause/resume 30-second deadlines, no
   retry-until-green loop, and no weakened app/runtime assertions. All three
   process/WebView recreations, native clock boundary and distinct bridge
   identities remain mandatory.
4. **Actionable evidence.** Each attempt saves its foreground/background
   PSI or `dumpsys cpuinfo` readings, asset-request counts, time-to-quiescence and readiness
   decision. Any failure captures current CPU/IO PSI, Android activity and
   window focus, and `gfxinfo`, alongside already preserved logcat, screenshots,
   app identity, process/native observations and errors.

## Definition of prevention and future escalation

A verified new run must pass TypeScript, formatting, all tests, three web
builds, the three-attempt Android emulator lifecycle gate and iOS simulator
checks. This mitigation addresses host-induced race conditions **before**
test actions; it does not convert a crash into success. If the target emits
another ANR even after stable PSI/renderer conditions, preserve the traces,
investigate Java/UI thread and WebView/GPU load as an app-side performance
regression, and fail the PR. Do not repeatedly rerun identical failing jobs
without diagnosing their evidence.

Separate physical Android and Google Play/AdMob testing remain required:
the reduced-dimension AOSP CI emulator does not replace hardware validation,
GPU stress testing or store certification.

## Initial CI validation lesson

The first run on the right-sized AVD stopped before the HOME gate because
Android 16 denied `adb shell cat /proc/pressure/cpu` with `Permission denied`.
This was a diagnostic permission issue, **not another application ANR**.
The permanent fallback now samples the public `dumpsys cpuinfo` output,
records which metric source was available, and fails if no valid source can
be measured. The native application is not run as root.


## Follow-up: avoid the cached CPU snapshot (run 41510785390)

The first non-root fallback failed its 120-second foreground readiness gate,
without an observed app ANR. Artifact 13173376318 proves that the existing
dumpsys cpuinfo output remained **exactly 85% total CPU / 5.7% iowait for all
118 samples**, even while the WebView asset count stopped changing and its
quiet interval reached 119 seconds. This is stale service telemetry, not a
credible sequence of live CPU readings.

The fallback now uses a fresh one-shot Android Toybox top measurement
(available to the ordinary shell UID) on each sample, with the aggregate
N-core idle and I/O counters normalized to percentages. An invalid or missing
top summary remains a hard diagnostic failure rather than a presumed-idle
reading. Regression tests reject the cached dumpsys report format and check
normalization on the 4-core emulator. The strict Home/pause/resume, native
clock, ANR and bridge assertions are unchanged.
