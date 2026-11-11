import { describe, expect, it } from 'vitest';
import { productionMobileSignIn } from './mobile-sign-in';

const configured = {
  VITE_NATIVE_PROVIDER_SIGN_IN: 'true',
  VITE_ACCOUNT_SERVICES_ENABLED: 'true',
  VITE_ACCOUNT_API_BASE_URL: 'https://crystalpath-api.kolequant.xyz/cpi',
  VITE_CLIENT_BUILD: '45',
};
describe('production mobile login configuration', () => {
  it('keeps ordinary builds unchanged and binds the live candidate to production', () => {
    expect(productionMobileSignIn('development', {})).toBeNull();
    expect(productionMobileSignIn('production', configured)).toMatchObject({
      kind: 'production-mobile',
      ranked: false,
    });
  });
  it.each([
    { VITE_ACCOUNT_API_BASE_URL: 'https://crystal-path-staging-api.kolequant.workers.dev/cpi' },
    { VITE_IOS_PROVIDER_SIGN_IN: 'true' },
    { VITE_WEB_PROVIDER_SIGN_IN: 'true' },
    { VITE_ACCOUNT_SERVICES_ENABLED: 'false' },
    { VITE_CLIENT_BUILD: '0' },
    { VITE_CLIENT_BUILD: '2147483648' },
  ])('rejects mixed or incomplete native login settings %o', (overrides) => {
    expect(() => productionMobileSignIn('production', { ...configured, ...overrides })).toThrow();
  });
});
