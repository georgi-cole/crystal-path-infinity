import { describe, expect, it } from 'vitest';
import { readLiveConfiguration } from '../src/live-configuration.ts';

const androidManifest = JSON.stringify({
  status: 'confirmed-in-stores',
  products: [
    {
      platform: 'android',
      key: 'credits.3',
      sku: 'com.georgicole.crystalpath.infinity.credits.3',
      kind: 'credit',
      quantity: 3,
      available: true,
    },
  ],
});

function config(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    CPI_LIVE_ENABLED: 'true',
    CPI_PROJECT_REF: 'yfntwewvfsvljxcztoyp',
    SUPABASE_URL: 'https://yfntwewvfsvljxcztoyp.supabase.co',
    CPI_ENVIRONMENT: 'staging',
    CPI_PRIVATE_PEPPER: '1'.repeat(64),
    CPI_ENCRYPTION_KEY: '2'.repeat(64),
    CPI_GATEWAY_KEY: '3'.repeat(64),
    CPI_WORKER_KEY: '4'.repeat(64),
    CPI_ACCOUNT_POLICY: JSON.stringify({
      status: 'reviewed',
      reviewReference: 'fixture-review-001',
      version: 'fixture-v1',
      countries: { BG: { minimumAge: 18, neutralAgeScreenAllowed: true } },
    }),
    CPI_ALLOWED_ORIGINS: 'capacitor://localhost',
    CPI_PURCHASES_ENABLED: 'true',
    CPI_REWARDS_ENABLED: 'false',
    CPI_COMMERCE_PRODUCTS: androidManifest,
    CPI_STAGING_TEST_EMAILS: 'one@example.com,two@example.net',
    CPI_GOOGLE_CLIENT_EMAIL: 'crystal-path@staging.iam.gserviceaccount.com',
    CPI_GOOGLE_PRIVATE_KEY: 'server-private-key',
    CPI_DATABASE_URL: 'postgres://runtime:password@db.example.invalid:5432/postgres',
    SUPABASE_SERVICE_ROLE_KEY: 'server-role-key',
    CPI_RESEND_API_KEY: 're_' + 'a'.repeat(20),
    CPI_MAIL_FROM: 'auth@example.com',
  };
  return { ...values, ...overrides };
}

describe('live purchase configuration', () => {
  it('allows Android-only staging verification without Apple credentials', () => {
    const result = readLiveConfiguration((name) => config()[name]);
    expect(result?.purchasePlatforms).toEqual(['android']);
    expect(result?.stagingTestEmails).toEqual(['one@example.com', 'two@example.net']);
    expect('appleIssuerId' in (result ?? {})).toBe(false);
  });

  it('keeps iOS Sandbox closed until its independent verifier key is configured', () => {
    const android = JSON.parse(androidManifest) as {
      status: string;
      products: Record<string, unknown>[];
    };
    const dual = {
      CPI_COMMERCE_PRODUCTS: JSON.stringify({
        ...android,
        products: [...android.products, { ...android.products[0], platform: 'ios' }],
      }),
      CPI_APPLE_ISSUER_ID: 'sandbox-issuer',
      CPI_APPLE_KEY_ID: 'sandbox-key-id',
      CPI_APPLE_PRIVATE_KEY: 'sandbox-private-key',
    };
    expect(() => readLiveConfiguration((name) => config(dual)[name])).toThrow(
      'Missing live configuration: CPI_APPLE_SANDBOX_VERIFIER_KEY',
    );
    expect(() =>
      readLiveConfiguration(
        (name) => config({ ...dual, CPI_APPLE_SANDBOX_VERIFIER_KEY: '1'.repeat(64) })[name],
      ),
    ).toThrow('Independent Apple Sandbox verifier key is required');
    const result = readLiveConfiguration(
      (name) => config({ ...dual, CPI_APPLE_SANDBOX_VERIFIER_KEY: 'a'.repeat(64) })[name],
    );
    expect(result?.purchasePlatforms).toEqual(['android', 'ios']);
    expect(result?.purchaseEnvironment).toBe('sandbox');
  });

  it('requires exactly two distinct staging accounts even with purchases disabled', () => {
    expect(() =>
      readLiveConfiguration((name) => config({ CPI_STAGING_TEST_EMAILS: 'one@example.com' })[name]),
    ).toThrow('Staging requires exactly two test accounts');
    expect(() =>
      readLiveConfiguration(
        (name) => config({ CPI_STAGING_TEST_EMAILS: 'one@example.com,ONE@example.com' })[name],
      ),
    ).toThrow('Staging requires exactly two test accounts');
    expect(() =>
      readLiveConfiguration(
        (name) => config({ CPI_PURCHASES_ENABLED: 'false', CPI_STAGING_TEST_EMAILS: '' })[name],
      ),
    ).toThrow('Missing live configuration: CPI_STAGING_TEST_EMAILS');
  });

  it('requires staging access to stay Bulgaria-only and adult-only', () => {
    expect(() =>
      readLiveConfiguration(
        (name) =>
          config({
            CPI_ACCOUNT_POLICY: JSON.stringify({
              status: 'reviewed',
              reviewReference: 'fixture-review-001',
              version: 'fixture-v1',
              countries: { BG: { minimumAge: 17, neutralAgeScreenAllowed: true } },
            }),
          })[name],
      ),
    ).toThrow('Staging account policy must be limited to Bulgaria and age 18+');
    expect(() =>
      readLiveConfiguration(
        (name) =>
          config({
            CPI_ACCOUNT_POLICY: JSON.stringify({
              status: 'reviewed',
              reviewReference: 'fixture-review-001',
              version: 'fixture-v1',
              countries: {
                BG: { minimumAge: 18, neutralAgeScreenAllowed: true },
                US: { minimumAge: 18, neutralAgeScreenAllowed: true },
              },
            }),
          })[name],
      ),
    ).toThrow('Staging account policy must be limited to Bulgaria and age 18+');
  });

  it('keeps production purchases closed unless both stores are mapped', () => {
    expect(() =>
      readLiveConfiguration(
        (name) => config({ CPI_ENVIRONMENT: 'production', CPI_STAGING_TEST_EMAILS: '' })[name],
      ),
    ).toThrow('Production purchases require both store platforms');
  });
});
