import { describe, expect, it } from 'vitest';
import { adEvent, beginAttempt, mayRestore, recordRestore, recordVerification } from './ad-gate';
import type { AdGate, AdEvent } from './ad-gate';

function showing(mode: AdGate['mode'] = 'native') {
  return adEvent(adEvent(beginAttempt('a1', 'i1', mode), 'a1', 'loaded'), 'a1', 'show-requested');
}
function events(g: AdGate, names: AdEvent[]) { return names.reduce((state, name) => adEvent(state, 'a1', name), g); }

describe('fullscreen presentation and independently verified rewards', () => {
  it('does not restore an earned and verified reward until dismissal', () => {
    let g = recordVerification(events(showing(), ['earned']), 'i1', 'native-test-ssv');
    expect(mayRestore(g, true, false)).toBe(false);
    g = adEvent(g, 'a1', 'dismissed');
    expect(mayRestore(g, true, false)).toBe(true);
  });
  it('allows dismissal before earned but never trusts that callback alone', () => {
    let g = events(showing(), ['dismissed', 'earned']);
    expect(mayRestore(g, true, false)).toBe(false);
    g = recordVerification(g, 'i1', 'native-test-ssv');
    expect(mayRestore(g, true, false)).toBe(true);
  });
  it('can use server evidence even if the local earned callback was lost', () => {
    const g = recordVerification(events(showing(), ['dismissed']), 'i1', 'native-test-ssv');
    expect(g.earnedSignal).toBe(false);
    expect(mayRestore(g, true, false)).toBe(true);
  });
  it('does not turn a synthetic grant into native verification', () => {
    const g = recordVerification(events(showing(), ['dismissed']), 'i1', 'synthetic');
    expect(g.verified).toBe(false);
    expect(mayRestore(g, true, false)).toBe(false);
  });
  it('preserves synthetic evidence and rejects native evidence for a fixture', () => {
    const g = events(showing('synthetic'), ['dismissed']);
    expect(recordVerification(g, 'i1', 'native-test-ssv').verified).toBe(false);
    const simulated = recordVerification(g, 'i1', 'synthetic');
    expect(simulated.evidence).toBe('synthetic');
    expect(mayRestore(simulated, true, false)).toBe(true);
  });
  it('does not resume while backgrounded or manually paused', () => {
    const g = recordVerification(events(showing(), ['earned', 'dismissed']), 'i1', 'native-test-ssv');
    expect(mayRestore(g, false, false)).toBe(false);
    expect(mayRestore(g, true, true)).toBe(false);
  });
  it('ignores events and verification belonging to an older attempt/intent', () => {
    const g = showing();
    expect(adEvent(g, 'old', 'dismissed')).toBe(g);
    expect(recordVerification(g, 'old', 'native-test-ssv')).toBe(g);
  });
  it('permits retry after a confirmed load failure but blocks ambiguous show errors', () => {
    const failed = adEvent(beginAttempt('a1', 'i1', 'native'), 'a1', 'load-failed');
    expect(beginAttempt('a2', 'i1', 'native', failed).phase).toBe('loading');
    const ambiguous = adEvent(showing(), 'a1', 'show-failed');
    expect(ambiguous.phase).toBe('pending');
    expect(() => beginAttempt('a2', 'i1', 'native', ambiguous)).toThrow();
  });
  it('does not discard a matching server grant because a later local load failed', () => {
    const failed = adEvent(beginAttempt('a1', 'i1', 'native'), 'a1', 'load-failed');
    const reconciled = recordVerification(failed, 'i1', 'native-test-ssv');
    expect(mayRestore(reconciled, true, false)).toBe(true);
    expect(mayRestore(reconciled, false, false)).toBe(false);
    expect(recordVerification(failed, 'i1', 'synthetic').verified).toBe(false);
  });
  it('ignores late show/load events after dismissal and duplicate events after restore', () => {
    const pending = events(showing(), ['dismissed', 'showed', 'loaded']);
    expect(pending.adClosed).toBe(true);
    const restored = recordRestore(recordVerification(pending, 'i1', 'native-test-ssv'), 'i1');
    expect(events(restored, ['earned', 'dismissed', 'showed'])).toBe(restored);
    expect(mayRestore(restored, true, false)).toBe(false);
  });
  it('cannot accept reward/dismiss callbacks before requesting the shown ad', () => {
    const g = beginAttempt('a1', 'i1', 'native');
    expect(events(g, ['earned', 'dismissed', 'show-failed'])).toBe(g);
  });
});
