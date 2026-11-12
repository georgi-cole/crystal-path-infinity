import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { getBuildInfo, requireEnvironment } from './config/environments.ts';
import { selectGuestAdUnits } from './config/guest-ad-inventory.ts';
import { assertUnsignedPublicVariables, resolveUnsignedRelease } from './config/release-build.ts';
import { assertOfflineCampaignBeta } from './config/campaign-beta.ts';
import { assertCampaignServices } from './config/campaign-services.ts';
import { assertCampaignRelease } from './config/campaign-release.ts';
import { assertCampaignWeb } from './config/campaign-web.ts';
import { resolveStoreBuild } from './config/store-build.ts';
import { productionMobileSignIn } from './config/mobile-sign-in.ts';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ mode }) => {
  const campaignBeta = mode === 'campaign-beta';
  const campaignServices = mode === 'campaign-services';
  const campaignRelease = mode === 'campaign-release';
  const campaignWeb = mode === 'campaign-web';
  // Both web review profiles use staging identity and can never become a release candidate.
  const preview = mode === 'qa' || mode === 'player-preview' || mode === 'campaign-qa';
  const environment = requireEnvironment(
    mode === 'test'
      ? 'development'
      : campaignBeta || campaignServices || campaignRelease || campaignWeb
        ? 'production'
        : preview
          ? 'staging'
          : mode,
  );
  const release =
    mode === 'test' ? null : resolveUnsignedRelease(environment, manifest.version, process.env);
  if ((preview || campaignBeta || campaignWeb) && release)
    throw new Error('Web review profiles cannot be included in an unsigned release candidate.');
  const values = loadEnv(mode, appRoot, 'VITE_');
  const serviceValues = {
    ...process.env,
    ...values,
    ...(campaignServices ? { CPI_CAMPAIGN_SERVICES: 'true' } : {}),
  };
  const mobileSignIn = productionMobileSignIn(environment, serviceValues);
  if (campaignBeta) assertOfflineCampaignBeta({ ...process.env, ...values });
  if (campaignServices) assertCampaignServices({ ...process.env, ...values });
  if (campaignRelease) assertCampaignRelease(serviceValues);
  if (campaignWeb) assertCampaignWeb(serviceValues);
  if (release || mode === 'player-preview') assertUnsignedPublicVariables(values);
  const store = resolveStoreBuild(environment, serviceValues);
  if (release && store) throw new Error('Store and unsigned release metadata cannot be combined.');
  const buildInfo = release?.app ?? getBuildInfo(environment, store?.version ?? manifest.version);
  const campaignBase =
    mode === 'campaign-qa' || campaignBeta || campaignServices || campaignRelease || campaignWeb
      ? spawnSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).stdout?.trim()
      : undefined;
  const guestAdUnits = selectGuestAdUnits({ ...process.env, ...values }, environment);
  return {
    root: appRoot,
    plugins: [
      react(),
      {
        name: 'crystal-path-build-identity',
        generateBundle() {
          if (campaignWeb)
            this.emitFile({
              type: 'asset',
              fileName: 'campaign-web-info.json',
              source:
                JSON.stringify({
                  schemaVersion: 1,
                  audience: 'public-browser',
                  sourceCommit: campaignBase,
                  campaign: true,
                  missions: 30,
                  simulatedPurchases: false,
                  purchases: 'mobile-app-only',
                  ads: 'unavailable',
                  progress: 'browser-local',
                }) + '\n',
            });
          if (campaignRelease)
            this.emitFile({
              type: 'asset',
              fileName: 'campaign-release-info.json',
              source:
                JSON.stringify({
                  schemaVersion: 1,
                  audience: 'campaign-release',
                  sourceCommit: campaignBase,
                  sandboxPurchases: false,
                  demonstrationAds: false,
                  simulatedPurchases: false,
                }) + '\n',
            });
          if (mobileSignIn)
            this.emitFile({
              type: 'asset',
              fileName: 'account-services-info.json',
              source: JSON.stringify(mobileSignIn) + '\n',
            });
          if (campaignServices)
            this.emitFile({
              type: 'asset',
              fileName: 'campaign-services-info.json',
              source:
                JSON.stringify({
                  schemaVersion: 1,
                  audience: 'campaign-services',
                  sourceCommit: campaignBase,
                  sandboxPurchases: true,
                  demonstrationAds: true,
                  simulatedPurchases: false,
                  playtestVersion: '0.7.4',
                }) + '\n',
            });
          if (campaignBeta)
            this.emitFile({
              type: 'asset',
              fileName: 'campaign-beta-info.json',
              source:
                JSON.stringify({
                  schemaVersion: 1,
                  audience: 'campaign-beta',
                  sourceCommit: campaignBase ?? null,
                  offline: true,
                  simulatedPurchases: true,
                  playtestVersion: '0.7.4',
                }) + '\n',
            });
          if (mode === 'qa')
            this.emitFile({
              type: 'asset',
              fileName: 'qa-info.json',
              source: JSON.stringify({ schemaVersion: 1, audience: 'qa', tools: true }) + '\n',
            });
          if (mode === 'campaign-qa')
            this.emitFile({
              type: 'asset',
              fileName: 'qa-info.json',
              source:
                JSON.stringify({
                  schemaVersion: 1,
                  audience: 'campaign-qa',
                  tools: 'offline-campaign',
                  playtestVersion: '0.7.4',
                  baseCommit: campaignBase || null,
                }) + '\n',
            });
          if (mode === 'player-preview')
            this.emitFile({
              type: 'asset',
              fileName: 'player-preview-info.json',
              source:
                JSON.stringify({ schemaVersion: 1, tools: false, simulatedStore: true }) + '\n',
            });
          this.emitFile({
            type: 'asset',
            fileName: 'build-info.json',
            source: `${JSON.stringify(buildInfo, null, 2)}\n`,
          });
          if (release)
            this.emitFile({
              type: 'asset',
              fileName: 'release-info.json',
              source: JSON.stringify(release, null, 2) + '\n',
            });
        },
      },
    ],
    define: {
      __CPI_BUILD_INFO__: JSON.stringify(buildInfo),
      __CPI_GUEST_AD_UNITS__: JSON.stringify(guestAdUnits),
    },
    server: { host: '127.0.0.1', port: 5174, strictPort: true },
    preview: { host: '127.0.0.1', port: 4174, strictPort: true },
    test: { environment: 'node', include: ['config/**/*.test.ts'] },
    build: {
      target: 'es2022',
      outDir:
        mode === 'qa'
          ? 'dist-qa'
          : mode === 'campaign-qa'
            ? 'dist-campaign-qa'
            : mode === 'player-preview'
              ? 'dist-player-preview'
              : 'dist',
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./index.html', import.meta.url)),
          account: fileURLToPath(new URL('./account.html', import.meta.url)),
        },
      },
    },
  };
});
