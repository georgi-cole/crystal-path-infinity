export type AppEnvironment = 'development' | 'staging' | 'production';

export interface BuildInfo {
  schemaVersion: 1;
  environment: AppEnvironment;
  appId: string;
  appName: string;
  version: string;
}

// Provisional application identities until the separate store-registration work.
const identities: Record<AppEnvironment, { appId: string; appName: string }> = {
  development: {
    appId: 'com.georgicole.crystalpath.infinity.dev',
    appName: 'Crystal Path Dev',
  },
  staging: {
    appId: 'com.georgicole.crystalpath.infinity.staging',
    appName: 'Crystal Path Staging',
  },
  production: {
    appId: 'com.georgicole.crystalpath.infinity',
    appName: 'Crystal Path Infinity',
  },
};

export function requireEnvironment(value: unknown): AppEnvironment {
  if (value === 'development' || value === 'staging' || value === 'production') {
    return value;
  }

  throw new Error('CPI_APP_ENV must be development, staging, or production.');
}

export function getBuildInfo(environment: AppEnvironment, version: string): BuildInfo {
  const selected = requireEnvironment(environment);
  if (typeof version !== 'string' || version.length === 0 || version.trim() !== version) {
    throw new Error(
      'The mobile package must provide a non-empty version without surrounding whitespace.',
    );
  }

  return { schemaVersion: 1, environment: selected, ...identities[selected], version };
}

/** Reject stale or differently identified web assets before a native copy/sync. */
export function assertBuiltEnvironment(
  metadata: unknown,
  environment: AppEnvironment,
  version: string,
): asserts metadata is BuildInfo {
  const expected = getBuildInfo(environment, version);
  const rebuild = `Rebuild apps/mobile for ${environment} before copying its native assets.`;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`Missing or invalid dist/build-info.json. ${rebuild}`);
  }

  const actual = metadata as Record<string, unknown>;
  const keys = Object.keys(expected) as (keyof BuildInfo)[];
  if (Object.keys(actual).length !== keys.length) {
    throw new Error(`Unexpected dist/build-info.json schema. ${rebuild}`);
  }

  for (const key of keys) {
    if (!Object.hasOwn(actual, key) || actual[key] !== expected[key]) {
      throw new Error(
        `Built assets do not match the requested ${environment} build (${key}). ${rebuild}`,
      );
    }
  }
}
