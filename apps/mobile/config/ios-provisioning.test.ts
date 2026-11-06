import { describe, expect, it, vi } from 'vitest';
import { prepareIosSimulator } from './ios-provisioning';

describe('iOS provisioning before any game process', () => {
  it('restarts the migrated device and requires a complete system-app round trip', async () => {
    const execute = vi.fn(() => Promise.resolve('com.apple.Preferences: 42'));
    await prepareIosSimulator(execute);
    expect(execute.mock.calls).toEqual([
      ['cold-boot', 900_000],
      ['shutdown', 180_000],
      ['warm-boot', 180_000],
      ['system-launch', 180_000],
      ['system-terminate', 60_000],
    ]);
  });

  it.each(['cold-boot', 'shutdown', 'warm-boot', 'system-launch', 'system-terminate'])(
    'stops immediately at a failed %s without retrying or advancing',
    async (failedStep) => {
      const steps: string[] = [];
      await expect(
        prepareIosSimulator((step) => {
          steps.push(step);
          if (step === failedStep) throw new Error('simctl timed out');
          return Promise.resolve('com.apple.Preferences: 42');
        }),
      ).rejects.toThrow('simctl timed out');
      expect(steps.at(-1)).toBe(failedStep);
      expect(new Set(steps).size).toBe(steps.length);
    },
  );

  it.each(['', 'com.apple.Preferences: 0', 'com.apple.Preferences: -1', 'other: 42'])(
    'rejects a successful command without Settings process evidence: %j',
    async (output) => {
      const steps: string[] = [];
      await expect(
        prepareIosSimulator((step) => {
          steps.push(step);
          return Promise.resolve(output);
        }),
      ).rejects.toThrow('did not return a process identifier');
      expect(steps.at(-1)).toBe('system-launch');
    },
  );
});
