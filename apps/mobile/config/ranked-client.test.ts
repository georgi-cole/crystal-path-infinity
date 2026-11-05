import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountSessionOwner } from '../src/account/session-owner';
import { createRankedClient, parseRankedReply } from '../src/ranked/ranked-client';
import type { RankedClient, RankedClientState } from '../src/ranked/ranked-client';
import { RankedScene } from '../src/ranked/ranked-scene';
import { RankedAuthority } from '../../../packages/server-core/src/ranked.ts';
import type {
  RankedReceipt,
  RankedRepository,
  StoredRankedRun,
} from '../../../packages/server-core/src/ranked.ts';
import { getCurrentRow } from '@crystal-path-infinity/game-core';

const NOW = 1_800_000_000_000;
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const RUN = '00000000-0000-4000-8000-000000000021';
const LEASE = '00000000-0000-4000-8000-000000000022';

function reply(sequence = '1', row = '0', generation = '1', paused = true) {
  return {
    accepted: true,
    reason: null,
    lease: { token: LEASE, generation, expiresAt: NOW + 60_000 },
    snapshot: {
      runId: RUN,
      rulesetVersion: 'infinity-v1',
      status: 'playing',
      region: { countryCode: 'BG', continent: 'EU', mappingVersion: 'cpi-regions-2026-11-v1' },
      nextSequence: sequence,
      lastClearedRow: row,
      currentRow: (BigInt(row) + 1n).toString(),
      sp: 300,
      hints: 2,
      activeTimeMs: 0,
      achievedAt: row === '0' ? null : NOW,
      paused,
      current: {
        revealedSafeSide: null,
        mysteryOutcome: null,
        lastChoice: null,
        hasMystery: false,
      },
      history: [],
      effects: [],
      death: null,
      revivesGranted: 0,
      revivesApplied: 0,
      revivesToReachScore: 0,
      rewardPending: false,
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
async function fixture(handler: (url: string, init: RequestInit) => Promise<Response>) {
  let saved: string | null = null;
  let subject = USER_A;
  let refresh = 0;
  const owner = new AccountSessionOwner(
    {
      supported: true,
      read: () => Promise.resolve(saved),
      write: (value) => {
        saved = value;
        return Promise.resolve();
      },
      clear: () => {
        saved = null;
        return Promise.resolve();
      },
    },
    {
      exchange: () =>
        Promise.resolve({
          status: 'active',
          subject,
          accessToken: 'access-token-test-0123456789',
          refreshToken: 'refresh-token-test-0123456789-' + String(refresh++),
          expiresAt: NOW + 3_600_000,
        }),
      refresh: () =>
        Promise.resolve({
          status: 'active',
          subject,
          accessToken: 'access-token-next-0123456789',
          refreshToken: 'refresh-token-next-0123456789-' + String(refresh++),
          expiresAt: NOW + 3_600_000,
        }),
      revoke: () => Promise.resolve({ status: 'revoked' }),
    },
    () => NOW,
  );
  await owner.exchangeVerifiedTicket('verified-ticket-test-0123456789');
  const calls: { url: string; init: RequestInit }[] = [];
  let id = 100;
  const client = createRankedClient({
    baseUrl: 'https://ranked.example.invalid',
    session: owner,
    newId: () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`,
    fetcher: (url, init) => {
      const address = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      calls.push({ url: address, init: init! });
      return handler(address, init!);
    },
  })!;
  return {
    owner,
    client,
    calls,
    switchAccount: () => {
      subject = USER_B;
    },
  };
}
function serializedBody(input: RequestInit): string {
  if (typeof input.body !== 'string') throw new Error('Expected a JSON body');
  return input.body;
}
function body(input: RequestInit): Record<string, unknown> {
  return JSON.parse(serializedBody(input)) as Record<string, unknown>;
}

describe('CPI-032/037 fixed operational refusals', () => {
  it('accepts whitelisted v2 pacing without relaxing the v1 or private-field boundary', () => {
    const legacy = reply();
    expect(parseRankedReply(legacy)?.snapshot.pacing).toBeUndefined();
    const paced = {
      ...legacy,
      snapshot: {
        ...legacy.snapshot,
        rulesetVersion: 'infinity-v2',
        activeTimeMs: 4_000,
        pacing: { rowEnteredAt: 0, nextSurvivalBonusAt: 60_000 },
      },
    };
    expect(parseRankedReply(paced)?.snapshot.pacing).toEqual(paced.snapshot.pacing);
    expect(
      parseRankedReply({
        ...paced,
        snapshot: { ...paced.snapshot, pacing: { ...paced.snapshot.pacing, safeSide: 'left' } },
      }),
    ).toBeNull();
    expect(
      parseRankedReply({ ...paced, snapshot: { ...paced.snapshot, stream: { rng: 'private' } } }),
    ).toBeNull();
    expect(
      parseRankedReply({ ...paced, snapshot: { ...paced.snapshot, pacing: undefined } }),
    ).toBeNull();
    expect(
      parseRankedReply({ ...paced, snapshot: { ...paced.snapshot, activeTimeMs: 8_000 } }),
    ).toBeNull();
    expect(
      parseRankedReply({
        ...paced,
        snapshot: { ...paced.snapshot, rulesetVersion: 'infinity-v1' },
      }),
    ).toBeNull();
    const dead = {
      ...paced,
      snapshot: {
        ...paced.snapshot,
        status: 'dead',
        activeTimeMs: 8_000,
        sp: 0,
        death: { id: 'v2:death:1', cause: 'idle', fatalRow: '1' },
      },
    };
    expect(parseRankedReply(dead)?.snapshot.death?.cause).toBe('idle');
    expect(
      parseRankedReply({
        ...legacy,
        snapshot: { ...legacy.snapshot, status: 'dead', sp: 0, death: dead.snapshot.death },
      }),
    ).toBeNull();
  });
  it.each([
    ['maintenance', 503, true],
    ['client_update_required', 426, false],
    ['ruleset_unavailable', 409, true],
    ['recovery_unavailable', 409, true],
    ['operation_context_required', 503, false],
  ] as const)(
    'fences %s and only offers a useful explicit recheck',
    async (code, status, canRetry) => {
      const f = await fixture(() => Promise.resolve(response({ code }, status)));
      await f.client.start();
      expect(f.client.snapshot()).toMatchObject({
        phase: 'blocked',
        problem: code,
        run: null,
        canRetry,
      });
      const original = serializedBody(f.calls[0].init);
      await f.client.recover(RUN);
      await f.client.lookupActive();
      await f.client.start();
      expect(f.calls).toHaveLength(1);
      await f.client.retry();
      expect(f.calls).toHaveLength(canRetry ? 2 : 1);
      if (canRetry) expect(serializedBody(f.calls[1].init)).toBe(original);
      f.client.dispose();
    },
  );
  it('keeps an uncertain action byte-for-byte through maintenance until its original receipt returns', async () => {
    let attempt = 0;
    const f = await fixture(() => {
      attempt++;
      if (attempt === 1) return Promise.resolve(response(reply()));
      if (attempt === 2) return Promise.reject(new Error('Response lost after commit'));
      if (attempt === 3) return Promise.resolve(response({ code: 'maintenance' }, 503));
      return Promise.resolve(response(reply('2', '0', '1', false)));
    });
    await f.client.start();
    await f.client.command({ type: 'resume' });
    await f.client.retry();
    expect(f.client.snapshot()).toMatchObject({
      phase: 'blocked',
      problem: 'maintenance',
      run: { nextSequence: '1', paused: true },
    });
    await f.client.command({ type: 'end' });
    await f.client.recover(RUN, true);
    expect(f.calls).toHaveLength(3);
    await f.client.retry();
    expect(f.calls.slice(1).map(({ init }) => serializedBody(init))).toEqual(
      Array.from({ length: 3 }, () => serializedBody(f.calls[1].init)),
    );
    expect(f.client.snapshot()).toMatchObject({
      phase: 'ready',
      problem: null,
      run: { nextSequence: '2', paused: false },
    });
    f.client.dispose();
  });
  it('treats service failure as ambiguous and rejects extra private fields or mismatched status in fixed errors', async () => {
    for (const [wire, status, expected] of [
      [{ code: 'service_unavailable' }, 503, 'service_unavailable'],
      [{ code: 'maintenance', email: 'PRIVATE-SECRET' }, 503, null],
      [{ code: 'client_update_required' }, 500, null],
      [{ code: 'PRIVATE-SECRET' }, 503, null],
    ] as const) {
      const f = await fixture(() => Promise.resolve(response(wire, status)));
      await f.client.start();
      expect(f.client.snapshot()).toMatchObject({
        phase: 'retry',
        problem: expected,
        canRetry: true,
      });
      expect(JSON.stringify(f.client.snapshot())).not.toContain('PRIVATE-SECRET');
      f.client.dispose();
    }
  });
});

describe('CPI-029 verified grant queue and device lease recovery', () => {
  const grantId = '29000000-0000-4000-8000-000000000099';
  const refreshedLease = '00000000-0000-4000-8000-000000000023';
  const dead = (generation = '1') => {
    const base = reply('2', '0', generation);
    return {
      ...base,
      lease: {
        ...base.lease,
        token: generation === '1' ? LEASE : refreshedLease,
        expiresAt: generation === '1' ? NOW - 1 : NOW + 60_000,
      },
      snapshot: {
        ...base.snapshot,
        status: 'dead',
        sp: 0,
        death: { id: 'death:1', fatalRow: '1', cause: 'wrong_tile' },
        revivesGranted: 1,
      },
    };
  };
  const restored = () => {
    const base = reply('3', '0', '2');
    return {
      ...base,
      lease: { ...base.lease, token: refreshedLease },
      snapshot: { ...base.snapshot, sp: 200, revivesGranted: 1, revivesApplied: 1 },
    };
  };
  it('rejects a stale displayed run before any lease recovery, apply or archive request', async () => {
    const f = await fixture(() => Promise.resolve(response(dead())));
    await f.client.recover(RUN);
    const calls = f.calls.length;
    expect(await f.client.applyVerifiedGrant(grantId, grantId)).toBe(false);
    expect(await f.client.archivePending(grantId)).toBe(false);
    expect(f.calls).toHaveLength(calls);
    f.client.dispose();
    f.owner.dispose();
  });
  it('archives an owed grant only after a matching acknowledgement and retries an uncertain archive exactly', async () => {
    let recoveries = 0;
    let archives = 0;
    const bodies: string[] = [];
    const f = await fixture((url, init) => {
      if (url.endsWith('/ranked/recover'))
        return Promise.resolve(response(dead(String(++recoveries))));
      if (url.endsWith('/ranked/archive')) {
        archives++;
        bodies.push(serializedBody(init));
        return archives === 1
          ? Promise.reject(new Error('Lost committed archive response'))
          : Promise.resolve(response({ status: 'archived', runId: RUN }));
      }
      return Promise.resolve(response({ code: 'not_found' }, 404));
    });
    await f.client.recover(RUN);
    expect(await f.client.archivePending(RUN)).toBe(false);
    expect(f.client.snapshot().run).toMatchObject({
      status: 'dead',
      revivesGranted: 1,
      revivesApplied: 0,
    });
    expect(await f.client.archivePending(RUN)).toBe(true);
    expect(recoveries).toBe(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(f.client.snapshot()).toMatchObject({ phase: 'idle', run: null, canRetry: false });
    expect(body(f.calls.at(-1)!.init)).toMatchObject({
      runId: RUN,
      sequence: '2',
      leaseToken: refreshedLease,
    });
    expect(f.calls.some((call) => call.url.endsWith('/ranked/action'))).toBe(false);
    f.client.dispose();
    f.owner.dispose();
  });
  it('does not erase a recoverable run on an archive response for the wrong run', async () => {
    let recoveries = 0;
    const f = await fixture((url) =>
      url.endsWith('/ranked/recover')
        ? Promise.resolve(response(dead(String(++recoveries))))
        : Promise.resolve(response({ status: 'archived', runId: grantId })),
    );
    await f.client.recover(RUN);
    expect(await f.client.archivePending(RUN)).toBe(false);
    expect(f.client.snapshot().run?.runId).toBe(RUN);
    expect(f.client.snapshot().canRetry).toBe(true);
    f.client.dispose();
    f.owner.dispose();
  });
  it('renews an ad-expired same-device lease then preserves the exact apply request after response loss', async () => {
    let recoveries = 0;
    let applications = 0;
    const bodies: string[] = [];
    const f = await fixture((url, init) => {
      if (url.endsWith('/ranked/recover'))
        return Promise.resolve(response(dead(String(++recoveries))));
      if (url.endsWith('/rewards/apply')) {
        applications++;
        bodies.push(serializedBody(init));
        return applications === 1
          ? Promise.reject(new Error('Response lost after commit'))
          : Promise.resolve(response(restored()));
      }
      return Promise.resolve(response({ code: 'not_found' }, 404));
    });
    await f.client.recover(RUN);
    expect(await f.client.applyVerifiedGrant(grantId, RUN)).toBe(false);
    expect(recoveries).toBe(2);
    expect(f.client.snapshot().canRetry).toBe(true);
    expect(body(f.calls.at(-1)!.init)).toMatchObject({
      runId: RUN,
      grantId,
      sequence: '2',
      leaseToken: refreshedLease,
    });
    expect(await f.client.applyVerifiedGrant(grantId, RUN)).toBe(true);
    expect(recoveries).toBe(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(f.client.snapshot().run).toMatchObject({
      status: 'playing',
      sp: 200,
      revivesGranted: 1,
      revivesApplied: 1,
    });
    f.client.dispose();
    f.owner.dispose();
  });
  it('preserves a grant when another device owns recovery and never silently requests takeover', async () => {
    let recoveries = 0;
    let applications = 0;
    const f = await fixture((url, init) => {
      if (url.endsWith('/ranked/recover')) {
        recoveries++;
        if (recoveries === 1) return Promise.resolve(response(dead()));
        expect(body(init).takeover).toBe(false);
        return Promise.resolve(response({ code: 'takeover-required' }, 409));
      }
      applications++;
      return Promise.resolve(response(restored()));
    });
    await f.client.recover(RUN);
    expect(await f.client.applyVerifiedGrant(grantId, RUN)).toBe(false);
    expect(applications).toBe(0);
    expect(f.client.snapshot().phase).toBe('lease_lost');
    expect(f.client.snapshot().run).toMatchObject({
      status: 'dead',
      revivesGranted: 1,
      revivesApplied: 0,
    });
    f.client.dispose();
    f.owner.dispose();
  });
  it('maps a server-refused expired apply lease into visible recovery without consuming the grant', async () => {
    let recoveries = 0;
    const f = await fixture((url) =>
      url.endsWith('/ranked/recover')
        ? Promise.resolve(response(dead(String(++recoveries))))
        : Promise.resolve(response({ code: 'reward-lease-expired' }, 409)),
    );
    await f.client.recover(RUN);
    expect(await f.client.applyVerifiedGrant(grantId, RUN)).toBe(false);
    expect(f.client.snapshot().phase).toBe('recovery');
    expect(f.client.snapshot().canRetry).toBe(false);
    expect(f.client.snapshot().run).toMatchObject({
      status: 'dead',
      sp: 0,
      revivesGranted: 1,
      revivesApplied: 0,
    });
    f.client.dispose();
    f.owner.dispose();
  });
});

describe('strict ranked public wire projection', () => {
  it('parses actual authority start, hint, choice, mystery, death, recovery and end replies', async () => {
    let record: StoredRankedRun | null = null;
    const receipts = new Map<string, RankedReceipt>();
    let now = NOW;
    let id = 500;
    const newId = () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`;
    const repository: RankedRepository = {
      transaction: (_subject, operation) =>
        operation({
          authorizeStart: () => Promise.resolve(),
          authorizeRecovery: () => Promise.resolve(),
          getActiveRun: () =>
            Promise.resolve(record && record.state.status !== 'finished' ? record : null),
          getRun: () => Promise.resolve(record),
          getReceipt: (key) => Promise.resolve(receipts.get(key) ?? null),
          getRegionSnapshot: () =>
            Promise.resolve({
              countryCode: 'BG',
              continent: 'EU',
              mappingVersion: 'cpi-regions-2026-11-v1',
            }),
          saveRun: (value) => {
            record = structuredClone(value);
            return Promise.resolve();
          },
          saveReceipt: (value) => {
            receipts.set(value.key, structuredClone(value));
            return Promise.resolve();
          },
          appendAudit: () => Promise.resolve(),
        }),
    };
    const authority = new RankedAuthority({
      repository,
      now: () => now,
      newId,
      newSecret: () => 'a'.repeat(64),
    });
    const actor = { subject: USER_A, deviceId: 'trusted-test-device', clientBuild: 1 };
    let latest = await authority.start(actor, { idempotencyKey: newId() });
    expect(parseRankedReply(latest)).not.toBeNull();
    const command = async (value: Parameters<RankedAuthority['execute']>[1]) => {
      now += 100;
      latest = await authority.execute(actor, {
        runId: latest.snapshot.runId,
        sequence: latest.snapshot.nextSequence,
        idempotencyKey: newId(),
        leaseToken: latest.lease.token,
        command: value,
      });
      expect(parseRankedReply(latest)).not.toBeNull();
    };
    await command({ type: 'resume' });
    await command({ type: 'hint', row: latest.snapshot.currentRow, life: 0 });
    await command({
      type: 'choose',
      row: latest.snapshot.currentRow,
      life: 0,
      side: getCurrentRow(record!.state).safeSide,
    });
    expect(latest.snapshot.history[0].index).toBe('0');
    expect(latest.snapshot.lastClearedRow).toBe('1');
    while (!latest.snapshot.current.hasMystery) {
      await command({
        type: 'choose',
        row: latest.snapshot.currentRow,
        life: 0,
        side: getCurrentRow(record!.state).safeSide,
      });
    }
    await command({ type: 'mystery', row: latest.snapshot.currentRow, life: 0 });
    record = { ...record!, state: { ...record!.state, sp: 1 } };
    const safe = getCurrentRow(record.state).safeSide;
    await command({
      type: 'choose',
      row: latest.snapshot.currentRow,
      life: 0,
      side: safe === 'left' ? 'right' : 'left',
    });
    expect(latest.snapshot.status).toBe('dead');
    latest = await authority.recover(actor, {
      runId: latest.snapshot.runId,
      idempotencyKey: newId(),
      takeover: false,
    });
    expect(parseRankedReply(latest)).not.toBeNull();
    await command({ type: 'end' });
    expect(latest.snapshot.status).toBe('finished');
  });
  it('preserves adjacent huge rows/sequences and accepts only bounded safe public fields', () => {
    const valid = reply('9007199254740993', '9007199254740992');
    expect(parseRankedReply(valid)?.snapshot.currentRow).toBe('9007199254740993');
    for (const invalid of [
      { ...valid, seed: 'private' },
      { ...valid, snapshot: { ...valid.snapshot, stream: { rng: 'private' } } },
      {
        ...valid,
        snapshot: { ...valid.snapshot, current: { ...valid.snapshot.current, safeSide: 'left' } },
      },
      {
        ...valid,
        snapshot: {
          ...valid.snapshot,
          region: { ...valid.snapshot.region, privacyContext: 'adult' },
        },
      },
      { ...valid, snapshot: { ...valid.snapshot, nextSequence: 9007199254740992 } },
      { ...valid, snapshot: { ...valid.snapshot, currentRow: '9007199254740992' } },
      {
        ...valid,
        snapshot: {
          ...valid.snapshot,
          history: Array.from({ length: 3 }, () => ({
            index: '0',
            revealedSafeSide: null,
            mysteryOutcome: null,
            lastChoice: null,
          })),
        },
      },
      { ...valid, lease: { ...valid.lease, token: 'not-a-capability' } },
    ])
      expect(parseRankedReply(invalid)).toBeNull();
  });
  it('does not create a client for missing, credentialed or non-HTTPS configuration', async () => {
    const { owner } = await fixture(() => Promise.resolve(response(reply())));
    for (const baseUrl of [
      undefined,
      'http://ranked.example.invalid',
      'https://user:password@ranked.example.invalid',
      'https://ranked.example.invalid?token=secret',
      'https://ranked.example.invalid/auth/v1',
    ]) {
      expect(createRankedClient({ baseUrl, session: owner })).toBeNull();
    }
  });
});

describe('confirmed-only ranked requests and retry ownership', () => {
  it('replaces a finished stale run with the newly discovered active run after another device starts it', async () => {
    const nextRun = '00000000-0000-4000-8000-000000000099';
    let starts = 0;
    let takeovers = 0;
    const { client } = await fixture((url) => {
      if (url.endsWith('/start'))
        return Promise.resolve(
          ++starts === 1 ? response(reply()) : response({ code: 'active-run-exists' }, 409),
        );
      if (url.endsWith('/active'))
        return Promise.resolve(response({ status: 'active', runId: nextRun }));
      if (url.endsWith('/recover')) {
        if (++takeovers === 1) return Promise.resolve(response({ code: 'takeover-required' }, 409));
        const value = reply('1', '0', '2', true);
        value.snapshot.runId = nextRun;
        return Promise.resolve(response(value));
      }
      return Promise.resolve(
        response({ ...reply('2'), snapshot: { ...reply('2').snapshot, status: 'finished' } }),
      );
    });
    await client.start();
    await client.command({ type: 'end' });
    expect(client.snapshot().phase).toBe('finished');
    await client.start();
    expect(client.snapshot().phase).toBe('recovery');
    expect(client.snapshot().run).toBeNull();
    const runId = await client.lookupActive();
    expect(runId).toBe(nextRun);
    await client.recover(runId!);
    expect(client.snapshot().phase).toBe('lease_lost');
    await client.recover(runId!, true);
    expect(client.snapshot().phase).toBe('ready');
    expect(client.snapshot().run?.runId).toBe(nextRun);
    client.dispose();
  });
  it('starts a distinct new run only after the previous authoritative result is finished', async () => {
    let starts = 0;
    const { client, calls } = await fixture((url) => {
      if (url.endsWith('/start')) {
        starts += 1;
        const value = reply();
        if (starts > 1) value.snapshot.runId = '00000000-0000-4000-8000-000000000099';
        return Promise.resolve(response(value));
      }
      return Promise.resolve(
        response({ ...reply('2'), snapshot: { ...reply('2').snapshot, status: 'finished' } }),
      );
    });
    await client.start();
    await client.start();
    expect(starts).toBe(1);
    await client.command({ type: 'end' });
    expect(client.snapshot().phase).toBe('finished');
    await client.start();
    expect(client.snapshot().run?.runId).toBe('00000000-0000-4000-8000-000000000099');
    expect(client.snapshot().run?.lastClearedRow).toBe('0');
    expect(calls).toHaveLength(3);
    client.dispose();
  });
  it('discovers the owned active run after client restart without local IDs or lease rotation', async () => {
    const { client, calls } = await fixture((url) =>
      url.endsWith('/active')
        ? Promise.resolve(response({ status: 'active', runId: RUN }))
        : Promise.resolve(response(reply('8', '6', '2', true))),
    );
    expect(client.snapshot().run).toBeNull();
    const runId = await client.lookupActive();
    expect(runId).toBe(RUN);
    expect(calls[0].url).toBe('https://ranked.example.invalid/ranked/active');
    expect(calls[0].init.body).toBe('{}');
    expect(client.snapshot().run).toBeNull();
    await client.recover(runId!);
    expect(client.snapshot().run?.lastClearedRow).toBe('6');
    expect(client.snapshot().run?.paused).toBe(true);
    client.dispose();
  });
  it('does not show optimistic progress, sends fixed POST commands, and retains the same pending command on network loss', async () => {
    const step = deferred<Response>();
    let action = 0;
    const { client, calls } = await fixture((url) => {
      if (url.endsWith('/start')) return Promise.resolve(response(reply()));
      action += 1;
      if (action === 1) return Promise.resolve(response(reply('2', '0', '1', false)));
      if (action === 2) return Promise.reject(new Error('server-secret-must-not-escape'));
      return step.promise;
    });
    await client.start();
    await client.command({ type: 'resume' });
    const command = { type: 'choose' as const, row: '1', life: 0, side: 'left' as const };
    await client.command(command);
    expect(client.snapshot().phase).toBe('retry');
    expect(client.snapshot().run?.lastClearedRow).toBe('0');
    const retry = client.retry();
    expect(client.snapshot().phase).toBe('pending');
    expect(client.snapshot().run?.lastClearedRow).toBe('0');
    step.resolve(response(reply('3', '1', '1', false)));
    await retry;
    expect(client.snapshot().run?.lastClearedRow).toBe('1');
    expect(calls[2].init.body).toBe(calls[3].init.body);
    expect(calls[3].url).toBe('https://ranked.example.invalid/ranked/action');
    expect(calls[3].init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    const sent = body(calls[3].init);
    expect(Object.keys(sent).sort()).toEqual([
      'command',
      'idempotencyKey',
      'leaseToken',
      'runId',
      'sequence',
    ]);
    expect(JSON.stringify(client.snapshot())).not.toContain(LEASE);
    expect(JSON.stringify(sent)).not.toContain('subject');
    client.dispose();
  });

  it('disables offline inputs and fences a late old response after retry/recovery', async () => {
    const old = deferred<Response>();
    let requests = 0;
    const { client, calls } = await fixture((url) => {
      requests += 1;
      if (url.endsWith('/start')) return Promise.resolve(response(reply()));
      if (requests === 2) return Promise.resolve(response(reply('2', '0', '1', false)));
      if (requests === 3) return old.promise;
      return Promise.resolve(response(reply('3', '1', '1', false)));
    });
    await client.start();
    await client.command({ type: 'resume' });
    const pending = client.command({ type: 'choose', row: '1', life: 0, side: 'left' });
    await Promise.resolve();
    client.setOnline(false);
    await client.command({ type: 'choose', row: '1', life: 0, side: 'right' });
    expect(client.snapshot().phase).toBe('offline');
    expect(calls).toHaveLength(3);
    expect(calls[2].init.signal?.aborted).toBe(true);
    client.setOnline(true);
    await client.retry();
    expect(client.snapshot().run?.lastClearedRow).toBe('1');
    old.resolve(response(reply('2', '0', '1', false)));
    await pending;
    expect(client.snapshot().run?.lastClearedRow).toBe('1');
    expect(client.snapshot().phase).toBe('ready');
    expect(calls[2].init.body).toBe(calls[3].init.body);
    client.dispose();
  });

  it('requires explicit recovery/takeover and rejects stale sequence or lease generation replies', async () => {
    let recovery = 0;
    const { client, calls } = await fixture((url, init) => {
      if (url.endsWith('/start')) return Promise.resolve(response(reply()));
      if (url.endsWith('/recover')) {
        recovery += 1;
        if (recovery === 1) return Promise.resolve(response({ code: 'takeover-required' }, 409));
        if (recovery === 2) return Promise.resolve(response(reply('5', '3', '2', true)));
        return Promise.resolve(response(reply('4', '2', '1', true)));
      }
      expect(body(init)).not.toHaveProperty('profile');
      return Promise.resolve(response({ code: 'lease-lost' }, 409));
    });
    await client.start();
    await client.command({ type: 'resume' });
    expect(client.snapshot().phase).toBe('lease_lost');
    await client.recover(RUN);
    expect(client.snapshot().phase).toBe('lease_lost');
    await client.recover(RUN, true);
    expect(body(calls.at(-1)!.init)).toMatchObject({
      runId: RUN,
      takeover: true,
    });
    expect(client.snapshot().run?.lastClearedRow).toBe('3');
    await client.recover(RUN, true);
    expect(client.snapshot().run?.lastClearedRow).toBe('3');
    expect(client.snapshot().phase).toBe('recovery');
    client.dispose();
  });

  it('fails closed on private fields and never imports a practice checkpoint or client score', async () => {
    const { client, calls } = await fixture(() =>
      Promise.resolve(
        response({ ...reply(), snapshot: { ...reply().snapshot, seed: 'private-seed' } }),
      ),
    );
    await client.start();
    expect(client.snapshot().run).toBeNull();
    expect(client.snapshot().phase).toBe('retry');
    expect(JSON.stringify(calls.map((call) => call.init.body))).not.toContain('checkpoint');
    expect(JSON.stringify(calls.map((call) => call.init.body))).not.toContain('score');
    client.dispose();
  });

  it('ignores duplicate/stale displayed callbacks and unknown command fields', async () => {
    let sequence = 1;
    const { client, calls } = await fixture(() =>
      Promise.resolve(response(reply(String(sequence++), '0', '1', sequence === 2))),
    );
    await client.start();
    await client.command({ type: 'resume' });
    const before = calls.length;
    await client.command({ type: 'choose', row: '2', life: 0, side: 'left' });
    await client.command({ type: 'choose', row: '1', life: 1, side: 'left' });
    await client.command({
      type: 'choose',
      row: '1',
      life: 0,
      side: 'left',
      score: '999',
    } as never);
    expect(calls).toHaveLength(before);
    client.dispose();
  });
});

describe('account scope privacy fence', () => {
  it('rotates only at account invalidation, clears views synchronously on sign-out, and rejects a late A response under B', async () => {
    const late = deferred<Response>();
    let calls = 0;
    const fixtureState = await fixture(() =>
      ++calls === 1 ? Promise.resolve(response(reply())) : late.promise,
    );
    const { owner, client, switchAccount } = fixtureState;
    const accountA = owner.accountScope();
    expect(accountA).not.toBeNull();
    expect(JSON.stringify(accountA)).toBe('{}');
    await client.start();
    await owner.refresh();
    expect(owner.accountScope()).toBe(accountA);
    const pending = client.command({ type: 'resume' });
    await Promise.resolve();
    let cleared = false;
    const unsubscribe = client.subscribe(() => {
      if (client.snapshot().run === null) cleared = true;
    });
    const signOut = owner.signOut();
    expect(owner.accountScope()).toBeNull();
    expect(client.snapshot().run).toBeNull();
    expect(cleared).toBe(true);
    await signOut;
    switchAccount();
    await owner.exchangeVerifiedTicket('verified-ticket-accountB-0123456789');
    expect(owner.accountScope()).not.toBe(accountA);
    late.resolve(response(reply('2', '0', '1', false)));
    await pending;
    expect(client.snapshot().run).toBeNull();
    expect(client.snapshot().phase).toBe('idle');
    unsubscribe();
    client.dispose();
  });
});

describe('ranked scene confirmed-state presentation', () => {
  function client(state: RankedClientState): RankedClient {
    return {
      snapshot: () => state,
      subscribe: () => () => {},
      start: () => Promise.resolve(),
      lookupActive: () => Promise.resolve(null),
      applyVerifiedGrant: () => Promise.resolve(false),
      archivePending: () => Promise.resolve(false),
      command: () => Promise.resolve(),
      retry: () => Promise.resolve(),
      recover: () => Promise.resolve(),
      setOnline: () => {},
      clear: () => {},
      dispose: () => {},
    };
  }
  it('keeps the unavailable guest boundary and disables pending inputs without inventing progress', () => {
    const guest = renderToStaticMarkup(
      createElement(RankedScene, { client: null, online: true, onLeave: () => {} }),
    );
    expect(guest).toContain('Guest practice remains available');
    expect(guest).not.toContain('Start verified run');
    const parsed = parseRankedReply(reply('3', '2', '1', false))!;
    const markup = renderToStaticMarkup(
      createElement(RankedScene, {
        client: client({
          phase: 'pending',
          run: parsed.snapshot,
          online: true,
          canRetry: false,
          rejected: false,
        }),
        online: true,
        onLeave: () => {},
      }),
    );
    expect(markup).toContain('Confirmed rows: 2');
    expect(markup).toContain('Current row 3');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain(LEASE);
    expect(markup).not.toContain(RUN);
    expect(markup).not.toContain('practiceCheckpoint');
  });
  it('keeps a pending reward unpublished and does not offer End run or an unverified advertisement', () => {
    const run = {
      ...parseRankedReply(reply())!.snapshot,
      status: 'dead' as const,
      sp: 0,
      rewardPending: true,
      death: { id: 'run:death:1', fatalRow: '1', cause: 'wrong_tile' as const },
    };
    const markup = renderToStaticMarkup(
      createElement(RankedScene, {
        client: client({ phase: 'ready', run, online: true, canRetry: false, rejected: false }),
        online: true,
        onLeave: () => {},
      }),
    );
    expect(markup).toContain('Reward verification is pending');
    expect(markup).not.toContain('>End run<');
    expect(markup).not.toContain('Watch ad');
  });
  it('shows actionable fixed copy for update, maintenance and retained recovery without enabling play', () => {
    for (const [problem, phrase, canRetry] of [
      ['maintenance', 'paused for maintenance', true],
      ['client_update_required', 'Update the app', false],
      ['operation_context_required', 'Ranked services are unavailable', false],
      ['recovery_unavailable', 'verified continuations are kept', true],
    ] as const) {
      const markup = renderToStaticMarkup(
        createElement(RankedScene, {
          client: client({
            phase: 'blocked',
            problem,
            run: parseRankedReply(reply())!.snapshot,
            online: true,
            canRetry,
            rejected: false,
          }),
          online: true,
          onLeave: () => {},
        }),
      );
      expect(markup).toContain(phrase);
      expect(markup.includes('Check again')).toBe(canRetry);
      expect(markup).not.toContain('>Resume<');
      expect(markup).not.toContain(LEASE);
    }
  });
});
