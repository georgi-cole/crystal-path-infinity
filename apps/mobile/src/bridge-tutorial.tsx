import { practiceStorage } from './app-profile';
import { useEffect, useRef, useState } from 'react';
import { HINT_SCAN_MS } from '@crystal-path-infinity/game-core';
import type { CSSProperties } from 'react';
import { applyTutorialAction, createTutorialSession } from './bridge-tutorial-model';
import type { TutorialAction, TutorialStep } from './bridge-tutorial-model';
import { useLanguage } from './language-context';
import type { MessageKey } from './i18n/messages';
import { GUIDE_CHAPTERS, GUIDE_PACING, GUIDE_RULES } from './crystal-guide-contract';
import { PrismBridge } from './prism-bridge';
import { presentInfinityScene } from './infinity-presentation';
import { createSceneDirector } from './scene-cinematics';
import type { SceneCinematic } from './scene-cinematics';
import { EffectGlyph } from './effect-glyph';
import { collectRunSignals, EMPTY_RUN_SIGNALS, liveSignal } from './run-signals';
import type { RunSignals } from './run-signals';
import { createHintCaptionGate } from './hint-caption';
import './bridge-tutorial.css';

const CHAPTER: Record<TutorialStep, number> = {
  safe: 0,
  wrong: 1,
  hint: 2,
  'hint-revealed': 2,
  pressure: 3,
  mystery: 4,
  'mystery-opened': 4,
  complete: 4,
};
const COPY: Record<TutorialStep, readonly [MessageKey, MessageKey]> = {
  safe: ['guide.footingTitle', 'guide.footingBody'],
  wrong: ['guide.fractureTitle', 'guide.fractureBody'],
  hint: ['guide.insightTitle', 'guide.insightBody'],
  'hint-revealed': ['guide.revealedTitle', 'guide.revealedBody'],
  pressure: ['guide.pursuitTitle', 'guide.pursuitBody'],
  mystery: ['guide.temptationTitle', 'guide.temptationBody'],
  'mystery-opened': ['guide.openedTitle', 'guide.openedBody'],
  complete: ['guide.completeTitle', 'guide.completeBody'],
};
const CHAPTER_LABELS: readonly MessageKey[] = [
  'guide.footing',
  'guide.fracture',
  'guide.insight',
  'guide.pursuit',
  'guide.temptation',
];

