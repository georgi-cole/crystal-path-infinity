/** Provision only the newly-created simulator, before installing or launching CPI.
 * First-boot migration can finish while the iOS services are still congested.
 * Restart that same migrated device once, then require a complete Settings
 * launch/termination round trip. No failed command or game launch is retried.
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
): Promise<void> {
  await execute('cold-boot', iosProvisioningBudgetsMs.coldBoot);
  await execute('shutdown', iosProvisioningBudgetsMs.shutdown);
  await execute('warm-boot', iosProvisioningBudgetsMs.warmBoot);
  const launched = await execute('system-launch', iosProvisioningBudgetsMs.systemLaunch);
  if (!/^com\.apple\.Preferences:\s*[1-9]\d*\s*$/m.test(launched)) {
    throw new Error('iOS provisioning: Settings launch did not return a process identifier');
  }
  await execute('system-terminate', iosProvisioningBudgetsMs.systemTerminate);
}
