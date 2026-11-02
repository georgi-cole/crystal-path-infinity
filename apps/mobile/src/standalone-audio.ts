import type { RunEvent, RunState } from '@crystal-path-infinity/game-core';
import type { PracticeSettings } from './practice-save';

export const CRYSTAL_AUDIO = Object.freeze({
  safe: '/assets/sounds/minigames/minigame_gb_safe_step.mp3',
  death: '/assets/sounds/minigames/minigame_gb_death.mp3',
  record: '/assets/sounds/minigames/minigame_gb_winner.mp3',
  newTurn: '/assets/sounds/minigames/minigame_gb_new_turn.mp3',
  // An original, offline interim bed; the Big Eye glass_bridge.mp3 still needs clearance/import.
  music: '/assets/music/crystal-ambient-interim.wav',
});
export type HapticKind = 'step' | 'damage' | 'end';

export interface AudioMedia {
  loop: boolean;
  volume: number;
  playbackRate: number;
  currentTime: number;
  readonly paused: boolean;
  preload: string;
  play(): Promise<void> | void;
  pause(): void;
}
export interface AudioPorts {
  readonly createMedia: (source: string) => AudioMedia;
  readonly haptic: (kind: HapticKind) => Promise<void> | void;
}
export interface StandaloneAudio {
  setActive(active: boolean): void;
  setSettings(settings: PracticeSettings): void;
  /** Call directly from a user gesture; autoplay rejection never blocks gameplay. */
  unlock(): Promise<boolean>;
  playEvents(events: readonly RunEvent[], state: RunState, options: { foreground: boolean; personalBest: boolean }): void;
  dispose(): void;
}

export function createStandaloneAudio(ports: AudioPorts, settings: PracticeSettings): StandaloneAudio {
  const music = ports.createMedia(CRYSTAL_AUDIO.music);
  music.loop = true;
  music.volume = 0.28;
  music.preload = 'auto';
  const sfx = {
    safe: ports.createMedia(CRYSTAL_AUDIO.safe),
    death: ports.createMedia(CRYSTAL_AUDIO.death),
    record: ports.createMedia(CRYSTAL_AUDIO.record),
    newTurn: ports.createMedia(CRYSTAL_AUDIO.newTurn),
  };
  for (const media of Object.values(sfx)) {
    media.loop = false;
    media.volume = 0.68;
    media.preload = 'auto';
  }
  let preferences = settings;
  let active = false;
  let unlocked = false;
  let disposed = false;
  let musicEpoch = 0;
  let playingMusic = false;
  let musicStarting: Promise<boolean> | null = null;
  let lastStep = '';
  let lastDeath = '';
  let ended = false;
  let introPlayed = false;

  function stopEffects() {
    for (const media of Object.values(sfx)) {
      media.pause();
      media.currentTime = 0;
    }
  }
  function stopMusic() {
    musicEpoch += 1;
    playingMusic = false;
    music.pause();
  }
  function startMusic(): Promise<boolean> {
    if (disposed || !active || !unlocked || !preferences.music) return Promise.resolve(false);
    if (playingMusic && !music.paused) return Promise.resolve(true);
    if (musicStarting) return musicStarting;
    const epoch = musicEpoch;
    try {
      const attempt = music.play();
      const pending = Promise.resolve(attempt)
        .then(() => {
          if (disposed || epoch !== musicEpoch || !active || !preferences.music) {
            music.pause();
            return false;
          }
          playingMusic = true;
          return true;
        })
        .catch(() => {
          playingMusic = false;
          return false;
        })
        .finally(() => {
          if (musicStarting === pending) musicStarting = null;
        });
      musicStarting = pending;
      return pending;
    } catch {
      playingMusic = false;
      return Promise.resolve(false);
    }
  }
  function cue(name: keyof typeof sfx, rate = 1) {
    if (disposed || !active || !unlocked || !preferences.soundEffects) return;
    const media = sfx[name];
    try {
      media.pause();
      media.currentTime = 0;
      media.playbackRate = rate;
      void Promise.resolve(media.play()).catch(() => {});
    } catch {
      // Audio interruptions, unsupported codecs and autoplay policy are nonfatal.
    }
  }
  function pulse(kind: HapticKind) {
    if (disposed || !active || !preferences.haptics) return;
    try {
      void Promise.resolve(ports.haptic(kind)).catch(() => {});
    } catch {
      // Haptics are always optional.
    }
  }
  return {
    setActive(next) {
      if (disposed || active === next) return;
      active = next;
      if (!active) {
        stopMusic();
        stopEffects();
      } else {
        void startMusic();
      }
    },
    setSettings(next) {
      if (disposed) return;
      const old = preferences;
      preferences = next;
      if (!next.music) stopMusic();
      else if (!old.music) void startMusic();
      if (!next.soundEffects) stopEffects();
    },
    async unlock() {
      if (disposed || !active) return false;
      unlocked = true;
      if (!introPlayed) {
        introPlayed = true;
        cue('newTurn');
      }
      if (!preferences.music) return true;
      return startMusic();
    },
    playEvents(events, state, options) {
      if (disposed || !active || !options.foreground) return;
      const death = events.find((event) => event.type === 'death');
      if (death?.type === 'death' && lastDeath !== death.death.id) {
        lastDeath = death.death.id;
        cue('death');
        pulse('end');
        return; // Never stack a fatal crack, death and record cue.
      }
      for (const event of events) {
        if (event.type === 'choice-resolved') {
          // Constant-size guard: a long endless run never accumulates cue IDs.
          const key = state.runId + ':' + state.revivesApplied + ':' + event.row;
          if (lastStep === key) continue;
          lastStep = key;
          if (event.wrong) {
            cue('safe', 0.72);
            pulse('damage');
          } else {
            cue('safe');
            pulse('step');
          }
        } else if (event.type === 'revive-applied') {
          lastStep = '';
          cue('newTurn');
        } else if (event.type === 'run-ended' && !ended) {
          ended = true;
          stopEffects();
          if (options.personalBest) cue('record');
          pulse('end');
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      stopMusic();
      stopEffects();
    },
  };
}
