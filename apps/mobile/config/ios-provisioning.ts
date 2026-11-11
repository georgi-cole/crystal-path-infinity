/** Provision only the newly-created simulator, before installing or launching CPI.
 * Require a complete Settings launch/termination round trip after first boot.
 * Only a failed pre-install Settings launch gets one restart of that same
 * owned device. No game launch, lifecycle assertion or invalid PID is retried.
 */
export const iosProvisioningBudgetsMs = {
  coldBoot: 900_000,
  shutdown: 180_000,
  warmBoot: 180_000,
  systemLaunch: 180_000,
  systemTerminate: 60_000,
  install: 120_000,
  screenshot: 180_000,
  firstNativeProcess: 180_000,
} as const;

type ProvisionStep = 'cold-boot' | 'shutdown' | 'warm-boot' | 'system-launch' | 'system-terminate';

export async function prepareIosSimulator(
  execute: (step: ProvisionStep, timeoutMs: number) => Promise<string>,
): Promise<{ restarted: boolean }> {
  await execute('cold-boot', iosProvisioningBudgetsMs.coldBoot);
  let restarted = false;
  let launched: string;
  try {
    launched = await execute('system-launch', iosProvisioningBudgetsMs.systemLaunch);
  } catch {
    // Host readiness recovery occurs before CPI is installed, never after a
    // failed app check. Keep the original failed probe in the command evidence.
    restarted = true;
    await execute('shutdown', iosProvisioningBudgetsMs.shutdown);
    await execute('warm-boot', iosProvisioningBudgetsMs.warmBoot);
    launched = await execute('system-launch', iosProvisioningBudgetsMs.systemLaunch);
  }
  if (!/^com\.apple\.Preferences:\s*[1-9]\d*\s*$/m.test(launched)) {
    throw new Error('iOS provisioning: Settings launch did not return a process identifier');
  }
  await execute('system-terminate', iosProvisioningBudgetsMs.systemTerminate);
  return { restarted };
}