/** A rehearsal of the actual crystal renderer and reducer, isolated from saves,
 * gameplay clocks, music and rewards. Reading the lesson never costs SP. */
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
  const current = useRef(session);
  const [cinematic, setCinematic] = useState<SceneCinematic | null>(null);
  const [signals, setSignals] = useState<RunSignals>(EMPTY_RUN_SIGNALS);
  const [captionGate] = useState(() => createHintCaptionGate(() => practiceStorage()));
  const [showHintCaption, setShowHintCaption] = useState(false);
  const director = useRef<ReturnType<typeof createSceneDirector> | null>(null);
  const reduced = useRef(reducedMotion);
  useEffect(() => {
    reduced.current = reducedMotion;
    if (reducedMotion) director.current?.finish();
  }, [reducedMotion]);
  useEffect(() => {
    const scene = createSceneDirector(
      current.current.run,
      setCinematic,
      (callback, delay) => {
        const timer = window.setTimeout(callback, delay);
        return () => window.clearTimeout(timer);
      },
      () => reduced.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    director.current = scene;
    return () => {
      scene.dispose();
      director.current = null;
    };
  }, []);
  const { run, step } = session;
  const completed = step === 'complete';
  const chapter = CHAPTER[step];
  const busy = !!cinematic && cinematic.phase !== 'reveal';
  const canChoose = ['safe', 'wrong', 'hint-revealed', 'pressure'].includes(step);
  const view = presentInfinityScene(run);
  const hint = liveSignal(signals.hint, run, HINT_SCAN_MS);
  const mystery = session.lastTransition?.events.find((event) => event.type === 'mystery-resolved');
  useEffect(() => {
    document.querySelector<HTMLElement>('[data-tutorial-heading]')?.focus();
  }, [step]);
  function act(action: TutorialAction) {
    if (director.current?.isBusy()) return;
    const next = applyTutorialAction(current.current, action);
    if (next === current.current) return;
    if (action === 'use-hint') setShowHintCaption(captionGate.claim());
    current.current = next;
    setSession(next);
    if (next.lastTransition) {
      director.current?.receive(next.lastTransition);
      setSignals((previous) => collectRunSignals(previous, next.lastTransition!));
    }
    if (next.step === 'complete') onComplete();
  }
  const stepAction: TutorialAction =
    step === 'safe'
      ? 'choose-safe'
      : step === 'wrong'
        ? 'choose-wrong'
        : step === 'hint-revealed'
          ? 'choose-hinted'
          : 'escape-pressure';
  return (
    <section
      className={'cpi-crystal-guide' + (reducedMotion ? ' cpi-reduced-motion' : '')}
      aria-labelledby="cpi-tutorial-title"
      data-guide-rules={GUIDE_RULES.version}
    >
      <header className="cpi-guide-topline">
        <span>{t('guide.eyebrow')}</span>
        <span className="cpi-guide-rehearsal">
          <i />
          {t('guide.rehearsal')}
        </span>
      </header>
      <ol className="cpi-guide-chapters" aria-label={t('guide.chapters')}>
        {GUIDE_CHAPTERS.map((id, index) => (
          <li
            key={id}
            className={
              index === chapter ? 'is-current' : index < chapter || completed ? 'is-complete' : ''
            }
            aria-current={index === chapter ? 'step' : undefined}
          >
            <span className="cpi-guide-chapter-mark" aria-hidden="true">
              {index < chapter || completed ? 'âœ“' : number(index + 1)}
            </span>
            <span>{t(CHAPTER_LABELS[index])}</span>
          </li>
        ))}
      </ol>
      <div className="cpi-guide-layout">
        <div className="cpi-guide-story">
          <span className="cpi-guide-index">
            {number(chapter + 1).padStart(2, '0')} /{' '}
            {number(GUIDE_CHAPTERS.length).padStart(2, '0')}
          </span>
          <h1 id="cpi-tutorial-title" data-menu-heading data-tutorial-heading tabIndex={-1}>
            {t(COPY[step][0])}
          </h1>
          <p id="cpi-guide-instruction">{t(COPY[step][1])}</p>
          {step === 'pressure' && GUIDE_PACING.bonus > 0 && (
            <p className="cpi-guide-whisper">{t('guide.survivalWhisper')}</p>
          )}
          <div className="cpi-guide-actions">
            {canChoose && (
              <button
                type="button"
                className="cpi-guide-primary"
                disabled={busy}
                onClick={() => act(stepAction)}
              >
                {t(step === 'pressure' ? 'guide.move' : 'guide.stepLeft')}
                <span aria-hidden="true">â†—</span>
              </button>
            )}
            {step === 'hint' && (
              <button
                type="button"
                className="cpi-guide-primary"
                disabled={busy}
                onClick={() => act('use-hint')}
              >
                <EffectGlyph kind="gain_hint" />
                {t('guide.useHint')}
              </button>
            )}
            {step === 'mystery' && (
              <>
                <button
                  type="button"
                  className="cpi-guide-primary"
                  disabled={busy}
                  onClick={() => act('try-mystery')}
                >
                  {t('guide.openMystery')}
                  <span aria-hidden="true">â†—</span>
                </button>
                <button
                  type="button"
                  className="cpi-guide-text-button"
                  disabled={busy}
                  onClick={() => act('skip-mystery')}
                >
                  {t('guide.leaveMystery')}
                </button>
              </>
            )}
            {step === 'mystery-opened' && (
              <button type="button" className="cpi-guide-primary" onClick={() => act('end-run')}>
                {t('guide.finish')}
                <span aria-hidden="true">â†—</span>
              </button>
            )}
            {completed && (
              <button type="button" className="cpi-guide-primary" onClick={onStartPractice}>
                {t('guide.begin')}
                <span aria-hidden="true">â†—</span>
              </button>
            )}
          </div>
        </div>
        <div
          className={
            'cpi-guide-stage' +
            (step === 'pressure' ? ' is-pursued' : '') +
            (completed ? ' is-complete' : '')
          }
          aria-label={t('guide.stage')}
          aria-describedby="cpi-guide-instruction"
        >
          <div className="cpi-guide-instruments">
            <div>
              <span>{t('guide.light')}</span>
              <strong>
                {number(run.sp)} <small>SP</small>
              </strong>
              <i
                style={
                  {
                    '--guide-light': `${(run.sp / (GUIDE_RULES.maxSp ?? GUIDE_RULES.startingSp)) * 100}%`,
                  } as CSSProperties
                }
              />
            </div>
            <span className="cpi-guide-hints">
              <EffectGlyph kind="gain_hint" />
              {number(run.hints)}
            </span>
          </div>
          <PrismBridge
            rows={cinematic?.rows ?? view.rows}
            interactive={!busy && (canChoose || step === 'mystery')}
            allowChoices={canChoose}
            allowedSide="left"
            showStepCaptions={false}
            showHintCaption={step === 'hint-revealed' && showHintCaption}
            onChoose={() => act(stepAction)}
            onMystery={() => act('try-mystery')}
            reducedMotion={reducedMotion}
            phase={cinematic?.phase}
            feedback={cinematic?.feedback}
            fractureSeed="crystal-rehearsal"
            hintScan={hint}
          />
          {step === 'pressure' && !busy && (
            <div className="cpi-guide-pursuit" aria-hidden="true">
              <svg viewBox="0 0 60 60" fill="none">
                <path d="M20 7h20M20 53h20M23 9c0 12 2 13 7 21-5 8-7 9-7 21m14-42c0 12-2 13-7 21 5 8 7 9 7 21M26 45h8" />
              </svg>
              <span>{t('guide.pursuitSignal')}</span>
            </div>
          )}
          {step === 'mystery-opened' && mystery?.type === 'mystery-resolved' && (
            <div className="cpi-guide-revelation" aria-hidden="true">
              <EffectGlyph kind={mystery.kind} />
              <span>{t('guide.openedSignal')}</span>
            </div>
          )}
          {completed && (
            <div className="cpi-guide-complete-mark" aria-hidden="true">
              <svg viewBox="0 0 80 80" fill="none">
                <path d="m18 41 15 15 31-32M12 11h14m28 0h14v14M68 55v14H54M26 69H12V55M12 25V11" />
              </svg>
            </div>
          )}
          <span className="cpi-guide-stage-caption">
            {t(completed ? 'guide.completeSignal' : 'guide.practiceSignal')}
          </span>
        </div>
      </div>
      <footer className="cpi-guide-footer">
        <span role="status" aria-live="polite">
          {t(busy ? 'guide.listen' : completed ? 'guide.completeNote' : 'guide.safeSpace')}
        </span>
        {!completed && (
          <button type="button" className="cpi-guide-text-button" onClick={onSkip}>
            {t('guide.skip')}
            <span aria-hidden="true">â†—</span>
          </button>
        )}
      </footer>
    </section>
  );
}
