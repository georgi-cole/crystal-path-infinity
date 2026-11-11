import type { AppEnvironment } from './environments';
import { selectGuestAdUnits } from './guest-ad-inventory.ts';

/** Separate version metadata for signed store candidates with live guest ads. */
export function resolveStoreBuild(
  environment: AppEnvironment,
  values: Readonly<Record<string, string | undefined>>,
) {
  const version = values.CPI_STORE_VERSION;
  const build = values.CPI_STORE_BUILD_NUMBER;
  if (!version && !build) return null;

  if (
    !version ||
    !/^[1-9]\d{0,3}\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/.test(version) ||
    !build ||
    !/^[1-9]\d{0,3}$/.test(build)
  ) {
    throw new Error('Set a numeric store version and a positive store build number.');
  }
  if (
    environment !== 'production' ||
    values.VITE_GUEST_REWARDED_ADS_LIVE !== 'true' ||
    !selectGuestAdUnits(values, environment)
  ) {
    throw new Error('Store build metadata requires live guest inventory in production.');
  }
  return { version, buildNumber: Number(build) };
}
