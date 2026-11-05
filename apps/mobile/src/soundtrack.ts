import { useThemeId } from './store-context';
import { useThemeMusic } from './theme-music';
import { useEffect, useRef } from 'react';
import { getGameplayLifecycle } from './gameplay-lifecycle';

export type SoundtrackScene = 'home' | 'run' | 'ended';
export const SOUNDTRACKS = {
  home: {
    file: 'home-ambient.m4a',
    start: 0,
    duration: null,
    loop: true,
    loopStart: 0,
    loopEnd: 0,
  },
  run: {
    file: 'gameplay-tension.m4a',
    start: 14,
    duration: null,
    loop: true,
    loopStart: 28,
    loopEnd: 181,
  },
  // Only the owner's 2:47–3:34 excerpt is bundled; zero is 2:47 in deathrow.mp3.
  ended: {
    file: 'run-ended-deathrow.m4a',
    start: 0,
    duration: 47,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
  },
} as const;

export function soundtrackOffset(scene: SoundtrackScene, elapsed: number) {
  const track = SOUNDTRACKS[scene];
  const position = track.start + elapsed;
  return track.loopEnd && position >= track.loopEnd
    ? track.loopStart + ((position - track.loopEnd) % (track.loopEnd - track.loopStart))
    : position;
}

/** Sample-scheduled playback window, including an exact end after pause/resume. */
export function soundtrackPlayback(
  scene: SoundtrackScene,
  elapsed: number,
  bufferDuration: number,
) {
  const track = SOUNDTRACKS[scene];
  const position = soundtrackOffset(scene, elapsed);
  const offset = track.loop && !track.loopEnd ? position % bufferDuration : position;
  const duration =
    track.duration === null
      ? null
      : Math.max(0, Math.min(bufferDuration, track.start + track.duration) - offset);
  return { offset, duration };
}

let context: AudioContext | null = null;
const buffers = new Map<SoundtrackScene, AudioBuffer>();
const loading = new Map<SoundtrackScene, Promise<AudioBuffer>>();
export function softenLoopBoundary(
  buffer: Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'getChannelData'>,
) {
  const count = Math.round(buffer.sampleRate * 0.08);
  const end = Math.round(buffer.sampleRate * 181);
  const begin = Math.round(buffer.sampleRate * 28);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < count; i++) {
      const blend = 0.5 - 0.5 * Math.cos((Math.PI * i) / (count - 1));
      data[end - count + i] = data[end - count + i] * (1 - blend) + data[begin - count + i] * blend;
    }
  }
}
const owners = new Map<object, readonly SoundtrackScene[]>();
function needed(scene: SoundtrackScene) {
  return [...owners.values()].some((scenes) => scenes.includes(scene));
}
function prune() {
  for (const scene of buffers.keys()) if (!needed(scene)) buffers.delete(scene);
}

async function load(scene: SoundtrackScene, audio: AudioContext) {
  if (buffers.has(scene)) return buffers.get(scene)!;
  if (!loading.has(scene))
    loading.set(
      scene,
      (async () => {
        const response = await fetch(
          import.meta.env.BASE_URL + 'assets/music/' + SOUNDTRACKS[scene].file,
        );
        if (!response.ok) throw new Error('Soundtrack unavailable');
        const buffer = await audio.decodeAudioData(await response.arrayBuffer());
        if (scene === 'run') {
          if (buffer.duration <= 181) throw new Error('Soundtrack loop exceeds source');
          // Join the last 80 ms to the material just before 28 s. The wrap itself
          // is sample-scheduled by Web Audio, without a timeupdate/seek gap.
          softenLoopBoundary(buffer);
        }
        if (needed(scene)) buffers.set(scene, buffer);
        return buffer;
      })().finally(() => {
        loading.delete(scene);
      }),
    );
  return loading.get(scene)!;
}

/** Scene music owns no gameplay timers. Pause/mute/background retain the position. */
export function useSoundtrack(
  scene: SoundtrackScene | null,
  enabled: boolean,
  prepareEnding = false,
) {
  const theme = useThemeId();
  useThemeMusic(scene, enabled, theme);
  const update = useRef<
    ((scene: SoundtrackScene | null, enabled: boolean, prepareEnding: boolean) => void) | null
  >(null);
  useEffect(() => {
    if (typeof AudioContext === 'undefined') return;
    context ??= new AudioContext();
    const audio = context;
    const owner = {};
    const lifecycle = getGameplayLifecycle();
    const gain = audio.createGain();
    gain.gain.value = 0.4;
    gain.connect(audio.destination);
    let desired: SoundtrackScene | null = null;
    let allowed = false,
      foreground =
        document.visibilityState !== 'hidden' && lifecycle.getSnapshot()?.active !== false,
      disposed = false;
    let source: AudioBufferSourceNode | null = null;
    let elapsed = 0,
      started = 0,
      completed = false,
      epoch = 0;
    function stop() {
      epoch++;
      if (source) {
        elapsed += Math.max(0, audio.currentTime - started);
        source.onended = null;
        source.stop();
        source.disconnect();
        source = null;
      }
    }
    function sync() {
      if (disposed || !desired || !allowed || !foreground || completed || source) return;
      const selected = desired,
        ticket = epoch;
      void load(selected, audio)
        .then((buffer) => {
          if (
            disposed ||
            ticket !== epoch ||
            desired !== selected ||
            !allowed ||
            !foreground ||
            source ||
            completed
          )
            return;
          const track = SOUNDTRACKS[selected];
          const { offset, duration } = soundtrackPlayback(selected, elapsed, buffer.duration);
          if (offset >= buffer.duration || duration === 0) {
            completed = true;
            return;
          }
          source = audio.createBufferSource();
          source.buffer = buffer;
          source.loop = track.loop;
          source.loopStart = track.loopStart;
          source.loopEnd = track.loopEnd;
          source.connect(gain);
          started = audio.currentTime;
          source.onended = () => {
            source?.disconnect();
            source = null;
            completed = true;
          };
          if (duration === null) source.start(0, offset);
          else source.start(0, offset, duration);
        })
        .catch(() => {
          /* Missing audio must never interrupt a crossing. */
        });
    }
    update.current = (next, music, prepare) => {
      if (next !== desired) {
        stop();
        desired = next;
        elapsed = 0;
        completed = false;
      }
      allowed = music;
      owners.set(owner, [
        ...(music && desired ? [desired] : []),
        ...(prepare ? ['ended' as const] : []),
      ]);
      prune();
      if (prepare) void load('ended', audio).catch(() => {});
      if (!allowed || !desired) stop();
      else sync();
    };
    const gesture = () => {
      void audio
        .resume()
        .then(sync)
        .catch(() => {});
      sync();
    };
    const unsubscribe = lifecycle.subscribe((snapshot) => {
      foreground = snapshot.active && document.visibilityState !== 'hidden';
      if (!foreground) stop();
      else sync();
    });
    const visibility = () => {
      foreground =
        document.visibilityState !== 'hidden' && lifecycle.getSnapshot()?.active !== false;
      if (!foreground) stop();
      else sync();
    };
    document.addEventListener('pointerdown', gesture);
    document.addEventListener('keydown', gesture);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      stop();
      owners.delete(owner);
      prune();
      gain.disconnect();
      unsubscribe();
      update.current = null;
      document.removeEventListener('pointerdown', gesture);
      document.removeEventListener('keydown', gesture);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    update.current?.(
      theme === 'obsidian' ? scene : null,
      enabled && theme === 'obsidian',
      prepareEnding && theme === 'obsidian',
    );
  }, [scene, enabled, prepareEnding, theme]);
}
