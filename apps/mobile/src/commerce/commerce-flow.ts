import { CommerceUnavailable } from './commerce-types';
import type {
  CommerceGateway,
  CommerceWallet,
  NativeBillingAdapter,
  PricedProduct,
  PurchaseProof,
} from './commerce-types';
import type { ThemeId } from '../store-catalog';

export interface CommerceSnapshot {
  readonly phase:
    | 'unavailable'
    | 'idle'
    | 'loading'
    | 'ready'
    | 'purchasing'
    | 'recovering'
    | 'pending'
    | 'error';
  readonly products: readonly PricedProduct[];
  readonly wallet: CommerceWallet | null;
}
const empty: CommerceSnapshot = { phase: 'idle', products: [], wallet: null };

/** Native receipts are evidence for verification, never a client-created balance. */
export class CommerceFlow {
  private state: CommerceSnapshot = empty;
  private controller: AbortController | null = null;
  private scope: object | null;
  private generation = 0;
  private busy = false;
  private disposed = false;
  private observers = new Set<() => void>();
  private readonly unsubscribe: () => void;
  constructor(
    private readonly gateway: CommerceGateway,
    private readonly native: NativeBillingAdapter,
  ) {
    this.scope = gateway.accountScope();
    this.state = { ...empty, phase: this.scope && native.available ? 'idle' : 'unavailable' };
    this.unsubscribe = gateway.subscribeAccountScope(() => {
      if (gateway.accountScope() === this.scope) return;
      this.scope = gateway.accountScope();
      this.generation++;
      this.controller?.abort();
      this.controller = null;
      // A displayed native checkout still owns the purchase lock until it closes.
      this.update({ ...empty, phase: this.scope && native.available ? 'idle' : 'unavailable' });
    });
  }
  snapshot = (): CommerceSnapshot => this.state;
  subscribe = (observer: () => void): (() => void) => {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  };
  private update(state: CommerceSnapshot) {
    this.state = state;
    for (const observer of this.observers) {
      try {
        observer();
      } catch {
        /* A view cannot interrupt durable purchase delivery. */
      }
    }
  }
  private async operation(
    phase: CommerceSnapshot['phase'],
    work: (current: () => boolean, signal: AbortSignal) => Promise<void>,
  ) {
    if (this.disposed || this.busy || !this.native.available || !this.gateway.accountScope())
      return;
    this.busy = true;
    const epoch = this.generation,
      scope = this.gateway.accountScope();
    const controller = new AbortController();
    this.controller = controller;
    const current = () =>
      epoch === this.generation &&
      scope === this.gateway.accountScope() &&
      !controller.signal.aborted;
    this.update({ ...this.state, phase });
    try {
      await work(current, controller.signal);
    } catch {
      if (current()) this.update({ ...this.state, phase: 'error' });
    } finally {
      this.busy = false;
      if (this.controller === controller) this.controller = null;
    }
  }
  private accept(wallet: CommerceWallet, accountToken?: string) {
    if (accountToken && wallet.accountToken !== accountToken) throw new CommerceUnavailable();
    if (
      this.state.wallet &&
      (wallet.accountToken !== this.state.wallet.accountToken ||
        wallet.revision < this.state.wallet.revision)
    )
      throw new CommerceUnavailable();
    this.update({ ...this.state, wallet });
  }
  load = async (): Promise<void> =>
    this.operation('loading', async (current, signal) => {
      const catalog = await this.gateway.catalog(signal);
      if (!current()) return;
      const wallet = await this.gateway.wallet(signal);
      if (!current()) return;
      const products = await this.native.prices(catalog);
      if (!current()) return;
      this.accept(wallet);
      this.update({ ...this.state, phase: 'ready', products });
    });
  private async deliver(
    receipt: PurchaseProof,
    current: () => boolean,
    signal: AbortSignal,
  ): Promise<boolean> {
    const product = this.state.products.find((item) => item.sku === receipt.sku);
    if (
      !product ||
      receipt.accountToken !== this.state.wallet?.accountToken ||
      receipt.platform !== this.native.platform
    )
      throw new CommerceUnavailable();
    const verified = await this.gateway.verify(receipt, signal);
    if (!current()) return false;
    if (verified.status === 'rejected') throw new CommerceUnavailable();
    if (verified.status !== 'granted') return false;
    if (verified.transactionId !== receipt.transactionId) throw new CommerceUnavailable();
    this.accept(verified.wallet, receipt.accountToken);
    // Delivery has already committed on the server. A finish failure is recoverable without re-crediting.
    await this.native.finish(receipt, product.consumable);
    return current();
  }
  buy = async (key: string): Promise<void> =>
    this.operation('purchasing', async (current, signal) => {
      const product = this.state.products.find((item) => item.key === key);
      if (!product || !this.state.wallet) throw new CommerceUnavailable();
      const permit = await this.gateway.begin(key, this.native.platform, signal);
      if (!current()) return;
      if (permit.accountToken !== this.state.wallet.accountToken) throw new CommerceUnavailable();
      const outcome = await this.native.purchase(product, permit.accountToken);
      if (!current()) return;
      if (outcome.status === 'cancelled') {
        this.update({ ...this.state, phase: 'ready' });
        return;
      }
      const delivered =
        outcome.status === 'purchased' ? await this.deliver(outcome.proof, current, signal) : false;
      if (current()) this.update({ ...this.state, phase: delivered ? 'ready' : 'pending' });
    });
  recover = async (): Promise<void> =>
    this.operation('recovering', async (current, signal) => {
      const wallet = this.state.wallet;
      if (!wallet) throw new CommerceUnavailable();
      const receipts = await this.native.recover(wallet.accountToken);
      if (!current()) return;
      let pending = false;
      for (const receipt of receipts) {
        if (!current()) return;
        pending = !(await this.deliver(receipt, current, signal)) || pending;
      }
      if (current()) this.update({ ...this.state, phase: pending ? 'pending' : 'ready' });
    });
  equip = async (theme: ThemeId): Promise<void> =>
    this.operation('loading', async (current, signal) => {
      const wallet = await this.gateway.equip(theme, signal);
      if (!current()) return;
      this.accept(wallet);
      this.update({ ...this.state, phase: 'ready' });
    });
  dispose() {
    this.disposed = true;
    this.generation++;
    this.controller?.abort();
    this.unsubscribe();
    this.update({ ...empty, phase: 'unavailable' });
    this.observers.clear();
  }
}
