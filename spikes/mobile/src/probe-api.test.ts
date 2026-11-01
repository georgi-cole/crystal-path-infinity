import { describe, expect, it } from 'vitest';
import { normalizeEndpoint } from './probe-api';
describe('diagnostic endpoint configuration', () => {
  it('uses the local Vite proxy only in the web fixture', () => {
    expect(normalizeEndpoint('', false)).toBe('/v1/probe');
    expect(() => normalizeEndpoint('', true)).toThrow();
  });
  it('accepts HTTPS and explicit local emulator addresses', () => {
    expect(normalizeEndpoint('https://probe.example/', true)).toBe('https://probe.example/v1/probe');
    expect(normalizeEndpoint('http://10.0.2.2:8787', true)).toBe('http://10.0.2.2:8787/v1/probe');
  });
  it.each(['http://remote.example', 'https://user:pass@probe.example', 'https://probe.example?token=x', 'file:///tmp/probe', 'javascript:alert(1)'])('rejects unsafe or credential-bearing endpoint %s', endpoint => {
    expect(() => normalizeEndpoint(endpoint, true)).toThrow();
  });
});
