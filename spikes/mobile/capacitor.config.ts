import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.georgicole.crystalpath.spike',
  appName: 'Crystal Path Lab',
  webDir: 'dist',
  backgroundColor: '#080c1b',
  ios: { contentInset: 'never', preferredContentMode: 'mobile' },
  android: { backgroundColor: '#080c1b' },
};
export default config;
