/** CPI-011: first-boot readiness evidence for the pinned Android API 36 emulator.
 * sys.boot_completed may be set while user-0 BOOT_COMPLETED dispatch is pending.
 * Do not confuse LOCKED_BOOT_COMPLETED, a different user or a generic mention
 * of the action with Android ActivityManager posting the actual user broadcast.
 */
export function androidUserBootPosted(log: string): boolean {
  return log.split(/\r?\n/).some((line) =>
    /\bI ActivityManager: Posting BOOT_COMPLETED user #0(?:\s|$)/.test(line),
  );
}

/** Official 'am wait-for-broadcast-idle' success; command errors must not pass. */
export function androidBroadcastsIdle(output: string): boolean {
  return output.split(/\r?\n/).some((line) => line.trim() === 'All broadcast queues are idle!');
}
