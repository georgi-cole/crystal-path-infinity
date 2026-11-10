import { getRuleset, isPactKind } from '@crystal-path-infinity/game-core';
import type { EffectKind, PactOption, TileSide } from '@crystal-path-infinity/game-core';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { PresentedRow } from '../infinity-presentation';
import { useLanguage } from '../language-context';
import { DeathClockBadge, MysteryRhythmBadge } from '../mystery-box';
import { MysteryEffects, MysteryFeedbackView, PactPanel } from '../mystery-effects';
import { DiscoveryIntroduction } from '../mystery-introduction';
import { PrismBridge } from '../prism-bridge';
import { RunHud } from '../run-hud';
import { StageAtmosphere } from '../stage-atmosphere';
import { useThemeId } from '../store-context';
import { companionStandingSide } from '../world-companion';
import { WorldPathCompanion } from '../world-effects';
import { isPetWorld } from '../world-kits';
import type { RankedCurrent, RankedRun } from './ranked-client';

function row(index: bigint, phase: 'current' | 'past', state?: RankedCurrent): PresentedRow {
  return {
    index: index.toString(),
    label: (index + 1n).toString(),
    distance: phase === 'current' ? 0 : -1,
    tone: Number(index % 3n) as 0 | 1 | 2,
    phase,
    hasMystery: false,
    mysteryAvailable: false,
    hint: phase === 'current' ? (state?.revealedSafeSide ?? null) : null,
    chosen: state?.lastChoice?.side ?? null,
    wrong: state?.lastChoice?.wrong ?? false,
  };
}

/** Project the confirmed viewport only. The bridge draws neutral scenery ahead. */
function presentRankedRows(run: RankedRun): readonly PresentedRow[] {
  const index = BigInt(run.lastClearedRow);
  const rows: PresentedRow[] = [];
  if (index > 0n) {
    const past = (index - 1n).toString();
    rows.push(
      row(
        index - 1n,
        'past',
        run.history.find((entry) => entry.index === past),
      ),
    );
  }
  rows.push({
    ...row(index, 'current', run.current),
    hasMystery: run.current.hasMystery,
    mysteryAvailable:
      run.status === 'playing' &&
      run.current.hasMystery &&
      run.current.mysteryOutcome === null &&
      run.pact?.phase !== 'offered',
    noSafeTile: run.current.noSafeTile,
    mysteryTier: run.current.mysteryTier,
  });
  return rows;
}

