import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/v1/probe': 'http://127.0.0.1:8787' },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
  build: { target: 'es2022', sourcemap: false },
});
