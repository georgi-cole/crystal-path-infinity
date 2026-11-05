import { describe, expect, it } from 'vitest';
import { createHintCaptionGate, HINT_CAPTION_KEY } from '../src/hint-caption';

describe('first hint caption', () => {
  it('shows once, remembers it across runs/reloads, and never writes game inventory', () => {
    const entries = new Map<string, string>();
    const storage = () => ({
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    });
    const gate = createHintCaptionGate(storage);
    expect(gate.claim()).toBe(true);
    expect(gate.claim()).toBe(false);
    expect(createHintCaptionGate(storage).claim()).toBe(false);
    expect([...entries.keys()]).toEqual([HINT_CAPTION_KEY]);
  });
  it('fails quietly and still suppresses repeats when preference storage is unavailable', () => {
    const gate = createHintCaptionGate(() => {
      throw new Error('Unavailable');
    });
    expect(gate.claim()).toBe(true);
    expect(gate.claim()).toBe(false);
  });
});
