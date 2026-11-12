import type { PracticeStorage } from './practice-save';

/** Build-time only. A URL, saved setting or guest profile cannot enable QA. */
export const QA_TOOLS_ENABLED =
  import.meta.env.MODE === 'development' ||
  import.meta.env.MODE === 'qa' ||
  import.meta.env.MODE === 'campaign-qa' ||
  import.meta.env.MODE === 'campaign-beta' ||
  import.meta.env.MODE === 'test';
export const CAMPAIGN_TEST_BUILD =
  import.meta.env.MODE === 'campaign-qa' || import.meta.env.MODE === 'campaign-beta';
export const CAMPAIGN_SERVICES_BUILD = import.meta.env.MODE === 'campaign-services';
export const CAMPAIGN_RELEASE_BUILD = import.meta.env.MODE === 'campaign-release';
export const CAMPAIGN_WEB_BUILD = import.meta.env.MODE === 'campaign-web';
export const CAMPAIGN_COMMERCE_ENABLED = CAMPAIGN_SERVICES_BUILD || CAMPAIGN_RELEASE_BUILD;
export const CAMPAIGN_ENABLED =
  CAMPAIGN_TEST_BUILD || CAMPAIGN_COMMERCE_ENABLED || CAMPAIGN_WEB_BUILD;

/** A guest review build uses the player controls with a browser-only simulated wallet. */
export const PLAYER_PREVIEW_ENABLED = import.meta.env.MODE === 'player-preview';
export const SIMULATED_STORE_ENABLED = QA_TOOLS_ENABLED || PLAYER_PREVIEW_ENABLED;
export const PLAYER_STORAGE_PREFIX = 'cpi.player.v1:';
export const CAMPAIGN_TEST_STORAGE_PREFIX = 'cpi.campaign-qa.v1:';
export const CAMPAIGN_SERVICES_STORAGE_PREFIX = 'cpi.campaign-services.v1:';
export const CAMPAIGN_RELEASE_STORAGE_PREFIX = 'cpi.campaign-production.v1:';
export const CAMPAIGN_WEB_STORAGE_PREFIX = 'cpi.campaign-web.v1:';

/** QA keeps its historical data; player saves/records/discoveries use a separate namespace. */
export function profilePracticeStorage(
  storage: PracticeStorage,
  profile: 'player' | 'qa' | 'campaign-qa' = CAMPAIGN_TEST_BUILD
    ? 'campaign-qa'
    : QA_TOOLS_ENABLED
      ? 'qa'
      : 'player',
): PracticeStorage {
  if (profile === 'qa') return storage;
  if (profile === 'campaign-qa') {
    return {
      getItem: (key) => storage.getItem(CAMPAIGN_TEST_STORAGE_PREFIX + key),
      setItem: (key, value) => storage.setItem(CAMPAIGN_TEST_STORAGE_PREFIX + key, value),
      removeItem: (key) => storage.removeItem(CAMPAIGN_TEST_STORAGE_PREFIX + key),
    };
  }
  return {
    getItem: (key) => storage.getItem(PLAYER_STORAGE_PREFIX + key),
    setItem: (key, value) => storage.setItem(PLAYER_STORAGE_PREFIX + key, value),
    removeItem: (key) => storage.removeItem(PLAYER_STORAGE_PREFIX + key),
  };
}
export function practiceStorage(): PracticeStorage {
  if (CAMPAIGN_WEB_BUILD)
    return {
      getItem: (key) => window.localStorage.getItem(CAMPAIGN_WEB_STORAGE_PREFIX + key),
      setItem: (key, value) =>
        window.localStorage.setItem(CAMPAIGN_WEB_STORAGE_PREFIX + key, value),
      removeItem: (key) => window.localStorage.removeItem(CAMPAIGN_WEB_STORAGE_PREFIX + key),
    };
  if (CAMPAIGN_COMMERCE_ENABLED) {
    const prefix = CAMPAIGN_RELEASE_BUILD
      ? CAMPAIGN_RELEASE_STORAGE_PREFIX
      : CAMPAIGN_SERVICES_STORAGE_PREFIX;
    return {
      getItem: (key) => window.localStorage.getItem(prefix + key),
      setItem: (key, value) => window.localStorage.setItem(prefix + key, value),
      removeItem: (key) => window.localStorage.removeItem(prefix + key),
    };
  }
  // Resolve browser storage only when an operation runs; SSR/bootstrap own no I/O.
  return profilePracticeStorage({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  });
}
