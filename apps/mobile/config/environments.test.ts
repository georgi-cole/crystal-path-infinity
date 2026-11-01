import { describe, expect, it } from 'vitest';
import { assertBuiltEnvironment, getBuildInfo, requireEnvironment } from './environments';
import type { AppEnvironment } from './environments';

const version = '0.1.0';

describe('mobile build environment contract', () => {
  it.each([undefined, null, '', 'prod', 'Production', 'production ', ' staging', 1, {}])(
    'rejects an absent, misspelled, or coerced environment: %j',
    (value) => {
      expect(() => requireEnvironment(value)).toThrow('CPI_APP_ENV');
    },
  );

  it('keeps installed app identities separate across all environments', () => {
    const builds = (['development', 'staging', 'production'] as const).map((environment) =>
      getBuildInfo(requireEnvironment(environment), version),
    );

    expect(new Set(builds.map((build) => build.appId)).size).toBe(3);
    expect(new Set(builds.map((build) => build.appName)).size).toBe(3);
    expect(builds.every((build) => /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(build.appId))).toBe(
      true,
    );
    for (const build of builds) {
      expect(Object.keys(build).sort()).toEqual([
        'appId',
        'appName',
        'environment',
        'schemaVersion',
        'version',
      ]);
      expect(() =>
        assertBuiltEnvironment(JSON.parse(JSON.stringify(build)), build.environment, version),
      ).not.toThrow();
    }
  });

  it('rejects a bundle copied from another environment in every direction', () => {
    const environments: AppEnvironment[] = ['development', 'staging', 'production'];
    for (const builtFor of environments) {
      for (const requested of environments.filter((environment) => environment !== builtFor)) {
        expect(() =>
          assertBuiltEnvironment(getBuildInfo(builtFor, version), requested, version),
        ).toThrow('Built assets do not match');
      }
    }
  });

  it('rejects stale assets after the package version changes', () => {
    expect(() =>
      assertBuiltEnvironment(getBuildInfo('production', '0.0.9'), 'production', version),
    ).toThrow('(version)');
  });

  it('rejects relabelled assets whose environment disagrees with their native identity', () => {
    const relabelled = { ...getBuildInfo('development', version), environment: 'production' };
    expect(() => assertBuiltEnvironment(relabelled, 'production', version)).toThrow('(appId)');

    const renamed = { ...getBuildInfo('staging', version), appName: 'Crystal Path Infinity' };
    expect(() => assertBuiltEnvironment(renamed, 'staging', version)).toThrow('(appName)');
  });

  it.each([
    [null],
    [[]],
    [{}],
    [{ ...getBuildInfo('development', version), schemaVersion: 2 }],
    [{ ...getBuildInfo('development', version), unexpected: 'field' }],
  ])('rejects missing or incompatible build metadata: %j', (metadata) => {
    expect(() => assertBuiltEnvironment(metadata, 'development', version)).toThrow();
  });

  it('does not silently invent or normalize a missing package version', () => {
    expect(() => getBuildInfo('development', '')).toThrow('version');
    expect(() => getBuildInfo('development', ' 0.1.0')).toThrow('version');
  });
});
