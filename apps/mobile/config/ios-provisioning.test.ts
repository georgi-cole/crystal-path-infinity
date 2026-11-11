import { describe, expect, it, vi } from 'vitest';
import { prepareIosSimulator } from './ios-provisioning';

describe('iOS provisioning before any game process', () => {
  it('keeps a healthy boot and requires Settings process and termination evidence', async () => {
    const execute = vi.fn(() => Promise.resolve('com.apple.Preferences: 42'));
    await expect(prepareIosSimulator(execute)).resolves.toEqual({ restarted: false });
    expect(execute.mock.calls).toEqual([
      ['cold-boot', 900_000],
      ['system-launch', 180_000],
      ['system-terminate', 60_000],
    ]);
  });

  it('recovers a failed pre-install Settings launch with exactly one owned-device restart', async () => {
    let probes = 0;
    const execute = vi.fn((step: string) => {
      if (step === 'system-launch' && probes++ === 0) return Promise.reject(new Error('busy OS'));
      return Promise.resolve('com.apple.Preferences: 42');
    });
    await expect(prepareIosSimulator(execute)).resolves.toEqual({ restarted: true });
    expect(execute.mock.calls).toEqual([
      ['cold-boot', 900_000],
      ['system-launch', 180_000],
      ['shutdown', 180_000],
      ['warm-boot', 180_000],
      ['system-launch', 180_000],
      ['system-terminate', 60_000],
    ]);
  });

  it.each(['cold-boot', 'system-terminate'])(
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

  it.each(['shutdown', 'warm-boot', 'system-launch'])(
    'stops at a failed recovery %s without a third launch probe',
    async (failedStep) => {
      const steps: string[] = [];
      await expect(
        prepareIosSimulator((step) => {
          steps.push(step);
          if (step === 'system-launch' || step === failedStep) throw new Error('OS unavailable');
          return Promise.resolve('com.apple.Preferences: 42');
        }),
      ).rejects.toThrow('OS unavailable');
      expect(steps.at(-1)).toBe(failedStep);
      expect(steps.filter((step) => step === 'system-launch').length).toBeLessThanOrEqual(2);
      expect(steps).not.toContain('system-terminate');
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
