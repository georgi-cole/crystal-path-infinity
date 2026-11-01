import type { ProbeStore } from '../server/probe.ts';
export type ProbeState = ReturnType<ProbeStore['get']>;
export type RewardIntent = ReturnType<ProbeStore['intent']>;
export type ProbeSession = ReturnType<ProbeStore['create']>;
export interface TimingSample { operation: string; milliseconds: number; ok: boolean; timestamp: string }

export function normalizeEndpoint(input: string, native: boolean): string {
  if (!input.trim()) {
    if (native) throw new Error('Enter the HTTPS probe address for the native build.');
    return '/v1/probe';
  }
  const url = new URL(input.trim());
  const loopback = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('Use an HTTPS endpoint, or a local emulator loopback address.');
  }
  if (url.pathname === '/') url.pathname = '/v1/probe';
  return url.toString().replace(/\/$/, '');
}
export class ProbeApi {
  constructor(readonly base: string, private timing: (sample: TimingSample) => void) {}
  async request<T>(operation: string, path: string, method: 'GET' | 'POST', token?: string, body?: unknown): Promise<T> {
    const start = performance.now(); let ok = false;
    try {
      const response = await fetch(this.base + path, {
        method, headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
        signal: AbortSignal.timeout(12_000), cache: 'no-store', credentials: 'omit',
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      ok = true; return data as T;
    } finally {
      this.timing({ operation, milliseconds: performance.now() - start, ok, timestamp: new Date().toISOString() });
    }
  }
}
