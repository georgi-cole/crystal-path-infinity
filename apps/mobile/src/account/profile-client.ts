import type { AccountSessionOwner } from './session-owner';

export const AGE_BANDS = [
  'under_13',
  '13_15',
  '16_17',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_64',
  '65_plus',
] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export interface PublicProfile {
  publicId: string;
  username: string;
  countryCode: string | null;
}
export interface OwnerProfile {
  profile: PublicProfile | null;
  analyticsAgeBand: AgeBand | null;
  ageResponseAt: string | null;
  analyticsAllowed: boolean;
  countryChangeAvailableAt: string | null;
  mappingVersion: string;
  countries: readonly { countryCode: string; continentCode: string }[];
}
export interface ProfileEdit {
  username: string;
  countryCode: string | null;
  analyticsAction: 'keep' | 'answer' | 'withdraw';
  analyticsAgeBand: AgeBand | null;
}
export type ProfileProblem =
  | 'unavailable'
  | 'username_invalid'
  | 'username_reserved'
  | 'username_taken'
  | 'country_unsupported'
  | 'country_cooldown'
  | 'analytics_not_allowed';
export type ProfileResult =
  { ok: true; value: OwnerProfile } | { ok: false; problem: ProfileProblem };
export interface ProfileClient {
  load(signal: AbortSignal): Promise<ProfileResult>;
  save(input: ProfileEdit, signal: AbortSignal): Promise<ProfileResult>;
}

/** Exact age exists only in a transient input. Neither requests nor storage retain it. */
export function ageBandFromInput(input: string): AgeBand | null {
  if (!/^(0|[1-9][0-9]{0,2})$/.test(input)) return null;
  const age = Number(input);
  if (age > 120) return null;
  if (age < 13) return 'under_13';
  if (age < 16) return '13_15';
  if (age < 18) return '16_17';
  if (age < 25) return '18_24';
  if (age < 35) return '25_34';
  if (age < 45) return '35_44';
  if (age < 55) return '45_54';
  if (age < 65) return '55_64';
  return '65_plus';
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function date(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)))
  );
}
const country = /^[A-Z]{2}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reconstruct allowlisted fields: private/server extras cannot spread into the view. */
export function parseOwnerProfile(value: unknown): OwnerProfile | null {
  if (!record(value) || !record(value.config) || !record(value.owner)) return null;
  const { config, owner } = value;
  if (
    typeof config.mappingVersion !== 'string' ||
    !/^[a-z0-9-]{1,80}$/.test(config.mappingVersion) ||
    !Array.isArray(config.countries) ||
    config.countries.length < 1 ||
    config.countries.length > 260 ||
    typeof owner.analyticsAllowed !== 'boolean' ||
    !date(owner.ageResponseAt) ||
    !date(owner.countryChangeAvailableAt) ||
    (owner.analyticsAgeBand !== null && !AGE_BANDS.includes(owner.analyticsAgeBand as AgeBand)) ||
    (owner.analyticsAgeBand === null) !== (owner.ageResponseAt === null)
  )
    return null;
  const countries: OwnerProfile['countries'][number][] = [];
  for (const item of config.countries) {
    if (
      !record(item) ||
      typeof item.countryCode !== 'string' ||
      !country.test(item.countryCode) ||
      typeof item.continentCode !== 'string' ||
      !['AF', 'AS', 'EU', 'NA', 'SA', 'OC', 'AN'].includes(item.continentCode) ||
      countries.some((entry) => entry.countryCode === item.countryCode)
    )
      return null;
    countries.push({ countryCode: item.countryCode, continentCode: item.continentCode });
  }
  let profile: PublicProfile | null = null;
  if (owner.profile !== null) {
    const item = owner.profile;
    if (
      !record(item) ||
      typeof item.public_id !== 'string' ||
      !uuid.test(item.public_id) ||
      typeof item.username !== 'string' ||
      !/^[a-z0-9_]{3,24}$/.test(item.username) ||
      (item.country_code !== null &&
        (typeof item.country_code !== 'string' ||
          !countries.some((entry) => entry.countryCode === item.country_code)))
    )
      return null;
    profile = {
      publicId: item.public_id,
      username: item.username,
      countryCode: item.country_code,
    };
  }
  return {
    profile,
    analyticsAgeBand: owner.analyticsAgeBand as AgeBand | null,
    ageResponseAt: owner.ageResponseAt,
    analyticsAllowed: owner.analyticsAllowed,
    countryChangeAvailableAt: owner.countryChangeAvailableAt,
    mappingVersion: config.mappingVersion,
    countries,
  };
}

const problems: Readonly<Record<string, ProfileProblem>> = {
  CPI_PROFILE_USERNAME_INVALID: 'username_invalid',
  CPI_PROFILE_USERNAME_RESERVED: 'username_reserved',
  CPI_PROFILE_USERNAME_TAKEN: 'username_taken',
  CPI_PROFILE_COUNTRY_UNSUPPORTED: 'country_unsupported',
  CPI_PROFILE_COUNTRY_COOLDOWN: 'country_cooldown',
  CPI_PROFILE_ANALYTICS_NOT_ALLOWED: 'analytics_not_allowed',
};

/** Only an explicitly supplied, approved session can make account requests. No auto-start. */
export function createProfileClient(
  baseUrl: string | undefined,
  session: Pick<AccountSessionOwner, 'withAccountRequest'>,
  fetcher: typeof fetch = fetch,
): ProfileClient | null {
  if (!baseUrl) return null;
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname === '/' ||
    /\/(auth|rest)\/v1/.test(base.pathname)
  )
    return null;
  const path = base.origin + base.pathname.replace(/\/$/, '') + '/profile/';
  async function request(
    endpoint: 'read' | 'save',
    input: object,
    signal: AbortSignal,
  ): Promise<ProfileResult> {
    try {
      return await session.withAccountRequest(async (lease) => {
        const response = await fetcher(path + endpoint, {
          method: 'POST',
          body: JSON.stringify({ schemaVersion: 1, ...input }),
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: 'Bearer ' + lease.accessToken,
          },
          signal: AbortSignal.any([signal, lease.signal, AbortSignal.timeout(15_000)]),
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
        });
        const text = await response.text();
        if (text.length > 65_536) return { ok: false, problem: 'unavailable' };
        const body: unknown = JSON.parse(text);
        if (!response.ok)
          return {
            ok: false,
            problem:
              record(body) && typeof body.code === 'string'
                ? (problems[body.code] ?? 'unavailable')
                : 'unavailable',
          };
        const parsed = parseOwnerProfile(body);
        return parsed ? { ok: true, value: parsed } : { ok: false, problem: 'unavailable' };
      });
    } catch {
      return { ok: false, problem: 'unavailable' };
    }
  }
  return {
    load: (signal) => request('read', {}, signal),
    save: (input, signal) =>
      request(
        'save',
        {
          username: input.username,
          countryCode: input.countryCode,
          analyticsAction: input.analyticsAction,
          analyticsAgeBand: input.analyticsAgeBand,
        },
        signal,
      ),
  };
}
