import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { getBuildInfo, requireEnvironment } from './config/environments.ts';
import { assertUnsignedPublicVariables, resolveUnsignedRelease } from './config/release-build.ts';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ mode }) => {
  // Vitest uses its own test mode; application builds accept only named environments.
  const environment = requireEnvironment(mode === 'test' ? 'development' : mode);
  const release =
    mode === 'test' ? null : resolveUnsignedRelease(environment, manifest.version, process.env);
  if (release) assertUnsignedPublicVariables(loadEnv(mode, appRoot, 'VITE_'));
  const buildInfo = release?.app ?? getBuildInfo(environment, manifest.version);
  return {
    root: appRoot,
    plugins: [
      react(),
      {
        name: 'crystal-path-build-identity',
        generateBundle() {
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
    define: { __CPI_BUILD_INFO__: JSON.stringify(buildInfo) },
    server: { host: '127.0.0.1', port: 5174, strictPort: true },
    preview: { host: '127.0.0.1', port: 4174, strictPort: true },
    test: { environment: 'node', include: ['config/**/*.test.ts'] },
    build: { target: 'es2022' },
  };
});
