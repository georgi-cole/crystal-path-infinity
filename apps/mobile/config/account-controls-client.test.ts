import { describe, it, expect, vi } from 'vitest';
import { AccountSessionOwner } from '../src/account/session-owner';
import { createAccountControlsClient } from '../src/account/account-controls-client';
import { formatAccountExport } from '../src/account/account-controls-model';
const subject = 'ab000000-0000-4000-8000-000000000001',
  first = 'ab000000-0000-4000-8000-000000000002',
  second = 'ab000000-0000-4000-8000-000000000003';
async function fixture() {
  let vault: string | null = null;
  const active = {
    status: 'active',
    subject,
    accessToken: 'a'.repeat(43),
    refreshToken: 'b'.repeat(43),
    expiresAt: Date.now() + 900000,
  };
  const session = new AccountSessionOwner(
    {
      supported: true,
      read: () => Promise.resolve(vault),
      write: (value) => {
        vault = value;
        return Promise.resolve();
      },
      clear: () => {
        vault = null;
        return Promise.resolve();
      },
    },
    {
      exchange: () => Promise.resolve(active),
      refresh: () => Promise.resolve(active),
      revoke: () => Promise.resolve({ status: 'revoked' }),
    },
  );
  await session.exchangeVerifiedTicket('ticket'.repeat(8));
  const calls: { path: string; body: Record<string, unknown> }[] = [],
    proofs = new Set<string>();
  let pages = 0;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    await Promise.resolve();
    if (typeof init?.body !== 'string') throw new Error('Missing JSON body');
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname.split('/').slice(2).join('/'),
      body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ path, body });
    const next = {
      consent: null,
      parental: null,
      run: null as string | null,
      result: null,
      report: null,
      reward: null,
      adAuthorization: null,
      purchase: null,
      spend: null,
      session: null,
      assistedResult: null,
    };
    let result: unknown = {};
    if (path === 'reauth/request') result = { status: 'accepted' };
    if (path === 'reauth/verify')
      result = { ceremony: 'c'.repeat(43), expiresAt: Date.now() + 300000 };
    if (path === 'reauth/proof')
      result = {
        proof: 'proof-' + calls.length.toString().padStart(30, '0'),
        expiresAt: Date.now() + 300000,
      };
    if (path === 'account/export') {
      expect(proofs.has(String(body.reauthProof))).toBe(false);
      proofs.add(String(body.reauthProof));
      pages++;
      result = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        profile: null,
        privateProfile: null,
        consents: [],
        parentalAuthorizations: [],
        runs: [{ runId: pages === 1 ? first : second, currentRow: '1', sp: 300 }],
        results: [],
        reports: [],
        rewards: [],
        adAuthorizations: [],
        commerce: { wallet: null, purchases: [], spends: [], sessions: [], assistedResults: [] },
        next: { ...next, run: pages === 1 ? first : null },
        privateProviderSecret: 'must disappear',
      };
    }
    if (path === 'account/delete') result = { requestId: first, status: 'revocation_pending' };
    if (path === 'account/status')
      result = { requestId: first, status: 'deleted', completedAt: new Date().toISOString() };
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' },
    });
  });
  return {
    session,
    calls,
    client: createAccountControlsClient('https://api.example/cpi', session, fetcher),
  };
}
describe('real self-service transport', () => {
  it('collects every page with a new one-use proof and strips non-export fields', async () => {
    const { client, calls } = await fixture();
    const operation = client.exportData();
    await vi.waitFor(() => expect(client.reauth?.snapshot()).not.toBeNull());
    client.reauth!.submit('123456');
    const result = (await operation) as { runs: unknown[] };
    expect(result.runs).toHaveLength(2);
    expect(formatAccountExport(result)).not.toContain('must disappear');
    expect(calls.filter((call) => call.path === 'reauth/proof')).toHaveLength(2);
  });
  it('cancels a pending code when the account changes', async () => {
    const { client, session, calls } = await fixture();
    const operation = client.exportData(),
      check = expect(operation).rejects.toThrow();
    await vi.waitFor(() => expect(client.reauth?.snapshot()).not.toBeNull());
    await session.signOut();
    await check;
    expect(calls.some((call) => call.path === 'account/export')).toBe(false);
  });
  it('recovers a committed pending deletion without asking for a second OTP', async () => {
    const { client, calls } = await fixture();
    const operation = client.deleteAccount();
    await vi.waitFor(() => expect(client.reauth?.snapshot()).not.toBeNull());
    client.reauth!.submit('123456');
    expect(await operation).toBe('revocation_pending');
    expect(await client.deleteAccount()).toBe('deleted');
    expect(calls.filter((call) => call.path === 'reauth/request')).toHaveLength(1);
    expect(calls.filter((call) => call.path === 'account/status')).toHaveLength(1);
  });
});
