import { describe, expect, it, vi } from 'vitest';
import { createStandaloneAudio, CRYSTAL_AUDIO } from '../src/standalone-audio';
import type { AudioMedia } from '../src/standalone-audio';
import { DEFAULT_PRACTICE_SETTINGS } from '../src/practice-save';
import type { RunEvent, RunState } from '@crystal-path-infinity/game-core';

function fixture() {
  const media = new Map<string, AudioMedia & { played: number; stopped: number }>();
  let deferred: (() => void) | undefined;
  const haptic = vi.fn(async () => {});
  const ports = {
    createMedia(source: string) {
      const item = {
        loop: false,
        volume: 1,
        playbackRate: 1,
        currentTime: 0,
        preload: 'none',
        paused: true,
        played: 0,
        stopped: 0,
        play() {
          item.played++;
          item.paused = false;
          if (source === CRYSTAL_AUDIO.music && deferred) {
            return new Promise<void>((resolve) => {
              deferred = resolve;
            });
          }
          return Promise.resolve();
        },
        pause() {
          item.stopped++;
          item.paused = true;
        },
      };
      media.set(source, item);
      return item;
    },
    haptic,
  };
  return {
    media,
    haptic,
    ports,
    deferMusic() {
      deferred = () => {};
    },
    resolveMusic() {
      deferred?.();
      deferred = undefined;
    },
  };
}
const state = { runId: 'practice-test', revivesApplied: 0 } as RunState;
const choose = (row: string, wrong: boolean): RunEvent => ({
  type: 'choice-resolved',
  row,
  side: 'left',
  wrong,
  spDelta: wrong ? -20 : 0,
  consumedKind: null,
  activeTimeMs: 0,
  observedAt: 0,
});
const death = (id: string): RunEvent => ({
  type: 'death',
  death: { id, sequence: 1, cause: 'wrong_tile', fatalRow: '5', activeTimeMs: 0, observedAt: 0 },
  activeTimeMs: 0,
  observedAt: 0,
});

