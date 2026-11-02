import { Capacitor, registerPlugin } from '@capacitor/core';
import type { HapticKind } from './standalone-audio';

interface CpiFeedbackPlugin {
  impact(options: { kind: HapticKind }): Promise<void>;
}
const native = registerPlugin<CpiFeedbackPlugin>('CpiFeedback');

/** No special permission, device identifier or backend call. Honors device feedback settings. */
export async function optionalHaptic(kind: HapticKind): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await native.impact({ kind });
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'step' ? 12 : kind === 'damage' ? [24, 22, 35] : [65, 28, 75]);
    }
  } catch {
    // Unsupported hardware or user/system preference must not block gameplay.
  }
}
