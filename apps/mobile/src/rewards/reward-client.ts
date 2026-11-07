import type { AccountSessionOwner } from '../account/session-owner';
import { parseOperationFailure } from '../operations/operation-failure.ts';
import type { OperationFailure } from '../operations/operation-failure';

export interface RewardPromise {
  readonly ordinal: number;
  readonly restoreSp: 200 | 150;
}
export interface RewardView {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly rulesetVersion: string;
  readonly status: 'offer' | 'pending' | 'granted' | 'playing' | 'finished';
  readonly deathId: string | null;
  readonly offer: RewardPromise | null;
  readonly intent:
    | (RewardPromise & {
        readonly id: string;
        readonly expiresAt: number;
        readonly customData: string;
      })
    | null;
  readonly grant: (RewardPromise & { readonly id: string }) | null;
  readonly revivesGranted: number;
  readonly revivesApplied: number;
  readonly revivesToReachScore: number;
}
export interface RewardInventory {
  readonly provider: 'admob';
  readonly platform: 'android' | 'ios';
  readonly sdkVersion: string;
  readonly mediation: readonly { readonly identifier: string; readonly version: string }[];
}
export interface RewardPermit {
  readonly id: string;
  readonly policyVersion: string;
  readonly expiresAt: number;
  readonly inventory: RewardInventory;
  readonly flags: {
    readonly canRequestAds: true;
    readonly childDirected: boolean;
    readonly underAgeOfConsent: boolean;
    readonly maxAdContentRating: 'G' | 'PG' | 'T' | 'MA';
    readonly nonPersonalized: boolean;
  };
  readonly context: 'unknown' | 'child' | 'teen' | 'adult';
  readonly contextSupported: true;
  readonly prerequisitesSatisfied: true;
}
export interface RewardClient {
  readonly accountScope: () => object | null;
  readonly subscribeAccountScope: (observer: () => void) => () => void;
  readonly eligibility: (runId: string, signal: AbortSignal) => Promise<RewardPermit | null>;
  readonly status: (runId: string, signal: AbortSignal) => Promise<RewardView>;
  readonly intent: (
    runId: string,
    idempotencyKey: string,
    signal: AbortSignal,
  ) => Promise<RewardView>;
  /** Delegates to the authoritative ranked queue, which owns sequence/lease/retry. */
  readonly applyGrant: (runId: string, grantId: string) => Promise<void | boolean>;
}
export class RewardUnavailable extends Error {
  constructor() {
    super('Rewarded continuation is unavailable');
    this.name = 'RewardUnavailable';
  }
}
export class RewardOperationUnavailable extends RewardUnavailable {
  readonly problem: OperationFailure;
  constructor(problem: OperationFailure) {
    super();
    this.problem = problem;
    this.name = 'RewardOperationUnavailable';
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^[A-Za-z0-9._-]{1,80}$/;
function object(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function id(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
function promise(value: unknown): value is RewardPromise {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    integer((value as RewardPromise).ordinal, 10) &&
    (value as RewardPromise).ordinal >= 1 &&
    (value as RewardPromise).restoreSp === ((value as RewardPromise).ordinal <= 5 ? 200 : 150)
  );
}
export function parseRewardView(value: unknown, runId: string): RewardView | null {
  if (
    !object(value, [
      'schemaVersion',
      'runId',
      'rulesetVersion',
      'status',
      'deathId',
      'offer',
      'intent',
      'grant',
      'revivesGranted',
      'revivesApplied',
      'revivesToReachScore',
    ]) ||
    value.schemaVersion !== 1 ||
    value.runId !== runId ||
    typeof value.rulesetVersion !== 'string' ||
    !VERSION.test(value.rulesetVersion) ||
    !['offer', 'pending', 'granted', 'playing', 'finished'].includes(value.status as string) ||
    (value.deathId !== null &&
      (typeof value.deathId !== 'string' || !/^[A-Za-z0-9:_-]{1,120}$/.test(value.deathId))) ||
    !integer(value.revivesGranted, value.rulesetVersion === 'infinity-v11-live' ? 15 : 10) ||
    !integer(value.revivesApplied, value.revivesGranted) ||
    !integer(value.revivesToReachScore, value.revivesApplied)
  )
    return null;
  const offer = value.offer;
  const intent = value.intent;
  const grant = value.grant;
  if (offer !== null && (!object(offer, ['ordinal', 'restoreSp']) || !promise(offer))) return null;
  if (
    intent !== null &&
    (!object(intent, ['id', 'ordinal', 'restoreSp', 'expiresAt', 'customData']) ||
      !promise(intent) ||
      !id(intent.id) ||
      !integer(intent.expiresAt) ||
      !id(intent.customData))
  )
    return null;
  if (
    grant !== null &&
    (!object(grant, ['id', 'ordinal', 'restoreSp']) || !promise(grant) || !id(grant.id))
  )
    return null;
  const next = value.revivesApplied + 1;
  if (
    (offer && offer.ordinal !== next) ||
    (intent && intent.ordinal !== next) ||
    (grant && grant.ordinal !== next) ||
    (value.status === 'offer' &&
      (value.deathId === null ||
        !offer ||
        intent !== null ||
        grant !== null ||
        value.revivesGranted !== value.revivesApplied ||
        next > 10)) ||
    (value.status === 'pending' &&
      (value.deathId === null ||
        offer !== null ||
        !intent ||
        grant !== null ||
        value.revivesGranted !== value.revivesApplied)) ||
    (value.status === 'granted' &&
      (value.deathId === null || offer !== null || !grant || value.revivesGranted !== next)) ||
    ((value.status === 'playing' || value.status === 'finished') &&
      (offer !== null || intent !== null || grant !== null)) ||
    (value.status === 'playing' && value.deathId !== null)
  )
    return null;
  return {
    schemaVersion: 1,
    runId,
    rulesetVersion: value.rulesetVersion,
    status: value.status as RewardView['status'],
    deathId: value.deathId,
    offer: offer ? { ordinal: offer.ordinal, restoreSp: offer.restoreSp } : null,
    intent: intent
      ? {
          id: intent.id as string,
          ordinal: intent.ordinal,
          restoreSp: intent.restoreSp,
          expiresAt: intent.expiresAt as number,
          customData: intent.customData as string,
        }
      : null,
    grant: grant
      ? { id: grant.id as string, ordinal: grant.ordinal, restoreSp: grant.restoreSp }
      : null,
    revivesGranted: value.revivesGranted,
    revivesApplied: value.revivesApplied,
    revivesToReachScore: value.revivesToReachScore,
  };
}
export function parseRewardPermit(value: unknown): RewardPermit | null {
  if (
    !object(value, ['schemaVersion', 'status', 'permit']) ||
    value.schemaVersion !== 1 ||
    value.status !== 'allowed'
  )
    return null;
  const raw = value.permit;
  if (
    !object(raw, [
      'id',
      'policyVersion',
      'expiresAt',
      'inventory',
      'flags',
      'context',
      'contextSupported',
      'prerequisitesSatisfied',
    ]) ||
    !id(raw.id) ||
    typeof raw.policyVersion !== 'string' ||
    !VERSION.test(raw.policyVersion) ||
    !integer(raw.expiresAt) ||
    !['unknown', 'child', 'teen', 'adult'].includes(raw.context as string) ||
    raw.contextSupported !== true ||
    raw.prerequisitesSatisfied !== true
  )
    return null;
  const inventory = raw.inventory;
  const flags = raw.flags;
  if (
    !object(inventory, ['provider', 'platform', 'sdkVersion', 'mediation']) ||
    inventory.provider !== 'admob' ||
    !['android', 'ios'].includes(inventory.platform as string) ||
    typeof inventory.sdkVersion !== 'string' ||
    !VERSION.test(inventory.sdkVersion) ||
    !Array.isArray(inventory.mediation) ||
    inventory.mediation.length > 20 ||
    !object(flags, [
      'canRequestAds',
      'childDirected',
      'underAgeOfConsent',
      'maxAdContentRating',
      'nonPersonalized',
    ]) ||
    flags.canRequestAds !== true ||
    typeof flags.childDirected !== 'boolean' ||
    typeof flags.underAgeOfConsent !== 'boolean' ||
    typeof flags.nonPersonalized !== 'boolean' ||
    !['G', 'PG', 'T', 'MA'].includes(flags.maxAdContentRating as string)
  )
    return null;
  const mediation: { identifier: string; version: string }[] = [];
  for (const item of inventory.mediation) {
    if (
      !object(item, ['identifier', 'version']) ||
      typeof item.identifier !== 'string' ||
      !VERSION.test(item.identifier) ||
      typeof item.version !== 'string' ||
      !VERSION.test(item.version) ||
      mediation.some((prior) => prior.identifier === item.identifier)
    )
      return null;
    mediation.push({ identifier: item.identifier, version: item.version });
  }
  if (
    (raw.context === 'unknown' || raw.context === 'child') &&
    (!flags.childDirected ||
      !flags.underAgeOfConsent ||
      flags.maxAdContentRating !== 'G' ||
      !flags.nonPersonalized)
  )
    return null;
  return {
    id: raw.id,
    policyVersion: raw.policyVersion,
    expiresAt: raw.expiresAt,
    inventory: {
      provider: 'admob',
      platform: inventory.platform as RewardInventory['platform'],
      sdkVersion: inventory.sdkVersion,
      mediation,
    },
    flags: {
      canRequestAds: true,
      childDirected: flags.childDirected,
      underAgeOfConsent: flags.underAgeOfConsent,
      maxAdContentRating: flags.maxAdContentRating as RewardPermit['flags']['maxAdContentRating'],
      nonPersonalized: flags.nonPersonalized,
    },
    context: raw.context as RewardPermit['context'],
    contextSupported: true,
    prerequisitesSatisfied: true,
  };
}
async function body(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new RewardUnavailable();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16384) {
        await reader.cancel();
        throw new RewardUnavailable();
      }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    reader.releaseLock();
  }
}

export function createRewardClient(options: {
  baseUrl: string | undefined;
  session: Pick<
    AccountSessionOwner,
    'withAccountRequest' | 'accountScope' | 'subscribeAccountScope'
  >;
  applyGrant: (runId: string, grantId: string) => Promise<void | boolean>;
  fetcher?: typeof fetch;
}): RewardClient | null {
  if (!options.baseUrl) return null;
  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    return null;
  }
  const path = base.pathname.replace(/\/$/, '');
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    /\/(auth|rest)\/v1/.test(path) ||
    (path !== '' && !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(path))
  )
    return null;
  const endpoint = base.origin + path + '/rewards/';
  const fetcher = options.fetcher ?? fetch;
  const request = async (
    route: 'eligibility' | 'status' | 'intent',
    input: { runId: string; idempotencyKey?: string },
    signal: AbortSignal,
  ) => {
    try {
      const scope = options.session.accountScope();
      if (
        !scope ||
        signal.aborted ||
        !id(input.runId) ||
        (input.idempotencyKey !== undefined && !id(input.idempotencyKey))
      )
        throw new RewardUnavailable();
      return await options.session.withAccountRequest(async (lease) => {
        const response = await fetcher(endpoint + route, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: 'Bearer ' + lease.accessToken,
          },
          body: JSON.stringify(input),
          signal: AbortSignal.any([signal, lease.signal, AbortSignal.timeout(8000)]),
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
        });
        const raw = await body(response);
        if (signal.aborted || lease.signal.aborted || scope !== options.session.accountScope())
          throw new RewardUnavailable();
        if (!response.ok) {
          const problem = parseOperationFailure(raw, response.status);
          if (problem) throw new RewardOperationUnavailable(problem);
          throw new RewardUnavailable();
        }
        return raw;
      });
    } catch (error) {
      if (error instanceof RewardOperationUnavailable) throw error;
      throw new RewardUnavailable();
    }
  };
  return {
    accountScope: () => options.session.accountScope(),
    subscribeAccountScope: (observer) => options.session.subscribeAccountScope(observer),
    eligibility: async (runId, signal) =>
      parseRewardPermit(await request('eligibility', { runId }, signal)),
    status: async (runId, signal) => {
      const view = parseRewardView(await request('status', { runId }, signal), runId);
      if (!view) throw new RewardUnavailable();
      return view;
    },
    intent: async (runId, idempotencyKey, signal) => {
      const view = parseRewardView(
        await request('intent', { runId, idempotencyKey }, signal),
        runId,
      );
      if (!view) throw new RewardUnavailable();
      return view;
    },
    applyGrant: async (runId, grantId) => {
      const scope = options.session.accountScope();
      if (!scope || !id(runId) || !id(grantId)) throw new RewardUnavailable();
      try {
        const result = await options.applyGrant(runId, grantId);
        if (scope !== options.session.accountScope()) throw new RewardUnavailable();
        return result;
      } catch (error) {
        if (error instanceof RewardOperationUnavailable) throw error;
        throw new RewardUnavailable();
      }
    },
  };
}