export function RankedBoard({
  run,
  interactive,
  canPause,
  reducedMotion,
  notice,
  onChoose,
  onHint,
  onPause,
  onMystery,
  onPact,
  children,
}: {
  run: RankedRun;
  interactive: boolean;
  canPause: boolean;
  reducedMotion: boolean;
  notice: string;
  onChoose: (side: TileSide) => void;
  onHint: () => void;
  onPause: () => void;
  onMystery: () => void;
  onPact: (option: PactOption) => void;
  children?: ReactNode;
}) {
  const { t, number } = useLanguage();
  const theme = useThemeId();
  const rows = presentRankedRows(run);
  const offered = run.pact?.phase === 'offered';
  const oracle = run.pact?.kind === 'false_oracle' && run.pact.phase === 'active';
  const discovery = run.discovery?.introduction;
  const effects = run.effects.filter((effect) => effect.kind !== discovery?.kind);
  const outcome = run.current.mysteryOutcome as EffectKind | null;
  const outcomeStrip =
    outcome &&
    !isPactKind(outcome) &&
    !run.pact &&
    outcome !== discovery?.kind &&
    outcome !== run.mysteryRhythm?.kind &&
    !effects.some((effect) => effect.kind === outcome)
      ? outcome
      : null;
  const feedback = useMemo(
    () =>
      outcomeStrip
        ? {
            id: run.runId + ':' + run.revivesApplied + ':' + run.currentRow + ':' + outcomeStrip,
            kind: outcomeStrip,
            spDelta: 0,
            hintDelta: 0,
            action: null,
          }
        : null,
    [outcomeStrip, run.currentRow, run.revivesApplied, run.runId],
  );
  const clock = run.deathClock;
  const clockActive = !!clock && run.activeTimeMs >= clock.warningAt;
  const fatal = run.death !== null && run.status !== 'playing';

  return (
    <main
      className={`cps-shell cps-shell--premium cpi-infinity-scene cpi-ranked-game${fatal ? ' is-catastrophe' : ''}${clockActive ? ' is-death-clock' : ''}${reducedMotion ? ' cpi-reduced-motion' : ''}`}
      data-world={theme}
      data-testid="ranked-game"
      aria-label={t('ranked.title')}
    >
      <p className="cpi-run-mode">
        {t(run.economy?.assisted ? 'ranked.assisted' : 'ranked.title')}
      </p>
      <StageAtmosphere emergency={fatal || clockActive} />
      <div className="cps-content" inert={!!children}>
        <RunHud
          row={run.currentRow}
          clearedRows={number(run.lastClearedRow)}
          sp={run.sp}
          maxSp={getRuleset(run.rulesetVersion).maxSp}
          hints={run.hints}
          reducedMotion={reducedMotion}
          canHint={
            interactive &&
            !offered &&
            !oracle &&
            !discovery &&
            run.hints > 0 &&
            run.current.revealedSafeSide === null &&
            !run.current.noSafeTile
          }
          canPause={canPause}
          paused={run.paused}
          onHint={onHint}
          onPause={onPause}
        />
        <aside
          className={'cpi-run-status' + (offered ? ' is-choosing' : '')}
          aria-label={t('game.effects')}
        >
          <div className="cpi-status-clock-slot">
            {clockActive && (
              <DeathClockBadge
                clock={clock}
                activeTimeMs={run.activeTimeMs}
                offered={offered || !!discovery}
              />
            )}
          </div>
          <div className="cpi-status-forces">
            <MysteryEffects
              effects={effects}
              activeTimeMs={run.activeTimeMs}
              rulesetVersion={run.rulesetVersion}
            />
            {run.mysteryRhythm?.kind !== discovery?.kind && (
              <MysteryRhythmBadge rhythm={run.mysteryRhythm} activeTimeMs={run.activeTimeMs} />
            )}
          </div>
          <div className="cpi-status-feedback-slot">
            <DiscoveryIntroduction
              discovery={run.discovery}
              activeTimeMs={run.activeTimeMs}
              rulesetVersion={run.rulesetVersion}
              reducedMotion={reducedMotion}
            />
            {!children && (
              <MysteryFeedbackView feedback={feedback} rulesetVersion={run.rulesetVersion} />
            )}
          </div>
        </aside>
        <section className="cps-board" aria-label={t('game.bridge')} dir="ltr">
          {run.pact && (
            <PactPanel
              pact={run.pact}
              hints={run.hints}
              revealed={run.current.revealedSafeSide !== null || !!run.current.noSafeTile}
              sp={run.sp}
              rulesetVersion={run.rulesetVersion}
              activeTimeMs={run.activeTimeMs}
              disabled={!interactive}
              onChoose={onPact}
            />
          )}
          <PrismBridge
            rows={rows}
            interactive={interactive && !offered}
            onChoose={onChoose}
            onMystery={onMystery}
            omen={oracle ? run.pact?.omen : null}
            reducedMotion={reducedMotion}
            collapsed={fatal}
            fractureSeed="verified-crossing"
            showHintCaption={run.current.revealedSafeSide !== null}
            mysteryReveal={!!discovery}
          />
          {theme !== 'obsidian' && run.status !== 'finished' && (
            <WorldPathCompanion
              theme={theme}
              standingSide={companionStandingSide(rows)}
              sp={run.sp}
              effects={[]}
              reaction={fatal || clockActive ? 'panic' : 'calm'}
              reduced={reducedMotion}
              paused={run.paused}
            />
          )}
        </section>
        <p className="visually-hidden" role="status" aria-live="polite">
          {notice} {t('ranked.row', { row: number(run.currentRow) })}{' '}
          {t('ranked.confirmed', { row: number(run.lastClearedRow) })}
        </p>
        <p className="cpi-scene-footer">
          <span aria-hidden="true">—</span>
          {t(isPetWorld(theme) ? 'vault.petGuidance' : 'game.bridgeGuidance')}
          <span aria-hidden="true">—</span>
        </p>
      </div>
      {children}
    </main>
  );
}
