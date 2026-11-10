/// <reference types="vite/client" />

import type { GuestAdUnits } from '../config/guest-ad-inventory';

declare global {
  const __CPI_GUEST_AD_UNITS__: GuestAdUnits | null;
  const __CPI_BUILD_INFO__: Readonly<{
    schemaVersion: 1;
    environment: 'development' | 'staging' | 'production';
    appId: string;
    appName: string;
    version: string;
  }>;
}
