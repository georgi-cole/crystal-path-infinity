import type { AccountSessionOwner } from '../account/session-owner';
import { THEME_IDS } from '../store-catalog';
import { COMMERCE_PRODUCTS as catalog, ADVENTURE_COMMERCE_UNLOCKS } from './adventure-products';
import type { ThemeId } from '../store-catalog';
import { CommerceUnavailable } from './commerce-types';
import type {
  BillingPlatform,
  CommerceGateway,
  CommerceWallet,
  LiveProduct,
  PurchaseProof,
  OfflineAllocation,
} from './commerce-types';

const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
export function parseOfflineAllocation(value: unknown): OfflineAllocation | null {
  if (
    !record(value) ||
    typeof value.operationId !== 'string' ||
    !tokenPattern.test(value.operationId)
  )
    return null;
  const keys = ['sp', 'hints', 'credits', 'shields', 'seasonChanges'] as const;
  if (
    Object.keys(value).length !== 6 ||
    keys.some((key) => !integer(value[key]) || value[key] > 10000) ||
    !keys.some((key) => (value[key] as number) > 0)
  )
    return null;
  return {
    operationId: value.operationId.toLowerCase(),
    sp: value.sp as number,
    hints: value.hints as number,
    credits: value.credits as number,
    shields: value.shields as number,
    seasonChanges: value.seasonChanges as number,
  };
}
export function parseCommerceWallet(value: unknown): CommerceWallet | null {
  if (
    !record(value) ||
    ((value.inventoryToken !== undefined || value.reviewWallet !== undefined) &&
      (typeof value.inventoryToken !== 'string' ||
        !tokenPattern.test(value.inventoryToken) ||
        typeof value.reviewWallet !== 'boolean')) ||
    !integer(value.revision) ||
    !integer(value.sp) ||
    !integer(value.hints) ||
    !integer(value.credits) ||
    (value.shields !== undefined && !integer(value.shields)) ||
    (value.seasonChanges !== undefined && !integer(value.seasonChanges)) ||
    (value.unlocks !== undefined &&
      (!Array.isArray(value.unlocks) ||
        new Set(value.unlocks).size !== value.unlocks.length ||
        value.unlocks.some(
          (key) => typeof key !== 'string' || !ADVENTURE_COMMERCE_UNLOCKS.includes(key),
        ))) ||
    typeof value.accountToken !== 'string' ||
    !tokenPattern.test(value.accountToken) ||
    !Array.isArray(value.owned) ||
    value.owned.length > THEME_IDS.length ||
    !value.owned.includes('obsidian') ||
    new Set(value.owned).size !== value.owned.length ||
    value.owned.some((theme) => !THEME_IDS.includes(theme as ThemeId)) ||
    !value.owned.includes(value.equipped)
  )
    return null;
  if (
    typeof value.inventoryToken === 'string' &&
    (value.inventoryToken.toLowerCase() === value.accountToken.toLowerCase()) === value.reviewWallet
  )
    return null;
  return {
    ...(value.inventoryToken === undefined
      ? {}
      : {
          inventoryToken: value.inventoryToken.toLowerCase(),
          reviewWallet: value.reviewWallet as boolean,
        }),
    revision: value.revision,
    accountToken: value.accountToken.toLowerCase(),
    sp: value.sp,
    hints: value.hints,
    credits: value.credits,
    shields: value.shields ?? 0,
    seasonChanges: value.seasonChanges ?? 0,
    unlocks: (value.unlocks ?? []) as string[],
    owned: value.owned as ThemeId[],
    equipped: value.equipped as ThemeId,
  };
}
export function parseLiveProducts(value: unknown): readonly LiveProduct[] | null {
  if (!Array.isArray(value) || value.length > catalog.size) return null;
  const keys = new Set<string>(),
    skus = new Set<string>();
  const output: LiveProduct[] = [];
  for (const product of value) {
    if (
      !record(product) ||
      typeof product.key !== 'string' ||
      !catalog.has(product.key) ||
      typeof product.sku !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(product.sku) ||
      /^(test\.|REPLACE|placeholder)/i.test(product.sku) ||
      product.consumable !== catalog.get(product.key)!.consumable ||
      keys.has(product.key) ||
      skus.has(product.sku)
    )
      return null;
    keys.add(product.key);
    skus.add(product.sku);
    output.push({ key: product.key, sku: product.sku, consumable: product.consumable });
  }
  return output;
}
async function json(response: Response): Promise<unknown> {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
    throw new CommerceUnavailable();
  const reader = response.body?.getReader();
  if (!reader) throw new CommerceUnavailable();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '',
    bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 131072) throw new CommerceUnavailable();
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Fixed own-server routes; no raw provider credentials or receipt queries. */
export function createCommerceGateway(options: {
  baseUrl: string;
  platform: BillingPlatform;
  session: Pick<
    AccountSessionOwner,
    'accountScope' | 'subscribeAccountScope' | 'withAccountRequest'
  >;
  fetcher?: typeof fetch;
  reviewWallet?: () => Promise<boolean | undefined>;
}): CommerceGateway | null {
  let base: URL;
  try {
    base = new URL(options.baseUrl);
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
    /\/(auth|rest)\/v1/.test(base.pathname) ||
    !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/?$/.test(base.pathname)
  )
    return null;
  const endpoint = base.origin + base.pathname.replace(/\/$/, '') + '/commerce/';
  const fetcher = options.fetcher ?? fetch;
  const session = options.session;
  let selectedScope: object | null = null;
  let reviewChoice: boolean | undefined;
  let environmentKnown = false;
  let selecting: Promise<void> | undefined;
  const responseScopes = new WeakMap<object, object | null>();
  async function post(
    route:
      | 'catalog'
      | 'wallet'
      | 'begin'
      | 'verify'
      | 'equip'
      | 'allocate'
      | 'allocations'
      | 'allocation-ack',
    payload: object,
    signal: AbortSignal,
  ) {
    return session.withAccountRequest(async (lease) => {
      const scope = session.accountScope();
      const changed = scope !== selectedScope;
      if (changed) {
        selectedScope = scope;
        reviewChoice = undefined;
        environmentKnown = false;
      }
      if (changed || !selecting || (route === 'wallet' && !environmentKnown)) {
        selecting = Promise.resolve()
          .then(() => options.reviewWallet?.())
          .catch(() => undefined)
          .then((choice) => {
            if (selectedScope !== scope || session.accountScope() !== scope) return;
            environmentKnown = typeof choice === 'boolean';
            if (environmentKnown) reviewChoice = choice;
          });
      }
      await selecting;
      if (session.accountScope() !== scope) throw new CommerceUnavailable();
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      lease.signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted || lease.signal.aborted) abort();
      const timeout = setTimeout(abort, 15000);
      try {
        const result = await json(
          await fetcher(endpoint + route, {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              authorization: 'Bearer ' + lease.accessToken,
            },
            body: JSON.stringify({
              schemaVersion: 1,
              platform: options.platform,
              ...(reviewChoice === undefined ? {} : { reviewWallet: reviewChoice }),
              ...payload,
            }),
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            signal: controller.signal,
          }),
        );
        if (session.accountScope() !== scope) throw new CommerceUnavailable();
        if (result && typeof result === 'object') responseScopes.set(result, scope);
        return result;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        lease.signal.removeEventListener('abort', abort);
      }
    });
  }
  function wallet(value: unknown): CommerceWallet {
    const parsed =
      record(value) && value.schemaVersion === 1 ? parseCommerceWallet(value.wallet) : null;
    if (!parsed) throw new CommerceUnavailable();
    if (
      parsed.reviewWallet !== undefined &&
      record(value) &&
      responseScopes.get(value) === selectedScope &&
      selectedScope === session.accountScope()
    )
      reviewChoice = parsed.reviewWallet;
    return parsed;
  }
  return {
    offlineSupplies: {
      async pending(signal) {
        const reply = await post('allocations', {}, signal);
        if (!record(reply) || !Array.isArray(reply.allocations) || reply.allocations.length > 100)
          throw new CommerceUnavailable();
        const allocations = reply.allocations.map(parseOfflineAllocation);
        if (
          allocations.some((item) => !item) ||
          new Set(allocations.map((item) => item!.operationId)).size !== allocations.length
        )
          throw new CommerceUnavailable();
        return { allocations: allocations as OfflineAllocation[], wallet: wallet(reply) };
      },
      async allocate(operationId, amounts, signal) {
        if (!parseOfflineAllocation({ operationId, ...amounts })) throw new CommerceUnavailable();
        const reply = await post('allocate', { operationId, amounts }, signal);
        const allocation = record(reply) ? parseOfflineAllocation(reply.allocation) : null;
        if (
          !allocation ||
          allocation.operationId !== operationId ||
          Object.entries(amounts).some(
            ([key, value]) => allocation[key as keyof typeof amounts] !== value,
          )
        )
          throw new CommerceUnavailable();
        return { allocation, wallet: wallet(reply) };
      },
      async acknowledge(operationId, signal) {
        if (!tokenPattern.test(operationId)) throw new CommerceUnavailable();
        const reply = await post('allocation-ack', { operationId }, signal);
        if (!record(reply) || reply.schemaVersion !== 1 || reply.acknowledged !== operationId)
          throw new CommerceUnavailable();
      },
    },
    accountScope: () => session.accountScope(),
    subscribeAccountScope: (observer) => session.subscribeAccountScope(observer),
    async catalog(signal) {
      const reply = await post('catalog', {}, signal);
      const products =
        record(reply) && reply.schemaVersion === 1 && reply.platform === options.platform
          ? parseLiveProducts(reply.products)
          : null;
      if (!products) throw new CommerceUnavailable();
      return products;
    },
    wallet: async (signal) => wallet(await post('wallet', {}, signal)),
    async begin(key, platform, signal) {
      if (!catalog.has(key) || platform !== options.platform) throw new CommerceUnavailable();
      const reply = await post('begin', { key }, signal);
      if (
        !record(reply) ||
        reply.schemaVersion !== 1 ||
        typeof reply.accountToken !== 'string' ||
        !tokenPattern.test(reply.accountToken) ||
        typeof reply.sku !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(reply.sku)
      )
        throw new CommerceUnavailable();
      return { accountToken: reply.accountToken.toLowerCase(), sku: reply.sku };
    },
    async verify(proof: PurchaseProof, signal) {
      if (proof.platform !== options.platform) throw new CommerceUnavailable();
      const reply = await post('verify', { proof }, signal);
      if (!record(reply) || reply.schemaVersion !== 1) throw new CommerceUnavailable();
      if (reply.status === 'pending' || reply.status === 'rejected')
        return { status: reply.status };
      if (
        reply.status !== 'granted' ||
        reply.transactionId !== proof.transactionId ||
        typeof reply.consumable !== 'boolean'
      )
        throw new CommerceUnavailable();
      return {
        status: 'granted',
        transactionId: proof.transactionId,
        consumable: reply.consumable,
        wallet: wallet(reply),
      };
    },
    async equip(theme, signal) {
      if (!THEME_IDS.includes(theme)) throw new CommerceUnavailable();
      return wallet(await post('equip', { theme }, signal));
    },
  };
}
