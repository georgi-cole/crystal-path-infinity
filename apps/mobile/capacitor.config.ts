import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertBuiltEnvironment, getBuildInfo, requireEnvironment } from './config/environments';

// Capacitor 8.5.3 loads this TypeScript file through its CommonJS config loader.
const environment = requireEnvironment(process.env.CPI_APP_ENV ?? 'development');
const mobilePackage = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};
const build = getBuildInfo(environment, mobilePackage.version);
const metadataPath = join(__dirname, 'dist', 'build-info.json');
const copiesAssets = process.argv
  .slice(2)
  .some((argument) => ['add', 'copy', 'sync', 'build', 'run'].includes(argument));

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
  backgroundColor: '#080c1b',
  server: { cleartext: false },
  // SystemBars ships with Capacitor core. Keep light icons on this dark shell
  // and use native insets; the CSS already consumes env(safe-area-inset-*).
  plugins: {
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
  },
  android: {
    backgroundColor: '#080c1b',
    allowMixedContent: false,
    webContentsDebuggingEnabled: debugging,
  },
  ios: {
    backgroundColor: '#080c1b',
    contentInset: 'never',
    preferredContentMode: 'mobile',
    webContentsDebuggingEnabled: debugging,
  },
};

export default config;
