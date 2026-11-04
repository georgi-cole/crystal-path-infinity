import { getBuildInfo } from './environments.ts';
import type { AppEnvironment, BuildInfo } from './environments.ts';

export interface UnsignedRelease {
  readonly schemaVersion: 1;
  readonly kind: 'unsigned-beta-preparation';
  readonly app: BuildInfo;
  readonly buildNumber: number;
  readonly iosBuildNumber: string;
  readonly sourceSha: string;
  readonly workflowRunId: string;
  readonly workflowRunAttempt: 1;
  readonly signing: 'unsigned';
  readonly distribution: 'not-uploaded';
  readonly liveServices: {
    readonly accounts: 'disabled';
    readonly ranked: 'disabled';
    readonly ads: 'disabled';
  };
}
const names = [
  'CPI_RELEASE_VERSION',
  'CPI_RELEASE_BUILD_NUMBER',
  'CPI_RELEASE_SOURCE_SHA',
  'CPI_RELEASE_RUN_ID',
  'CPI_RELEASE_RUN_ATTEMPT',
] as const;
const version = /^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/;

/** Explicit opt-in only; ordinary development/CI metadata remains unchanged. */
export function resolveUnsignedRelease(
  environment: AppEnvironment,
  packageVersion: string,
  values: Readonly<Record<string, string | undefined>>,
): UnsignedRelease | null {
  if (!names.some((name) => values[name] !== undefined)) return null;
  if (environment !== 'staging' && environment !== 'production')
    throw new Error('Unsigned beta preparation requires staging or production identity.');
  if (names.some((name) => typeof values[name] !== 'string' || values[name] === ''))
    throw new Error('All unsigned release metadata inputs are required.');
  const selectedVersion = values.CPI_RELEASE_VERSION!;
  const number = values.CPI_RELEASE_BUILD_NUMBER!;
  if (!version.test(selectedVersion) || !version.test(packageVersion))
    throw new Error('Release versions require canonical numeric major.minor.patch components.');
  // A conservative common integer policy: compatible with both platform build
  // strings and well below Android's 2,100,000,000 limit. Never wrap or reuse it.
  if (!/^[1-9][0-9]{0,3}$/.test(number))
    throw new Error('Unsigned release build number must be an integer from 1 through 9999.');
  if (!/^[a-f0-9]{40}$/.test(values.CPI_RELEASE_SOURCE_SHA!))
    throw new Error('Unsigned release requires the exact lowercase source commit SHA.');
  if (!/^[1-9][0-9]{0,19}$/.test(values.CPI_RELEASE_RUN_ID!))
    throw new Error('Unsigned release requires a canonical workflow run identity.');
  if (values.CPI_RELEASE_RUN_ATTEMPT !== '1')
    throw new Error(
      'Dispatch a new unsigned candidate; reruns cannot reuse its native build number.',
    );
  return {
    schemaVersion: 1,
    kind: 'unsigned-beta-preparation',
    app: getBuildInfo(environment, selectedVersion),
    buildNumber: Number(number),
    iosBuildNumber: number,
    sourceSha: values.CPI_RELEASE_SOURCE_SHA!,
    workflowRunId: values.CPI_RELEASE_RUN_ID!,
    workflowRunAttempt: 1,
    signing: 'unsigned',
    distribution: 'not-uploaded',
    liveServices: { accounts: 'disabled', ranked: 'disabled', ads: 'disabled' },
  };
}

/** No deployment approval was granted: custom public service/ad variables must be empty. */
export function assertUnsignedPublicVariables(
  values: Readonly<Record<string, string | undefined>>,
): void {
  if (
    Object.entries(values).some(
      ([name, value]) => name.startsWith('VITE_') && value !== undefined && value !== '',
    )
  ) {
    throw new Error(
      'Unsigned preparation keeps every live service disabled; public VITE configuration must be empty.',
    );
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'undefined';
}
/** Reject stale source/build/identity metadata and any additional secret-bearing field. */
export function assertUnsignedRelease(
  actual: unknown,
  expected: UnsignedRelease,
): asserts actual is UnsignedRelease {
  if (canonical(actual) !== canonical(expected))
    throw new Error(
      'Unsigned release metadata does not match the requested source, identity and build.',
    );
}
