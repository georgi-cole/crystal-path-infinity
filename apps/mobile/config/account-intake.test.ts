import { describe, expect, it } from 'vitest';
import { AccountOtpFlow, validateEligibility, validAccountEmail } from '../src/account/otp-flow';
import type { OtpGateway } from '../src/account/otp-flow';

const permit = 'eligible-permit-ABCDEF0123456789012';
const epoch = 1_800_000_000_000;
const eligible = () => ({
  status: 'eligible',
  permit,
  expiresAt: epoch + 600_000,
  policyVersion: 'cpi-policy-v1',
});

function fixture(decision: unknown = eligible()) {
  let time = epoch;
  const calls: string[] = [];
  const gateway: OtpGateway = {
    eligibility: () => {
      calls.push('eligibility');
      return Promise.resolve(decision);
    },
    requestCode: (email, challenge) => {
      calls.push('request:' + email + ':' + challenge);
      return Promise.resolve({ status: 'accepted', expiresAt: time + 120_000 });
    },
    verifyCode: (email, code, challenge) => {
      calls.push('verify:' + email + ':' + code + ':' + challenge);
      return Promise.resolve({ status: 'verified' });
    },
  };
  const flow = new AccountOtpFlow(gateway, () => time);
  return { flow, calls, clock: (ms: number) => (time += ms) };
}

describe('CPI-018 privacy-gated OTP pre-account flow', () => {
  it('hands a verified ticket to the credential owner once without putting it in a UI snapshot', async () => {
    const ticket = 'verified-once-0123456789abcdef';
    const gateway: OtpGateway = {
      eligibility: () => Promise.resolve(eligible()),
      requestCode: () => Promise.resolve({ status: 'accepted', expiresAt: epoch + 120000 }),
      verifyCode: () =>
        Promise.resolve({
          status: 'verified',
          verifiedTicket: ticket,
          refreshToken: 'must-not-render',
        }),
    };
    const flow = new AccountOtpFlow(gateway, () => epoch);
    await flow.checkEligibility(true);
    await flow.requestCode('example@example.org', true);
    await flow.verifyCode('123456', true);
    expect(JSON.stringify(flow.snapshot())).not.toContain(ticket);
    expect(JSON.stringify(flow.snapshot())).not.toContain('must-not-render');
    expect(flow.takeVerifiedTicket()).toBe(ticket);
    expect(flow.takeVerifiedTicket()).toBeNull();
    flow.cancel();
    expect(flow.takeVerifiedTicket()).toBeNull();
  });
  it('refuses unknown, expired, invented or overlong grants', () => {
    for (const response of [
      null,
      {},
      { status: 'eligible' },
      { ...eligible(), expiresAt: epoch - 1 },
      { ...eligible(), expiresAt: epoch + 20 * 60_000 },
      { ...eligible(), permit: 'short' },
      { ...eligible(), policyVersion: '' },
      { status: 'adult' },
    ]) {
      expect(validateEligibility(response, epoch).status).toBe('unavailable');
    }
    expect(validateEligibility(eligible(), epoch).status).toBe('eligible');
  });

  it('advances to email with a valid 15-minute permit when the device clock runs behind', async () => {
    const { flow } = fixture({ ...eligible(), expiresAt: epoch + 15 * 60_000 + 2_000 });
    await flow.checkEligibility(true);
    expect(flow.snapshot()).toMatchObject({ step: 'eligible', problem: null });
  });

  it('keeps review-required and unknown contexts out of email capture', async () => {
    const review = fixture({ status: 'parental_review' });
    await review.flow.checkEligibility(true);
    expect(review.flow.snapshot().step).toBe('parental_review');
    await review.flow.requestCode('someone@example.org', true);
    expect(review.calls).toEqual(['eligibility']);
    const blocked = fixture({ status: 'unknown' });
    await blocked.flow.checkEligibility(true);
    expect(blocked.flow.snapshot()).toMatchObject({ step: 'unavailable', problem: 'retry' });
    await blocked.flow.requestCode('someone@example.org', true);
    expect(blocked.calls).toEqual(['eligibility']);
  });

  it('never starts eligibility or OTP network calls while offline', async () => {
    const { flow, calls } = fixture();
    await flow.checkEligibility(false);
    expect(flow.snapshot().step).toBe('offline');
    await flow.requestCode('someone@example.org', false);
    await flow.verifyCode('123456', false);
    expect(calls).toEqual([]);
  });

  it('accepts email only after server permit; does not invent ranked auth', async () => {
    const { flow, calls } = fixture();
    await flow.requestCode('someone@example.org', true);
    expect(calls).toEqual([]);
    await flow.checkEligibility(true);
    expect(flow.snapshot().step).toBe('eligible');
    await flow.requestCode('someone@example.org', true);
    expect(flow.snapshot().step).toBe('code');
    expect(calls[1]).toBe('request:someone@example.org:' + permit);
    await flow.verifyCode('123456', true);
    expect(flow.snapshot().step).toBe('verified_pending_session');
    expect(calls[2]).toBe('verify:someone@example.org:123456:' + permit);
  });

  it('rejects bad email/code and enforces one-minute resend cooldown', async () => {
    const { flow, calls, clock } = fixture();
    expect(validAccountEmail('someone@example.org')).toBe(true);
    expect(validAccountEmail(' someone@example.org')).toBe(false);
    expect(validAccountEmail('someone@domain')).toBe(false);
    await flow.checkEligibility(true);
    await flow.requestCode('invalid address', true);
    expect(flow.snapshot().problem).toBe('invalid_email');
    expect(calls).toEqual(['eligibility']);
    await flow.requestCode('someone@example.org', true);
    await flow.requestCode('someone@example.org', true);
    expect(flow.snapshot().problem).toBe('cooldown');
    expect(calls).toHaveLength(2);
    await flow.verifyCode('12abc4', true);
    expect(flow.snapshot().problem).toBe('invalid_code');
    expect(calls).toHaveLength(2);
    clock(61_000);
    await flow.requestCode('someone@example.org', true);
    expect(calls).toHaveLength(3);
  });

  it('fails closed when the eligibility grant or code expires', async () => {
    const { flow, clock } = fixture();
    await flow.checkEligibility(true);
    clock(601_000);
    await flow.requestCode('someone@example.org', true);
    expect(flow.snapshot().step).toBe('unavailable');
    expect(flow.snapshot().problem).toBe('expired');
    const second = fixture();
    await second.flow.checkEligibility(true);
    await second.flow.requestCode('someone@example.org', true);
    second.clock(121_000);
    await second.flow.verifyCode('123456', true);
    expect(second.flow.snapshot().problem).toBe('expired');
  });

  it('cancels late eligibility and send responses without resurrecting identity', async () => {
    let resolve!: (payload: unknown) => void;
    const late = new Promise<unknown>((r) => (resolve = r));
    const gateway: OtpGateway = {
      eligibility: () => late,
      requestCode: () => Promise.resolve({ status: 'accepted', expiresAt: epoch + 60_000 }),
      verifyCode: () => Promise.resolve({ status: 'verified' }),
    };
    const flow = new AccountOtpFlow(gateway, () => epoch);
    const pending = flow.checkEligibility(true);
    flow.cancel();
    resolve(eligible());
    await pending;
    expect(flow.snapshot().step).toBe('guest');
    expect(flow.snapshot().resendAt).toBeNull();
  });
});
