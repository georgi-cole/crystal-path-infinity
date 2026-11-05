import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CRYSTAL_AUDIO } from '../src/standalone-audio';

const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const sounds = join(publicRoot, 'assets/sounds/minigames');
function resource(path: string) {
  expect(path.startsWith('/assets/')).toBe(true);
  return readFileSync(join(publicRoot, path.slice(1)));
}

describe('CPI-010 offline and scoped assets', () => {
  it('bundles exactly the four selected original glass bridge sound effects', () => {
    const expected = [
      'minigame_gb_death.mp3',
      'minigame_gb_new_turn.mp3',
      'minigame_gb_safe_step.mp3',
      'minigame_gb_winner.mp3',
    ];
    expect(readdirSync(sounds).sort()).toEqual(expected);
    for (const source of [
      CRYSTAL_AUDIO.safe,
      CRYSTAL_AUDIO.death,
      CRYSTAL_AUDIO.record,
      CRYSTAL_AUDIO.newTurn,
    ]) {
      const bytes = resource(source);
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(bytes[0] === 0xff || bytes.toString('ascii', 0, 3) === 'ID3').toBe(true);
    }
  });
  it('provides the clearly separate interim loop, not a mislabelled source MP3', () => {
    const bytes = resource(CRYSTAL_AUDIO.music);
    expect(bytes.byteLength).toBeGreaterThan(100000);
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
    expect(CRYSTAL_AUDIO.music).not.toContain('glass_bridge.mp3');
  });
  it('bundles original mono glass and emergency cues at the project base path', () => {
    for (const source of [CRYSTAL_AUDIO.glass, CRYSTAL_AUDIO.alarm]) {
      const bytes = resource(source);
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
      expect(bytes.readUInt16LE(22)).toBe(1);
      expect(bytes.readUInt32LE(24)).toBe(22050);
      expect(bytes.readUInt32LE(40)).toBe(bytes.byteLength - 44);
      expect(bytes.byteLength).toBeLessThan(120000);
    }
  });
});
