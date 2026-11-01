#!/usr/bin/env node
// Real loopback HTTP measurements, with an explicitly artificial perfect-choice
// fixture. This does not measure gameplay difficulty, a device, or a cloud DB.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createProbeServer } from '../server/index.ts';
import { ProbeStore } from '../server/probe.ts';

function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
}
const rounded = value => Math.round(value * 1000) / 1000;
async function scenario(name, delayMs, steps) {
  const server = createProbeServer({
    store: new ProbeStore({ chooseSide: () => 'left', maxActions: steps }),
    syntheticDelayMs: delayMs,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/v1/probe`;
  const samples = [], checkpoints = [];
  let requestCount = 0, requestBodyBytes = 0, responseBodyBytes = 0;
  let stepRequestBytes = 0, stepResponseBytes = 0;
  async function request(path, token, body, expectedStatus = 200) {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const started = performance.now();
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(serialized ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: serialized, signal: AbortSignal.timeout(15_000),
    });
    const raw = await response.text();
    const milliseconds = performance.now() - started;
    requestCount++; requestBodyBytes += Buffer.byteLength(serialized ?? ''); responseBodyBytes += Buffer.byteLength(raw);
    assert.equal(response.status, expectedStatus, `Unexpected HTTP status for ${path.split('/').at(-1)}`);
    return { data: JSON.parse(raw), milliseconds, requestBytes: Buffer.byteLength(serialized ?? ''), responseBytes: Buffer.byteLength(raw) };
  }
  try {
    const { data: run } = await request('/runs', undefined, { mode: 'synthetic', platform: 'web' }, 201);
    const path = `/runs/${run.runId}`;
    let lastAction, lastState;
    for (let sequence = 1; sequence <= steps; sequence++) {
      lastAction = { sequence, side: 'left', idempotencyKey: randomUUID() };
      const result = await request(`${path}/step`, run.token, lastAction);
      samples.push(result.milliseconds); stepRequestBytes += result.requestBytes; stepResponseBytes += result.responseBytes;
      lastState = result.data.state;
      if ([1, 100, 351, 1000, steps].includes(sequence)) {
        const { data: metrics } = await request('/metrics');
        checkpoints.push({ completedRows: sequence, retainedActions: metrics.retainedActions,
          retainedActionJsonBytes: metrics.retainedActionJsonBytes, publicCheckpointJsonBytes: metrics.publicCheckpointJsonBytes });
      }
    }
    assert.equal(lastState.lastClearedRow, steps);
    assert.equal(lastState.status, 'playing');
    assert.equal(lastState.sp, 300);
    const duplicate = await request(`${path}/step`, run.token, lastAction);
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.state.lastClearedRow, steps);
    const limit = await request(`${path}/step`, run.token, { sequence: steps + 1, side: 'left', idempotencyKey: randomUUID() }, 429);
    assert.equal(limit.data.error, 'lab_action_limit_restart_required');
    const { data: metrics } = await request('/metrics');
    return {
      name, artificialStepDelayMs: delayMs, steps, httpRequestsIncludingDiagnostics: requestCount,
      stepRoundTripMs: { p50: rounded(percentile(samples, .5)), p95: rounded(percentile(samples, .95)), max: rounded(Math.max(...samples)) },
      stepBodyBytes: { requestMean: rounded(stepRequestBytes / steps), responseMean: rounded(stepResponseBytes / steps), requestTotal: stepRequestBytes, responseTotal: stepResponseBytes },
      allHttpBodyBytes: { request: requestBodyBytes, response: responseBodyBytes },
      checkpoints, finalMetrics: metrics,
      assertions: { stillPlayingAtLastRow: true, duplicateDidNotAdvance: true, explicitLabBudgetError: true, official: false },
    };
  } finally {
    server.closeAllConnections();
    await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
  }
}

const target = resolve(process.argv[2] ?? 'artifacts/probe-local.json');
const report = {
  measuredAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  scope: 'Serial requests over real loopback HTTP. Server and client share one machine. No TLS, cellular network, mobile WebView, database, or native ad SDK.',
  fixture: 'Synthetic perfect choices; maxActions raised to 10000 only in this measurement harness. The interactive server retains its 1000-action lab budget. Neither is a product finish rule.',
  limitations: ['Artificial delay is server delay, not a cellular-network simulation.', 'JSON bytes exclude HTTP headers, TLS, runtime objects, DB metadata/indexes/replicas and provider billing.', 'One run per profile is not a load/capacity benchmark.'],
  scenarios: [],
};
for (const [name, delay, steps] of [['long-run-local', 0, 10000], ['delay-150ms', 150, 30], ['delay-600ms', 600, 12]]) {
  const result = await scenario(name, delay, steps); report.scenarios.push(result);
  console.log(JSON.stringify({ name, steps, p50Ms: result.stepRoundTripMs.p50, p95Ms: result.stepRoundTripMs.p95 }));
}
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Measurement report: ${target}`);
