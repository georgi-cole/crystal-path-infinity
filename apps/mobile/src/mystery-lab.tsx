import { mysteryFeedbackFromEvents } from './mystery-feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRuleset,
  isPactKind,
  PACT_KINDS,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import { createMysteryLabRun } from './mystery-lab-model';
import type {
  EffectKind,
  RunCommand,
  RunState,
  TransitionResult,
} from '@crystal-path-infinity/game-core';
import { useLanguage } from './language-context';
import { effectCopy, mysteryText } from './mystery.messages';
import { EffectGlyph, MysteryEffects, MysteryFeedbackView, PactPanel } from './mystery-effects';
import type { MysteryFeedback } from './mystery-feedback';

export function MysteryLab({
  onClose,
  reducedMotion,
}: {
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const { locale } = useLanguage();
  const [kind, setKind] = useState<EffectKind>('blood_oath');
  const [startingSp, setStartingSp] = useState(100);
  const [initial] = useState(() => createMysteryLabRun('blood_oath'));
  const [state, setState] = useState<RunState>(initial.state);
  const [feedback, setFeedback] = useState<MysteryFeedback | null>(null);
  const [notice, setNotice] = useState('');
  const current = useRef(state);
  const room = useRef<HTMLElement>(null);
  const chamberSeed = useRef(91025);
  const commit = useCallback((result: TransitionResult) => {
    current.current = result.state;
    setState(result.state);
    const nextFeedback = mysteryFeedbackFromEvents(result.events, result.state);
    if (nextFeedback) setFeedback(nextFeedback);
    if (!result.accepted) setNotice(result.reason ?? '');
  }, []);
  useEffect(() => {
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
  }, [commit]);
  const reset = (nextKind = kind, sp = startingSp) => {
    chamberSeed.current += 1;
    setKind(nextKind);
    setStartingSp(sp);
    setNotice('');
    setFeedback(null);
    commit(createMysteryLabRun(nextKind, sp, chamberSeed.current));
    if (window.matchMedia('(max-width: 600px)').matches)
      room.current?.scrollIntoView({
        block: 'start',
        behavior:
          reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
      });
  };
  const issue = (command: RunCommand) => {
    const latest = current.current;
    if (latest.status !== 'playing') return;
    setNotice('');
    commit(
      transitionRun(latest, command, {
        activeTimeMs: latest.activeTimeMs,
        achievedAt: latest.lastObservedAt,
        rng: PRACTICE_RNG,
      }),
    );
  };
  const frozen = state.pact?.phase === 'offered';
  const oracle = state.pact?.kind === 'false_oracle' && state.pact.phase === 'active';
  const copy = effectCopy(locale, kind);
  const classic = getRuleset().mysteryTable.map((entry) => entry.kind);
  const catalog = (kinds: readonly EffectKind[]) => (
    <div>
      {kinds.map((item) => (
        <button type="button" key={item} aria-pressed={kind === item} onClick={() => reset(item)}>
          <EffectGlyph kind={item} />
          <span>{effectCopy(locale, item).title}</span>
        </button>
      ))}
    </div>
  );
  return (
    <main className={'cpi-mystery-lab' + (reducedMotion ? ' cpi-reduced-motion' : '')}>
      <header>
        <h1>{mysteryText(locale, 'lab')}</h1>
        <button type="button" onClick={onClose}>
          {mysteryText(locale, 'back')}
        </button>
      </header>
      <p className="cpi-lab-intro">
        {mysteryText(locale, 'labIntro')}
        <br />
        {mysteryText(locale, 'labNote')}
      </p>
      <div className="cpi-lab-layout">
        <nav className="cpi-lab-catalog" aria-label={mysteryText(locale, 'lab')}>
          <h2>{mysteryText(locale, 'pacts')}</h2>
          {catalog(PACT_KINDS)}
          <h2>{mysteryText(locale, 'classic')}</h2>
          {catalog(classic)}
        </nav>
        <section ref={room} className="cpi-lab-room" aria-label={copy.title}>
          <div className="cpi-lab-instrument">
            <label>
              {mysteryText(locale, 'starting')}
              <input
                type="range"
                min="20"
                max="400"
                step="5"
                value={startingSp}
                onChange={(event) => reset(kind, Number(event.target.value))}
              />
              <span>{startingSp}</span>
            </label>
            <button type="button" onClick={() => reset()}>
              {mysteryText(locale, 'reset')}
            </button>
          </div>
          <div className="cpi-lab-instrument">
            <strong className="cpi-lab-sp">{state.sp} / 400 SP</strong>
            <span>
              {mysteryText(locale, 'hints')}: {state.hints} ◈
            </span>
            <span>↟ {state.currentRow}</span>
          </div>
          {!isPactKind(kind) && (
            <>
              <h2>{copy.title}</h2>
              <p>{copy.detail}</p>
            </>
          )}
          <MysteryEffects effects={state.effects} activeTimeMs={state.activeTimeMs} />
          <PactPanel
            pact={state.pact}
            hints={state.hints}
            revealed={state.current.revealedSafeSide !== null}
            disabled={state.status !== 'playing'}
            onChoose={(option) => issue({ type: 'pact', option, row: state.currentRow, life: 0 })}
          />
          {isPactKind(kind) && !state.pact && <p>{copy.detail}</p>}
          <div className="cpi-lab-controls">
            {(['left', 'right'] as const).map((side) => (
              <button
                type="button"
                key={side}
                disabled={frozen || state.status !== 'playing'}
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
                frozen ||
                oracle ||
                state.hints === 0 ||
                state.current.revealedSafeSide !== null ||
                state.status !== 'playing'
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
      <MysteryFeedbackView
        feedback={
          feedback && !(isPactKind(feedback.kind) && feedback.action === null) ? feedback : null
        }
      />
    </main>
  );
}
