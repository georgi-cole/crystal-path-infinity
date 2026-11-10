import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { getBuildInfo, requireEnvironment } from './config/environments.ts';
import { selectGuestAdUnits } from './config/guest-ad-inventory.ts';
import { assertUnsignedPublicVariables, resolveUnsignedRelease } from './config/release-build.ts';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ mode }) => {
  // Both web review profiles use staging identity and can never become a release candidate.
  const preview = mode === 'qa' || mode === 'player-preview';
  const environment = requireEnvironment(
    mode === 'test' ? 'development' : preview ? 'staging' : mode,
  );
  const release =
    mode === 'test' ? null : resolveUnsignedRelease(environment, manifest.version, process.env);
  if (preview && release)
    throw new Error('Web review profiles cannot be included in an unsigned release candidate.');
  const values = loadEnv(mode, appRoot, 'VITE_');
  if (release || mode === 'player-preview') assertUnsignedPublicVariables(values);
  const buildInfo = release?.app ?? getBuildInfo(environment, manifest.version);
  const guestAdUnits = selectGuestAdUnits({ ...process.env, ...values }, environment);
  return {
    root: appRoot,
    plugins: [
      react(),
      {
        name: 'crystal-path-build-identity',
        generateBundle() {
          if (mode === 'qa')
            this.emitFile({
              type: 'asset',
              fileName: 'qa-info.json',
              source: JSON.stringify({ schemaVersion: 1, audience: 'qa', tools: true }) + '\n',
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
        mode === 'qa' ? 'dist-qa' : mode === 'player-preview' ? 'dist-player-preview' : 'dist',
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./index.html', import.meta.url)),
          account: fileURLToPath(new URL('./account.html', import.meta.url)),
        },
      },
    },
  };
});
