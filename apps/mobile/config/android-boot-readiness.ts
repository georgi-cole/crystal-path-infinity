/** Pinned Android API 36 emulator: sys.boot_completed can precede user-0 boot dispatch. */
const userBootPosted = /\bI ActivityManager: Posting BOOT_COMPLETED user #0(?:\s|$)/;
const broadcastIdleMarker = 'All broadcast queues are idle!';

export function androidUserBootPosted(log: string): boolean {
  return log.split(/\r?\n/).some((line) => userBootPosted.test(line));
}

/** The documented activity-manager command must report an exact idle line. */
export function androidBroadcastsIdle(output: string): boolean {
  return output.split(/\r?\n/).some((line) => line.trim() === broadcastIdleMarker);
}

/** True only for an actual ActivityTaskManager launch of the OS Home activity. */
const homeStart = 'I ActivityTaskManager: START u0 {act=android.intent.action.MAIN';
const homeCategory = 'cat=[android.intent.category.HOME]';

export function androidHomeLaunchObserved(log: string, afterLine = 0): boolean {
  return log
    .split(/\r?\n/)
    .slice(afterLine)
    .some((line) => line.includes(homeStart) && line.includes(homeCategory));
}
