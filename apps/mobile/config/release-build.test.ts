import { describe, expect, it } from 'vitest';
import {
  assertUnsignedPublicVariables,
  assertUnsignedRelease,
  resolveUnsignedRelease,
} from './release-build';
import { getBuildInfo } from './environments';

const values = {
  CPI_RELEASE_VERSION: '0.1.0',
  CPI_RELEASE_BUILD_NUMBER: '42',
  CPI_RELEASE_SOURCE_SHA: 'a'.repeat(40),
  CPI_RELEASE_RUN_ID: '41725931436',
  CPI_RELEASE_RUN_ATTEMPT: '1',
};
describe('unsigned beta release input contract', () => {
  it('preserves default development metadata and assigns exact standalone identities without signing or live services', () => {
    expect(resolveUnsignedRelease('development', '0.1.0', {})).toBeNull();
    expect(getBuildInfo('development', '0.1.0').appId).toBe(
      'com.georgicole.crystalpath.infinity.dev',
    );
    const staging = resolveUnsignedRelease('staging', '0.1.0', values)!;
    const production = resolveUnsignedRelease('production', '0.1.0', values)!;
    expect(staging.buildNumber).toBe(42);
    expect(staging.iosBuildNumber).toBe('42');
    expect(staging.app.appId).toBe('com.georgicole.crystalpath.infinity.staging');
    expect(production.app.appId).toBe('com.georgicole.crystalpath.infinity');
    expect(staging.app.appId).not.toBe(production.app.appId);
    expect(production).toMatchObject({
      sourceSha: 'a'.repeat(40),
      signing: 'unsigned',
      distribution: 'not-uploaded',
      liveServices: { accounts: 'disabled', ranked: 'disabled', ads: 'disabled' },
    });
    expect(Object.keys(production.app).sort()).toEqual([
      'appId',
      'appName',
      'environment',
      'schemaVersion',
      'version',
    ]);
  });
  it('validates native build bounds, canonical versions, immutable provenance and unique first-attempt counters', () => {
    for (const number of ['1', '9999'])
      expect(
        resolveUnsignedRelease('staging', '0.1.0', { ...values, CPI_RELEASE_BUILD_NUMBER: number })
          ?.buildNumber,
      ).toBe(Number(number));
    for (const number of ['0', '10000', '2147483648', '01', '1.0', '-1', '1e3', '42\n'])
      expect(() =>
        resolveUnsignedRelease('staging', '0.1.0', { ...values, CPI_RELEASE_BUILD_NUMBER: number }),
      ).toThrow();
    for (const candidate of [
      'v1.2.3',
      '1.2',
      '1.2.3-beta',
      '01.2.3',
      '1.2.3\n',
      '1.2.$(echo secret)',
    ])
      expect(() =>
        resolveUnsignedRelease('staging', '0.1.0', { ...values, CPI_RELEASE_VERSION: candidate }),
      ).toThrow();
    for (const extra of [
      { CPI_RELEASE_SOURCE_SHA: 'short' },
      { CPI_RELEASE_SOURCE_SHA: 'A'.repeat(40) },
      { CPI_RELEASE_RUN_ID: '01' },
      { CPI_RELEASE_RUN_ATTEMPT: '2' },
      { CPI_RELEASE_VERSION: '' },
    ])
      expect(() => resolveUnsignedRelease('staging', '0.1.0', { ...values, ...extra })).toThrow();
    expect(() => resolveUnsignedRelease('development', '0.1.0', values)).toThrow();
  });
  it('rejects partially configured inputs and refuses public endpoints, ad units or secrets while services are unapproved', () => {
    expect(() =>
      resolveUnsignedRelease('staging', '0.1.0', { CPI_RELEASE_BUILD_NUMBER: '42' }),
    ).toThrow();
    expect(() =>
      assertUnsignedPublicVariables({
        VITE_ACCOUNT_API_BASE_URL: '',
        VITE_API_BASE_URL: undefined,
      }),
    ).not.toThrow();
    for (const name of [
      'VITE_API_BASE_URL',
      'VITE_ACCOUNT_API_BASE_URL',
      'VITE_AD_UNIT',
      'VITE_SERVICE_ROLE_KEY',
    ])
      expect(() => assertUnsignedPublicVariables({ [name]: 'configured' })).toThrow();
  });
  it('rejects copied metadata with another build/source/environment or additional credential fields', () => {
    const expected = resolveUnsignedRelease('production', '0.1.0', values)!;
    expect(() =>
      assertUnsignedRelease(JSON.parse(JSON.stringify(expected)), expected),
    ).not.toThrow();
    for (const actual of [
      { ...expected, buildNumber: 43 },
      { ...expected, sourceSha: 'b'.repeat(40) },
      { ...expected, app: getBuildInfo('staging', '0.1.0') },
      { ...expected, signing: 'signed' },
      { ...expected, password: 'secret' },
      { ...expected, liveServices: { ...expected.liveServices, ads: 'enabled' } },
    ])
      expect(() => assertUnsignedRelease(actual, expected)).toThrow();
  });
});