describe('CPI-010 standalone audio ownership', () => {
  it('starts the emergency loop only below 15 SP after a gesture and silences pause, background, mute and disposal', async () => {
    const f = fixture();
    const audio = createStandaloneAudio(f.ports, { ...DEFAULT_PRACTICE_SETTINGS, music: false });
    const alarm = f.media.get(CRYSTAL_AUDIO.alarm)!;
    const low = { ...state, status: 'playing', sp: 14 } as RunState;
    const options = { foreground: true, personalBest: false };
    audio.setActive(true);
    audio.playEvents([], low, options);
    expect(alarm.played).toBe(0);
    await audio.unlock();
    audio.playEvents([], low, options);
    expect(alarm.played).toBe(1);
    expect(alarm.loop).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    audio.setActive(false);
    expect(alarm.paused).toBe(true);
    audio.setActive(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(alarm.played).toBe(2);
    audio.setForeground(false);
    expect(alarm.paused).toBe(true);
    audio.setForeground(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(alarm.played).toBe(3);
    audio.playEvents([], { ...low, sp: 15 }, options);
    expect(alarm.paused).toBe(true);
    audio.playEvents([], low, options);
    await Promise.resolve();
    await Promise.resolve();
    audio.setSettings({ ...DEFAULT_PRACTICE_SETTINGS, soundEffects: false });
    expect(alarm.paused).toBe(true);
    audio.dispose();
    expect(alarm.paused).toBe(true);
  });
  it('uses falling glass for a survived wrong pane and stops the alarm before a fatal tail', async () => {
    const f = fixture();
    const audio = createStandaloneAudio(f.ports, DEFAULT_PRACTICE_SETTINGS);
    audio.setActive(true);
    await audio.unlock();
    audio.playEvents(
      [choose('1', true)],
      { ...state, status: 'playing', sp: 10 },
      {
        foreground: true,
        personalBest: false,
      },
    );
    expect(f.media.get(CRYSTAL_AUDIO.glass)?.played).toBe(1);
    expect(f.media.get(CRYSTAL_AUDIO.safe)?.played).toBe(0);
    await Promise.resolve();
    audio.playEvents(
      [death('fatal')],
      { ...state, status: 'dead', sp: 0 },
      {
        foreground: true,
        personalBest: false,
      },
    );
    expect(f.media.get(CRYSTAL_AUDIO.alarm)?.paused).toBe(true);
    expect(f.media.get(CRYSTAL_AUDIO.death)?.played).toBe(1);
    audio.setActive(false);
    expect(f.media.get(CRYSTAL_AUDIO.death)?.paused).toBe(false);
    audio.dispose();
  });
  it('separates looping music from independent cues and starts only after a gesture', async () => {
    const f = fixture();
    const audio = createStandaloneAudio(f.ports, DEFAULT_PRACTICE_SETTINGS);
    const music = f.media.get(CRYSTAL_AUDIO.music)!;
    const safe = f.media.get(CRYSTAL_AUDIO.safe)!;
    expect(music.loop).toBe(true);
    expect(safe.loop).toBe(false);
    audio.setActive(true);
    expect(music.played).toBe(0);
    await audio.unlock();
    expect(music.played).toBe(1);
    audio.playEvents([choose('1', false)], state, { foreground: true, personalBest: false });
    audio.playEvents([choose('1', false)], state, { foreground: true, personalBest: false });
    expect(safe.played).toBe(1);
    expect(f.haptic).toHaveBeenCalledTimes(1);
    audio.setActive(false);
    audio.setActive(true);
    await Promise.resolve();
    expect(music.played).toBe(2);
    audio.dispose();
    expect(music.paused).toBe(true);
  });

  it('keeps the one-shot death tail after gameplay stops but silences OS background', async () => {
    const f = fixture();
    const audio = createStandaloneAudio(f.ports, DEFAULT_PRACTICE_SETTINGS);
    audio.setActive(true);
    await audio.unlock();
    const cue = f.media.get(CRYSTAL_AUDIO.death)!;
    audio.playEvents([death('d-1')], state, { foreground: true, personalBest: false });
    audio.playEvents([death('d-1')], state, { foreground: true, personalBest: false });
    expect(cue.played).toBe(1);
    audio.setActive(false);
    expect(cue.paused).toBe(false);
    audio.setForeground(false);
    expect(cue.paused).toBe(true);
    audio.setForeground(true);
    audio.dispose();
    expect(cue.paused).toBe(true);
  });

  it('does not play muted cues or unsupported haptics as mandatory work', async () => {
    const f = fixture();
    f.haptic.mockRejectedValueOnce(new Error('unsupported device'));
    const audio = createStandaloneAudio(f.ports, {
      ...DEFAULT_PRACTICE_SETTINGS,
      music: false,
      soundEffects: false,
    });
    audio.setActive(true);
    await audio.unlock();
    audio.playEvents([choose('1', true)], state, { foreground: true, personalBest: false });
    expect(f.media.get(CRYSTAL_AUDIO.safe)?.played).toBe(0);
    expect(f.haptic).toHaveBeenCalledWith('damage');
    audio.setSettings({ ...DEFAULT_PRACTICE_SETTINGS, haptics: false });
    audio.playEvents([choose('2', true)], state, { foreground: true, personalBest: false });
    expect(f.haptic).toHaveBeenCalledTimes(1);
    audio.dispose();
  });

  it('does not replay a terminal record and never creates a row-350 victory event', async () => {
    const f = fixture();
    const audio = createStandaloneAudio(f.ports, DEFAULT_PRACTICE_SETTINGS);
    audio.setActive(true);
    await audio.unlock();
    audio.playEvents([choose('350', false)], state, { foreground: true, personalBest: true });
    expect(f.media.get(CRYSTAL_AUDIO.record)?.played).toBe(0);
    const ending: RunEvent = {
      type: 'run-ended',
      activeTimeMs: 1,
      observedAt: 1,
      result: {} as Extract<RunEvent, { type: 'run-ended' }>['result'],
    };
    audio.playEvents([ending, ending], state, { foreground: true, personalBest: true });
    audio.playEvents([ending], state, { foreground: true, personalBest: true });
    expect(f.media.get(CRYSTAL_AUDIO.record)?.played).toBe(1);
    audio.setActive(false);
    expect(f.media.get(CRYSTAL_AUDIO.record)?.paused).toBe(false);
    audio.dispose();
  });

  it('plays one result cue when the player ends an already-dead attempt', async () => {
    const f = fixture();
    const audio = createStandaloneAudio(f.ports, DEFAULT_PRACTICE_SETTINGS);
    audio.setActive(true);
    await audio.unlock();
    audio.setActive(false);
    const ending: RunEvent = {
      type: 'run-ended',
      activeTimeMs: 1,
      observedAt: 1,
      result: {} as Extract<RunEvent, { type: 'run-ended' }>['result'],
    };
    audio.playEvents([ending, ending], state, { foreground: true, personalBest: true });
    expect(f.media.get(CRYSTAL_AUDIO.record)?.played).toBe(1);
    audio.dispose();
  });

  it('does not resurrect music from an old pending play after interruption', async () => {
    const f = fixture();
    f.deferMusic();
    const audio = createStandaloneAudio(f.ports, DEFAULT_PRACTICE_SETTINGS);
    audio.setActive(true);
    const unlocked = audio.unlock();
    expect(f.media.get(CRYSTAL_AUDIO.music)?.played).toBe(1);
    audio.setForeground(false);
    f.resolveMusic();
    expect(await unlocked).toBe(false);
    expect(f.media.get(CRYSTAL_AUDIO.music)?.paused).toBe(true);
    audio.dispose();
  });
});
