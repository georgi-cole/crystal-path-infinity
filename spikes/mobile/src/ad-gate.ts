/** Presentation gate only. The server, never this gate, authorizes a reward. */
export type AdPhase = 'loading' | 'loaded' | 'showing' | 'pending' | 'failed' | 'restored';
export type AdEvent = 'loaded' | 'show-requested' | 'showed' | 'earned' | 'dismissed' | 'load-failed' | 'show-failed';
export type GrantEvidence = 'synthetic' | 'native-test-ssv';
export interface AdGate {
  attemptId: string;
  intentId: string;
  mode: 'synthetic' | 'native';
  phase: AdPhase;
  showRequested: boolean;
  adClosed: boolean;
  earnedSignal: boolean;
  verified: boolean;
  evidence: GrantEvidence | null;
}

export function beginAttempt(attemptId: string, intentId: string, mode: AdGate['mode'], previous?: AdGate | null): AdGate {
  if (previous && previous.phase !== 'failed' && previous.phase !== 'restored') {
    throw new Error('The existing ad attempt must be resolved first.');
  }
  return { attemptId, intentId, mode, phase: 'loading', showRequested: false, adClosed: true, earnedSignal: false, verified: false, evidence: null };
}

export function adEvent(gate: AdGate, attemptId: string, event: AdEvent): AdGate {
  if (attemptId !== gate.attemptId || gate.phase === 'restored' || gate.phase === 'failed') return gate;
  if (event === 'loaded') return gate.phase === 'loading' ? { ...gate, phase: 'loaded' } : gate;
  if (event === 'load-failed') return !gate.showRequested ? { ...gate, phase: 'failed', adClosed: true } : gate;
  if (event === 'show-requested') return gate.phase === 'loaded' ? { ...gate, phase: 'showing', showRequested: true, adClosed: false } : gate;
  if (!gate.showRequested) return gate; // An unrelated/stale SDK callback is not our loaded ad.
  if (event === 'showed') return gate.adClosed ? gate : { ...gate, phase: 'showing' };
  if (event === 'earned') return { ...gate, earnedSignal: true };
  if (event === 'dismissed' || event === 'show-failed') {
    // A post-show error is ambiguous; it must not silently permit another ad.
    return { ...gate, phase: 'pending', adClosed: true };
  }
  return gate;
}

export function recordVerification(gate: AdGate, intentId: string, evidence: GrantEvidence): AdGate {
  if (intentId !== gate.intentId || gate.phase === 'restored') return gate;
  if ((gate.mode === 'native') !== (evidence === 'native-test-ssv')) return gate;
  // A failed load does not erase a matching authoritative grant. That attempt
  // never opened a fullscreen ad, so reconciliation may proceed while closed.
  return { ...gate, phase: gate.phase === 'failed' ? 'pending' : gate.phase, verified: true, evidence };
}

export function mayRestore(gate: AdGate | null, foreground: boolean, userPaused: boolean): boolean {
  return Boolean(gate && gate.phase === 'pending' && gate.adClosed && gate.verified && foreground && !userPaused);
}

export function recordRestore(gate: AdGate, intentId: string): AdGate {
  return gate.intentId === intentId && gate.adClosed && gate.verified ? { ...gate, phase: 'restored' } : gate;
}
