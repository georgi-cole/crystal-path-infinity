import { useCallback, useEffect, useRef } from 'react';
import { LANDING_HOLD_MS } from './campaign-landing';
import { getGameplayLifecycle } from './gameplay-lifecycle';
import type { PracticeSettings } from './practice-save';

export type MissionAudioPhase =
  'landing' | 'transition' | 'celebration' | 'result' | 'failed' | null;
export const MISSION_AUDIO_FILES = {
  landing: 'mission-complete.mp3',
  failed: 'mission-failed.mp3',
  music: 'crystal-path-campaign.mp3',
} as const;
export const CAMPAIGN_MUSIC_START_SECONDS = 3;
export interface MissionMedia {
  loop: boolean;
  volume: number;
  currentTime: number;
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'ended' | 'error' | 'loadedmetadata', listener: () => void): void;
  removeEventListener(type: 'ended' | 'error' | 'loadedmetadata', listener: () => void): void;
}
/** Audio owns presentation only: missing/blocked media cannot hold a completed run. */
export function createMissionAudio(
  createMedia: (url: string) => MissionMedia,
  assets: Partial<Record<keyof typeof MISSION_AUDIO_FILES, string>>,
  onLandingComplete: () => void = () => {},
) {
  const tracks = Object.fromEntries(
    Object.entries(assets).map(([slot, url]) => [slot, createMedia(url)]),
  ) as Partial<Record<keyof typeof MISSION_AUDIO_FILES, MissionMedia>>;
  if (tracks.music) tracks.music.volume = 0.4;
  let phase: MissionAudioPhase = null;
  let foreground = true;
  let enabled = { soundEffects: false, music: false };
  let disposed = false;
  let dismissed = false;
  let musicPlaying = false;
  let musicNeedsStart = true;
  let musicEpoch = 0;
  let cueEpoch = 0;
  let cueDone = false;
  let landingReady = false;
  let landingDelivered = false;
  let minimumTimer: ReturnType<typeof setTimeout> | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let releaseCue: (() => void) | undefined;
  const stop = (media?: MissionMedia) => {
    try {
      media?.pause();
      if (media) media.currentTime = 0;
    } catch {
      /* Presentation must never interrupt the result. */
    }
  };
  function clearCue() {
    ++cueEpoch;
    releaseCue?.();
    releaseCue = undefined;
    clearTimeout(minimumTimer);
    clearTimeout(fallbackTimer);
    stop(tracks.landing);
    stop(tracks.failed);
  }
  function deliverLanding() {
    if (disposed || phase !== 'landing' || !cueDone || !landingReady || landingDelivered) return;
    landingDelivered = true;
    onLandingComplete();
  }
  function wantsMusic() {
    return (
      !disposed &&
      !dismissed &&
      foreground &&
      enabled.music &&
      (phase === 'transition' || phase === 'celebration' || phase === 'result')
    );
  }
  function syncMusic() {
    const media = tracks.music;
    const wants = wantsMusic();
    if (!media || wants === musicPlaying) return;
    if (wants && media.readyState < 1) return;
    musicPlaying = wants;
    const epoch = ++musicEpoch;
    try {
      if (wants) {
        if (musicNeedsStart) {
          media.currentTime = CAMPAIGN_MUSIC_START_SECONDS;
          musicNeedsStart = false;
        }
        void media
          .play()
          .then(() => {
            if (!wantsMusic()) media.pause();
          })
          .catch(() => {
            if (musicEpoch === epoch) musicPlaying = false;
          });
      } else media.pause();
    } catch {
      musicPlaying = false;
    }
  }
  const repeatMusic = () => {
    musicPlaying = false;
    musicNeedsStart = true;
    syncMusic();
  };
  tracks.music?.addEventListener('loadedmetadata', syncMusic);
  tracks.music?.addEventListener('ended', repeatMusic);
  return {
    update(
      next: MissionAudioPhase,
      settings: Pick<PracticeSettings, 'soundEffects' | 'music' | 'reducedMotion'>,
    ) {
      if (disposed) return;
      enabled = settings;
      if (next !== phase) {
        clearCue();
        phase = next;
        if (next === null || next === 'landing' || next === 'failed') dismissed = false;
        if (next === 'landing' || next === 'failed') {
          const epoch = cueEpoch;
          cueDone = false;
          landingReady = false;
          landingDelivered = false;
          if (next === 'landing')
            minimumTimer = setTimeout(
              () => {
                landingReady = true;
                deliverLanding();
              },
              settings.reducedMotion ? 100 : LANDING_HOLD_MS,
            );
          const media = tracks[next];
          const finish = () => {
            if (disposed || cueEpoch !== epoch || phase !== next || cueDone) return;
            cueDone = true;
            clearTimeout(fallbackTimer);
            stop(media);
            deliverLanding();
          };
          if (!foreground || !settings.soundEffects || !media) finish();
          else {
            media.loop = false;
            media.addEventListener('ended', finish);
            media.addEventListener('error', finish);
            releaseCue = () => {
              media.removeEventListener('ended', finish);
              media.removeEventListener('error', finish);
            };
            // The authored complete cue is short; a stalled decoder cannot strand the landing.
            if (next === 'landing') fallbackTimer = setTimeout(finish, 6000);
            try {
              void media
                .play()
                .then(() => {
                  if (disposed || !foreground || !enabled.soundEffects || phase !== next || cueDone)
                    media.pause();
                })
                .catch(finish);
            } catch {
              finish();
            }
          }
        }
        if (next === null || next === 'failed' || next === 'landing') {
          musicPlaying = false;
          musicNeedsStart = true;
          ++musicEpoch;
          stop(tracks.music);
        }
      }
      if (!settings.soundEffects) {
        stop(tracks.landing);
        stop(tracks.failed);
        cueDone = true;
        deliverLanding();
      }
      syncMusic();
    },
    setForeground(active: boolean) {
      if (disposed || foreground === active) return;
      foreground = active;
      if (!active) {
        // An interrupted one-shot cue never replays on return.
        stop(tracks.landing);
        stop(tracks.failed);
        cueDone = true;
        deliverLanding();
      }
      syncMusic();
    },
    activate: syncMusic,
    dismiss() {
      dismissed = true;
      clearCue();
      syncMusic();
      stop(tracks.music);
      musicNeedsStart = true;
    },
    dispose() {
      disposed = true;
      clearCue();
      ++musicEpoch;
      tracks.music?.removeEventListener('loadedmetadata', syncMusic);
      tracks.music?.removeEventListener('ended', repeatMusic);
      Object.values(tracks).forEach(stop);
    },
  };
}
export function useMissionAudio(
  phase: MissionAudioPhase,
  settings: PracticeSettings,
  onLandingComplete: () => void,
) {
  const owner = useRef<ReturnType<typeof createMissionAudio> | null>(null);
  const completed = useRef(onLandingComplete);
  useEffect(() => {
    completed.current = onLandingComplete;
  }, [onLandingComplete]);
  useEffect(() => {
    const assets = Object.fromEntries(
      Object.entries(MISSION_AUDIO_FILES).map(([slot, file]) => [
        slot,
        import.meta.env.BASE_URL + 'assets/music/' + file,
      ]),
    );
    const audio = createMissionAudio(
      (url) => {
        const media = new Audio(url);
        media.preload = 'auto';
        return media;
      },
      assets,
      () => completed.current(),
    );
    owner.current = audio;
    const lifecycle = getGameplayLifecycle();
    const refresh = () =>
      audio.setForeground(
        document.visibilityState !== 'hidden' && lifecycle.getSnapshot()?.active !== false,
      );
    refresh();
    const unsubscribe = lifecycle.subscribe(refresh);
    document.addEventListener('visibilitychange', refresh);
    document.addEventListener('pointerdown', audio.activate);
    document.addEventListener('keydown', audio.activate);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', refresh);
      document.removeEventListener('pointerdown', audio.activate);
      document.removeEventListener('keydown', audio.activate);
      audio.dispose();
      if (owner.current === audio) owner.current = null;
    };
  }, []);
  useEffect(() => owner.current?.update(phase, settings), [phase, settings]);
  return useCallback(() => owner.current?.dismiss(), []);
}
