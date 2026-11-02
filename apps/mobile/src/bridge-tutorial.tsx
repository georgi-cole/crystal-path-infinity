import { useEffect, useState } from 'react';
import { applyTutorialAction, createTutorialSession } from './bridge-tutorial-model';
import type { TutorialAction, TutorialStep } from './bridge-tutorial-model';
import './bridge-tutorial.css';

interface TutorialCopy {
  readonly title: string;
  readonly instruction: string;
}
const COPY: Record<TutorialStep, TutorialCopy> = {
  safe: {
    title: 'Take a safe step',
    instruction: 'Tap LEFT to cross Row 1 safely. A safe step leaves SP unchanged.',
  },
  wrong: {
    title: 'Survive a wrong step',
    instruction:
      'Tap LEFT again. This time it is wrong: you lose SP, but if you survive the row still counts.',
  },
  hint: {
    title: 'Ask for a hint',
    instruction: 'Tap Use hint to reveal the safe pane on Row 3. Hints are limited.',
  },
  'hint-revealed': {
    title: 'Follow the hint',
    instruction: 'LEFT is revealed as safe. Tap the LEFT glass to cross Row 3.',
  },
  mystery: {
    title: 'Mystery is your choice',
    instruction:
      'Try the centre mystery or skip it. Effects can help, hurt, change hints or last for a few seconds.',
  },
  end: {
    title: 'How an attempt ends',
    instruction:
      'There is no final row. End run is your choice. The optional fatal example starts at 10 SP to demonstrate death.',
  },
  fatal: {
    title: 'A fatal row does not count',
    instruction: 'The example dropped SP to zero on Row 4. Its final cleared row is still Row 3.',
  },
  complete: {
    title: 'You know the bridge',
    instruction: 'Tutorial complete. Start a separate local practice run whenever you are ready.',
  },
};

const STEP_NUMBER: Record<TutorialStep, number> = {
  safe: 1,
  wrong: 2,
  hint: 3,
  'hint-revealed': 3,
  mystery: 4,
  end: 5,
  fatal: 5,
  complete: 5,
};

/** Separate from InfinityPractice: no clock, checkpoint, media, ad or score owner. */
export function BridgeTutorial({
  onComplete,
  onSkip,
  onStartPractice,
  reducedMotion = false,
}: {
  onComplete: () => void;
  onSkip: () => void;
  onStartPractice: () => void;
  reducedMotion?: boolean;
}) {
  const [session, setSession] = useState(createTutorialSession);
  const { run, step } = session;
  const copy = COPY[step];
  const canTapLeft = step === 'safe' || step === 'wrong' || step === 'hint-revealed';
  const canTapRight = false; // Scripted demonstration: no hidden random test answers.
  const didFinish = step === 'complete';

  useEffect(() => {
    document.querySelector<HTMLElement>('[data-tutorial-heading]')?.focus();
  }, [step]);

  const act = (action: TutorialAction) => {
    setSession((previous) => applyTutorialAction(previous, action));
  };
  const finish = () => {
    if (step !== 'end' && step !== 'fatal') return;
    act('end-run');
    onComplete();
  };

  return (
    <section
      className={'cpi-tutorial' + (reducedMotion ? ' cpi-reduced-motion' : '')}
      aria-labelledby="cpi-tutorial-title"
    >
      <div className="cpi-tutorial-topline">
        <span className="cpi-menu-eyebrow">Guided local demo · {STEP_NUMBER[step]} / 5</span>
        <span className="cpi-tutorial-proof">Not ranked · No ads</span>
      </div>
      <h1 id="cpi-tutorial-title" data-menu-heading data-tutorial-heading tabIndex={-1}>
        {copy.title}
      </h1>
      <p className="cpi-tutorial-instruction" id="cpi-tutorial-instruction">
        {copy.instruction}
      </p>

      <div className="cpi-tutorial-stats" aria-label="Training resources">
        <span>
          <strong>{run.sp}</strong> / 400 SP
        </span>
        <span>
          <strong>{run.hints}</strong> hints
        </span>
        <span>
          Last cleared: <strong>Row {run.lastClearedRow}</strong>
        </span>
      </div>

      {!didFinish && (
        <section className="cpi-tutorial-bridge" aria-label="Training bridge">
          <div className="cpi-tutorial-row-caption">Current Row {run.currentRow}</div>
          <div className="cpi-tutorial-glass">
            <button
              type="button"
              className={'cpi-tutorial-pane' + (step === 'hint-revealed' ? ' is-revealed' : '')}
              disabled={!canTapLeft}
              onClick={() =>
                act(
                  step === 'safe'
                    ? 'choose-safe'
                    : step === 'wrong'
                      ? 'choose-wrong'
                      : 'choose-hinted',
                )
              }
              aria-describedby="cpi-tutorial-instruction"
            >
              <span className="cpi-tutorial-pane-label">Left glass</span>
              <span className="cpi-tutorial-pane-note">
                {step === 'safe'
                  ? 'Safe example'
                  : step === 'wrong'
                    ? 'Wrong example'
                    : step === 'hint-revealed'
                      ? 'Hint: safe'
                      : 'Locked'}
              </span>
            </button>
            <div className="cpi-tutorial-centre">
              <button
                type="button"
                className="cpi-tutorial-mystery"
                disabled={step !== 'mystery'}
                aria-label="Try optional mystery tile"
                aria-describedby="cpi-tutorial-instruction"
                onClick={() => act('try-mystery')}
              >
                ?
              </button>
            </div>
            <button
              type="button"
              className="cpi-tutorial-pane"
              disabled={!canTapRight}
              aria-describedby="cpi-tutorial-instruction"
            >
              <span className="cpi-tutorial-pane-label">Right glass</span>
              <span className="cpi-tutorial-pane-note">
                {step === 'wrong' ? 'Safe in this example' : 'Locked'}
              </span>
            </button>
          </div>
          <p className="cpi-tutorial-feedback" role="status" aria-live="polite">
            {session.notice}
          </p>
        </section>
      )}

      <div className="cpi-tutorial-actions">
        {step === 'hint' && (
          <button type="button" className="cpi-tutorial-primary" onClick={() => act('use-hint')}>
            Use hint · {run.hints} left
          </button>
        )}
        {step === 'mystery' && (
          <button type="button" onClick={() => act('skip-mystery')}>
            Skip mystery · No penalty
          </button>
        )}
        {step === 'end' && (
          <>
            <button type="button" onClick={() => act('show-fatal')}>
              Show a fatal wrong step
            </button>
            <button type="button" className="cpi-tutorial-primary" onClick={finish}>
              End training run
            </button>
          </>
        )}
        {step === 'fatal' && (
          <button type="button" className="cpi-tutorial-primary" onClick={finish}>
            End training run
          </button>
        )}
        {didFinish && (
          <>
            <p className="cpi-tutorial-finished" role="status">
              Completed. The demo was never saved as a practice attempt or score.
            </p>
            <button type="button" className="cpi-tutorial-primary" onClick={onStartPractice}>
              Go to Practice
            </button>
          </>
        )}
      </div>

      <div className="cpi-tutorial-facts" aria-label="Core rules">
        <p>
          <strong>SP:</strong> A mistake can cost points. Zero SP means death.
        </p>
        <p>
          <strong>Progress:</strong> Survived wrong steps count. Fatal rows never count.
        </p>
        <p>
          <strong>Infinity:</strong> There is no finish line. End run finishes your attempt.
        </p>
      </div>
      {!didFinish && (
        <button type="button" className="cpi-tutorial-skip" onClick={onSkip}>
          Skip tutorial · Return to Practice
        </button>
      )}
    </section>
  );
}
