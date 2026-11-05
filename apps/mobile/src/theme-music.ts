import { useEffect, useRef } from 'react';
import type { ThemeId } from './store-catalog';
import type { SoundtrackScene } from './soundtrack';
import { getGameplayLifecycle } from './gameplay-lifecycle';

/** One bounded local loop, stopped on mute, OS background and owner disposal. */
export function useThemeMusic(scene: SoundtrackScene | null, enabled: boolean, theme: ThemeId) {
  const allowed = useRef(enabled);

  const control = useRef<(() => void) | null>(null);
  useEffect(() => {
    allowed.current = enabled;
    control.current?.();
  }, [enabled]);
  useEffect(() => {
    if (theme === 'obsidian' || !scene || typeof Audio === 'undefined') return;
    const media = new Audio(
      import.meta.env.BASE_URL +
        `assets/themes/${theme}-${scene === 'ended' ? 'ended' : 'loop'}.wav`,
    );
    media.loop = scene !== 'ended';
    media.volume = scene === 'home' ? 0.2 : 0.25;
    media.preload = 'auto';
    const lifecycle = getGameplayLifecycle();
    let disposed = false;
    let active = lifecycle.getSnapshot()?.active !== false;
    let starting = false;
    function permitted() {
      return !disposed && allowed.current && active && !document.hidden;
    }
    function sync() {
      if (!permitted()) {
        media.pause();
        return;
      }
      if (!media.paused || starting || (media.ended && !media.loop)) return;
      starting = true;
      void media
        .play()
        .then(() => {
          if (!permitted()) media.pause();
        })
        .catch(() => {})
        .finally(() => {
          starting = false;
        });
    }
    control.current = sync;
    const unsubscribe = lifecycle.subscribe((snapshot) => {
      active = snapshot.active;
      sync();
    });
    document.addEventListener('pointerdown', sync);
    document.addEventListener('keydown', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      disposed = true;
      media.pause();
      media.removeAttribute('src');
      media.load();
      control.current = null;
      unsubscribe();
      document.removeEventListener('pointerdown', sync);
      document.removeEventListener('keydown', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [theme, scene]);
  useEffect(() => {
    control.current?.();
  }, [enabled]);
}
