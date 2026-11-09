import pg from 'pg';
import { createAppleSandboxVerifier } from '../../../packages/server-core/src/apple-sandbox-verifier.ts';
import { createBoundedAppleApiClient } from '../../../packages/server-core/src/apple-api-client.ts';
import { readLiveConfiguration } from '../../../packages/server-core/src/live-configuration.ts';
import { createProjectSqlPool } from '../../../packages/server-core/src/supabase-database.ts';
import { privateCryptography } from '../../../packages/server-core/src/private-services.ts';
import { createAccountIssuer } from '../../../packages/server-core/src/account-issuer.ts';
import {
  createResendAccountMailer,
  createSupabaseAccountDirectory,
} from '../../../packages/server-core/src/account-providers.ts';
import {
  createGooglePlayAccessToken,
  createGooglePurchaseVerifier,
  createApplePurchaseVerifier,
} from '../../../packages/server-core/src/purchase-verification.ts';
import { createCommerceService } from '../../../packages/server-core/src/commerce-service.ts';
import { createPurchaseMaintenance } from '../../../packages/server-core/src/purchase-maintenance.ts';
import {
  createGooglePurchaseJobs,
  createApplePurchaseJobs,
} from '../../../packages/server-core/src/purchase-provider-jobs.ts';
import { createDurableRateLimit } from '../../../packages/server-core/src/durable-rate-limit.ts';
import { createLiveServer } from '../../../packages/server-core/src/live-server.ts';
import { APPLE_ROOT_G3 } from '../../../packages/server-core/src/apple-root.ts';
import type { PurchaseVerifier } from '../../../packages/server-core/src/purchase-verification.ts';

function closed() {
  return Promise.resolve(
    new Response('{"code":"service_unavailable"}', {
      status: 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    }),
  );
}

export function createCpiLiveFunction(env: (name: string) => string | undefined) {
  let handler: (request: Request) => Promise<Response> = closed;
  try {
    const config = readLiveConfiguration(env);
    if (config) {
      const database = createProjectSqlPool(
        config.projectRef,
        config.databaseUrl,
        (options) => new pg.Client(options),
        'cpi_runtime',
        config.databaseCa,
      );
      const crypto = privateCryptography(config.pepper, config.encryptionKey);
      const issuer = createAccountIssuer({
        database,
        crypto,
        policy: config.policy,
        directory: createSupabaseAccountDirectory({
          url: config.url,
          serviceKey: config.serviceKey,
          database,
        }),
        mailer: createResendAccountMailer({ apiKey: config.mailKey, from: config.mailFrom }),
        stagingTestEmails: config.stagingTestEmails,
      });
      const googleToken = config.purchasePlatforms.includes('android')
        ? createGooglePlayAccessToken({
            clientEmail: config.googleClientEmail!,
            privateKey: config.googlePrivateKey!,
          })
        : null;
      const googleJobs = googleToken
        ? createGooglePurchaseJobs({
            packageName: 'com.georgicole.crystalpath.infinity',
            environment: config.purchaseEnvironment,
            accessToken: googleToken,
          })
        : undefined;
      const appleApi = config.purchasePlatforms.includes('ios')
        ? createBoundedAppleApiClient({
            signingKey: config.applePrivateKey!,
            keyId: config.appleKeyId!,
            issuerId: config.appleIssuerId!,
            bundleId: 'com.georgicole.crystalpath.infinity',
            environment: config.purchaseEnvironment,
          })
        : null;
      const appleSignedVerifier = config.appleSandboxVerifierKey
        ? createAppleSandboxVerifier(config.appleSandboxVerifierKey)
        : undefined;
      const appleJobs = appleApi
        ? createApplePurchaseJobs({
            roots: [APPLE_ROOT_G3],
            signedVerifier: appleSignedVerifier,
            bundleId: 'com.georgicole.crystalpath.infinity',
            appleAppId: 6831790531,
            environment: config.purchaseEnvironment,
            api: appleApi,
          })
        : undefined;
      const googleVerify = googleToken
        ? createGooglePurchaseVerifier({
            packageName: 'com.georgicole.crystalpath.infinity',
            environment: config.purchaseEnvironment,
            accessToken: googleToken,
          })
        : null;
      const appleVerify = appleApi
        ? createApplePurchaseVerifier({
            roots: [APPLE_ROOT_G3],
            signedVerifier: appleSignedVerifier,
            bundleId: 'com.georgicole.crystalpath.infinity',
            appleAppId: 6831790531,
            environment: config.purchaseEnvironment,
            api: appleApi,
          })
        : null;
      const verifyPurchase: PurchaseVerifier = (proof) =>
        proof.platform === 'android' && googleVerify
          ? googleVerify(proof)
          : proof.platform === 'ios' && appleVerify
            ? appleVerify(proof)
            : Promise.resolve({ status: 'rejected' });
      const maintenance = createPurchaseMaintenance({
        database,
        crypto,
        acknowledgeAndroid: (proof) =>
          googleJobs
            ? googleJobs.acknowledge(proof)
            : Promise.reject(new Error('Purchases disabled')),
      });
      const live = createLiveServer({
        database,
        issuer,
        environment: config.environment,
        origins: config.origins,
        gatewayKey: config.gatewayKey,
        workerKey: config.workerKey,
        rateLimit: createDurableRateLimit(database, crypto),
        rewardsEnabled: config.rewardsEnabled,
        purchasesEnabled: config.purchasesEnabled,
        purchasePlatforms: config.purchasePlatforms,
        commerce: createCommerceService({
          database,
          products: config.products,
          verifyPurchase,
          economyReady: config.purchasesEnabled,
          completionCrypto: crypto,
        }),
        maintenance,
        googleJobs,
        appleJobs,
      });
      handler = (request) => {
        const url = new URL(request.url);
        const match = /^(?:\/functions\/v1)?\/cpi-live(\/.*)$/.exec(url.pathname);
        if (!match) return closed();
        // Fixed public origin/mount, including on the Supabase internal HTTP listener.
        // Preserve the provider's raw query bytes for signed SSV validation.
        return live(
          new Request(config.url + '/functions/v1/cpi-live' + match[1] + url.search, request),
        );
      };
    }
  } catch {
    /* Configuration errors cannot expose credentials, mail addresses or provider responses. */
  }

  return handler;
}
