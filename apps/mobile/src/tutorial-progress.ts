import type { PracticeStorage } from './practice-save';

export const TUTORIAL_PROGRESS_KEY = 'cpi:tutorial:v1';
export type TutorialProgress = 'unseen' | 'skipped' | 'completed';

/** Isolated from saved runs, settings, and practice-only personal best. */
export function readTutorialProgress(storage: Pick<PracticeStorage, 'getItem'>): TutorialProgress {
  const value = storage.getItem(TUTORIAL_PROGRESS_KEY);
  return value === 'skipped' || value === 'completed' ? value : 'unseen';
}

export function writeTutorialProgress(
  storage: Pick<PracticeStorage, 'setItem'>,
  progress: Exclude<TutorialProgress, 'unseen'>,
): void {
  storage.setItem(TUTORIAL_PROGRESS_KEY, progress);
}
