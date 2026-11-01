/// <reference types="vite/client" />

export {};

declare global {
  const __CPI_BUILD_INFO__: Readonly<{
    schemaVersion: 1;
    environment: 'development' | 'staging' | 'production';
    appId: string;
    appName: string;
    version: string;
  }>;
}
