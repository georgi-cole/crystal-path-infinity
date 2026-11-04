import { describe, expect, it, vi } from 'vitest';
import {
  createRewardClient,
  parseRewardPermit,
  parseRewardView,
  RewardUnavailable,
} from '../src/rewards/reward-client';
import type { RewardClient, RewardPermit, RewardView } from '../src/rewards/reward-client';
import type { AccountRequestLease } from '../src/account/session-owner';
const runId = '29000000-0000-4000-8000-000000000001';
const intentId = '29100000-0000-4000-8000-000000000001';
const nonce = '29200000-0000-4000-8000-000000000001';
const grantId = '29300000-0000-4000-8000-000000000001';
const NOW = 1_800_000_000_000;
function offer(): RewardView {
  return {
    schemaVersion: 1,
    runId,
    rulesetVersion: 'infinity-v1',
    status: 'offer',
    deathId: 'death:1',
    offer: { ordinal: 1, restoreSp: 200 },
    intent: null,
    grant: null,
    revivesGranted: 0,
    revivesApplied: 0,
    revivesToReachScore: 0,
  };
}
function permit(): RewardPermit {
  return {
    id: nonce,
    policyVersion: 'test-policy',
    expiresAt: NOW + 60_000,
    inventory: { provider: 'admob', platform: 'android', sdkVersion: 'test-sdk-1', mediation: [] },
    flags: {
      canRequestAds: true,
      childDirected: true,
      underAgeOfConsent: true,
      maxAdContentRating: 'G',
      nonPersonalized: true,
    },
    context: 'unknown',
    contextSupported: true,
    prerequisitesSatisfied: true,
  };
}
function session() {
  let scope: object | null = {};
  const observers = new Set<() => void>();
  return {
    accountScope: () => scope,
    subscribeAccountScope: (observer: () => void) => {
      observers.add(observer);
      return () => {
        observers.delete(observer);
      };
    },
    withAccountRequest: <T>(operation: (lease: AccountRequestLease) => Promise<T>) =>
      operation({ accessToken: 'REWARD-ACCESS-SECRET', signal: new AbortController().signal }),
    invalidate: () => {
      scope = null;
      for (const observer of observers) observer();
    },
  };
}
describe('CPI-026/029 strict rewarded wire and private transport', () => {
  it('validates exact fixed promises and preserves the tenth granted continuation before it is applied', () => {
    expect(parseRewardView(offer(), runId)).toEqual(offer());
    const tenth = {
      ...offer(),
      status: 'granted',
      offer: null,
      revivesGranted: 10,
      revivesApplied: 9,
      revivesToReachScore: 5,
      intent: {
        id: intentId,
        ordinal: 10,
        restoreSp: 150,
        expiresAt: NOW - 60_000,
        customData: nonce,
      },
      grant: { id: grantId, ordinal: 10, restoreSp: 150 },
    };
    expect(parseRewardView(tenth, runId)?.grant?.ordinal).toBe(10);
    for (const invalid of [
      { ...offer(), checkpoint_private: {} },
      { ...offer(), offer: { ordinal: 1, restoreSp: 150 } },
      { ...offer(), revivesGranted: 11 },
      { ...offer(), revivesApplied: 1 },
      { ...offer(), deathId: null },
      { ...offer(), runId: nonce },
      { ...tenth, grant: { id: grantId, ordinal: 11, restoreSp: 150 } },
      { ...tenth, intent: { ...tenth.intent, customData: 'email@example.invalid' } },
      { ...offer(), status: 'playing' },
      { ...offer(), status: 'pending', offer: null },
    ])
      expect(parseRewardView(invalid, runId)).toBeNull();
  });
  it('requires independent server prerequisites, exact inventory and safe child/unknown flags without analytics shortcuts', () => {
    const wire = { schemaVersion: 1, status: 'allowed', permit: permit() };
    expect(parseRewardPermit(wire)).toEqual(permit());
    for (const invalid of [
      { ...wire, permit: { ...permit(), analyticsAgeBand: '18_24' } },
      { ...wire, permit: { ...permit(), contextSupported: false } },
      { ...wire, permit: { ...permit(), prerequisitesSatisfied: false } },
      { ...wire, permit: { ...permit(), flags: { ...permit().flags, canRequestAds: 'true' } } },
      { ...wire, permit: { ...permit(), flags: { ...permit().flags, childDirected: false } } },
      { ...wire, permit: { ...permit(), flags: { ...permit().flags, underAgeOfConsent: false } } },
      { ...wire, permit: { ...permit(), flags: { ...permit().flags, maxAdContentRating: 'T' } } },
      { ...wire, permit: { ...permit(), flags: { ...permit().flags, nonPersonalized: false } } },
      { ...wire, status: 'parental_review' },
      { schemaVersion: 1, status: 'unavailable' },
    ])
      expect(parseRewardPermit(invalid)).toBeNull();
  });
  it('creates no default endpoint and sends only fixed operations through the approved account fence', async () => {
    const owner = session();
    const applyGrant = vi.fn<RewardClient['applyGrant']>().mockResolvedValue(true);
    const fetcher = vi.fn<typeof fetch>((input) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            (typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url
            ).endsWith('/eligibility')
              ? { schemaVersion: 1, status: 'allowed', permit: permit() }
              : offer(),
          ),
        ),
      ),
    );
    for (const baseUrl of [
      undefined,
      '',
      'http://server.invalid',
      'https://u:p@server.invalid',
      'https://server.invalid?token=SECRET',
      'https://server.invalid#token',
      'https://server.invalid/auth/v1',
    ])
      expect(createRewardClient({ baseUrl, session: owner, applyGrant, fetcher })).toBeNull();
    const client = createRewardClient({
      baseUrl: 'https://server.invalid/cpi',
      session: owner,
      applyGrant,
      fetcher,
    })!;
    expect(fetcher).not.toHaveBeenCalled();
    await client.eligibility(runId, new AbortController().signal);
    await client.status(runId, new AbortController().signal);
    await client.intent(runId, intentId, new AbortController().signal);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://server.invalid/cpi/rewards/eligibility',
      'https://server.invalid/cpi/rewards/status',
      'https://server.invalid/cpi/rewards/intent',
    ]);
    for (const [, init] of fetcher.mock.calls)
      expect(init).toMatchObject({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        headers: { authorization: 'Bearer REWARD-ACCESS-SECRET' },
      });
    expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toEqual({
      runId,
      idempotencyKey: intentId,
    });
    expect(await client.applyGrant(runId, grantId)).toBe(true);
    expect(applyGrant).toHaveBeenCalledExactlyOnceWith(runId, grantId);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('redacts failed HTTP/network responses and rejects stale account results without caching credentials or grants', async () => {
    const owner = session();
    const client = createRewardClient({
      baseUrl: 'https://server.invalid',
      session: owner,
      applyGrant: () => Promise.resolve(false),
      fetcher: () =>
        Promise.resolve(new Response('private email REWARD-ACCESS-SECRET', { status: 503 })),
    })!;
    await expect(client.status(runId, new AbortController().signal)).rejects.toEqual(
      new RewardUnavailable(),
    );
    const stale = createRewardClient({
      baseUrl: 'https://server.invalid',
      session: owner,
      applyGrant: () => Promise.resolve(false),
      fetcher: () => {
        owner.invalidate();
        return Promise.resolve(new Response(JSON.stringify(offer())));
      },
    })!;
    await expect(stale.status(runId, new AbortController().signal)).rejects.toEqual(
      new RewardUnavailable(),
    );
    expect(stale.accountScope()).toBeNull();
  });
});
