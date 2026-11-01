import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProbeStore } from './probe.ts';
import { createGoogleKeyCache, ProbeError, splitGoogleSsv, verifyGoogleSsv } from './ssv.ts';

const PREFIX = '/v1/probe';
const BODY_LIMIT = 4096;
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost', 'https://localhost', 'capacitor://localhost'];
function numberEnv(name: string, fallback: number, max: number) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) > max) throw new Error(`Invalid ${name}`);
  return Number(value);
}
function exactKeys(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ProbeError(400, 'unexpected_field');
}
function jsonBody(req: IncomingMessage, count: (n: number) => void): Promise<Record<string, unknown>> {
  return new Promise((accept, reject) => {
    let size = 0; const chunks: Buffer[] = []; let rejected = false;
    req.on('data', (chunk: Buffer) => {
      count(chunk.byteLength); size += chunk.byteLength;
      if (size > BODY_LIMIT) {
        if (!rejected) { rejected = true; reject(new ProbeError(413, 'body_too_large')); }
        return;
      }
      if (!rejected) chunks.push(chunk);
    });
    req.on('error', () => reject(new ProbeError(400, 'invalid_request')));
    req.on('end', () => {
      if (rejected) return;
      try {
        if (size && !req.headers['content-type']?.startsWith('application/json')) throw new ProbeError(415, 'json_required');
        const value: unknown = size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProbeError(400, 'json_object_required');
        accept(value as Record<string, unknown>);
      } catch (error) { reject(error instanceof ProbeError ? error : new ProbeError(400, 'invalid_json')); }
    });
  });
}

export function createProbeServer(options: {
  store?: ProbeStore; origins?: string[]; syntheticDelayMs?: number;
  getPublicKey?: (keyId: string) => Promise<string>;
} = {}) {
  const store = options.store ?? new ProbeStore();
  const origins = new Set(options.origins ?? DEFAULT_ORIGINS);
  if (origins.has('*') || origins.has('null')) throw new Error('Explicit origins required');
  const delayMs = options.syntheticDelayMs ?? 0;
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 10_000) throw new Error('Invalid delay');
  const getPublicKey = options.getPublicKey ?? createGoogleKeyCache();
  const metrics = { requests: 0, errors: 0, requestBodyBytes: 0, responseBodyBytes: 0,
    handlerMillisecondsTotal: 0, handlerMillisecondsMax: 0, clientCallbackReports: 0, ssvVerifiedCallbacks: 0 };
  let active = 0;
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 10_000, headersTimeout: 10_000 }, async (req, res) => {
    const started = performance.now(); metrics.requests++;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const send = (status: number, value: unknown) => {
      const body = JSON.stringify(value); metrics.responseBodyBytes += Buffer.byteLength(body);
      res.writeHead(status); res.end(body);
    };
    if (active >= 32) { send(503, { error: 'lab_concurrency_limit', official: false }); return; }
    active++;
    try {
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) throw new ProbeError(403, 'origin_not_allowed');
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        send(200, { official: false }); return;
      }
      const rawUrl = req.url ?? '/';
      if (rawUrl.length > 8192) throw new ProbeError(414, 'url_too_long');
      const separator = rawUrl.indexOf('?');
      const path = separator < 0 ? rawUrl : rawUrl.slice(0, separator);
      const rawQuery = separator < 0 ? '' : rawUrl.slice(separator + 1);
      if (req.method === 'GET' && (path === '/ssv' || path === `${PREFIX}/ssv`)) {
        const { keyId } = splitGoogleSsv(rawQuery);
        const fields = verifyGoogleSsv(rawQuery, await getPublicKey(keyId));
        const result = store.acceptVerifiedSsv(fields); metrics.ssvVerifiedCallbacks++;
        // The unauthenticated provider callback gets no run state, token or opaque user data.
        send(200, { ok: true, duplicate: result.duplicate, official: false, evidence: 'native-test-ssv' }); return;
      }
      if (req.method === 'GET' && path === `${PREFIX}/health`) {
        send(200, { ok: true, official: false, service: 'CPI-002 volatile test probe' }); return;
      }
      if (req.method === 'GET' && path === `${PREFIX}/metrics`) {
        send(200, { ...metrics, ...store.metrics(), activeRequests: active, syntheticDelayMs: delayMs,
          measurement: 'HTTP body bytes and handler wall time; not native frame latency, DB usage or cloud cost' }); return;
      }
      if (rawQuery) throw new ProbeError(400, 'unexpected_query');
      const body = req.method === 'POST' ? await jsonBody(req, n => { metrics.requestBodyBytes += n; }) : {};
      if (req.method === 'POST' && path === `${PREFIX}/runs`) {
        exactKeys(body, ['mode', 'platform']); send(201, store.create(body.mode, body.platform)); return;
      }
      const match = /^\/v1\/probe\/runs\/([a-f0-9-]{36})(?:\/(step|death|reward-intent|synthetic-grant|restore|client-event))?$/.exec(path);
      if (!match?.[1]) throw new ProbeError(404, 'not_found');
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ') || !/^[A-Za-z0-9_-]{43}$/.test(auth.slice(7))) throw new ProbeError(401, 'bearer_required');
      const runId = match[1]; const token = auth.slice(7); const action = match[2];
      const state = store.get(runId, token);
      if (req.method === 'GET' && !action) { send(200, { state }); return; }
      if (req.method !== 'POST' || !action) throw new ProbeError(405, 'method_not_allowed');
      let result: unknown;
      switch (action) {
        case 'step':
          exactKeys(body, ['sequence', 'side', 'idempotencyKey']);
          if (state.mode === 'synthetic' && delayMs) await new Promise(r => setTimeout(r, delayMs));
          result = store.step(runId, token, body); break;
        case 'death': exactKeys(body, []); result = { state: store.death(runId, token), debugOnly: true }; break;
        case 'reward-intent': exactKeys(body, []); result = store.intent(runId, token); break;
        case 'synthetic-grant': exactKeys(body, ['intentId']); result = store.syntheticGrant(runId, token, body.intentId); break;
        case 'restore': exactKeys(body, ['intentId']); result = store.restore(runId, token, body.intentId); break;
        case 'client-event':
          exactKeys(body, ['event']);
          if (!['earned', 'dismissed', 'no-fill', 'error', 'background', 'foreground'].includes(String(body.event))) throw new ProbeError(400, 'invalid_event');
          metrics.clientCallbackReports++; result = { state: store.get(runId, token), recordedOnly: true }; break;
      }
      send(200, result);
    } catch (error) {
      metrics.errors++;
      const known = error instanceof ProbeError;
      send(known ? error.status : 500, { error: known ? error.code : 'internal_error', official: false });
    } finally {
      active--; const duration = performance.now() - started;
      metrics.handlerMillisecondsTotal += duration;
      metrics.handlerMillisecondsMax = Math.max(metrics.handlerMillisecondsMax, duration);
    }
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.PROBE_HOST ?? '127.0.0.1';
  const port = numberEnv('PROBE_PORT', 8787, 65535);
  const origins = process.env.PROBE_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean);
  const server = createProbeServer({ origins, syntheticDelayMs: numberEnv('PROBE_SYNTHETIC_DELAY_MS', 0, 10_000) });
  server.on('error', () => { process.stderr.write('Probe listen failed; check bind address, port and workspace permissions.\n'); process.exitCode = 1; });
  server.listen(port, host, () => {
    process.stdout.write(`CPI-002 TEST ONLY probe listening on ${host}:${port}; volatile state; official=false\n`);
  });
}
