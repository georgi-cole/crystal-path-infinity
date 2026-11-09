import { exactObject, isObject } from './private-services.ts';
import { validateAccountPolicy } from './account-policy.ts';
import type { AccountPolicy } from './account-policy.ts';
import type { CommerceProduct } from './commerce-service.ts';

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
  let products: readonly CommerceProduct[] = [];
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
  }
  const purchaseEnvironment =
    environment === 'production' ? ('production' as const) : ('sandbox' as const);
  return {
    projectRef,
    url,
    environment,
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
        : undefined,
    policy,
    origins,
    products,
    purchasesEnabled,
    rewardsEnabled,
    purchaseEnvironment,
    databaseUrl: require('CPI_DATABASE_URL'),
    databaseCa: env('CPI_DATABASE_CA')?.replaceAll('\\n', '\n'),
    serviceKey: require('SUPABASE_SERVICE_ROLE_KEY'),
    pepper: keys[0],
    encryptionKey: keys[1],
    gatewayKey: keys[2],
    workerKey: keys[3],
    mailKey: require('CPI_RESEND_API_KEY'),
    mailFrom: require('CPI_MAIL_FROM'),
    ...(purchasesEnabled
      ? {
          googleClientEmail: require('CPI_GOOGLE_CLIENT_EMAIL'),
          googlePrivateKey: require('CPI_GOOGLE_PRIVATE_KEY').replaceAll('\\n', '\n'),
          appleIssuerId: require('CPI_APPLE_ISSUER_ID'),
          appleKeyId: require('CPI_APPLE_KEY_ID'),
          applePrivateKey: require('CPI_APPLE_PRIVATE_KEY').replaceAll('\\n', '\n'),
        }
      : {}),
  } as const;
}
