import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GEAR_IDS } from '@crystal-path-infinity/game-core';
import { THEME_IDS } from '../src/store-catalog';
import { equippedCompanionAsset, EQUIPPED_SPRITE } from '../src/equipped-companions';

// Missing images would otherwise compile successfully and silently vanish in a run.
describe('complete equipped character assets', () => {
  for (const world of THEME_IDS) {
    it(`ships every outfit and three reaction frames for ${world}`, () => {
      for (const gear of GEAR_IDS) {
        const path = equippedCompanionAsset(world, gear);
        const bytes = readFileSync(new URL(`../public/${path}`, import.meta.url));
        expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
        expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
        expect(bytes.toString('ascii', 12, 16)).toBe('VP8X');
        expect(bytes[20] & 0x10).toBe(0x10); // Alpha is required on the bridge.
        const width = bytes.readUIntLE(24, 3) + 1;
        const height = bytes.readUIntLE(27, 3) + 1;
        expect(width).toBe(height * EQUIPPED_SPRITE.frames);
        expect(height).toBeGreaterThanOrEqual(EQUIPPED_SPRITE.cell * 2);
      }
    });
  }
});
