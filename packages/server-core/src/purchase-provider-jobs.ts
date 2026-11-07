import { createHash } from 'node:crypto';
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library';
import type { AppStoreServerAPIClient } from '@apple/app-store-server-library';
import type { PurchaseProof } from './purchase-verification.ts';
import type { VerifiedRefund } from './purchase-maintenance.ts';
import { syncCursor } from './purchase-maintenance.ts';
import { isObject, providerJson } from './private-services.ts';
const DAY = 86400_000;
const fingerprint = (platform: string, env: string, id: string) =>
  createHash('sha256')
    .update(platform + ':' + env + ':' + id)
    .digest('hex');

export function createGooglePurchaseJobs(options: {
  packageName: string;
  environment: 'sandbox' | 'production';
  accessToken: () => Promise<string>;
  fetcher?: typeof fetch;
  now?: () => number;
}) {
  if (!/^[A-Za-z0-9_.]+$/.test(options.packageName)) throw new Error('Invalid Android package');
  const base =
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
      encodeURIComponent(options.packageName),
    fetcher = options.fetcher ?? fetch,
    now = options.now ?? Date.now;
  async function read(proof: PurchaseProof) {
    const data = await providerJson(
      base + '/purchases/productsv2/tokens/' + encodeURIComponent(proof.purchaseToken!),
      { headers: { authorization: 'Bearer ' + (await options.accessToken()) } },
      fetcher,
    );
    if (
      !isObject(data) ||
      data.orderId !== proof.transactionId ||
      typeof data.obfuscatedExternalAccountId !== 'string' ||
      data.obfuscatedExternalAccountId.toLowerCase() !== proof.accountToken ||
      (data.testPurchaseContext !== undefined) !== (options.environment === 'sandbox') ||
      !isObject(data.purchaseStateContext) ||
      data.purchaseStateContext.purchaseState !== 'PURCHASED' ||
      !Array.isArray(data.productLineItem) ||
      data.productLineItem.length !== 1 ||
      !isObject(data.productLineItem[0]) ||
      data.productLineItem[0].productId !== proof.sku
    )
      throw new Error('Purchase no longer valid');
    return data;
  }
  async function acknowledge(proof: PurchaseProof) {
    if (proof.platform !== 'android' || !proof.purchaseToken)
      throw new Error('Invalid Android job');
    if ((await read(proof)).acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') return;
    const response = await fetcher(
      base +
        '/purchases/products/' +
        encodeURIComponent(proof.sku) +
        '/tokens/' +
        encodeURIComponent(proof.purchaseToken) +
        ':acknowledge',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + (await options.accessToken()),
          'content-type': 'application/json',
        },
        body: '{}',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      },
    );
    await response.body?.cancel();
    // Native finish can win the race after our GET; accept only a fresh authoritative acknowledgement.
    if (
      !response.ok &&
      (await read(proof)).acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
    )
      throw new Error('Purchase acknowledgement unavailable');
  }
  async function voidedPage(value: unknown) {
    const cursor = syncCursor(value);
    if (cursor.start < now() - 30 * DAY || cursor.end > now() + MINUTE)
      throw new Error('Google reconciliation window expired');
    const query = new URLSearchParams({
      startTime: String(cursor.start),
      endTime: String(cursor.end),
      type: '0',
      maxResults: '20',
      includeQuantityBasedPartialRefund: 'true',
      ...(cursor.page ? { token: cursor.page } : {}),
    });
    const result = await providerJson(
      base + '/purchases/voidedpurchases?' + query.toString(),
      { headers: { authorization: 'Bearer ' + (await options.accessToken()) } },
      fetcher,
    );
    if (
      !isObject(result) ||
      (result.voidedPurchases !== undefined && !Array.isArray(result.voidedPurchases))
    )
      throw new Error('Invalid Google response');
    const rows = result.voidedPurchases ?? [];
    if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Invalid Google page');
    const events: VerifiedRefund[] = [];
    for (const row of rows) {
      if (
        !isObject(row) ||
        typeof row.purchaseToken !== 'string' ||
        row.purchaseToken.length > 8192 ||
        typeof row.orderId !== 'string' ||
        row.orderId.length > 256 ||
        typeof row.voidedTimeMillis !== 'string' ||
        !/^\d{1,16}$/.test(row.voidedTimeMillis) ||
        (row.voidedQuantity !== undefined && row.voidedQuantity !== 1)
      )
        throw new Error('Invalid voided purchase');
      events.push({
        fingerprint: fingerprint('android', options.environment, row.purchaseToken),
        platform: 'android',
        environment: options.environment,
        transactionId: row.orderId,
        eventId: row.orderId + ':' + row.voidedTimeMillis,
        effectiveAt: Number(row.voidedTimeMillis),
      });
    }
    const nextToken =
      isObject(result.tokenPagination) && typeof result.tokenPagination.nextPageToken === 'string'
        ? result.tokenPagination.nextPageToken
        : null;
    return {
      events,
      next: nextToken
        ? { ...cursor, page: nextToken }
        : { start: Math.max(cursor.end - DAY, now() - 29 * DAY), end: now(), page: null },
    };
  }
  return { acknowledge, voidedPage };
}
const MINUTE = 60_000;
export function createApplePurchaseJobs(options: {
  roots: readonly Buffer[];
  bundleId: string;
  appleAppId: number;
  environment: 'sandbox' | 'production';
  api: Pick<AppStoreServerAPIClient, 'getNotificationHistory'>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const verifier = new SignedDataVerifier(
    [...options.roots],
    true,
    options.environment === 'production' ? Environment.PRODUCTION : Environment.SANDBOX,
    options.bundleId,
    options.appleAppId,
  );
  async function notification(
    signedPayload: string,
  ): Promise<(VerifiedRefund & { reverse?: boolean }) | null> {
    if (signedPayload.length > 65536) throw new Error('Apple notification too large');
    const notice = await verifier.verifyAndDecodeNotification(signedPayload);
    if (!notice.notificationUUID || !notice.signedDate || notice.signedDate > now() + 5 * MINUTE)
      throw new Error('Invalid Apple event');
    if (!['REFUND', 'REVOKE', 'REFUND_REVERSED'].includes(notice.notificationType ?? ''))
      return null;
    if (!notice.data?.signedTransactionInfo) throw new Error('Missing Apple transaction');
    const transaction = await verifier.verifyAndDecodeTransaction(
      notice.data.signedTransactionInfo,
    );
    if (
      !transaction.transactionId ||
      transaction.bundleId !== options.bundleId ||
      transaction.quantity !== 1 ||
      !transaction.productId
    )
      throw new Error('Invalid Apple transaction');
    // Both the notification and its nested transaction are verified for the configured app/environment.
    return {
      fingerprint: fingerprint('ios', options.environment, transaction.transactionId),
      platform: 'ios',
      environment: options.environment,
      transactionId: transaction.transactionId,
      eventId: notice.notificationUUID,
      effectiveAt: notice.signedDate,
      ...(notice.notificationType === 'REFUND_REVERSED' ? { reverse: true } : {}),
    };
  }
  async function historyPage(value: unknown) {
    const cursor = syncCursor(value);
    if (cursor.start < now() - 180 * DAY || cursor.end > now() + MINUTE)
      throw new Error('Apple reconciliation window expired');
    const result = await options.api.getNotificationHistory(cursor.page, {
      startDate: cursor.start,
      endDate: cursor.end,
    });
    const history = result.notificationHistory ?? (result.hasMore === false ? [] : null);
    if (
      !Array.isArray(history) ||
      history.length > 1000 ||
      (result.hasMore && !result.paginationToken)
    )
      throw new Error('Invalid Apple history');
    const events: (VerifiedRefund & { reverse?: boolean })[] = [];
    for (const row of history) {
      if (!row.signedPayload) throw new Error('Invalid Apple history row');
      const event = await notification(row.signedPayload);
      if (event) events.push(event);
    }
    return {
      events,
      next: result.hasMore
        ? { ...cursor, page: result.paginationToken! }
        : { start: Math.max(cursor.end - DAY, now() - 179 * DAY), end: now(), page: null },
    };
  }
  return { notification, historyPage };
}
