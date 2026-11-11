import type { ThemeId } from './store-catalog';
import type { RunEvent, RunState, Season, Weather } from '@crystal-path-infinity/game-core';
import {
  presentRowPressure,
  getDeathClock,
  journeyForecast,
} from '@crystal-path-infinity/game-core';
import type { PracticeSettings } from './practice-save';
import { createJourneyAudio } from './journey-audio';
import lilySplash from './assets/campaign/lily-splash.wav?url';
import jellyBreak from './assets/campaign/jelly-break.wav?url';
import trampolineTear from './assets/campaign/trampoline-tear.wav?url';
import cosmicBreak from './assets/campaign/cosmic-break.wav?url';
import woodBreak from './assets/campaign/wood-break.wav?url';

export const CRYSTAL_AUDIO = Object.freeze({
  safe: import.meta.env.BASE_URL + 'assets/sounds/minigames/minigame_gb_safe_step.mp3',
  death: import.meta.env.BASE_URL + 'assets/sounds/minigames/minigame_gb_death.mp3',
  record: import.meta.env.BASE_URL + 'assets/sounds/minigames/minigame_gb_winner.mp3',
  newTurn: import.meta.env.BASE_URL + 'assets/sounds/minigames/minigame_gb_new_turn.mp3',
  box: import.meta.env.BASE_URL + 'assets/sounds/ui/ui_wildcard_draw.mp3',
  // Original offline interim music, NOT the Big Eye glass_bridge.mp3.
  music: import.meta.env.BASE_URL + 'assets/music/crystal-ambient-interim.wav',
  glass: import.meta.env.BASE_URL + 'assets/sounds/crystal-glass-fall.wav',
  lilySplash,
  jellyBreak,
  woodBreak,
  trampolineTear,
  cosmicBreak,
  alarm: import.meta.env.BASE_URL + 'assets/sounds/crystal-emergency.wav',
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
  readonly createAmbientContext?: () => AudioContext;
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
export function createStandaloneAudio(
  ports: AudioPorts,
  settings: PracticeSettings,
  theme: ThemeId = 'obsidian',
  surface:
    'glass' | 'lily' | 'jelly' | 'wood' | 'ice' | 'cookie' | 'trampoline' | 'cosmic' = 'glass',
): StandaloneAudio {
  const journeyAudio = ports.createAmbientContext && createJourneyAudio(ports.createAmbientContext);
  let journeyMix: Season | Weather | null = null;
  const music = ports.createMedia(CRYSTAL_AUDIO.music);
  music.loop = true;
  music.volume = 0.28;
  music.preload = 'auto';
  const sfx = {
    safe: ports.createMedia(CRYSTAL_AUDIO.safe),
    death: ports.createMedia(CRYSTAL_AUDIO.death),
    record: ports.createMedia(
      theme === 'obsidian'
        ? CRYSTAL_AUDIO.record
        : import.meta.env.BASE_URL + `assets/themes/${theme}-record.wav`,
    ),
    newTurn: ports.createMedia(CRYSTAL_AUDIO.newTurn),
    box: ports.createMedia(CRYSTAL_AUDIO.box),
    impact: ports.createMedia(
      surface === 'lily'
        ? CRYSTAL_AUDIO.lilySplash
        : surface === 'jelly'
          ? CRYSTAL_AUDIO.jellyBreak
          : surface === 'wood' || surface === 'cookie'
            ? CRYSTAL_AUDIO.woodBreak
            : surface === 'trampoline'
              ? CRYSTAL_AUDIO.trampolineTear
              : surface === 'cosmic'
                ? CRYSTAL_AUDIO.cosmicBreak
                : CRYSTAL_AUDIO.glass,
    ),
  };
  const alarm = ports.createMedia(CRYSTAL_AUDIO.alarm);
  alarm.loop = true;
  alarm.volume = 0.24;
  alarm.preload = 'auto';
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
  let lastMystery = '';
  let ended = false;
  let emergency = false;
  let alarmPlaying = false;
  let alarmEpoch = 0;
  let alarmStarting: Promise<void> | null = null;

  function syncJourney() {
    journeyAudio?.setMix(
      active && foreground && preferences.soundEffects && !emergency ? journeyMix : null,
    );
  }

  function stopAlarm() {
    alarmEpoch++;
    alarmPlaying = false;
    alarm.pause();
    alarm.currentTime = 0;
  }
  function canPlayAlarm() {
    return !disposed && active && foreground && unlocked && preferences.soundEffects && emergency;
  }
  function syncAlarm() {
    if (!canPlayAlarm()) {
      if (alarmPlaying || alarmStarting) stopAlarm();
      return;
    }
    if (alarmPlaying && !alarm.paused) return;
    if (alarmStarting) return;
    const epoch = alarmEpoch;
    try {
      const pending = Promise.resolve(alarm.play())
        .then(() => {
          if (!canPlayAlarm() || alarmEpoch !== epoch) {
            alarm.pause();
            return;
          }
          alarmPlaying = true;
        })
        .catch(() => {})
        .finally(() => {
          if (alarmStarting === pending) {
            alarmStarting = null;
            if (canPlayAlarm() && alarmEpoch !== epoch) syncAlarm();
          }
        });
      alarmStarting = pending;
    } catch {
      alarmPlaying = false;
    }
  }

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
  function cue(name: keyof typeof sfx, playbackRate = 1, allowInactive = false) {
    if (
      disposed ||
      (!active && !allowInactive) ||
      !foreground ||
      !unlocked ||
      !preferences.soundEffects
    )
      return;
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
  function pulse(kind: HapticKind, allowInactive = false) {
    if (disposed || (!active && !allowInactive) || !foreground || !preferences.haptics) return;
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
      syncJourney();
      if (!active) {
        stopAlarm();
        stopMusic();
        // A fatal/result cue may finish while gameplay stops. OS background
        // and disposal still stop it immediately.
        stopEffects(terminalTail !== null && foreground);
      } else {
        terminalTail = null;
        void startMusic();
        syncAlarm();
      }
    },
    setForeground(next) {
      if (disposed || foreground === next) return;
      foreground = next;
      syncJourney();
      if (!foreground) {
        stopAlarm();
        stopMusic();
        stopEffects();
      } else {
        void startMusic();
        syncAlarm();
      }
    },
    setSettings(next) {
      if (disposed) return;
      const prior = preferences;
      preferences = next;
      syncJourney();
      if (!next.music) stopMusic();
      else if (!prior.music) void startMusic();
      if (!next.soundEffects) stopEffects();
      if (!next.soundEffects) stopAlarm();
      else syncAlarm();
    },
    async unlock() {
      if (disposed || !active || !foreground) return false;
      unlocked = true;
      if (preferences.soundEffects) journeyAudio?.unlock();
      syncJourney();
      syncAlarm();
      if (!preferences.music) return true;
      return startMusic();
    },
    playEvents(events, state, options) {
      if (disposed || !foreground || !options.foreground) return;
      emergency =
        state.status === 'playing' &&
        ((state.sp > 0 && state.sp < 15) ||
          presentRowPressure(state)?.urgent === true ||
          (getDeathClock(state) !== null && state.activeTimeMs >= getDeathClock(state)!.warningAt));
      if (journeyAudio && state.stream.journey) {
        const forecast = journeyForecast(state.stream.journey, BigInt(state.currentRow));
        journeyMix =
          state.status === 'playing'
            ? forecast?.startsIn === 0n
              ? forecast.weather
              : state.stream.journey.season
            : null;
        syncJourney();
      }
      syncAlarm();
      const hasTerminal = events.some((event) => event.type === 'run-ended');
      if (!active && !hasTerminal) return;
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
            cue('impact', surface === 'ice' ? 0.84 : surface === 'cookie' ? 1.2 : 1);
            pulse('damage');
          } else {
            cue('safe');
            pulse('step');
          }
        } else if (event.type === 'mystery-resolved') {
          const key = state.runId + ':' + state.revivesApplied + ':' + event.row;
          if (lastMystery === key) continue;
          lastMystery = key;
          cue('box');
          if (event.spDelta < 0) pulse('damage');
        } else if (event.type === 'revive-applied') {
          lastStep = '';
          terminalTail = null;
          cue('newTurn');
        } else if (event.type === 'run-ended' && !ended) {
          ended = true;
          stopEffects();
          if (options.personalBest) {
            terminalTail = 'record';
            cue('record', 1, true);
          }
          pulse('end', true);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      stopMusic();
      stopAlarm();
      stopEffects();
      journeyAudio?.dispose();
    },
  };
}
