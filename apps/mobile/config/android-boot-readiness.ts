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
