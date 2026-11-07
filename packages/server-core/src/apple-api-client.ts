import { AppStoreServerAPIClient, Environment } from '@apple/app-store-server-library';
import nodeFetch from 'node-fetch';
/** SDK HTTP hook: fixed app-store origin, deadline, response bound and no redirects. */
export function createBoundedAppleApiClient(options: {
  signingKey: string;
  keyId: string;
  issuerId: string;
  bundleId: string;
  environment: 'production' | 'sandbox';
}) {
  const base =
    options.environment === 'production'
      ? 'https://api.storekit.apple.com'
      : 'https://api.storekit-sandbox.apple.com';
  class Client extends AppStoreServerAPIClient {
    protected override makeFetchRequest(
      path: string,
      query: URLSearchParams,
      method: string,
      body: string | Buffer | undefined,
      headers: Record<string, string>,
    ) {
      const target = new URL(base + path);
      if (
        target.origin !== base ||
        !target.pathname.startsWith('/inApps/') ||
        target.search ||
        target.hash
      )
        throw new Error('Invalid Apple API path');
      return nodeFetch(target.href + '?' + query.toString(), {
        method,
        body,
        headers,
        redirect: 'error',
        timeout: 10000,
        size: 1048576,
      });
    }
  }
  return new Client(
    options.signingKey,
    options.keyId,
    options.issuerId,
    options.bundleId,
    options.environment === 'production' ? Environment.PRODUCTION : Environment.SANDBOX,
  );
}
