/** No auth, network, ads, analytics or remote content belongs in startup. */
export type StartupResult<T> = { status: 'ready'; value: T } | { status: 'failed'; reason: string };

export const BOOT_TIMEOUT_MS = 1500;

/** Return a local result immediately; timeout is a failure bound, not minimum duration. */
export function settleStartup<T>(
  loader: () => T | Promise<T>,
  timeoutMs: number = BOOT_TIMEOUT_MS,
): Promise<StartupResult<T>> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new RangeError('Startup timeout must be positive.');
  }
  return new Promise((resolve) => {
    let done = false;
    const complete = (result: StartupResult<T>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(
      () => complete({ status: 'failed', reason: 'Local startup took too long.' }),
      timeoutMs,
    );
    void Promise.resolve()
      .then(loader)
      .then(
        (value) => complete({ status: 'ready', value }),
        () => complete({ status: 'failed', reason: 'Local startup is unavailable.' }),
      );
  });
}
