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
  it('requires explicit production review support and an independent hosted Apple verifier', () => {
    expect(() =>
      readLiveConfiguration((name) => config({ CPI_PURCHASE_REVIEW_ENABLED: 'true' })[name]),
    ).toThrow('Review purchases require an explicit production commerce configuration');
    const products = JSON.parse(androidManifest) as {
      products: Record<string, unknown>[];
      status: string;
    };
    const values = config({
      CPI_ENVIRONMENT: 'production',
      CPI_PROJECT_REF: 'c'.repeat(20),
      SUPABASE_URL: 'https://' + 'c'.repeat(20) + '.supabase.co',
      CPI_PURCHASE_REVIEW_ENABLED: 'true',
      CPI_COMMERCE_PRODUCTS: JSON.stringify({
        ...products,
        products: [...products.products, { ...products.products[0], platform: 'ios' }],
      }),
      CPI_APPLE_ISSUER_ID: 'fixture-issuer',
      CPI_APPLE_KEY_ID: 'fixture-key',
      CPI_APPLE_PRIVATE_KEY: 'fixture-private-key',
    });
    expect(() => readLiveConfiguration((name) => values[name])).toThrow(
      'CPI_APPLE_PRODUCTION_VERIFIER_KEY',
    );
    values.CPI_APPLE_PRODUCTION_VERIFIER_KEY = '1'.repeat(64);
    expect(() => readLiveConfiguration((name) => values[name])).toThrow(
      'Independent production Apple verifier key is required',
    );
    values.CPI_APPLE_PRODUCTION_VERIFIER_KEY = 'a'.repeat(64);
    expect(readLiveConfiguration((name) => values[name])).toMatchObject({
      reviewPurchasesEnabled: true,
      purchaseEnvironment: 'production',
    });
  });
  it('isolates sandbox browser-provider credentials from the existing native iPhone and production identities', () => {
    const values = config({
      CPI_NATIVE_IDENTITY_ENABLED: 'true',
      CPI_MOBILE_IDENTITY_ENABLED: 'true',
      CPI_IDENTITY_GOOGLE_IOS_CLIENT_ID: '123-ios.apps.googleusercontent.com',
      CPI_IDENTITY_APPLE_KEY_ID: 'A'.repeat(10),
      CPI_IDENTITY_APPLE_PRIVATE_KEY: 'fixture-native-key',
      CPI_IDENTITY_GOOGLE_STAGING_WEB_CLIENT_ID: '123-sandbox.apps.googleusercontent.com',
      CPI_IDENTITY_GOOGLE_STAGING_WEB_CLIENT_SECRET: 'fixture-web-secret',
      CPI_IDENTITY_APPLE_STAGING_WEB_KEY_ID: 'B'.repeat(10),
      CPI_IDENTITY_APPLE_STAGING_WEB_PRIVATE_KEY: 'fixture-sandbox-key',
    });
    const result = readLiveConfiguration((name) => values[name]);
    expect(result?.publicWebEntry).toBe(false);
    expect(result?.publicMobileEntry).toBe(true);
    expect(result?.nativeIdentity?.googleClientId).toBe('123-ios.apps.googleusercontent.com');
    expect(result?.mobileIdentity?.googleClientId).toBe('123-sandbox.apps.googleusercontent.com');
    expect(result?.mobileIdentity?.callback).toBe(
      'https://crystal-path-staging-api.kolequant.workers.dev/cpi/identity/mobile/callback',
    );
    expect(result?.mobileIdentity?.apple.clientId).toBe(
      'com.georgicole.crystalpath.infinity.staging.web',
    );
    delete values.CPI_IDENTITY_GOOGLE_STAGING_WEB_CLIENT_SECRET;
    expect(() => readLiveConfiguration((name) => values[name])).toThrow(
      'CPI_IDENTITY_GOOGLE_STAGING_WEB_CLIENT_SECRET',
    );
  });
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
    const productionProjectRef = 'c'.repeat(20);
    expect(() =>
      readLiveConfiguration(
        (name) =>
          config({
            CPI_ENVIRONMENT: 'production',
            CPI_PROJECT_REF: productionProjectRef,
            SUPABASE_URL: 'https://' + productionProjectRef + '.supabase.co',
            CPI_STAGING_TEST_EMAILS: '',
          })[name],
      ),
    ).toThrow('Production purchases require both store platforms');
  });

  it('rejects the staging Supabase project when configured as production', () => {
    expect(() =>
      readLiveConfiguration((name) => config({ CPI_ENVIRONMENT: 'production' })[name]),
    ).toThrow('Production requires a Supabase project separate from Crystal Path staging');
  });
});
