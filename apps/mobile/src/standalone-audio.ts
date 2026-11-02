import type { RunEvent, RunState } from '@crystal-path-infinity/game-core';
import type { PracticeSettings } from './practice-save';

export const CRYSTAL_AUDIO = Object.freeze({
  safe: '/assets/sounds/minigames/minigame_gb_safe_step.mp3',
  death: '/assets/sounds/minigames/minigame_gb_death.mp3',
  record: '/assets/sounds/minigames/minigame_gb_winner.mp3',
  newTurn: '/assets/sounds/minigames/minigame_gb_new_turn.mp3',
  // Original offline interim music, NOT the Big Eye glass_bridge.mp3.
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
  /** Explicit OS foreground transition stops every cue, even a death tail. */
  setForeground(foreground: boolean): void;
  setSettings(settings: PracticeSettings): void;
  /** Called synchronously from an actual user gesture. Autoplay failures are benign. */
  unlock(): Promise<boolean>;
  playEvents(
    events: readonly RunEvent[],
    state: RunState,
    options: { foreground: boolean; personalBest: boolean },
  ): void;
  dispose(): void;
}

/** One owner per attempt; no global SoundManager, clocks, score writes or timers. */
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
  let foreground = true;
  let unlocked = false;
  let disposed = false;
  let musicEpoch = 0;
  let musicPlaying = false;
  let musicStarting: Promise<boolean> | null = null;
  let startingEpoch: number | null = null;
  let terminalTail: 'death' | 'record' | null = null;
  let lastStep = '';
  let lastDeath = '';
  let ended = false;
  let introPlayed = false;

  function stopEffects(preserveTerminal = false) {
    for (const [name, media] of Object.entries(sfx)) {
      if (preserveTerminal && name === terminalTail) continue;
      media.pause();
      media.currentTime = 0;
    }
    if (!preserveTerminal) terminalTail = null;
  }
  function stopMusic() {
    musicEpoch += 1;
    musicPlaying = false;
    music.pause();
  }
  function canPlayMusic() {
    return !disposed && active && foreground && unlocked && preferences.music;
  }
  function startMusic(): Promise<boolean> {
    if (!canPlayMusic()) return Promise.resolve(false);
    if (musicPlaying && !music.paused) return Promise.resolve(true);
    if (musicStarting) {
      const pending = musicStarting;
      if (startingEpoch === musicEpoch) return pending;
      // A pending play from before a pause must settle before the resumed play.
      return pending.then(() => startMusic());
    }
    const epoch = musicEpoch;
    startingEpoch = epoch;
    try {
      const request = music.play();
      const pending = Promise.resolve(request)
        .then(() => {
          if (!canPlayMusic() || epoch !== musicEpoch) {
            music.pause();
            return false;
          }
          musicPlaying = true;
          return true;
        })
        .catch(() => {
          musicPlaying = false;
          return false;
        })
        .finally(() => {
          if (musicStarting === pending) {
            musicStarting = null;
            startingEpoch = null;
          }
        });
      musicStarting = pending;
      return pending;
    } catch {
      musicPlaying = false;
      musicStarting = null;
      startingEpoch = null;
      return Promise.resolve(false);
    }
  }
  function cue(name: keyof typeof sfx, playbackRate = 1) {
    if (disposed || !active || !foreground || !unlocked || !preferences.soundEffects) return;
    const media = sfx[name];
    try {
      media.pause();
      media.currentTime = 0;
      media.playbackRate = playbackRate;
      void Promise.resolve(media.play()).catch(() => {});
    } catch {
      // Muted platform, codec failure or autoplay rejection may not block a step.
    }
  }
  function pulse(kind: HapticKind) {
    if (disposed || !active || !foreground || !preferences.haptics) return;
    try {
      void Promise.resolve(ports.haptic(kind)).catch(() => {});
    } catch {
      // Haptics are an optional accessibility preference.
    }
  }
  return {
    setActive(next) {
      if (disposed || active === next) return;
      active = next;
      if (!active) {
        stopMusic();
        // A fatal/result cue may finish while gameplay stops. OS background
        // and disposal still stop it immediately.
        stopEffects(terminalTail !== null && foreground);
      } else {
        terminalTail = null;
        void startMusic();
      }
    },
    setForeground(next) {
      if (disposed || foreground === next) return;
      foreground = next;
      if (!foreground) {
        stopMusic();
        stopEffects();
      } else {
        void startMusic();
      }
    },
    setSettings(next) {
      if (disposed) return;
      const prior = preferences;
      preferences = next;
      if (!next.music) stopMusic();
      else if (!prior.music) void startMusic();
      if (!next.soundEffects) stopEffects();
    },
    async unlock() {
      if (disposed || !active || !foreground) return false;
      unlocked = true;
      if (!introPlayed) {
        introPlayed = true;
        cue('newTurn');
      }
      if (!preferences.music) return true;
      return startMusic();
    },
    playEvents(events, state, options) {
      if (disposed || !active || !foreground || !options.foreground) return;
      const death = events.find((event) => event.type === 'death');
      if (death?.type === 'death' && lastDeath !== death.death.id) {
        lastDeath = death.death.id;
        stopEffects();
        terminalTail = 'death';
        cue('death');
        pulse('end');
        return; // A fatal crack never layers with a death/record cue.
      }
      for (const event of events) {
        if (event.type === 'choice-resolved') {
          // One ID only: unlimited rows never mean unlimited deduplication memory.
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
          terminalTail = null;
          cue('newTurn');
        } else if (event.type === 'run-ended' && !ended) {
          ended = true;
          stopEffects();
          if (options.personalBest) {
            terminalTail = 'record';
            cue('record');
          }
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
