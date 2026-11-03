import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountControls } from '../src/account/account-controls';
import { AccountControlsOwner, formatAccountExport } from '../src/account/account-controls-model';
import type { AccountControlsClient } from '../src/account/account-controls-model';

function exported(username = 'prism_a') {
  return {
    schemaVersion: 1,
    exportedAt: '2026-11-04T00:00:00.000Z',
    profile: {
      publicId: '31000000-0000-4000-8000-000000000001',
      username,
      countryCode: 'BG',
      email: 'private-secret@example.invalid',
    },
    privateProfile: {
      analyticsAgeBand: '25_34',
      ageResponseAt: '2026-11-04T00:00:00.000Z',
      privacyContext: 'adult',
      rawAge: 25,
    },
    consents: [
      {
        id: 'consent-1',
        purpose: 'analytics',
        decision: 'granted',
        policyVersion: 'policy-v1',
        jurisdiction: 'BG',
        recordedAt: '2026-11-04T00:00:00.000Z',
        email: 'private-secret@example.invalid',
      },
    ],
    parentalAuthorizations: [],
    runs: [
      {
        runId: 'run-1',
        lastClearedRow: '9007199254740993',
        activeTimeMs: '9007199254740993',
        checkpoint: { futureRoute: 'secret-answer' },
        accessToken: 'secret-token',
      },
    ],
    results: [],
    reports: [],
    next: { consent: null, parental: null, run: null, result: null, report: null },
    providerSecret: 'secret-provider-field',
  };
}
function client() {
  return {
    exportData: vi.fn<AccountControlsClient['exportData']>().mockResolvedValue(exported()),
    deleteAccount: vi.fn<AccountControlsClient['deleteAccount']>().mockResolvedValue('deleted'),
  } satisfies AccountControlsClient;
}

describe('CPI-031 account controls', () => {
  it('has no guest collection, reauthentication fields or deletion action without an approved client', () => {
    const markup = renderToStaticMarkup(createElement(AccountControls));
    expect(markup).toContain('Guest practice remains available');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<form');
    expect(markup).not.toContain('<button');
  });
  it('treats an explicit null account scope as signed out even if a host reuses its client', async () => {
    const api = client();
    const markup = renderToStaticMarkup(
      createElement(AccountControls, { client: api, accountScope: null }),
    );
    expect(markup).not.toContain('<button');
    const owner = new AccountControlsOwner(api);
    await owner.exportData();
    owner.replace(api, null);
    expect(owner.snapshot().exportJson).toBeNull();
    await owner.exportData();
    await owner.deleteAccount();
    expect(api.exportData).toHaveBeenCalledTimes(1);
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });
  it('offers a separate delete choice before confirmation and never invokes it on render', () => {
    const api = client();
    const markup = renderToStaticMarkup(createElement(AccountControls, { client: api }));
    expect(markup).toContain('Delete my account');
    expect(markup).not.toContain('Confirm account deletion');
    expect(api.deleteAccount).not.toHaveBeenCalled();
    expect(api.exportData).not.toHaveBeenCalled();
  });
  it('reconstructs only self-service export fields and preserves exact progress strings', () => {
    const text = formatAccountExport(exported());
    const result = JSON.parse(text) as ReturnType<typeof exported>;
    expect(result.profile.username).toBe('prism_a');
    expect(result.privateProfile.analyticsAgeBand).toBe('25_34');
    expect(result.privateProfile.privacyContext).toBe('adult');
    expect(result.runs[0].lastClearedRow).toBe('9007199254740993');
    for (const forbidden of [
      'secret',
      'rawAge',
      'checkpoint',
      'email',
      'providerSecret',
      'accessToken',
    ])
      expect(text).not.toContain(forbidden);
    expect(() => formatAccountExport({ profile: { username: 'unsafe' } })).toThrow();
    expect(() =>
      formatAccountExport({ ...exported(), next: { ...exported().next, report: 'more-reports' } }),
    ).toThrow('additional pages');
    expect(() => formatAccountExport({ ...exported(), next: {} })).toThrow('additional pages');
  });
  it('keeps export in memory until explicit clear or scope replacement and copies only by explicit action', async () => {
    const owner = new AccountControlsOwner(client());
    const write = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    await owner.exportData();
    expect(owner.snapshot().exportJson).toContain('prism_a');
    expect(write).not.toHaveBeenCalled();
    await owner.copyExport(write);
    expect(write).toHaveBeenCalledWith(owner.snapshot().exportJson);
    expect(owner.snapshot().copied).toBe(true);
    owner.clear();
    expect(owner.snapshot().exportJson).toBeNull();
    expect(owner.snapshot().copied).toBe(false);
  });
  it('fences late account A export/deletion responses after replacement by B or sign-out', async () => {
    let resolveExport!: (value: unknown) => void;
    let resolveDelete!: (value: 'deleted') => void;
    const accountA: AccountControlsClient = {
      exportData: () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        }),
      deleteAccount: () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    };
    const owner = new AccountControlsOwner(accountA);
    const staleExport = owner.exportData();
    const accountB = client();
    owner.replace(accountB);
    resolveExport(exported('old_account_a'));
    await staleExport;
    expect(owner.matches(accountB, accountB)).toBe(true);
    expect(owner.snapshot().exportJson).toBeNull();
    expect(owner.snapshot().phase).toBe('idle');
    owner.replace(accountA);
    const staleDelete = owner.deleteAccount();
    owner.replace(null);
    resolveDelete('deleted');
    await staleDelete;
    expect(owner.snapshot().phase).toBe('idle');
    expect(owner.matches(null, null)).toBe(true);
  });
  it('clears exports when an opaque account scope changes even when a host reuses its client', async () => {
    const api = client();
    const first = {};
    const second = {};
    const owner = new AccountControlsOwner(api, first);
    await owner.exportData();
    expect(owner.matches(api, second)).toBe(false);
    owner.replace(api, second);
    expect(owner.snapshot().exportJson).toBeNull();
    expect(owner.matches(api, second)).toBe(true);
  });
  it('never claims deletion for pending revocation, disables export while pending and preserves pending on failed retry', async () => {
    const api = client();
    const deletion = vi
      .fn<AccountControlsClient['deleteAccount']>()
      .mockResolvedValueOnce('revocation_pending')
      .mockRejectedValueOnce(new Error('private issuer error'))
      .mockResolvedValueOnce('deleted');
    api.deleteAccount = deletion;
    const owner = new AccountControlsOwner(api);
    await owner.exportData();
    await owner.deleteAccount();
    expect(owner.snapshot()).toMatchObject({ phase: 'pending', exportJson: null });
    await owner.exportData();
    expect(api.exportData).toHaveBeenCalledTimes(1);
    await owner.deleteAccount();
    expect(owner.snapshot()).toMatchObject({ phase: 'pending', error: 'delete' });
    await owner.deleteAccount();
    expect(owner.snapshot()).toMatchObject({ phase: 'deleted', error: null });
  });
  it('does not duplicate a pending request and never displays private provider errors', async () => {
    let finish!: (value: 'revocation_pending') => void;
    const api = client();
    api.deleteAccount = vi.fn<AccountControlsClient['deleteAccount']>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const owner = new AccountControlsOwner(api);
    const pending = owner.deleteAccount();
    await owner.deleteAccount();
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
    finish('revocation_pending');
    await pending;
    expect(JSON.stringify(owner.snapshot())).not.toContain('secret');
  });
});
