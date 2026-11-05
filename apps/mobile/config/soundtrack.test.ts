import { describe, expect, it } from 'vitest';
import { SOUNDTRACKS, soundtrackOffset, softenLoopBoundary } from '../src/soundtrack';
import { statSync } from 'node:fs';

describe('owner-supplied scene soundtrack', () => {
  it('joins both stereo channels at the decoded loop boundary without altering the intro', () => {
    for (const sampleRate of [44100, 48000]) {
      const channels = [
        new Float32Array(sampleRate * 182).fill(0.7),
        new Float32Array(sampleRate * 182).fill(-0.6),
      ];
      const edge = Math.round(sampleRate * 28) - 1;
      channels[0][edge] = 0.1;
      channels[1][edge] = -0.2;
      softenLoopBoundary({
        sampleRate,
        numberOfChannels: 2,
        getChannelData: (channel) => channels[channel],
      });
      expect(channels[0][sampleRate * 181 - 1]).toBeCloseTo(0.1);
      expect(channels[1][sampleRate * 181 - 1]).toBeCloseTo(-0.2);
      expect(channels[0][sampleRate * 13]).toBeCloseTo(0.7);
      expect(channels[1][sampleRate * 13]).toBeCloseTo(-0.6);
    }
  });
  it('plays the first pass from 13, then wraps exactly from 181 to 28 without repeating the intro', () => {
    expect(soundtrackOffset('run', 0)).toBe(13);
    expect(soundtrackOffset('run', 167.99)).toBeCloseTo(180.99);
    expect(soundtrackOffset('run', 168)).toBe(28);
    expect(soundtrackOffset('run', 168 + 153)).toBe(28);
    expect(soundtrackOffset('run', 168 + 153 * 100 + 1.5)).toBe(29.5);
  });
  it('starts the final track at 14 and keeps it a single play', () => {
    expect(soundtrackOffset('ended', 0)).toBe(14);
    expect(SOUNDTRACKS.ended.loop).toBe(false);
    expect(SOUNDTRACKS.home.loop).toBe(true);
    for (const track of Object.values(SOUNDTRACKS))
      expect(
        statSync(new URL('../public/assets/music/' + track.file, import.meta.url)).size,
      ).toBeGreaterThan(100_000);
  });
});
