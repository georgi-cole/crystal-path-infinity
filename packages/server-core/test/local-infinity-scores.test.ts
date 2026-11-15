import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { privateDatabase } from './private-database.ts';
import { createLeaderboardHandler } from '../src/leaderboard-api.ts';

let database: Awaited<ReturnType<typeof privateDatabase>>;
beforeAll(async () => {
  database = await privateDatabase();
}, 30000);
afterAll(async () => {
  await database?.db.close();
});
describe('end-of-run score service', () => {
  it('applies real migrations and exercises best scores, top 10, account scope and SQL grants', async () => {
    await database.db.exec(
      readFileSync(
        new URL('../../../backend/tests/local-infinity-scores.sql', import.meta.url),
        'utf8',
      ),
    );
  });
  it('requires authentication, rejects extra identity fields, rate limits and stamps owner from session', async () => {
    const subject = '15000000-0000-4000-8000-000000000001';
    const score = {
      schemaVersion: 1,
      runId: '15200000-0000-4000-8000-000000000001',
      rows: '120',
      revives: 0,
      activeTimeMs: 1000,
    };
    const query = vi.fn().mockResolvedValue({
      rows: [{ result: { status: 'saved', runId: score.runId, secret: 'redacted' } }],
    });
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({ query, release });
    const rateLimitScore = vi.fn().mockResolvedValue(true);
    const handler = createLeaderboardHandler({
      database: { connect },
      deviceScores: true,
      allowedRulesets: ['infinity-device-v1'],
      allowedMappingVersions: ['cpi-regions-2026-11-v1'],
      allowOrigin: (o) => o === 'capacitor://localhost',
      rateLimit: () => Promise.resolve(true),
      rateLimitScore,
      authenticate: () => Promise.resolve({ subject, leaderboardAllowed: true }),
      allowPublicRead: () => Promise.resolve(true),
    });
    const request = (input: unknown = score, auth = true) =>
      new Request('https://example.invalid/infinity/score', {
        method: 'POST',
        headers: {
          origin: 'capacitor://localhost',
          'content-type': 'application/json',
          ...(auth ? { authorization: 'Bearer test-access-token-long' } : {}),
        },
        body: JSON.stringify(input),
      });
    expect((await handler(request(score, false))).status).toBe(401);
    expect((await handler(request({ ...score, userId: subject }))).status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'saved', runId: score.runId });
    expect(query.mock.calls[0]?.[1]).toEqual([subject, score.runId, '120', 0, 1000]);
    expect(release).toHaveBeenCalledTimes(1);
    rateLimitScore.mockResolvedValue(false);
    expect((await handler(request())).status).toBe(429);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
