import { describe, expect, it } from 'vitest';
import {
  SOUNDTRACKS,
  createStreamedSoundtrack,
  soundtrackOffset,
  soundtrackPlayback,
  softenLoopBoundary,
} from '../src/soundtrack';
import { statSync } from 'node:fs';

class NativeAudio extends EventTarget {
  src = '';
  readyState = 0;
  currentTime = 0;
  paused = true;
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = '';
  }
  load() {
    this.readyState = 0;
  }
  loaded() {
    this.readyState = 1;
    this.dispatchEvent(new Event('loadedmetadata'));
  }
  seek(time: number) {
    this.currentTime = time;
    this.dispatchEvent(new Event('timeupdate'));
  }
}

describe('owner-supplied scene soundtrack', () => {
  it('starts iPhone scene music at metadata readiness and hands off once to the end track', () => {
    const players: NativeAudio[] = [];
    const controller = createStreamedSoundtrack(() => {
      const media = new NativeAudio();
      players.push(media);
      return media as unknown as HTMLAudioElement;
    });
    controller.update('run', true, true);
    const [run, end] = players;
    expect(run.paused).toBe(true);
    run.loaded();
    end.loaded();
    expect(run.currentTime).toBe(14);
    expect(run.paused).toBe(false);
    expect(end.paused).toBe(true);
    run.seek(181.25);
    expect(run.currentTime).toBe(28.25);
    controller.setForeground(false);
    expect(run.paused).toBe(true);
    controller.setForeground(true);
    expect(run.paused).toBe(false);
    expect(run.currentTime).toBe(28.25);
    controller.update('ended', true, false);
    expect(run.paused).toBe(true);
    expect(end.currentTime).toBe(0);
    expect(end.paused).toBe(false);
    end.seek(47.02);
    controller.sync();
    expect(end.paused).toBe(true);
    controller.dispose();
    expect(end.src).toBe('');
  });

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
      expect(channels[0][sampleRate * 14]).toBeCloseTo(0.7);
      expect(channels[1][sampleRate * 14]).toBeCloseTo(-0.6);
    }
  });
  it('plays the first pass from 14, then wraps exactly from 181 to 28 without repeating the intro', () => {
    expect(soundtrackOffset('run', 0)).toBe(14);
    expect(soundtrackOffset('run', 166.99)).toBeCloseTo(180.99);
    expect(soundtrackOffset('run', 167)).toBe(28);
    expect(soundtrackOffset('run', 167 + 153)).toBe(28);
    expect(soundtrackOffset('run', 167 + 153 * 100 + 1.5)).toBe(29.5);
    expect(soundtrackPlayback('run', 167 + 153, 214.616)).toEqual({ offset: 28, duration: null });
  });
  it('plays only the trimmed deathrow excerpt once and stops at 47 seconds despite encoder padding', () => {
    expect(SOUNDTRACKS.ended.file).toBe('run-ended-deathrow.m4a');
    expect(soundtrackPlayback('ended', 0, 47.02)).toEqual({ offset: 0, duration: 47 });
    expect(soundtrackPlayback('ended', 12.5, 47.02)).toEqual({ offset: 12.5, duration: 34.5 });
    expect(soundtrackPlayback('ended', 46.99, 47.02).duration).toBeCloseTo(0.01);
    expect(soundtrackPlayback('ended', 47, 47.02).duration).toBe(0);
    expect(soundtrackPlayback('ended', 120, 47.02).duration).toBe(0);
    expect(SOUNDTRACKS.ended.loop).toBe(false);
    expect(SOUNDTRACKS.home.loop).toBe(true);
    for (const track of Object.values(SOUNDTRACKS))
      expect(
        statSync(new URL('../public/assets/music/' + track.file, import.meta.url)).size,
      ).toBeGreaterThan(100_000);
  });
  it('resumes the ambient loop after several complete loops without treating it as finished', () => {
    expect(soundtrackPlayback('home', 193 * 4 + 12.5, 193)).toEqual({
      offset: 12.5,
      duration: null,
    });
  });
});
