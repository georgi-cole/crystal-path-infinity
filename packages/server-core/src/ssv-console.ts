import { verifyGoogleReward } from './reward-ssv.ts';
import type { GoogleRewardKeys } from './reward-ssv.ts';
/** AdMob's mandatory URL verification sends this reserved nonce. It can never grant a revive. */
export const SSV_CONSOLE_NONCE = '00000000-0000-4000-8000-000000000000';
export async function verifySsvConsole(
  rawQuery: string,
  keys: GoogleRewardKeys,
  contract: { unit: string; amount: string; item: string; networks: readonly string[] },
  now = Date.now(),
) {
  const value = await verifyGoogleReward(rawQuery, keys);
  if (
    value.customData !== SSV_CONSOLE_NONCE ||
    value.adUnit !== contract.unit ||
    value.amount !== contract.amount ||
    value.item !== contract.item ||
    !contract.networks.includes(value.adNetwork) ||
    Math.abs(now - value.earnedAt) > 300_000
  )
    throw new Error('Invalid console verification');
  return { status: 'verified-no-reward' };
}
