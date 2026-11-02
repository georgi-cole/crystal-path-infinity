import { describe, expect, it, vi } from 'vitest';
import { BOOT_TIMEOUT_MS, settleStartup } from '../src/startup-bootstrap';

describe('CPI-012 bounded offline startup', () => {
  it('does not delay successful local loading or call a remote service', async () => {
    const load = vi.fn(() => ({ saved: 'local', settings: 'local' }));
    expect(await settleStartup(load)).toEqual({
      status: 'ready',
      value: { saved: 'local', settings: 'local' },
    });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('fails visibly instead of blocking forever on a pending loader', async () => {
    vi.useFakeTimers();
    try {
      const promise = settleStartup(() => new Promise<never>(() => {}), 15);
      await vi.advanceTimersByTimeAsync(15);
      expect(await promise).toEqual({ status: 'failed', reason: 'Local startup took too long.' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns an explicit retryable failure when the local loader throws', async () => {
    await expect(
      settleStartup(() => {
        throw new Error('storage unavailable');
      }),
    ).resolves.toEqual({ status: 'failed', reason: 'Local startup is unavailable.' });
  });

  it('ignores late success after the deadline and has a positive default bound', async () => {
    vi.useFakeTimers();
    try {
      let resolveLate: (value: string) => void = () => {};
      const waiting = new Promise<string>((resolve) => {
        resolveLate = resolve;
      });
      const outcome = settleStartup(() => waiting, 5);
      await vi.advanceTimersByTimeAsync(5);
      resolveLate('late');
      expect(await outcome).toEqual({ status: 'failed', reason: 'Local startup took too long.' });
      expect(BOOT_TIMEOUT_MS).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects unbounded or invalid timeout configurations', () => {
    expect(() => settleStartup(() => 'ready', 0)).toThrow(RangeError);
    expect(() => settleStartup(() => 'ready', Infinity)).toThrow(RangeError);
  });
});
