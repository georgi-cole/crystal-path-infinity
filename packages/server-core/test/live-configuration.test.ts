import { describe, expect, it } from 'vitest';
import { readLiveConfiguration } from '../src/live-configuration.ts';

const stagingRef = 'yfntwewvfsvljxcztoyp';
const fixture = {
  CPI_LIVE_ENABLED: 'true',
  CPI_PROJECT_REF: stagingRef,
  SUPABASE_URL: 'https://' + stagingRef + '.supabase.co',
  CPI_PRIVATE_PEPPER: 'a'.repeat(64),
  CPI_ENCRYPTION_KEY: 'b'.repeat(64),
  CPI_GATEWAY_KEY: 'c'.repeat(64),
  CPI_WORKER_KEY: 'd'.repeat(64),
  CPI_ACCOUNT_POLICY: JSON.stringify({
    status: 'reviewed',
    reviewReference: 'configuration-test',
    version: 'test-v1',
    countries: {},
  }),
  CPI_ALLOWED_ORIGINS: 'https://staging.example.test',
  CPI_PURCHASES_ENABLED: 'false',
  CPI_REWARDS_ENABLED: 'false',
  CPI_DATABASE_URL: 'postgresql://cpi_runtime:fixture@db.example.test/postgres',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
  CPI_RESEND_API_KEY: 'fixture-mail-key',
  CPI_MAIL_FROM: 'login@example.test',
};

function readConfiguration(environment: string) {
  const variables: Record<string, string> = { ...fixture, CPI_ENVIRONMENT: environment };
  return readLiveConfiguration((name) => variables[name]);
}

describe('live account project isolation', () => {
  it('accepts the designated staging project for staging', () => {
    expect(readConfiguration('staging')).toMatchObject({
      environment: 'staging',
      projectRef: stagingRef,
    });
  });

  it('rejects staging credentials relabelled as production', () => {
    expect(() => readConfiguration('production')).toThrow('separate from Crystal Path staging');
  });
});
