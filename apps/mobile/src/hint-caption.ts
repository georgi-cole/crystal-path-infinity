import type { PracticeStorage } from './practice-save';

export const HINT_CAPTION_KEY = 'cpi.ui.hint-caption.v1';
/** Only presentation is remembered; no hint inventory or run data lives here. */
export function createHintCaptionGate(storage: () => Pick<PracticeStorage, 'getItem' | 'setItem'>) {
  let claimed = false;
  return {
    claim() {
      if (claimed) return false;
      claimed = true;
      try {
        const store = storage();
        if (store.getItem(HINT_CAPTION_KEY) === 'seen') return false;
        store.setItem(HINT_CAPTION_KEY, 'seen');
      } catch {
        /* Once per mount if this device cannot remember preferences. */
      }
      return true;
    },
  };
}
