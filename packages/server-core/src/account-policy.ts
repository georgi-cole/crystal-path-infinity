import { exactObject } from './private-services.ts';

export interface AccountCountryPolicy {
  /** Reviewed country-specific threshold; never inferred from optional analytics. */
  readonly minimumAge: number;
  /** False when the launch territory needs an assurance method we have not connected. */
  readonly neutralAgeScreenAllowed: boolean;
}
export interface AccountPolicy {
  readonly version: string;
  readonly countries: Readonly<Record<string, AccountCountryPolicy>>;
}
export interface AccountRequestContext {
  /** Authenticated gateway metadata, never an arbitrary X-Forwarded-For/country header. */
  readonly country: string | null;
  readonly rateKey: string;
}
export function validateAccountPolicy(policy: AccountPolicy): AccountPolicy {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(policy.version)) throw new Error('Invalid account policy');
  for (const [country, rule] of Object.entries(policy.countries)) {
    if (
      !/^[A-Z]{2}$/.test(country) ||
      !Number.isInteger(rule.minimumAge) ||
      rule.minimumAge < 13 ||
      rule.minimumAge > 21 ||
      typeof rule.neutralAgeScreenAllowed !== 'boolean'
    )
      throw new Error('Invalid account country policy');
  }
  return structuredClone(policy);
}
/** Conservative two-territory decision before any email is accepted; exact age is not stored. */
export function accountEligibility(
  policy: AccountPolicy,
  context: AccountRequestContext,
  input: unknown,
):
  | {
      status: 'eligible';
      country: string;
      privacyContext: 'teen' | 'adult';
      platform: 'android' | 'ios' | 'web';
      clientBuild: number;
    }
  | { status: 'parental_review' | 'unavailable' } {
  if (
    !exactObject(input, ['schemaVersion', 'age', 'country', 'platform', 'clientBuild']) ||
    input.schemaVersion !== 2 ||
    typeof input.age !== 'number' ||
    !Number.isInteger(input.age) ||
    input.age < 0 ||
    input.age > 120 ||
    typeof input.country !== 'string' ||
    !/^[A-Z]{2}$/.test(input.country) ||
    !['android', 'ios', 'web'].includes(String(input.platform)) ||
    typeof input.clientBuild !== 'number' ||
    !Number.isSafeInteger(input.clientBuild) ||
    input.clientBuild < 1 ||
    input.clientBuild > 2147483647
  )
    return { status: 'unavailable' };
  const geo = context.country ? policy.countries[context.country] : undefined;
  const declared = policy.countries[input.country];
  if (!geo || !declared || !geo.neutralAgeScreenAllowed || !declared.neutralAgeScreenAllowed)
    return { status: 'unavailable' };
  if (input.age < Math.max(geo.minimumAge, declared.minimumAge))
    return { status: 'parental_review' };
  return {
    status: 'eligible',
    country: input.country,
    privacyContext: input.age < 18 ? 'teen' : 'adult',
    platform: input.platform as 'android' | 'ios' | 'web',
    clientBuild: input.clientBuild,
  };
}
