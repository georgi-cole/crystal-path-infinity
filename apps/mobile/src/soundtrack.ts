import { useCallback, useEffect, useRef, useState } from 'react';
import { getGameplayLifecycle } from './gameplay-lifecycle';

export type SoundtrackScene = 'home' | 'run' | 'ended';
type BufferedScene = Exclude<SoundtrackScene, 'home'>;
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
const buffers = new Map<BufferedScene, AudioBuffer>();
const loading = new Map<BufferedScene, Promise<AudioBuffer>>();
const musicUrl = (scene: SoundtrackScene) =>
  import.meta.env.BASE_URL + 'assets/music/' + SOUNDTRACKS[scene].file;

function soundtrackContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    return (context ??= new AudioContext());
  } catch {
    return null;
  }
}

function resumeSoundtrack() {
  const audio = soundtrackContext();
  if (audio && audio.state !== 'running') void audio.resume().catch(() => {});
}
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
const owners = new Map<object, readonly BufferedScene[]>();
function needed(scene: BufferedScene) {
  return [...owners.values()].some((scenes) => scenes.includes(scene));
}
function prune() {
  for (const scene of buffers.keys()) if (!needed(scene)) buffers.delete(scene);
}

async function load(scene: BufferedScene, audio: AudioContext, priority: RequestPriority = 'auto') {
  if (buffers.has(scene)) return buffers.get(scene)!;
  if (!loading.has(scene))
    loading.set(
      scene,
      (async () => {
        const response = await fetch(musicUrl(scene), { priority });
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

/** Stream the menu track while warming the sample-scheduled crossing track. */
export function useHomeSoundtrack(menu: boolean, launchComplete: boolean, music: boolean) {
  const [awaitingGesture, setAwaitingGesture] = useState(false);
  const update = useRef<((menu: boolean, launchComplete: boolean, music: boolean) => void) | null>(
    null,
  );
  const activateRef = useRef<(() => void) | null>(null);
  const activate = useCallback(() => activateRef.current?.(), []);

  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    const media = new Audio();
    media.loop = true;
    media.preload = 'auto';
    media.volume = 0.4;
    const lifecycle = getGameplayLifecycle();
    const owner = {};
    let inMenu = false;
    let launched = false;
    let enabled = false;
    let disposed = false;
    let foreground =
      document.visibilityState !== 'hidden' && lifecycle.getSnapshot()?.active !== false;

    const wantsMusic = () => !disposed && inMenu && launched && enabled && foreground;
    function prepareHome() {
      if (!media.getAttribute('src')) media.src = musicUrl('home');
    }
    function play() {
      prepareHome();
      if (!media.paused) return;
      void media.play().catch((error: unknown) => {
        if (
          wantsMusic() &&
          media.paused &&
          error instanceof DOMException &&
          error.name === 'NotAllowedError'
        )
          setAwaitingGesture(true);
      });
    }
    function sync() {
      if (wantsMusic()) play();
      else media.pause();
    }
    const playing = () => setAwaitingGesture(false);
    const gesture = () => {
      if (!inMenu || !enabled || !foreground) return;
      resumeSoundtrack();
      if (wantsMusic()) play();
    };
    const visibility = () => {
      const next =
        document.visibilityState !== 'hidden' && lifecycle.getSnapshot()?.active !== false;
      if (next === foreground) return;
      foreground = next;
      sync();
    };
    activateRef.current = () => {
      resumeSoundtrack();
      if (inMenu && launched && foreground) play();
    };
    update.current = (nextMenu, nextLaunchComplete, nextMusic) => {
      const leavingMenu = inMenu && !nextMenu;
      inMenu = nextMenu;
      launched = nextLaunchComplete;
      enabled = nextMusic;
      if (inMenu && enabled) {
        prepareHome();
        const audio = soundtrackContext();
        if (audio) {
          owners.set(owner, ['run']);
          void load('run', audio, 'low').catch(() => {});
        }
      } else {
        owners.delete(owner);
        // The crossing registers its claim in the same React commit.
        queueMicrotask(prune);
      }
      sync();
      if (leavingMenu && media.readyState > 0) media.currentTime = 0;
    };
    const unsubscribe = lifecycle.subscribe(visibility);
    media.addEventListener('playing', playing);
    document.addEventListener('click', gesture, true);
    document.addEventListener('keydown', gesture, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      media.removeEventListener('playing', playing);
      media.pause();
      media.removeAttribute('src');
      media.load();
      owners.delete(owner);
      queueMicrotask(prune);
      unsubscribe();
      update.current = null;
      activateRef.current = null;
      document.removeEventListener('click', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => update.current?.(menu, launchComplete, music), [menu, launchComplete, music]);
  return { activate, awaitingGesture };
}

/** Scene music owns no gameplay timers. Pause/mute/background retain the position. */
export function useSoundtrack(
  scene: BufferedScene | null,
  enabled: boolean,
  prepareEnding = false,
) {
  const update = useRef<
    ((scene: BufferedScene | null, enabled: boolean, prepareEnding: boolean) => void) | null
  >(null);
  useEffect(() => {
    const availableContext = soundtrackContext();
    if (!availableContext) return;
    const audio = availableContext;
    const owner = {};
    const lifecycle = getGameplayLifecycle();
    const gain = audio.createGain();
    gain.gain.value = 0.4;
    gain.connect(audio.destination);
    let desired: BufferedScene | null = null;
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
      if (
        disposed ||
        !desired ||
        !allowed ||
        !foreground ||
        completed ||
        source ||
        audio.state !== 'running'
      )
        return;
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
            completed ||
            audio.state !== 'running'
          )
            return;
          const track = SOUNDTRACKS[selected];
          const { offset, duration } = soundtrackPlayback(selected, elapsed, buffer.duration);
          if (offset >= buffer.duration || duration === 0) {
            completed = true;
            return;
          }
          const node = audio.createBufferSource();
          node.buffer = buffer;
          node.loop = track.loop;
          node.loopStart = track.loopStart;
          node.loopEnd = track.loopEnd;
          node.connect(gain);
          started = audio.currentTime;
          node.onended = () => {
            node.disconnect();
            if (source === node) {
              source = null;
              completed = true;
            }
          };
          try {
            if (duration === null) node.start(0, offset);
            else node.start(0, offset, duration);
            source = node;
          } catch {
            node.disconnect();
          }
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
      owners.set(owner, [...(desired ? [desired] : []), ...(prepare ? ['ended' as const] : [])]);
      queueMicrotask(prune);
      if (prepare) void load('ended', audio).catch(() => {});
      if (!allowed || !desired) stop();
      else sync();
    };
    const gesture = () => {
      if (!foreground || !allowed) return;
      resumeSoundtrack();
      sync();
    };
    const visibility = () => {
      const next =
        document.visibilityState !== 'hidden' && lifecycle.getSnapshot()?.active !== false;
      if (next === foreground) return;
      foreground = next;
      if (!foreground) stop();
      else gesture();
    };
    const unsubscribe = lifecycle.subscribe(visibility);
    audio.addEventListener('statechange', sync);
    document.addEventListener('pointerup', gesture, true);
    document.addEventListener('click', gesture, true);
    document.addEventListener('keydown', gesture, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      stop();
      owners.delete(owner);
      queueMicrotask(prune);
      gain.disconnect();
      unsubscribe();
      update.current = null;
      audio.removeEventListener('statechange', sync);
      document.removeEventListener('pointerup', gesture, true);
      document.removeEventListener('click', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    update.current?.(scene, enabled, prepareEnding);
  }, [scene, enabled, prepareEnding]);
}
