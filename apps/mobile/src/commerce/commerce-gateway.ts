import type { AccountSessionOwner } from '../account/session-owner';
import { STORE_PRODUCTS, THEME_IDS } from '../store-catalog';
import type { ThemeId } from '../store-catalog';
import { CommerceUnavailable } from './commerce-types';
import type {
  BillingPlatform,
  CommerceGateway,
  CommerceWallet,
  LiveProduct,
  PurchaseProof,
} from './commerce-types';

const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const catalog = new Map(
  STORE_PRODUCTS.map((product) => [product.id.replace(/^test\./, ''), product]),
);
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
export function parseCommerceWallet(value: unknown): CommerceWallet | null {
  if (
    !record(value) ||
    !integer(value.revision) ||
    !integer(value.sp) ||
    !integer(value.hints) ||
    !integer(value.credits) ||
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
  return {
    revision: value.revision,
    accountToken: value.accountToken.toLowerCase(),
    sp: value.sp,
    hints: value.hints,
    credits: value.credits,
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
      product.consumable !== (catalog.get(product.key)!.kind !== 'theme') ||
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
  async function post(
    route: 'catalog' | 'wallet' | 'begin' | 'verify' | 'equip',
    payload: object,
    signal: AbortSignal,
  ) {
    return session.withAccountRequest(async (lease) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      lease.signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted || lease.signal.aborted) abort();
      const timeout = setTimeout(abort, 15000);
      try {
        return await json(
          await fetcher(endpoint + route, {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              authorization: 'Bearer ' + lease.accessToken,
            },
            body: JSON.stringify({ schemaVersion: 1, platform: options.platform, ...payload }),
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            signal: controller.signal,
          }),
        );
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
    return parsed;
  }
  return {
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
        !tokenPattern.test(reply.accountToken)
      )
        throw new CommerceUnavailable();
      return { accountToken: reply.accountToken };
    },
    async verify(proof: PurchaseProof, signal) {
      if (proof.platform !== options.platform) throw new CommerceUnavailable();
      const reply = await post('verify', { proof }, signal);
      if (!record(reply) || reply.schemaVersion !== 1) throw new CommerceUnavailable();
      if (reply.status === 'pending' || reply.status === 'rejected')
        return { status: reply.status };
      if (reply.status !== 'granted' || reply.transactionId !== proof.transactionId)
        throw new CommerceUnavailable();
      return { status: 'granted', transactionId: proof.transactionId, wallet: wallet(reply) };
    },
    async equip(theme, signal) {
      if (!THEME_IDS.includes(theme)) throw new CommerceUnavailable();
      return wallet(await post('equip', { theme }, signal));
    },
  };
}
