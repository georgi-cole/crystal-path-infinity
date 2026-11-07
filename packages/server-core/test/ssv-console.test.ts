import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { SSV_CONSOLE_NONCE, verifySsvConsole } from '../src/ssv-console.ts';
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
  now = Date.now(),
  contract = {
    unit: '5387868010',
    networks: ['5450213213286189855'],
    amount: '1',
    item: 'continue',
  };
function signed(nonce = SSV_CONSOLE_NONCE) {
  const prefix = new URLSearchParams({
    ad_network: contract.networks[0],
    ad_unit: contract.unit,
    custom_data: nonce,
    reward_amount: '1',
    reward_item: 'continue',
    timestamp: String(now),
    transaction_id: 'abcdef',
  }).toString();
  return (
    prefix +
    '&signature=' +
    sign('sha256', Buffer.from(prefix), pair.privateKey).toString('base64url') +
    '&key_id=123'
  );
}
describe('AdMob URL verification without a player reward', () => {
  it('accepts a signed, fresh reserved nonce without any ledger dependency', async () => {
    expect(
      await verifySsvConsole(
        signed(),
        { get: () => Promise.resolve(pair.publicKey) },
        contract,
        now,
      ),
    ).toEqual({ status: 'verified-no-reward' });
  });
  it('rejects player nonces, wrong inventory, tampering and stale callbacks', async () => {
    const keys = { get: () => Promise.resolve(pair.publicKey) };
    await expect(
      verifySsvConsole(signed('00000000-0000-4000-8000-000000000001'), keys, contract, now),
    ).rejects.toThrow();
    await expect(
      verifySsvConsole(signed(), keys, { ...contract, unit: '4563926844' }, now),
    ).rejects.toThrow();
    await expect(
      verifySsvConsole(signed().replace('abcdef', 'bad'), keys, contract, now),
    ).rejects.toThrow();
    await expect(verifySsvConsole(signed(), keys, contract, now + 300001)).rejects.toThrow();
  });
});
