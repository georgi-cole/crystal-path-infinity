import type { ThemeId } from '../store-catalog';

export type BillingPlatform = 'android' | 'ios';
export interface LiveProduct {
  readonly key: string;
  readonly sku: string;
  readonly consumable: boolean;
}
export interface PricedProduct extends LiveProduct {
  readonly displayPrice: string;
}
export interface PurchaseProof {
  readonly platform: BillingPlatform;
  readonly sku: string;
  readonly transactionId: string;
  readonly accountToken: string;
  readonly purchaseToken?: string;
  readonly signedTransaction?: string;
}
export interface CommerceWallet {
  readonly revision: number;
  /** Random billing alias issued by our server, never the Auth user ID. */
  readonly accountToken: string;
  readonly sp: number;
  readonly hints: number;
  readonly credits: number;
  readonly shields: number;
  readonly seasonChanges: number;
  readonly unlocks: readonly string[];
  readonly owned: readonly ThemeId[];
  readonly equipped: ThemeId;
}
export interface NativeBillingAdapter {
  readonly available: boolean;
  readonly platform: BillingPlatform;
  prices(this: void, products: readonly LiveProduct[]): Promise<readonly PricedProduct[]>;
  purchase(
    this: void,
    product: LiveProduct,
    accountToken: string,
  ): Promise<{ status: 'purchased'; proof: PurchaseProof } | { status: 'cancelled' | 'pending' }>;
  recover(this: void, accountToken: string): Promise<readonly PurchaseProof[]>;
  finish(this: void, proof: PurchaseProof, consumable: boolean): Promise<void>;
}
export interface CommerceGateway {
  readonly offlineSupplies?: {
    pending(
      signal: AbortSignal,
    ): Promise<{ allocations: readonly OfflineAllocation[]; wallet: CommerceWallet }>;
    allocate(
      operationId: string,
      amounts: OfflineSupplyAmounts,
      signal: AbortSignal,
    ): Promise<{ allocation: OfflineAllocation; wallet: CommerceWallet }>;
    acknowledge(operationId: string, signal: AbortSignal): Promise<void>;
  };
  accountScope(this: void): object | null;
  subscribeAccountScope(this: void, observer: () => void): () => void;
  catalog(this: void, signal: AbortSignal): Promise<readonly LiveProduct[]>;
  wallet(this: void, signal: AbortSignal): Promise<CommerceWallet>;
  begin(
    this: void,
    key: string,
    platform: BillingPlatform,
    signal: AbortSignal,
  ): Promise<{ accountToken: string; sku: string }>;
  verify(
    this: void,
    proof: PurchaseProof,
    signal: AbortSignal,
  ): Promise<
    | { status: 'pending' | 'rejected' }
    | { status: 'granted'; transactionId: string; consumable: boolean; wallet: CommerceWallet }
  >;
  equip(this: void, theme: ThemeId, signal: AbortSignal): Promise<CommerceWallet>;
}
export interface OfflineSupplyAmounts {
  readonly sp: number;
  readonly hints: number;
  readonly credits: number;
  readonly shields: number;
  readonly seasonChanges: number;
}
export interface OfflineAllocation extends OfflineSupplyAmounts {
  readonly operationId: string;
}
export class CommerceUnavailable extends Error {
  constructor() {
    super('Purchase service unavailable');
    this.name = 'CommerceUnavailable';
  }
}
