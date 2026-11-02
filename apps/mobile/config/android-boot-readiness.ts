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

/** Android Linux PSI = time some tasks are stalled, not host CPU usage. */
export interface AndroidRenderPressure {
  cpuSomeAvg10: number;
  ioSomeAvg10: number;
}

function someAvg10(output: string): number | null {
  const matched = output.match(/(?:^|\n)some\s+avg10=(\d+(?:\.\d+)?)/);
  if (!matched) return null;
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

/** Missing or malformed kernel telemetry must never silently pass readiness. */
export function androidRenderPressure(cpu: string, io: string): AndroidRenderPressure | null {
  const cpuSomeAvg10 = someAvg10(cpu);
  const ioSomeAvg10 = someAvg10(io);
  if (cpuSomeAvg10 === null || ioSomeAvg10 === null) return null;
  return { cpuSomeAvg10, ioSomeAvg10 };
}

/** Avoid high system/compositor starvation while testing focus-loss transitions. */
export function androidPressureWithinBudget(pressure: AndroidRenderPressure | null): boolean {
  return pressure !== null && pressure.cpuSomeAvg10 <= 48 && pressure.ioSomeAvg10 <= 8;
}

/** A genuine app ANR is an unconditional failure, regardless of the host's load. */
export function androidAppAnrObserved(log: string, appId: string): boolean {
  return log.split(/\r?\n/).some((line) => {
    const marker = 'E ActivityManager: ANR in ' + appId;
    return line.includes(marker + ' (') || line.trimEnd().endsWith(marker);
  });
}
