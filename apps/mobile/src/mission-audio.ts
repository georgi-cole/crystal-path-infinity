import { useEffect, useRef } from 'react';
import { getGameplayLifecycle } from './gameplay-lifecycle';
import type { PracticeSettings } from './practice-save';

export type MissionAudioPhase = 'landing' | 'transition' | 'celebration' | 'result' | null;
export const MISSION_AUDIO_FILES = {
  landing: 'mission-complete.m4a',
  transition: 'mission-transition.m4a',
  music: 'mission-celebration.m4a',
} as const;
// Optional owner-supplied audio: absent files produce no request or broken playback.
const bundled = import.meta.glob<string>('./assets/campaign/mission-*.m4a', {
  eager: true,
  query: '?url',
  import: 'default',
});
export interface MissionMedia {
  loop: boolean;
  volume: number;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
}
export function createMissionAudio(
  createMedia: (url: string) => MissionMedia,
  assets: Partial<Record<keyof typeof MISSION_AUDIO_FILES, string>>,
) {
  const tracks = Object.fromEntries(
    Object.entries(assets).map(([slot, url]) => [slot, createMedia(url)]),
  ) as Partial<Record<keyof typeof MISSION_AUDIO_FILES, MissionMedia>>;
  if (tracks.music) {
    tracks.music.loop = true;
    tracks.music.volume = 0.4;
  }
  let phase: MissionAudioPhase = null;
  let foreground = true;
  let enabled = { soundEffects: false, music: false };
  let disposed = false;
  let musicPlaying = false;
  let musicEpoch = 0;
  let cueEpoch = 0;
  const stop = (media?: MissionMedia) => {
    try {
      media?.pause();
      if (media) media.currentTime = 0;
    } catch {
      /* An optional track must never interrupt the result. */
    }
  };
  function wantsMusic() {
    return (
      !disposed && foreground && enabled.music && (phase === 'celebration' || phase === 'result')
    );
  }
  function syncMusic() {
    const wants = wantsMusic();
    if (wants === musicPlaying) return;
    musicPlaying = wants;
    const epoch = ++musicEpoch;
    try {
      if (wants)
        void tracks.music
          ?.play()
          .then(() => {
            if (!wantsMusic()) tracks.music?.pause();
          })
          .catch(() => {
            if (musicEpoch === epoch) musicPlaying = false;
          });
      else tracks.music?.pause();
    } catch {
      musicPlaying = false;
    }
  }
  return {
    update(next: MissionAudioPhase, settings: Pick<PracticeSettings, 'soundEffects' | 'music'>) {
      if (disposed) return;
      enabled = settings;
      if (!settings.soundEffects) {
        cueEpoch++;
        stop(tracks.landing);
        stop(tracks.transition);
      }
      if (next !== phase) {
        const epoch = ++cueEpoch;
        stop(tracks.landing);
        stop(tracks.transition);
        phase = next;
        if (foreground && settings.soundEffects && (next === 'landing' || next === 'transition')) {
          const media = tracks[next];
          try {
            void media
              ?.play()
              .then(() => {
                if (disposed || !foreground || !enabled.soundEffects || cueEpoch !== epoch)
                  media.pause();
              })
              .catch(() => {});
          } catch {
            /* Missing/unsupported audio is silent. */
          }
        }
        if (next === null) stop(tracks.music);
      }
      syncMusic();
    },
    setForeground(active: boolean) {
      if (disposed) return;
      foreground = active;
      if (!active) {
        cueEpoch++;
        stop(tracks.landing);
        stop(tracks.transition);
      }
      syncMusic();
    },
    dispose() {
      disposed = true;
      cueEpoch++;
      musicEpoch++;
      Object.values(tracks).forEach(stop);
    },
  };
}
export function useMissionAudio(phase: MissionAudioPhase, settings: PracticeSettings) {
  const owner = useRef<ReturnType<typeof createMissionAudio> | null>(null);
  useEffect(() => {
    const assets = Object.fromEntries(
      Object.entries(MISSION_AUDIO_FILES).flatMap(([slot, file]) => {
        const url = bundled['./assets/campaign/' + file];
        return url ? [[slot, url]] : [];
      }),
    );
    const audio = createMissionAudio((url) => new Audio(url), assets);
    owner.current = audio;
    const lifecycle = getGameplayLifecycle();
    const refresh = () =>
      audio.setForeground(
        document.visibilityState !== 'hidden' && lifecycle.getSnapshot()?.active !== false,
      );
    refresh();
    const unsubscribe = lifecycle.subscribe(refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', refresh);
      audio.dispose();
      if (owner.current === audio) owner.current = null;
    };
  }, []);
  useEffect(() => owner.current?.update(phase, settings), [phase, settings]);
}
