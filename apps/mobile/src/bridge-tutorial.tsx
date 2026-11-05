import { useEffect, useState } from 'react';
import { applyTutorialAction, createTutorialSession } from './bridge-tutorial-model';
import { STARTING_SP } from '@crystal-path-infinity/game-core';
import type { TutorialAction, TutorialStep } from './bridge-tutorial-model';
import { useLanguage } from './language-context';
import type { MessageKey } from './i18n/messages';
import './bridge-tutorial.css';

interface TutorialCopy {
  readonly title: MessageKey;
  readonly instruction: MessageKey;
}
const COPY: Record<TutorialStep, TutorialCopy> = {
  safe: { title: 'tutorial.safeTitle', instruction: 'tutorial.safeInstruction' },
  wrong: { title: 'tutorial.wrongTitle', instruction: 'tutorial.wrongInstruction' },
  hint: { title: 'tutorial.hintTitle', instruction: 'tutorial.hintInstruction' },
  'hint-revealed': {
    title: 'tutorial.hintRevealedTitle',
    instruction: 'tutorial.hintRevealedInstruction',
  },
  mystery: { title: 'tutorial.mysteryTitle', instruction: 'tutorial.mysteryInstruction' },
  end: { title: 'tutorial.endTitle', instruction: 'tutorial.endInstruction' },
  fatal: { title: 'tutorial.fatalTitle', instruction: 'tutorial.fatalInstruction' },
  complete: { title: 'tutorial.completeTitle', instruction: 'tutorial.completeInstruction' },
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
  const { t, number } = useLanguage();
  const [session, setSession] = useState(createTutorialSession);
  const { run, step } = session;
  const copy = COPY[step];
  const canTapLeft = step === 'safe' || step === 'wrong' || step === 'hint-revealed';
  const canTapRight = false; // Scripted demonstration: no hidden random test answers.
  const didFinish = step === 'complete';
  const localizedNotice =
    step === 'safe'
      ? t('tutorial.notice.safe')
      : step === 'wrong'
        ? t('tutorial.notice.wrong', { sp: number(run.sp) })
        : step === 'hint'
          ? t('tutorial.notice.hint', { damage: number(STARTING_SP - run.sp) })
          : step === 'hint-revealed'
            ? t('tutorial.notice.hintRevealed')
            : step === 'mystery'
              ? t('tutorial.notice.mystery')
              : step === 'end'
                ? t('tutorial.notice.end')
                : step === 'fatal'
                  ? t('tutorial.notice.fatal', {
                      row: number(run.currentRow),
                      cleared: number(run.lastClearedRow),
                    })
                  : t('tutorial.notice.complete');

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
        <span className="cpi-menu-eyebrow">
          {t('tutorial.guided', { step: number(STEP_NUMBER[step]) })}
        </span>
        <span className="cpi-tutorial-proof">{t('tutorial.notRanked')}</span>
      </div>
      <h1 id="cpi-tutorial-title" data-menu-heading data-tutorial-heading tabIndex={-1}>
        {t(copy.title)}
      </h1>
      <p className="cpi-tutorial-instruction" id="cpi-tutorial-instruction">
        {t(copy.instruction)}
      </p>

      <div className="cpi-tutorial-stats" aria-label={t('tutorial.resources')}>
        <span>
          <strong>{run.sp}</strong> / 400 SP
        </span>
        <span>{t('tutorial.hints', { count: number(run.hints) })}</span>
        <span>{t('tutorial.lastCleared', { row: number(run.lastClearedRow) })}</span>
      </div>

      {!didFinish && (
        <section className="cpi-tutorial-bridge" aria-label={t('tutorial.bridge')}>
          <div className="cpi-tutorial-row-caption">
            {t('tutorial.currentRow', { row: number(run.currentRow) })}
          </div>
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
              <span className="cpi-tutorial-pane-label">{t('tutorial.leftGlass')}</span>
              <span className="cpi-tutorial-pane-note">
                {step === 'safe'
                  ? t('tutorial.safeExample')
                  : step === 'wrong'
                    ? t('tutorial.wrongExample')
                    : step === 'hint-revealed'
                      ? t('tutorial.hintSafe')
                      : t('tutorial.locked')}
              </span>
            </button>
            <div className="cpi-tutorial-centre">
              <button
                type="button"
                className="cpi-tutorial-mystery"
                disabled={step !== 'mystery'}
                aria-label={t('tutorial.mysteryOptional')}
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
              <span className="cpi-tutorial-pane-label">{t('tutorial.rightGlass')}</span>
              <span className="cpi-tutorial-pane-note">
                {step === 'wrong' ? t('tutorial.rightSafe') : t('tutorial.locked')}
              </span>
            </button>
          </div>
          <p className="cpi-tutorial-feedback" role="status" aria-live="polite">
            {localizedNotice}
          </p>
        </section>
      )}

      <div className="cpi-tutorial-actions">
        {step === 'hint' && (
          <button type="button" className="cpi-tutorial-primary" onClick={() => act('use-hint')}>
            {t('tutorial.useHint', { count: number(run.hints) })}
          </button>
        )}
        {step === 'mystery' && (
          <button type="button" onClick={() => act('skip-mystery')}>
            {t('tutorial.skipMystery')}
          </button>
        )}
        {step === 'end' && (
          <>
            <button type="button" onClick={() => act('show-fatal')}>
              {t('tutorial.showFatal')}
            </button>
            <button type="button" className="cpi-tutorial-primary" onClick={finish}>
              {t('tutorial.endTraining')}
            </button>
          </>
        )}
        {step === 'fatal' && (
          <button type="button" className="cpi-tutorial-primary" onClick={finish}>
            {t('tutorial.endTraining')}
          </button>
        )}
        {didFinish && (
          <>
            <p className="cpi-tutorial-finished" role="status">
              {t('tutorial.completeNotice')}
            </p>
            <button type="button" className="cpi-tutorial-primary" onClick={onStartPractice}>
              {t('tutorial.goPractice')}
            </button>
          </>
        )}
      </div>

      <div className="cpi-tutorial-facts" aria-label={t('tutorial.coreRules')}>
        <p>{t('tutorial.ruleSp')}</p>
        <p>{t('tutorial.ruleProgress')}</p>
        <p>{t('tutorial.ruleInfinity')}</p>
        <p>{t('tutorial.ruleClock')}</p>
        <p>{t('tutorial.ruleSurvival')}</p>
      </div>
      {!didFinish && (
        <button type="button" className="cpi-tutorial-skip" onClick={onSkip}>
          {t('tutorial.skip')}
        </button>
      )}
    </section>
  );
}
