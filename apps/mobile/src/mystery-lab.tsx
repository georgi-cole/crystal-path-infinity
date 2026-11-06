import { mysteryFeedbackFromEvents, runCuesFromEvents } from './mystery-feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BALANCE_RULESET_VERSION,
  getCurrentRow,
  getRowBandDamage,
  getRuleset,
  isPactKind,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type {
  EffectKind,
  RunCommand,
  RunState,
  TransitionResult,
} from '@crystal-path-infinity/game-core';
import { createMysteryLabRun } from './mystery-lab-model';
import { useLanguage } from './language-context';
import { effectCopy, mysteryText } from './mystery.messages';
import { EffectGlyph, MysteryEffects, MysteryFeedbackView, PactPanel } from './mystery-effects';
import type { MysteryFeedback, RunCues } from './mystery-feedback';
import { EffectConsumption, HintCounter } from './resource-feedback';

export function MysteryLab({
  onClose,
  reducedMotion,
}: {
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const { locale } = useLanguage();
  const version = BALANCE_RULESET_VERSION;
  const [kind, setKind] = useState<EffectKind>('inversion_5s');
  const [startingSp, setStartingSp] = useState(100);
  const [spDraft, setSpDraft] = useState('100');
  const [initial] = useState(() => createMysteryLabRun('inversion_5s', 100, 91025, version));
  const [state, setState] = useState<RunState>(initial.state);
  const [feedback, setFeedback] = useState<MysteryFeedback | null>(null);
  const [cues, setCues] = useState<RunCues>({});
  const [notice, setNotice] = useState('');
  const [clockPaused, setClockPaused] = useState(true);
  const [comparison, setComparison] = useState<{
    before: number;
    after: number;
    normal: number;
  } | null>(null);
  const current = useRef(state);
  const room = useRef<HTMLElement>(null);
  const chamberSeed = useRef(91025);
  const commit = useCallback((result: TransitionResult) => {
    current.current = result.state;
    setState(result.state);
    const nextFeedback = mysteryFeedbackFromEvents(result.events, result.state);
    if (nextFeedback) setFeedback(nextFeedback);
    const nextCues = runCuesFromEvents(result.events, result.state);
    if (nextCues.hints || nextCues.consumption)
      setCues((previous) => ({ ...previous, ...nextCues }));
    if (!result.accepted) setNotice(result.reason ?? '');
    return result;
  }, []);
  useEffect(() => {
    if (clockPaused) return;
    const timer = window.setInterval(() => {
      const latest = current.current;
      if (latest.status !== 'playing') return;
      commit(
        transitionRun(
          latest,
          { type: 'tick' },
          {
            activeTimeMs: latest.activeTimeMs + 250,
            achievedAt: latest.lastObservedAt + 250,
            rng: PRACTICE_RNG,
          },
        ),
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [clockPaused, commit]);
  const reset = (nextKind = kind, sp = startingSp) => {
    if (!Number.isSafeInteger(sp) || sp < 1) return;
    chamberSeed.current += 1;
    setKind(nextKind);
    setStartingSp(sp);
    setSpDraft(String(sp));
    setNotice('');
    setFeedback(null);
    setCues({});
    setComparison(null);
    setClockPaused(true);
    commit(createMysteryLabRun(nextKind, sp, chamberSeed.current, version));
    if (window.matchMedia('(max-width: 600px)').matches)
      room.current?.scrollIntoView({
        block: 'start',
        behavior:
          reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
      });
  };
  const issue = (command: RunCommand, elapsed = 0) => {
    const latest = current.current;
    if (latest.status !== 'playing') return null;
    setNotice('');
    return commit(
      transitionRun(latest, command, {
        activeTimeMs: latest.activeTimeMs + elapsed,
        achievedAt: latest.lastObservedAt + elapsed,
        rng: PRACTICE_RNG,
      }),
    );
  };
  const demonstrate = (wrong: boolean) => {
    const latest = current.current;
    const safe = getCurrentRow(latest).safeSide;
    const before = latest.sp;
    const result = issue({
      type: 'choose',
      side: wrong ? (safe === 'left' ? 'right' : 'left') : safe,
      row: latest.currentRow,
      life: 0,
    });
    if (result?.accepted)
      setComparison({
        before,
        after: result.state.sp,
        normal: Math.max(0, before - (wrong ? getRowBandDamage(latest.currentRow, version) : 0)),
      });
  };
  const frozen = state.pact?.phase === 'offered';
  const oracle = state.pact?.kind === 'false_oracle' && state.pact.phase === 'active';
  const copy = effectCopy(locale, kind, version);
  const all = getRuleset(version).mysteryTable.map((entry) => entry.kind);
  const catalog = (kinds: readonly EffectKind[]) => (
    <div>
      {kinds.map((item) => (
        <button type="button" key={item} aria-pressed={kind === item} onClick={() => reset(item)}>
          <EffectGlyph kind={item} />
          <span>{effectCopy(locale, item, version).title}</span>
        </button>
      ))}
    </div>
  );
  const disabled = frozen || state.status !== 'playing';
  const comparisonText = comparison
    ? mysteryText(locale, 'comparison')
        .replace('{before}', String(comparison.before))
        .replace('{after}', String(comparison.after))
        .replace('{normal}', String(comparison.normal))
    : '';
  return (
    <main className={'cpi-mystery-lab' + (reducedMotion ? ' cpi-reduced-motion' : '')}>
      <header>
        <h1>{mysteryText(locale, 'lab')}</h1>
        <button type="button" onClick={onClose}>
          {mysteryText(locale, 'back')}
        </button>
      </header>
      <p className="cpi-lab-intro">
        {mysteryText(locale, 'labIntro').replace('{count}', String(all.length))}
        <br />
        {mysteryText(locale, 'labNote')}
      </p>
      <div className="cpi-lab-layout">
        <nav className="cpi-lab-catalog" aria-label={mysteryText(locale, 'lab')}>
          <h2>{mysteryText(locale, 'pacts')}</h2>
          {catalog(all.filter(isPactKind))}
          <h2>{mysteryText(locale, 'classic')}</h2>
          {catalog(all.filter((item) => !isPactKind(item)))}
        </nav>
        <section ref={room} className="cpi-lab-room" aria-label={copy.title}>
          <div className="cpi-lab-instrument">
            <label>
              {mysteryText(locale, 'starting')}
              <input
                type="number"
                min="1"
                value={spDraft}
                onChange={(event) => setSpDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') reset(kind, Number(spDraft));
                }}
              />
            </label>
            <button type="button" onClick={() => reset(kind, Number(spDraft))}>
              {mysteryText(locale, 'reset')}
            </button>
          </div>
          <div className="cpi-lab-instrument">
            <strong className="cpi-lab-sp">{state.sp} SP</strong>
            <span>
              {mysteryText(locale, 'hints')}: <HintCounter count={state.hints} cue={cues.hints} />
            </span>
            <span>↟ {state.currentRow}</span>
          </div>
          <div className="cpi-lab-time">
            <button type="button" onClick={() => setClockPaused((paused) => !paused)}>
              {mysteryText(locale, clockPaused ? 'resumeDemo' : 'pauseDemo')}
            </button>
            <button
              type="button"
              disabled={state.status !== 'playing'}
              onClick={() => issue({ type: 'tick' }, 1000)}
            >
              {mysteryText(locale, 'advanceTime')}
            </button>
            <span>{mysteryText(locale, 'noLimit')}</span>
          </div>
          {!isPactKind(kind) && (
            <>
              <h2>{copy.title}</h2>
              <p>{copy.detail}</p>
            </>
          )}
          <MysteryEffects
            effects={state.effects}
            activeTimeMs={state.activeTimeMs}
            rulesetVersion={version}
          />
          <PactPanel
            pact={state.pact}
            sp={state.sp}
            hints={state.hints}
            revealed={state.current.revealedSafeSide !== null}
            disabled={state.status !== 'playing'}
            rulesetVersion={version}
            onChoose={(option) => issue({ type: 'pact', option, row: state.currentRow, life: 0 })}
          />
          {isPactKind(kind) && !state.pact && <p>{copy.detail}</p>}
          {kind === 'borrowed_time' && (
            <button type="button" onClick={() => reset(kind, 5)}>
              {locale === 'bg' ? 'Демо: започни само с 5 SP' : 'Demo: start with only 5 SP'}
            </button>
          )}
          <div className="cpi-lab-demo">
            <p>{mysteryText(locale, 'demoOnly')}</p>
            <button type="button" disabled={disabled} onClick={() => demonstrate(true)}>
              {mysteryText(locale, 'demoWrong')}
            </button>
            <button type="button" disabled={disabled} onClick={() => demonstrate(false)}>
              {mysteryText(locale, 'demoSafe')}
            </button>
            {comparison && (
              <strong className="cpi-lab-comparison" role="status">
                {comparisonText}
              </strong>
            )}
          </div>
          <div className="cpi-lab-controls">
            {(['left', 'right'] as const).map((side) => (
              <button
                type="button"
                key={side}
                disabled={disabled}
                onClick={() => issue({ type: 'choose', side, row: state.currentRow, life: 0 })}
              >
                {mysteryText(locale, side === 'left' ? 'stepLeft' : 'stepRight')}
                {state.current.revealedSafeSide === side ? ' ◈' : ''}
                {oracle && state.pact?.omen === side ? ' · 70%' : ''}
              </button>
            ))}
            <button
              className="cpi-lab-hint"
              type="button"
              disabled={
                disabled || oracle || state.hints === 0 || state.current.revealedSafeSide !== null
              }
              onClick={() => issue({ type: 'hint', row: state.currentRow, life: 0 })}
            >
              {mysteryText(locale, oracle ? 'hintsSealed' : 'hint')}
            </button>
          </div>
          <p className="cpi-lab-status" role="status">
            {state.status !== 'playing' ? mysteryText(locale, 'died') : notice}
          </p>
        </section>
      </div>
      <EffectConsumption cue={cues.consumption} />
      <MysteryFeedbackView
        rulesetVersion={version}
        feedback={
          feedback && !(isPactKind(feedback.kind) && feedback.action === null) ? feedback : null
        }
      />
    </main>
  );
}
