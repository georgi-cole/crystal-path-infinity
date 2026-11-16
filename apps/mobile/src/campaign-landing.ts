import { STEP_TIMING } from './scene-cinematics';

export const LANDING_SIGNATURE_MS = 1250;
// Allow even a recovered wrong step to settle before the single signature move.
export const LANDING_HOLD_MS = STEP_TIMING.wrong + STEP_TIMING.travel + LANDING_SIGNATURE_MS;
