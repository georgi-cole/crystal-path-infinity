export interface CampaignInterstitialCadence {
  /** Called once when the player leaves a result for a first-cleared mission. */
  recordFirstClear(): boolean;
}

/** Keep campaign ads at calm level breaks: first two clears are free, then at most two per app session. */
export function createCampaignInterstitialCadence(
  options: {
    everyClears?: number;
    sessionLimit?: number;
  } = {},
): CampaignInterstitialCadence {
  const everyClears = options.everyClears ?? 3;
  const sessionLimit = options.sessionLimit ?? 2;
  if (!Number.isSafeInteger(everyClears) || everyClears < 1)
    throw new Error('Campaign ad interval must be a positive integer.');
  if (!Number.isSafeInteger(sessionLimit) || sessionLimit < 0)
    throw new Error('Campaign ad session limit must be a nonnegative integer.');

  let clears = 0;
  let offers = 0;
  return {
    recordFirstClear() {
      clears++;
      if (clears % everyClears !== 0 || offers >= sessionLimit) return false;
      offers++;
      return true;
    },
  };
}
