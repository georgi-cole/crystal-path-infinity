import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertBuiltEnvironment, getBuildInfo, requireEnvironment } from './config/environments';
import { readNativeIntegrations } from './config/native-integrations';
import {
  assertUnsignedPublicVariables,
  assertUnsignedRelease,
  resolveUnsignedRelease,
} from './config/release-build';
import { resolveStoreBuild } from './config/store-build';

const CPI_BRAND_BACKGROUND = '#000000';

// Capacitor 8.5.3 loads this TypeScript file through its CommonJS config loader.
const environment = requireEnvironment(process.env.CPI_APP_ENV ?? 'development');
const mobilePackage = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};
const release = resolveUnsignedRelease(environment, mobilePackage.version, process.env);
const store = resolveStoreBuild(environment, process.env);
const integrations = readNativeIntegrations(process.env, environment);
if (release && (integrations.ads || integrations.purchases))
  throw new Error('The existing unsigned preparation profile does not activate native services.');
const build = release?.app ?? getBuildInfo(environment, store?.version ?? mobilePackage.version);
const metadataPath = join(__dirname, 'dist', 'build-info.json');
const copiesAssets = process.argv
  .slice(2)
  .some((argument) => ['add', 'copy', 'sync', 'build', 'run'].includes(argument));
if (
  copiesAssets &&
  ['qa-info.json', 'player-preview-info.json'].some((marker) =>
    existsSync(join(__dirname, 'dist', marker)),
  )
)
  throw new Error(
    'Simulated web preview assets cannot be copied into a player native build. Rebuild player assets first.',
  );

const releaseMetadataPath = join(__dirname, 'dist', 'release-info.json');
if (release) {
  assertUnsignedPublicVariables(process.env);
  if (existsSync(releaseMetadataPath))
    assertUnsignedRelease(JSON.parse(readFileSync(releaseMetadataPath, 'utf8')), release);
  else if (copiesAssets)
    throw new Error('Build the matching unsigned release metadata before copying native assets.');
} else if (copiesAssets && existsSync(releaseMetadataPath)) {
  throw new Error('Rebuild ordinary assets before copying an unsigned candidate into development.');
}

if (existsSync(metadataPath)) {
  assertBuiltEnvironment(
    JSON.parse(readFileSync(metadataPath, 'utf8')),
    environment,
    build.version,
  );
} else if (copiesAssets) {
  throw new Error(
    `Build apps/mobile for ${environment} first: dist/build-info.json is required before native asset copying.`,
  );
}

const debugging = environment === 'development';
const config: CapacitorConfig = {
  appId: build.appId,
  appName: build.appName,
  webDir: 'dist',
  backgroundColor: CPI_BRAND_BACKGROUND,
  // Installed SDKs stay out of the native app until explicitly configured.
  includePlugins: integrations.plugins,
  server: { cleartext: false },
  // SystemBars ships with Capacitor core. Keep light icons on this dark shell
  // and use native insets; the CSS already consumes env(safe-area-inset-*).
  plugins: {
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
    ...(integrations.purchases ? { NativePurchases: { autoFinishTransactions: false } } : {}),
  },
  android: {
    backgroundColor: CPI_BRAND_BACKGROUND,
    allowMixedContent: false,
    webContentsDebuggingEnabled: debugging,
  },
  ios: {
    backgroundColor: CPI_BRAND_BACKGROUND,
    contentInset: 'never',
    preferredContentMode: 'mobile',
    webContentsDebuggingEnabled: debugging,
  },
};

export default config;
