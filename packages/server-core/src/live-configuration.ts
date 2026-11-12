import { exactObject, isObject } from './private-services.ts';
import { validateAccountPolicy } from './account-policy.ts';
import type { AccountPolicy } from './account-policy.ts';
import type { CommerceProduct } from './commerce-service.ts';
import { MOBILE_IDENTITY_CALLBACK, STAGING_MOBILE_IDENTITY_CALLBACK } from './mobile-identity.ts';

const stagingProjectRef = 'yfntwewvfsvljxcztoyp';

function providerSignupEmails(configured: string | undefined) {
  if (!configured) return undefined;
  const value: unknown = JSON.parse(configured);
  if (!exactObject(value, ['apple', 'google']))
    throw new Error('Invalid staging provider signup list');
  function addresses(input: unknown): string[] {
    if (!Array.isArray(input) || input.length > 4)
      throw new Error('Invalid staging provider signup list');
    return (input as unknown[]).map((address) => {
      if (
        typeof address !== 'string' ||
        address.length > 254 ||
        !/^[A-Za-z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
          address,
        )
      )
        throw new Error('Invalid staging provider signup address');
      return address.toLowerCase();
    });
  }
  return { apple: addresses(value.apple), google: addresses(value.google) };
}

export function readLiveConfiguration(env: (name: string) => string | undefined) {
  if (env('CPI_LIVE_ENABLED') !== 'true') return null;
  const require = (name: string) => {
    const value = env(name);
    if (!value || /REPLACE|placeholder/i.test(value))
      throw new Error('Missing live configuration: ' + name);
    return value;
  };
  const projectRef = require('CPI_PROJECT_REF');
  // This development project currently also hosts The Big Eye QA. Never change its global Auth configuration here.
  if (!/^[a-z]{20}$/.test(projectRef) || projectRef === 'jbyguybxhezjhdbenevh')
    throw new Error('An isolated Crystal Path project is required');
  const url = 'https://' + projectRef + '.supabase.co';
  if (require('SUPABASE_URL') !== url) throw new Error('Live project mismatch');
  const environment = require('CPI_ENVIRONMENT');
  if (environment !== 'development' && environment !== 'staging' && environment !== 'production')
    throw new Error('Invalid live environment');
  if (environment === 'production' && projectRef === stagingProjectRef)
    throw new Error('Production requires a Supabase project separate from Crystal Path staging');
  const keys = [
    'CPI_PRIVATE_PEPPER',
    'CPI_ENCRYPTION_KEY',
    'CPI_GATEWAY_KEY',
    'CPI_WORKER_KEY',
  ].map(require);
  if (keys.some((key) => !/^[a-f0-9]{64}$/.test(key)) || new Set(keys).size !== keys.length)
    throw new Error('Independent server keys are required');
  const raw: unknown = JSON.parse(require('CPI_ACCOUNT_POLICY'));
  if (
    !isObject(raw) ||
    raw.status !== 'reviewed' ||
    typeof raw.reviewReference !== 'string' ||
    raw.reviewReference.length < 8 ||
    !isObject(raw.countries) ||
    typeof raw.version !== 'string'
  )
    throw new Error('Account policy must be reviewed');
  const policy = validateAccountPolicy({
    version: raw.version,
    countries: raw.countries,
  } as AccountPolicy);
  if (
    environment === 'staging' &&
    (Object.keys(policy.countries).length !== 1 ||
      !policy.countries.BG ||
      policy.countries.BG.minimumAge < 18)
  )
    throw new Error('Staging account policy must be limited to Bulgaria and age 18+');
  const origins = require('CPI_ALLOWED_ORIGINS').split(',');
  if (
    origins.length > 8 ||
    origins.some((origin) => {
      try {
        const u = new URL(origin);
        return (
          !(
            ['https:', 'capacitor:'].includes(u.protocol) ||
            (u.protocol === 'http:' && u.hostname === 'localhost')
          ) ||
          (u.origin === 'null' && origin !== 'capacitor://localhost') ||
          origin.includes('*') ||
          u.username !== '' ||
          u.password !== '' ||
          u.search !== '' ||
          u.hash !== '' ||
          (u.pathname !== '/' && u.pathname !== '')
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error('Invalid live origins');
  const purchasesEnabled = env('CPI_PURCHASES_ENABLED') === 'true',
    rewardsEnabled = env('CPI_REWARDS_ENABLED') === 'true';
  for (const flag of ['CPI_PURCHASES_ENABLED', 'CPI_REWARDS_ENABLED'])
    if (env(flag) !== 'false' && env(flag) !== 'true')
      throw new Error('Explicit service flags are required');
  let products: readonly CommerceProduct[] = [],
    purchasePlatforms: readonly ('android' | 'ios')[] = [],
    stagingTestEmails: readonly string[] = [];
  if (environment === 'staging') {
    const emails = require('CPI_STAGING_TEST_EMAILS')
      .split(',')
      .map((address) => address.trim().toLowerCase());
    const emailPattern =
      /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/;
    if (
      emails.length !== 2 ||
      new Set(emails).size !== 2 ||
      emails.some((address) => !emailPattern.test(address))
    )
      throw new Error('Staging requires exactly two test accounts');
    stagingTestEmails = emails;
  }
  if (purchasesEnabled) {
    const value: unknown = JSON.parse(require('CPI_COMMERCE_PRODUCTS'));
    if (
      !isObject(value) ||
      value.status !== 'confirmed-in-stores' ||
      !Array.isArray(value.products) ||
      value.products.length < 1 ||
      value.products.length > 64
    )
      throw new Error('Confirmed store mappings are required');
    products = value.products as CommerceProduct[];
    const platforms = new Set<string>();
    for (const product of value.products) {
      if (!isObject(product) || (product.platform !== 'android' && product.platform !== 'ios'))
        throw new Error('Invalid purchase platform mapping');
      platforms.add(product.platform);
    }
    if (!platforms.size || (environment === 'production' && platforms.size !== 2))
      throw new Error('Production purchases require both store platforms');
    if (environment === 'staging') {
      if (!platforms.has('android')) throw new Error('Staging purchases require Google Play');
    } else if (environment !== 'production') {
      throw new Error('Purchases may only be enabled in staging or production');
    }
    purchasePlatforms = [...platforms] as ('android' | 'ios')[];
  }
  const appleSandboxVerifierKey =
    environment === 'staging' && purchasePlatforms.includes('ios')
      ? require('CPI_APPLE_SANDBOX_VERIFIER_KEY')
      : undefined;
  if (
    appleSandboxVerifierKey &&
    (!/^[a-f0-9]{64}$/.test(appleSandboxVerifierKey) || keys.includes(appleSandboxVerifierKey))
  )
    throw new Error('Independent Apple Sandbox verifier key is required');
  const purchaseEnvironment =
    environment === 'production' ? ('production' as const) : ('sandbox' as const);
  const reviewPurchasesEnabled = env('CPI_PURCHASE_REVIEW_ENABLED') === 'true';
  if (
    (env('CPI_PURCHASE_REVIEW_ENABLED') !== undefined &&
      !['true', 'false'].includes(env('CPI_PURCHASE_REVIEW_ENABLED')!)) ||
    (reviewPurchasesEnabled && (environment !== 'production' || !purchasesEnabled))
  )
    throw new Error('Review purchases require an explicit production commerce configuration');
  const appleProductionVerifierKey =
    environment === 'production' && purchasePlatforms.includes('ios')
      ? require('CPI_APPLE_PRODUCTION_VERIFIER_KEY')
      : undefined;
  if (
    appleProductionVerifierKey &&
    (!/^[a-f0-9]{64}$/.test(appleProductionVerifierKey) ||
      keys.includes(appleProductionVerifierKey))
  )
    throw new Error('Independent production Apple verifier key is required');
  const publicWebEntry =
    environment === 'production' &&
    projectRef === 'wtldjvzvpcfkwfacgsqj' &&
    env('CPI_WEB_IDENTITY_ENABLED') === 'true';
  const stagingMobileEntry =
    environment === 'staging' &&
    projectRef === stagingProjectRef &&
    env('CPI_NATIVE_IDENTITY_ENABLED') === 'true' &&
    env('CPI_MOBILE_IDENTITY_ENABLED') === 'true';
  const publicMobileEntry =
    (publicWebEntry || stagingMobileEntry) && env('CPI_MOBILE_IDENTITY_ENABLED') === 'true';
  const mobileIdentity = publicMobileEntry
    ? ({
        callback:
          environment === 'staging' ? STAGING_MOBILE_IDENTITY_CALLBACK : MOBILE_IDENTITY_CALLBACK,
        googleClientId: require(
          environment === 'staging'
            ? 'CPI_IDENTITY_GOOGLE_STAGING_WEB_CLIENT_ID'
            : 'CPI_IDENTITY_GOOGLE_WEB_CLIENT_ID',
        ),
        web: {
          redirectUri:
            environment === 'staging' ? STAGING_MOBILE_IDENTITY_CALLBACK : MOBILE_IDENTITY_CALLBACK,
          googleClientSecret: require(
            environment === 'staging'
              ? 'CPI_IDENTITY_GOOGLE_STAGING_WEB_CLIENT_SECRET'
              : 'CPI_IDENTITY_GOOGLE_WEB_CLIENT_SECRET',
          ),
        },
        apple: {
          clientId:
            environment === 'staging'
              ? 'com.georgicole.crystalpath.infinity.staging.web'
              : 'com.georgicole.crystalpath.infinity.web',
          teamId: 'C97T2A5255',
          keyId: require(
            environment === 'staging'
              ? 'CPI_IDENTITY_APPLE_STAGING_WEB_KEY_ID'
              : 'CPI_IDENTITY_APPLE_WEB_KEY_ID',
          ),
          privateKey: require(
            environment === 'staging'
              ? 'CPI_IDENTITY_APPLE_STAGING_WEB_PRIVATE_KEY'
              : 'CPI_IDENTITY_APPLE_WEB_PRIVATE_KEY',
          ).replaceAll('\\n', '\n'),
        },
      } as const)
    : undefined;
  return {
    projectRef,
    url,
    environment,
    publicWebEntry,
    publicMobileEntry,
    mobileIdentity,
    // Staging is opt-in and this project is pinned independently of client flags.
    nativeIdentity:
      environment === 'staging' &&
      projectRef === 'yfntwewvfsvljxcztoyp' &&
      env('CPI_NATIVE_IDENTITY_ENABLED') === 'true'
        ? {
            googleClientId: require('CPI_IDENTITY_GOOGLE_IOS_CLIENT_ID'),
            signupEmails: providerSignupEmails(env('CPI_STAGING_PROVIDER_SIGNUP_EMAILS')),
            directEntry:
              env('CPI_STAGING_DIRECT_PROVIDER_ENTRY') === 'true' &&
              Object.keys(policy.countries).length === 1 &&
              policy.countries.BG?.minimumAge === 18 &&
              policy.countries.BG.neutralAgeScreenAllowed,
            apple: {
              clientId: 'com.georgicole.crystalpath.infinity',
              teamId: 'C97T2A5255',
              keyId: require('CPI_IDENTITY_APPLE_KEY_ID'),
              privateKey: require('CPI_IDENTITY_APPLE_PRIVATE_KEY').replaceAll('\\n', '\n'),
            },
          }
        : publicWebEntry
          ? {
              googleClientId: require('CPI_IDENTITY_GOOGLE_WEB_CLIENT_ID'),
              signupEmails: { apple: [], google: [] },
              directEntry: false,
              web: {
                redirectUri: 'https://crystalpath-api.kolequant.xyz/cpi/identity/web-callback',
                googleClientSecret: require('CPI_IDENTITY_GOOGLE_WEB_CLIENT_SECRET'),
              },
              apple: {
                clientId: 'com.georgicole.crystalpath.infinity.web',
                teamId: 'C97T2A5255',
                keyId: require('CPI_IDENTITY_APPLE_WEB_KEY_ID'),
                privateKey: require('CPI_IDENTITY_APPLE_WEB_PRIVATE_KEY').replaceAll('\\n', '\n'),
              },
            }
          : undefined,
    policy,
    origins,
    products,
    purchasePlatforms,
    stagingTestEmails,
    purchasesEnabled,
    rewardsEnabled,
    purchaseEnvironment,
    appleSandboxVerifierKey,
    appleProductionVerifierKey,
    reviewPurchasesEnabled,
    databaseUrl: require('CPI_DATABASE_URL'),
    databaseCa: env('CPI_DATABASE_CA')?.replaceAll('\\n', '\n'),
    serviceKey: require('SUPABASE_SERVICE_ROLE_KEY'),
    pepper: keys[0],
    encryptionKey: keys[1],
    gatewayKey: keys[2],
    workerKey: keys[3],
    mailKey: require('CPI_RESEND_API_KEY'),
    mailFrom: require('CPI_MAIL_FROM'),
    ...(purchasesEnabled && purchasePlatforms.includes('android')
      ? {
          googleClientEmail: require('CPI_GOOGLE_CLIENT_EMAIL'),
          googlePrivateKey: require('CPI_GOOGLE_PRIVATE_KEY').replaceAll('\\n', '\n'),
        }
      : {}),
    ...(purchasesEnabled && purchasePlatforms.includes('ios')
      ? {
          appleIssuerId: require('CPI_APPLE_ISSUER_ID'),
          appleKeyId: require('CPI_APPLE_KEY_ID'),
          applePrivateKey: require('CPI_APPLE_PRIVATE_KEY').replaceAll('\\n', '\n'),
        }
      : {}),
  } as const;
}
