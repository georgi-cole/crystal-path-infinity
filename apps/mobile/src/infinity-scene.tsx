import { nextPracticeRuleset } from './balance-tuning';
import {
  CAMPAIGN_TEST_BUILD,
  PLAYER_PREVIEW_ENABLED,
  QA_TOOLS_ENABLED,
  practiceStorage,
} from './app-profile';
import { shouldFinishPracticeOnExit } from './practice-exit';
import { DiscoveryIntroduction } from './mystery-introduction';
import { MysteryJournal } from './mystery-discovery';
import { readMysteryJournal } from './mystery-journal-model';
import { mysteryFeedbackFromEvents, runCuesFromEvents } from './mystery-feedback';
import type { MysteryFeedback, RunCues } from './mystery-feedback';
import { MysteryEffects, MysteryFeedbackView, PactPanel, EffectGlyph } from './mystery-effects';
import { EffectConsumption } from './resource-feedback';
import { MysteryRhythmBadge, DeathClockBadge } from './mystery-box';
import { MysteryLab } from './mystery-lab';
import { effectCopy } from './mystery.messages';
import './run-status.css';
import { RunReserves } from './run-reserves';
import { useTestStore, useThemeId } from './store-context';
import { ThemeScope } from './store-provider';
import { WorldPathCompanion, WorldStepEffect } from './world-effects';
import { companionStandingSide } from './world-companion';
import { MysteryCache, WorldOutcomeHero } from './world-treasures';
import type { ThemeId } from './store-catalog';
import { isPetWorld, WORLD_KITS } from './world-kits';
import type { ReactNode } from 'react';
import { StageAtmosphere } from './stage-atmosphere';
import { useSoundtrack } from './soundtrack';
import { PrismBridge } from './prism-bridge';
import { RunHud } from './run-hud';
import { RunKitButton, RunKitDialog } from './run-kit';
import { GuardianShieldMarker } from './guardian-shield';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPracticeCursor,
  createRun,
  getRuleset,
  parseTileExperiment,
  getDeathClock,
  isPactKind,
  getMaxRevives,
  PRACTICE_RNG,
  presentRowPressure,
  HINT_SCAN_MS,
  marketingSale,
  usesDiscoveryRules,
  journeyForecast,
  journeyGearEffect,
} from '@crystal-path-infinity/game-core';
import type {
  RunEvent,
  TestResource,
  RunState,
  SessionCommand,
  TileSide,
  TimedSessionResult,
  EffectKind,
  PactOption,
  BeforeRunCommit,
} from '@crystal-path-infinity/game-core';
import { getGameplayLifecycle } from './gameplay-lifecycle';
import { createStandaloneAudio } from './standalone-audio';
import type { StandaloneAudio } from './standalone-audio';
import { optionalHaptic } from './optional-haptic';
import {
  readPracticePersonalBest,
  recordPracticePersonalBest,
  upgradePracticePacing,
} from './practice-save';
import { presentRunOutcome } from './run-outcome';
import type { GuestRewardedAd } from './rewards/native-admob';
import {
  earnedGuestContinuation,
  guestAdOffer,
  watchGuestContinuation,
} from './rewards/guest-continuation';
import { useLanguage } from './language-context';
import type { PracticeSettings } from './practice-save';
import { RunPauseMenu } from './run-pause-menu';
import { createPracticeRuntime, schedulePracticeTick } from './practice-runtime';
import type { PracticePauseLease, PracticeRuntime } from './practice-runtime';
import { presentInfinityScene } from './infinity-presentation';
import { createSceneDirector } from './scene-cinematics';
import type { SceneCinematic, SceneFeedback } from './scene-cinematics';
import { AnimatedResult } from './animated-result';
import { DeathClock } from './scene-instruments';
import { collectRunSignals, EMPTY_RUN_SIGNALS, liveSignal } from './run-signals';
import type { RunSignals } from './run-signals';
import { createHintCaptionGate } from './hint-caption';
import { bridgeModel } from './campaign-content';
import type { BridgeStyle } from './campaign-content';
import { JourneyAtmosphere } from './journey-atmosphere';
import { CLEAR_SKY, GEAR_COPY, WEATHER_COPY } from './journey-copy';
import './infinity-scene.css';
import './infinity-hud-premium.css';
import './run-outcome.css';
import './scene-cinematics.css';
import './row-pressure.css';

const DEFAULT_VISUAL_SKIN = {
  id: 'infinity-glass-v1',
  shell: 'cps-shell--premium',
  title: 'Crystal Path: Infinity',
} as const;
// Visual choice is not stored inside the reducer or checkpoint. Future skins
// can replace this map without changing route, hints, SP or a ranked response.
export const INFINITY_SCENE_SKIN = DEFAULT_VISUAL_SKIN;

export type { SceneFeedback } from './scene-cinematics';
interface CampaignPresentation {
  readonly name: string;
  readonly targetRow: number;
  readonly minimumStability: number;
  readonly objectiveProgress?: string;
}
interface KitSelection {
  stabilityDoses: number;
  shieldDelta: number;
  wear?: boolean;
  revision: number;
  notice: string;
  changed: 'sp' | 'shield' | 'gear' | null;
  direction: 'load' | 'return';
}
const EMPTY_KIT_SELECTION: KitSelection = {
  stabilityDoses: 0,
  shieldDelta: 0,
  revision: 0,
  notice: '',
  changed: null,
  direction: 'load',
};
type InfinitySupplies = Readonly<Record<'sp' | 'hint' | 'shield' | 'continue', number>>;
export interface InfinitySceneViewProps {
  readonly weather?: 'clear' | 'rain';
  readonly campaignMission?: CampaignPresentation;
  readonly bridgeStyle?: BridgeStyle;
  readonly campaignSupplyPanel?: ReactNode;
  readonly reserveHints?: number;
  readonly kitOpen?: boolean;
  readonly onToggleKit?: () => void;
  readonly kitGearWear?: boolean;
  readonly kitNotice?: string;
  readonly kitError?: boolean;
  readonly onToggleJourneyGear?: (wear: boolean) => void;
  readonly resourcePanel?: ReactNode;
  readonly guestContinuePanel?: ReactNode;
  readonly trial?: boolean;
  readonly state: RunState;
  readonly feedback: SceneFeedback | null;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly paused: boolean;
  readonly error: string | null;
  readonly onChoose: (side: TileSide) => void;
  readonly onHint: () => void;
  readonly onMystery: () => void;
  readonly onPact?: (option: PactOption) => void;
  readonly mysteryFeedback?: MysteryFeedback | null;
  readonly resourceCues?: RunCues;
  readonly onMysteryLab?: () => void;
  readonly onMysteryJournal?: () => void;
  readonly onPause: () => void;
  readonly onEnd: () => void;
  readonly onRequestEnd: () => void;
  readonly onCancelEnd: () => void;
  readonly confirmEnd: boolean;
  readonly onExit: () => void;
  readonly onViewRankings: () => void;
  readonly personalBest: string | null;
  readonly newPersonalBest: boolean;
  readonly onRestart: () => void;
  readonly onRetry: () => void;
  readonly settings: PracticeSettings;
  readonly onSettingsChange: (next: PracticeSettings) => void;
  readonly cinematic?: SceneCinematic | null;
  readonly signals?: RunSignals;
  readonly hintCaptionRow?: string | null;
}

export function InfinitySceneView({
  resourcePanel,
  guestContinuePanel,
  trial = false,
  state,
  feedback,
  ready,
  busy,
  paused,
  error,
  onChoose,
  onHint,
  onMystery,
  onPact,
  mysteryFeedback = null,
  resourceCues = {},
  onMysteryLab,
  onMysteryJournal,
  onPause,
  onEnd,
  onRequestEnd,
  onCancelEnd,
  confirmEnd,
  onExit,
  onViewRankings,
  personalBest,
  newPersonalBest,
  onRestart,
  onRetry,
  weather = 'clear',
  campaignMission,
  bridgeStyle,
  campaignSupplyPanel,
  reserveHints = 0,
  kitOpen = false,
  onToggleKit,
  kitGearWear,
  kitNotice,
  kitError,
  onToggleJourneyGear,
  settings,
  onSettingsChange,
  cinematic = null,
  signals = EMPTY_RUN_SIGNALS,
  hintCaptionRow = null,
}: InfinitySceneViewProps) {
  const { t, number, locale } = useLanguage();
  const themeId = useThemeId();
  const petWorld = isPetWorld(themeId);
  const presented = presentInfinityScene(state);
  const outcome = presentRunOutcome(state);
  const availableHints = state.hints + (campaignMission ? 0 : reserveHints);
  const worldOutcomeTheme =
    themeId !== 'obsidian' &&
    !error &&
    !confirmEnd &&
    ['dead', 'grant-ready', 'finished'].includes(outcome.phase)
      ? themeId
      : null;
  const clearedRows = number(state.result?.lastClearedRow ?? state.lastClearedRow);
  const rawFatalRow = state.result?.fatalRow ?? state.death?.fatalRow ?? null;
  const fatalRow = rawFatalRow === null ? null : number(rawFatalRow);
  const deathCause = state.result?.deathCause ?? state.death?.cause ?? null;
  const localizedDeathReason = deathCause
    ? t(
        deathCause === 'wrong_tile'
          ? petWorld
            ? 'vault.petWrong'
            : 'game.deathWrong'
          : deathCause === 'idle' || deathCause === 'death_clock'
            ? petWorld
              ? 'vault.petIdle'
              : 'game.deathIdle'
            : deathCause === 'mystery'
              ? petWorld
                ? 'vault.petMystery'
                : 'game.deathMystery'
              : petWorld
                ? 'vault.petDrain'
                : 'game.deathDrain',
      )
    : null;
  const overlayVisible =
    !!error || (!cinematic?.fatal && (paused || confirmEnd || outcome.phase !== 'playing'));
  const pauseVisible = paused && !error && !confirmEnd && outcome.phase === 'playing';
  const worldDialogTheme =
    worldOutcomeTheme ?? (pauseVisible && themeId !== 'obsidian' ? themeId : null);
  const catastrophic = state.death !== null && state.status !== 'playing';
  const pressure = presentRowPressure(state);
  const deathClock = getDeathClock(state);
  const pactOffered = state.pact?.phase === 'offered';
  const clockActive = deathClock !== null && state.activeTimeMs >= deathClock.warningAt;
  const oracleActive = state.pact?.kind === 'false_oracle' && state.pact.phase === 'active';
  const maxSp = getRuleset(state.rulesetVersion).maxSp;
  const discoveryKind = state.discovery?.introduction?.kind;
  const rhythm = state.mysteryDirector?.rhythm;
  const visibleEffects = discoveryKind
    ? state.effects.filter((effect) => effect.kind !== discoveryKind)
    : state.effects;
  const mysteryFeedbackVisible =
    mysteryFeedback !== null &&
    (mysteryFeedback.action !== null ||
      (!isPactKind(mysteryFeedback.kind) &&
        mysteryFeedback.kind !== discoveryKind &&
        mysteryFeedback.kind !== rhythm?.kind &&
        !state.effects.some((effect) => effect.kind === mysteryFeedback.kind)));
  const bonus = liveSignal(signals.bonus, state, 2400);
  const hintScan =
    liveSignal(signals.hint, state, HINT_SCAN_MS) ??
    (pressure?.paused &&
    state.pacing?.hintScanStartedAt !== undefined &&
    state.current.revealedSafeSide
      ? {
          id: `${state.runId}:${state.revivesApplied}:${state.currentRow}:scan-recovery`,
          row: state.currentRow,
          side: state.current.revealedSafeSide,
          activeAt: state.pacing.hintScanStartedAt,
        }
      : null);
  const emergency =
    state.status === 'playing' &&
    ((state.sp > 0 && state.sp < 15) || pressure?.urgent || clockActive);
  const hostileReveal = cinematic?.mystery
    ? cinematic.mystery.spDelta < 0 ||
      cinematic.mystery.hintDelta < 0 ||
      !effectCopy(locale, cinematic.mystery.kind, state.rulesetVersion).positive
    : false;
  const current = presented.rows.find((row) => row.phase === 'current');
  const cinematicBlocks = !!cinematic && (cinematic.phase !== 'reveal' || cinematic.fatal);
  const interactive =
    ready &&
    !busy &&
    !cinematicBlocks &&
    !pactOffered &&
    !paused &&
    !kitOpen &&
    !confirmEnd &&
    !error &&
    outcome.phase === 'playing';
  const experiment =
    import.meta.env.MODE !== 'production' ? parseTileExperiment(state.rulesetVersion) : null;
  const route = state.stream.journey;
  const season = experiment?.journey === 'plain' ? undefined : route?.season;
  const forecast = route && season ? journeyForecast(route, BigInt(state.currentRow)) : null;
  const activeWeather = forecast?.startsIn === 0n ? forecast.weather : undefined;
  const legacyRain = !route && weather === 'rain';
  const currentSky = activeWeather ?? (legacyRain ? 'rain' : undefined);
  const approaching =
    forecast && forecast.startsIn > 0n && forecast.startsIn <= 3n ? forecast.weather : undefined;
  const cue = current?.cue;
  const cueText =
    cue?.side === null
      ? 'Both tiles are cracked'
      : cue?.kind === 'mirror'
        ? 'Mirror glint · land opposite'
        : cue?.kind === 'prism'
          ? 'Rainbow · land on the prism'
          : cue?.kind === 'echo'
            ? 'Echo · follow the ring'
            : cue?.kind === 'gust'
              ? 'Gust · follow the leaf'
              : cue?.kind === 'beacon'
                ? 'Beacon · follow the light'
                : cue?.kind === 'lens'
                  ? 'Sunshades · follow the clear glint'
                  : null;
  const gear = state.journeyGear;
  const gearCopy = gear ? GEAR_COPY[gear.item] : undefined;
  const here =
    gear && route ? journeyGearEffect(gear.item, route.season, activeWeather) : undefined;
  const ahead =
    gear && route && approaching
      ? journeyGearEffect(gear.item, route.season, approaching)
      : undefined;
  const hasGearDownside = gear?.worn && ((here?.hitRelief ?? 0) < 0 || (ahead?.hitRelief ?? 0) < 0);
  const gearTip =
    gear && gearCopy
      ? gear.queued !== null
        ? gear.queued
          ? 'Ready after this step.'
          : 'Packed away after this step.'
        : gear.worn && (here?.hitRelief ?? 0) < 0
          ? gearCopy.warning
          : gear.worn && (ahead?.hitRelief ?? 0) < 0
            ? 'Pack it away before ' + WEATHER_COPY[approaching!].title.toLowerCase() + '.'
            : gear.worn && ((here?.hitRelief ?? 0) > 0 || here?.cleanGain)
              ? gearCopy.ready
              : !gear.worn &&
                  ((ahead?.hitRelief ?? 0) > 0 || (here?.hitRelief ?? 0) > 0 || here?.cleanGain)
                ? 'A good time to bring it out.'
                : null
      : null;
  const hasKit = !!(
    onToggleKit &&
    ((gear && gearCopy && onToggleJourneyGear) || campaignSupplyPanel)
  );
  const modeLabel = trial
    ? t('vault.trial')
    : state.storeTest?.assisted
      ? t('vault.assisted')
      : experiment
        ? locale === 'bg'
          ? 'Тест'
          : 'Playtest'
        : t('vault.classic');
  const notice =
    cinematic?.phase === 'impact'
      ? t(cinematic.feedback?.kind === 'wrong' ? 'game.impactWrong' : 'game.impactSafe')
      : (error ??
        (outcome.phase === 'verification-pending'
          ? t('game.noticePending')
          : outcome.phase === 'dead' || outcome.phase === 'grant-ready'
            ? t(petWorld ? 'vault.petRestTitle' : 'game.noticeDead')
            : outcome.phase === 'finished'
              ? t('game.noticeFinished')
              : !ready
                ? t('game.noticePreparing')
                : paused
                  ? t('game.noticePaused')
                  : current?.mysteryAvailable
                    ? t('game.noticeMystery')
                    : state.current.mysteryOutcome
                      ? t('game.noticeMysteryDone')
                      : t('game.noticeChoose')));

  const rescueNote = worldOutcomeTheme && (
    <p className="cpi-world-safe-home" role="status">
      {t(WORLD_KITS[worldOutcomeTheme].safe)}
    </p>
  );
  const dialogHeading = (
    <h2 id="cpi-run-outcome-title" tabIndex={-1}>
      {t(
        error
          ? 'game.clockTitle'
          : confirmEnd && outcome.canEnd
            ? 'game.confirmTitle'
            : outcome.phase === 'verification-pending'
              ? 'game.pendingTitle'
              : outcome.phase === 'finished'
                ? petWorld
                  ? 'vault.petFinishedTitle'
                  : themeId === 'league'
                    ? 'vault.leagueFinishedTitle'
                    : 'game.complete'
                : outcome.phase === 'dead' || outcome.phase === 'grant-ready'
                  ? petWorld
                    ? 'vault.petRestTitle'
                    : themeId === 'league'
                      ? 'vault.leagueRestTitle'
                      : 'game.deathTitle'
                  : petWorld
                    ? 'vault.petPaused'
                    : 'game.paused',
      )}
    </h2>
  );

  const pauseFoothold = pauseVisible && (
    <div className="cpi-pause-foothold">
      <span>{t(petWorld ? 'vault.rowsExplored' : 'game.rowsCleared')}</span>
      <strong>{clearedRows}</strong>
      <span className="visually-hidden">{t('game.pausedExplanation')}</span>
    </div>
  );

  return (
    <main
      className={`cps-shell ${INFINITY_SCENE_SKIN.shell} cpi-infinity-scene${catastrophic ? ' is-catastrophe' : ''}${emergency ? ' is-emergency' : ''}${paused || kitOpen ? ' is-paused' : ''}${pressure?.active || clockActive ? ' is-death-clock' : ''}${settings.reducedMotion ? ' cpi-reduced-motion' : ''}${legacyRain ? ' cpi-rain-mission' : ''}`}
      data-world={themeId}
      data-weather={activeWeather ?? (legacyRain ? 'rain' : 'clear')}
      data-season={season}
      data-testid="infinity-scene"
      aria-label={INFINITY_SCENE_SKIN.title}
    >
      <p className="cpi-run-mode">
        {campaignMission ? 'Campaign' : modeLabel}
        {season
          ? ' · ' + season
          : experiment &&
            !CAMPAIGN_TEST_BUILD &&
            ` · ${experiment.highBreakPercent}% / ${experiment.lowBreakPercent}%`}
        {gear && !campaignMission && ' · Outfitted'}
      </p>
      <StageAtmosphere emergency={emergency || catastrophic} />
      {legacyRain && <div className="cpi-rain-curtain" aria-hidden="true" />}
      {season && (
        <JourneyAtmosphere
          season={season}
          weather={activeWeather}
          world={themeId}
          reduced={settings.reducedMotion || paused}
        />
      )}
      {campaignMission && (
        <p className="cpi-campaign-objective" role="status">
          {campaignMission.name} · Row {campaignMission.targetRow}
          {campaignMission.minimumStability > 0 &&
            ` · ${campaignMission.minimumStability} Stability`}
          {campaignMission.objectiveProgress && <small>{campaignMission.objectiveProgress}</small>}
        </p>
      )}
      <div className="cps-content" inert={overlayVisible}>
        <RunHud
          campaign={!!campaignMission}
          row={
            cinematic?.rows?.find((row) => row.phase === 'current')?.label ?? presented.currentRow
          }
          clearedRows={clearedRows}
          sp={state.sp}
          maxSp={maxSp}
          hints={availableHints}
          bonus={bonus}
          hintCue={resourceCues.hints}
          reducedMotion={settings.reducedMotion}
          canHint={
            interactive &&
            !oracleActive &&
            !state.discovery?.introduction &&
            availableHints > 0 &&
            !state.current.noSafeTile &&
            state.current.revealedSafeSide === null
          }
          canPause={
            ready && !busy && !cinematicBlocks && !error && !kitOpen && state.status === 'playing'
          }
          paused={paused}
          onHint={onHint}
          onPause={onPause}
          kitControl={
            hasKit && onToggleKit ? (
              <RunKitButton
                open={kitOpen}
                warning={!!hasGearDownside}
                charges={state.journeyShields}
                disabled={
                  !ready ||
                  busy ||
                  !!cinematic ||
                  paused ||
                  !!error ||
                  state.status !== 'playing' ||
                  pactOffered
                }
                onClick={onToggleKit}
              />
            ) : undefined
          }
        />
        {(season || legacyRain || cueText) && (
          <aside className="cpi-journey-forecast" data-active={!!currentSky} aria-live="polite">
            {currentSky ? (
              <span>
                {currentSky === 'heat' && here?.clearGlint && gear?.worn
                  ? 'The sun is playing tricks. Your shades cut through the glare.'
                  : WEATHER_COPY[currentSky].remark}
              </span>
            ) : approaching ? (
              <span>
                {WEATHER_COPY[approaching].title} ahead. {WEATHER_COPY[approaching].remark}
              </span>
            ) : season ? (
              <span>{CLEAR_SKY[season]}</span>
            ) : null}
            {cueText && <strong>{cueText}</strong>}
          </aside>
        )}
        {hasKit && onToggleKit && kitOpen && !error && state.status === 'playing' && (
          <RunKitDialog onClose={onToggleKit} notice={kitNotice} error={kitError}>
            {gear && gearCopy && onToggleJourneyGear && (
              <aside
                className="cpi-journey-kit-control"
                data-warning={!!hasGearDownside}
                aria-label="Crossing gear"
              >
                <span className="cpi-kit-gear-art" data-item={gear.item} aria-hidden="true" />
                <div>
                  <strong>{gearCopy.name}</strong>
                  <small>
                    {kitGearWear !== undefined
                      ? kitGearWear
                        ? 'Ready to wear'
                        : 'Ready to pack away'
                      : (gearTip ?? (gear.worn ? 'Wearing' : 'Packed away'))}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={!ready || busy || paused || !!error || !!cinematic}
                  onClick={() => onToggleJourneyGear(!(kitGearWear ?? gear.queued ?? gear.worn))}
                >
                  {kitGearWear !== undefined
                    ? 'Undo change'
                    : gear.queued !== null
                      ? 'Cancel change'
                      : gear.worn
                        ? 'Pack away'
                        : 'Bring out'}
                </button>
              </aside>
            )}
            {campaignSupplyPanel}
          </RunKitDialog>
        )}
        <aside
          className={'cpi-run-status' + (pactOffered ? ' is-choosing' : '')}
          aria-label={t('game.effects')}
        >
          <div className="cpi-status-clock-slot">
            {clockActive && (
              <DeathClockBadge clock={deathClock} activeTimeMs={state.activeTimeMs} />
            )}
            {pressure?.active && <DeathClock pressure={pressure} />}
          </div>
          <div className="cpi-status-forces">
            <MysteryEffects
              effects={visibleEffects}
              activeTimeMs={state.activeTimeMs}
              rulesetVersion={state.rulesetVersion}
            />
            {state.pact?.phase === 'active' && (
              <PactPanel
                pact={state.pact}
                hints={state.hints}
                marketingHints={marketingSale(state).count}
                revealed={state.current.revealedSafeSide !== null}
                disabled={!interactive}
                onChoose={(option) => onPact?.(option)}
                sp={state.sp}
                rulesetVersion={state.rulesetVersion}
                activeTimeMs={state.activeTimeMs}
              />
            )}
            {rhythm?.kind !== discoveryKind && (
              <MysteryRhythmBadge rhythm={rhythm} activeTimeMs={state.activeTimeMs} />
            )}
          </div>
          <div className="cpi-status-feedback-slot">
            <DiscoveryIntroduction
              discovery={state.discovery}
              activeTimeMs={state.activeTimeMs}
              rulesetVersion={state.rulesetVersion}
              reducedMotion={settings.reducedMotion}
            />
            {!overlayVisible && (
              <MysteryFeedbackView
                rulesetVersion={state.rulesetVersion}
                feedback={mysteryFeedbackVisible ? mysteryFeedback : null}
              />
            )}
            {bonus && (
              <span className="cpi-status-bonus" role="status">
                +{bonus.amount} SP
              </span>
            )}
          </div>
        </aside>
        <section className="cps-board" aria-label={t('game.bridge')} dir="ltr">
          {pactOffered && (
            <PactPanel
              pact={state.pact}
              hints={state.hints}
              marketingHints={marketingSale(state).count}
              revealed={state.current.revealedSafeSide !== null}
              disabled={!ready || busy || paused || !!error}
              onChoose={(option) => onPact?.(option)}
              sp={state.sp}
              rulesetVersion={state.rulesetVersion}
              activeTimeMs={state.activeTimeMs}
            />
          )}
          <PrismBridge
            bridgeStyle={bridgeStyle}
            season={season}
            weather={activeWeather}
            rows={cinematic?.rows ?? presented.rows}
            feedback={cinematic?.feedback ?? feedback}
            interactive={interactive}
            onChoose={onChoose}
            omen={oracleActive ? state.pact?.omen : null}
            onMystery={onMystery}
            reducedMotion={settings.reducedMotion}
            phase={cinematic?.phase}
            collapsed={catastrophic && (!cinematic || cinematic.phase === 'collapse')}
            fractureSeed={`${state.runId}:${state.revivesApplied}`}
            hintScan={hintScan}
            showHintCaption={hintCaptionRow === state.currentRow}
            mysteryReveal={!!state.discovery?.introduction}
          />
          <WorldStepEffect theme={themeId} cinematic={cinematic} reduced={settings.reducedMotion} />
          {themeId === 'obsidian' && !gear?.worn && outcome.phase !== 'finished' && (
            <GuardianShieldMarker
              side={companionStandingSide(cinematic?.rows ?? presented.rows)}
              charges={state.journeyShields ?? 0}
              temporary={state.effects.some((effect) => effect.kind === 'shield_5s')}
              impact={!!cinematic?.shielded && cinematic.phase === 'impact'}
              linger={
                !!cinematic?.shielded &&
                (cinematic.phase === 'contact' || cinematic.phase === 'impact')
              }
            />
          )}
          {(themeId !== 'obsidian' || gear?.worn) && outcome.phase !== 'finished' && (
            <WorldPathCompanion
              theme={themeId}
              bridge={bridgeModel(bridgeStyle)}
              cinematic={cinematic}
              standingSide={companionStandingSide(cinematic?.rows ?? presented.rows)}
              sp={state.sp}
              effects={presented.effects}
              reduced={settings.reducedMotion}
              paused={paused || kitOpen}
              shieldCharges={state.journeyShields}
              season={season}
              weather={activeWeather}
              gear={gear?.worn ? gear.item : undefined}
              reaction={
                emergency || catastrophic || hostileReveal || cinematic?.feedback?.kind === 'wrong'
                  ? 'panic'
                  : cinematic?.feedback?.kind === 'safe' || cinematic?.mystery
                    ? 'happy'
                    : 'calm'
              }
            />
          )}
          {cinematic?.mystery && !state.discovery?.introduction && !pactOffered && (
            <div
              key={cinematic.id}
              className={
                'cpi-mystery-release' +
                (themeId !== 'obsidian' ? ' cpi-world-reveal' : '') +
                (hostileReveal ? ' is-hostile' : '')
              }
              aria-hidden="true"
            >
              <span className="cpi-release-flare" />
              {themeId !== 'obsidian' && (
                <span className="cpi-world-reveal-cache">
                  <MysteryCache theme={themeId} open />
                </span>
              )}
              <span className="cpi-released-symbol">
                <EffectGlyph kind={cinematic.mystery.kind} />
              </span>
            </div>
          )}
          {cinematic?.feedback && cinematic.phase !== 'contact' && cinematic.phase !== 'travel' && (
            <div className={'cpi-step-readout is-' + cinematic.feedback.kind} aria-hidden="true">
              {t(
                cinematic.fatal
                  ? petWorld
                    ? 'vault.safeCompanions'
                    : 'game.collapse'
                  : cinematic.feedback.kind === 'wrong'
                    ? 'game.impactWrong'
                    : 'game.impactSafe',
              )}
            </div>
          )}
          {catastrophic && !petWorld && (
            <div className="cpi-death-veil" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
        </section>
        <p className="visually-hidden" role="status" aria-live="polite">
          {notice}
        </p>
        <p className="cpi-scene-footer">
          <span aria-hidden="true">—</span>
          {t(petWorld ? 'vault.petGuidance' : 'game.bridgeGuidance')}
          <span aria-hidden="true">—</span>
          <span className="visually-hidden">{t('game.crossingNote')}</span>
        </p>
      </div>
      <EffectConsumption
        cue={resourceCues.consumption}
        hidden={overlayVisible}
        glass={themeId === 'obsidian'}
      />
      {overlayVisible && (
        <div className="cpi-overlay cpi-crossing-overlay">
          <div
            className={
              'cpi-overlay-card cpi-run-outcome' +
              (worldOutcomeTheme ? ' is-world-outcome' : '') +
              (pauseVisible ? ' cpi-pause-card' : '')
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="cpi-run-outcome-title"
          >
            {worldDialogTheme ? (
              <WorldOutcomeHero theme={worldDialogTheme} finished={outcome.phase === 'finished'}>
                {dialogHeading}
                {pauseFoothold}
              </WorldOutcomeHero>
            ) : (
              <header className="cpi-dialog-heading">
                {pauseVisible && (
                  <span className="cpi-dialog-kicker">{t('game.pauseClockHeld')}</span>
                )}
                {dialogHeading}
                {pauseFoothold}
              </header>
            )}
            {error ? (
              <>
                <p role="alert">{error}</p>
                <p>{t('game.clockRecover')}</p>
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary onClick={onRetry}>
                    {t('game.retryClock')}
                  </button>
                  <button type="button" onClick={onExit}>
                    {t('general.saveLeave')}
                  </button>
                </div>
              </>
            ) : confirmEnd && outcome.canEnd ? (
              <>
                <p>
                  {t('game.confirmCleared', { row: clearedRows })}{' '}
                  {fatalRow !== null
                    ? t('game.confirmFatal', { row: fatalRow })
                    : t('game.confirmUnfinished')}
                </p>
                {outcome.forfeitsGrant && <p role="alert">{t('game.confirmForfeit')}</p>}
                <p>{t('game.confirmLocal')}</p>
                <div className="cpi-overlay-actions">
                  <button
                    type="button"
                    data-cpi-overlay-primary
                    disabled={busy}
                    onClick={onCancelEnd}
                  >
                    {t('game.keepAttempt')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onEnd}
                    className="cpi-run-danger-action"
                  >
                    {outcome.forfeitsGrant ? t('game.confirmForfeitButton') : t('game.confirmEnd')}
                  </button>
                </div>
              </>
            ) : outcome.phase === 'verification-pending' ? (
              <>
                <p>{t('game.pendingExplanation', { row: clearedRows })}</p>
                <p role="status">{t('game.pendingRecovery')}</p>
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary onClick={onExit}>
                    {t('game.savePending')}
                  </button>
                </div>
              </>
            ) : outcome.phase === 'finished' ? (
              <div className="cpi-outcome-split">
                <div>
                  {rescueNote}
                  <p className="cpi-run-status-label">
                    {t(state.storeTest?.assisted ? 'vault.assisted' : 'game.practiceUnverified')}
                  </p>
                  <div className="cpi-result-score">
                    <span>{t(petWorld ? 'vault.rowsExplored' : 'game.rowsCleared')}</span>
                    <strong>
                      <AnimatedResult
                        value={state.result?.lastClearedRow ?? state.lastClearedRow}
                        reduced={settings.reducedMotion}
                      />
                    </strong>
                  </div>
                  <dl className="cpi-result-details">
                    <div>
                      <dt>{t(petWorld ? 'vault.uncrossedRow' : 'game.fatalRow')}</dt>
                      <dd>
                        {rawFatalRow === null ? (
                          t('general.none')
                        ) : (
                          <AnimatedResult value={rawFatalRow} reduced={settings.reducedMotion} />
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('game.activeTime')}</dt>
                      <dd>{outcome.activeTime}</dd>
                    </div>
                    <div>
                      <dt>{t('game.revivesApplied')}</dt>
                      <dd>
                        <AnimatedResult
                          value={String(outcome.appliedContinues)}
                          reduced={settings.reducedMotion}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>{t('game.bestLocal')}</dt>
                      <dd>
                        {personalBest === null ? t('general.notSaved') : number(personalBest)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="cpi-outcome-next">
                  {localizedDeathReason && <p>{localizedDeathReason}</p>}
                  {newPersonalBest && <p className="cpi-new-best">{t('game.bestNew')}</p>}
                  <p>
                    {t(state.storeTest?.assisted ? 'vault.assistedResult' : 'game.resultLocal')}
                  </p>
                  <div className="cpi-overlay-actions cpi-result-actions">
                    <button type="button" data-cpi-overlay-primary onClick={onRestart}>
                      {t('game.nextRun')}
                    </button>
                    <button type="button" onClick={onViewRankings}>
                      {t('game.rankingsNotLive')}
                    </button>
                    <button type="button" onClick={onExit}>
                      {t('game.returnMenu')}
                    </button>
                  </div>
                </div>
              </div>
            ) : outcome.phase === 'dead' || outcome.phase === 'grant-ready' ? (
              <div className="cpi-outcome-split">
                <div>
                  {rescueNote}
                  {localizedDeathReason && <p>{localizedDeathReason}</p>}
                  <div className="cpi-result-score">
                    <span>{t(petWorld ? 'vault.rowsExplored' : 'game.rowsCleared')}</span>
                    <strong>
                      <AnimatedResult
                        value={state.lastClearedRow}
                        reduced={settings.reducedMotion}
                      />
                    </strong>
                  </div>
                  <p>
                    {t(petWorld ? 'vault.petFatalNotCounted' : 'game.fatalNotCounted', {
                      row: fatalRow ?? t('general.none'),
                    })}
                  </p>
                </div>
                <div className="cpi-outcome-next">
                  {guestContinuePanel ? (
                    guestContinuePanel
                  ) : outcome.offer && resourcePanel ? (
                    resourcePanel
                  ) : outcome.offer && QA_TOOLS_ENABLED ? (
                    <div className="cpi-revive-offer">
                      <strong>
                        {t(petWorld ? 'vault.petContinueTitle' : 'game.bargainTitle', {
                          sp: number(outcome.offer.restoreSp),
                        })}
                      </strong>
                      <span>{t(petWorld ? 'vault.petContinueBody' : 'game.bargainBody')}</span>
                      <span>{t('game.bargainSleeping')}</span>
                    </div>
                  ) : outcome.offer ? (
                    <p>
                      {t(
                        PLAYER_PREVIEW_ENABLED && !state.storeTest
                          ? 'vault.previewNewCrossing'
                          : 'vault.continuationUnavailable',
                      )}
                    </p>
                  ) : outcome.phase === 'grant-ready' ? (
                    <p role="status">{t('game.grantReady')}</p>
                  ) : (
                    <p>{t('game.noContinues')}</p>
                  )}
                  <div className="cpi-overlay-actions cpi-result-navigation">
                    <button
                      type="button"
                      data-cpi-overlay-primary={
                        !(guestContinuePanel || (outcome.offer && resourcePanel)) || undefined
                      }
                      disabled={busy}
                      onClick={outcome.phase === 'dead' ? onRestart : onRequestEnd}
                    >
                      {t(outcome.phase === 'dead' ? 'vault.restartFree' : 'general.endRun')}
                    </button>
                    <button type="button" disabled={busy} onClick={onExit}>
                      {t(outcome.forfeitsGrant ? 'general.saveLeave' : 'game.returnMenu')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <RunPauseMenu
                outcome={outcome}
                clearedRows={clearedRows}
                maxContinues={getMaxRevives(state.rulesetVersion)}
                resources={resourcePanel}
                settings={settings}
                onSettingsChange={onSettingsChange}
                busy={busy}
                onResume={onPause}
                onDiscoveries={onMysteryJournal}
                onMysteryLab={onMysteryLab}
                onExit={onExit}
                onEnd={onRequestEnd}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function makeInitialRun(testEconomy = false, fixedRulesetVersion?: string): RunState {
  let discoveredMysteries: EffectKind[] = [];
  try {
    discoveredMysteries = readMysteryJournal(practiceStorage());
  } catch {
    /* Optional discoveries. */
  }
  const seed = new Uint32Array(2);
  crypto.getRandomValues(seed);
  const route = (BigInt(seed[0]) << 32n) | BigInt(seed[1]);
  const mystery = route ^ 0x9e3779b97f4a7c15n;
  const rulesetVersion = fixedRulesetVersion ?? nextPracticeRuleset(testEconomy);
  return createRun(
    {
      runId: 'practice-' + route.toString(16),
      rulesetVersion,
      ...(usesDiscoveryRules(rulesetVersion) ? { discoveredMysteries } : {}),
      routeRng: createPracticeCursor(route),
      mysteryRng: createPracticeCursor(mystery),
      observedAt: Date.now(),
      buffer: { ahead: 8, history: 2 },
    },
    PRACTICE_RNG,
  );
}

interface InfinityRunProps {
  trial?: boolean;
  onExit: () => void;
  onStore?: () => void;
  onViewRankings: () => void;
  onExitCancelled: () => void;
  exitRequest: number;
  onRestart: () => void;
  guestRewardedAd?: GuestRewardedAd | null;
  initialState: RunState | null;
  onCheckpoint: (state: RunState, events?: readonly RunEvent[]) => void;
  settings: PracticeSettings;
  onSettingsChange: (next: PracticeSettings) => void;
  fixedRulesetVersion?: string;
  weather?: 'clear' | 'rain';
  campaignMission?: CampaignPresentation;
  bridgeStyle?: BridgeStyle;
  infinitySupplies?: InfinitySupplies;
  onInfinitySupplyCommit?: (
    state: RunState,
    events: readonly RunEvent[],
    previous: RunState,
  ) => void;
}
function InfinityRun({
  trial = false,
  onExit,
  onStore,
  onViewRankings,
  onExitCancelled,
  exitRequest,
  onRestart,
  guestRewardedAd,
  initialState,
  onCheckpoint,
  settings,
  onSettingsChange,
  fixedRulesetVersion,
  weather = 'clear',
  campaignMission,
  bridgeStyle,
  infinitySupplies,
  onInfinitySupplyCommit,
}: InfinityRunProps) {
  const { t, number } = useLanguage();
  const { store } = useTestStore();
  const runTheme = useThemeId();
  const isCampaign = !!campaignMission;
  const suppliesAvailable =
    !trial &&
    !isCampaign &&
    !!parseTileExperiment(initialState?.rulesetVersion ?? '')?.infinitySupplies;
  const model = bridgeModel(bridgeStyle);
  const bridgeSurface =
    model === 'trestle'
      ? 'wood'
      : model === 'frost'
        ? 'ice'
        : model === 'aurora'
          ? 'trampoline'
          : model === 'prism'
            ? 'cosmic'
            : model === 'jelly' || model === 'lily' || model === 'cookie'
              ? model
              : 'glass';
  const [resourceMessage, setResourceMessage] = useState('');
  const [initial] = useState(() =>
    initialState
      ? upgradePracticePacing(initialState)
      : makeInitialRun(!!store && !trial, fixedRulesetVersion),
  );
  const [initialAudioSettings] = useState(settings);
  const lastCommittedActiveMs = useRef(-500);
  const [state, setState] = useState<RunState>(initial);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);
  const [kitSelection, setKitSelection] = useState<KitSelection>(EMPTY_KIT_SELECTION);
  const [kitBase, setKitBase] = useState({
    sp: 0,
    shields: 0,
    loaded: 0,
    gearWear: undefined as boolean | undefined,
  });
  const [kitError, setKitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SceneFeedback | null>(null);
  const [mysteryFeedback, setMysteryFeedback] = useState<MysteryFeedback | null>(null);
  const [resourceCues, setResourceCues] = useState<RunCues>({});
  const [labOpen, setLabOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [cinematic, setCinematic] = useState<SceneCinematic | null>(null);
  const [signals, setSignals] = useState<RunSignals>(EMPTY_RUN_SIGNALS);
  const [hintCaptionRow, setHintCaptionRow] = useState<string | null>(null);
  const [hintCaptionGate] = useState(() => createHintCaptionGate(() => practiceStorage()));
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [guestAdPhase, setGuestAdPhase] = useState<'idle' | 'watching' | 'offline' | 'unavailable'>(
    'idle',
  );
  const guestAdRequest = useRef<AbortController | null>(null);
  useSoundtrack(
    state.status === 'playing' ? 'run' : cinematic?.fatal ? null : 'ended',
    settings.music && (state.status !== 'playing' || (ready && !paused && !confirmEnd && !error)),
    settings.music && (!!cinematic?.fatal || confirmEnd || guestAdPhase === 'watching'),
  );
  const [personalBest, setPersonalBest] = useState<string | null>(null);
  const [newPersonalBest, setNewPersonalBest] = useState(false);
  const runtimeRef = useRef<PracticeRuntime | null>(null);
  const audioRef = useRef<StandaloneAudio | null>(null);
  const pauseRef = useRef<PracticePauseLease | null>(null);
  const kitPauseRef = useRef<PracticePauseLease | null>(null);
  const commandLock = useRef(false);
  const exitLock = useRef(false);
  const directorRef = useRef<ReturnType<typeof createSceneDirector> | null>(null);
  const reducedRef = useRef(settings.reducedMotion);

  useEffect(() => {
    reducedRef.current = settings.reducedMotion;
    if (settings.reducedMotion) directorRef.current?.finish();
  }, [settings.reducedMotion]);

  useEffect(() => {
    let alive = true;
    const lifecycle = getGameplayLifecycle();
    const audio = createStandaloneAudio(
      {
        createMedia: (source) => new Audio(source),
        haptic: optionalHaptic,
        ...(initial.stream.journey &&
        parseTileExperiment(initial.rulesetVersion)?.journey !== 'plain'
          ? { createAmbientContext: () => new AudioContext() }
          : {}),
      },
      { ...initialAudioSettings, music: false },
      runTheme,
      bridgeSurface,
    );
    audioRef.current = audio;
    const director = createSceneDirector(
      initial,
      (beat) => {
        if (alive) setCinematic(beat);
      },
      (callback, delay) => {
        const timer = window.setTimeout(callback, delay);
        return () => window.clearTimeout(timer);
      },
      () => reducedRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    directorRef.current = director;
    audio.setForeground(document.visibilityState !== 'hidden');
    const runtime = createPracticeRuntime({
      state: initial,
      rng: PRACTICE_RNG,
      lifecycle,
      schedule: schedulePracticeTick,
      playback: audio,
      onTransition: (result: TimedSessionResult) => {
        if (!alive) return;
        director.receive(result);
        const hint = result.events.find((event) => event.type === 'hint-used');
        if (hint && hintCaptionGate.claim()) setHintCaptionRow(hint.row);
        if (result.events.length) setSignals((previous) => collectRunSignals(previous, result));
        let earnedNewBest = false;
        if (!trial && !isCampaign && result.events.some((event) => event.type === 'run-ended')) {
          try {
            earnedNewBest =
              result.state.storeTest?.assisted && store
                ? store.recordAssistedBest(result.state.lastClearedRow, result.state.rulesetVersion)
                : recordPracticePersonalBest(
                    practiceStorage(),
                    result.state.lastClearedRow,
                    result.state.rulesetVersion,
                  );
            setPersonalBest(
              result.state.storeTest?.assisted && store
                ? store.assistedBest(result.state.rulesetVersion)
                : readPracticePersonalBest(practiceStorage(), result.state.rulesetVersion),
            );
            setNewPersonalBest(earnedNewBest);
          } catch {
            // A storage error must not change game result or claim a saved best.
            setPersonalBest(null);
            setNewPersonalBest(false);
          }
        }
        audio.playEvents(result.events, result.state, {
          foreground: document.visibilityState !== 'hidden',
          personalBest: earnedNewBest,
        });
        if (
          result.events.length > 0 ||
          result.state.status !== 'playing' ||
          result.state.activeTimeMs - lastCommittedActiveMs.current >= 500
        ) {
          onCheckpoint(result.state, result.events);
          lastCommittedActiveMs.current = result.state.activeTimeMs;
        }
        setState(result.state);
        const mysteryNotice = mysteryFeedbackFromEvents(result.events, result.state);
        if (mysteryNotice)
          setMysteryFeedback(
            result.state.discovery?.introduction && mysteryNotice.action === null
              ? null
              : mysteryNotice,
          );
        const cues = runCuesFromEvents(result.events, result.state);
        if (cues.consumption || cues.hints)
          setResourceCues((previous) => ({ ...previous, ...cues }));
        const choice = result.events.find(
          (event): event is Extract<RunEvent, { type: 'choice-resolved' }> =>
            event.type === 'choice-resolved',
        );
        if (choice)
          setFeedback({
            row: (BigInt(choice.row) - 1n).toString(),
            side: choice.side,
            kind: choice.wrong ? 'wrong' : 'safe',
          });
      },
      onError: (reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : 'Clock read failed.');
      },
    });
    runtimeRef.current = runtime;
    const unsubscribeCheckpoint = lifecycle.subscribe((snapshot) => {
      audio.setForeground(snapshot.active);
      if (!snapshot.active && alive) {
        director.finish();
        setSignals(EMPTY_RUN_SIGNALS);
        try {
          onCheckpoint(runtime.getState());
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Local save failed.');
        }
      }
    });
    void runtime.ready
      .then(() => {
        if (alive) {
          setReady(true);
          setState(runtime.getState());
        }
      })
      .catch((reason) => {
        if (alive)
          setError(reason instanceof Error ? reason.message : 'Unable to initialize clock.');
      });
    return () => {
      alive = false;
      guestAdRequest.current?.abort();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      if (audioRef.current === audio) audioRef.current = null;
      if (directorRef.current === director) directorRef.current = null;
      director.dispose();
      unsubscribeCheckpoint();
      runtime.dispose();
    };
  }, [
    initial,
    onCheckpoint,
    initialAudioSettings,
    hintCaptionGate,
    store,
    trial,
    runTheme,
    isCampaign,
    bridgeSurface,
  ]);

  useEffect(() => {
    audioRef.current?.setSettings({ ...settings, music: false });
  }, [settings]);

  useEffect(() => {
    if (paused || confirmEnd || state.status !== 'playing' || error) {
      const heading = document.querySelector<HTMLElement>('.cpi-overlay .is-world-outcome h2');
      if (heading) {
        heading.focus({ preventScroll: true });
        const card = heading.closest('.cpi-overlay-card');
        if (card) card.scrollTop = 0;
      } else {
        document
          .querySelector<HTMLButtonElement>('.cpi-overlay [data-cpi-overlay-primary]')
          ?.focus({ preventScroll: true });
      }
    }
  }, [paused, confirmEnd, state.status, state.pendingReward, error, cinematic?.fatal]);

  useEffect(() => {
    if (!confirmEnd) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmEnd(false);
      }
    };
    document.addEventListener('keydown', cancelOnEscape);
    return () => document.removeEventListener('keydown', cancelOnEscape);
  }, [confirmEnd]);

  function unlockAudio() {
    void audioRef.current?.unlock();
  }

  async function issue(command: SessionCommand, beforeCommit?: BeforeRunCommit) {
    const runtime = runtimeRef.current;
    if (
      !runtime ||
      !ready ||
      (paused && command.type !== 'end') ||
      commandLock.current ||
      (command.type !== 'end' && directorRef.current?.isBusy())
    )
      return;
    if (kitPauseRef.current) return;
    commandLock.current = true;
    setBusy(true);
    try {
      const commit =
        beforeCommit ??
        (onInfinitySupplyCommit
          ? (result: Parameters<BeforeRunCommit>[0], previous: RunState) =>
              onInfinitySupplyCommit(result.state, result.events, previous)
          : undefined);
      const result = await runtime.bind(command, commit)();
      setState(result.state);
      if (
        !result.accepted &&
        result.reason &&
        ![
          'clock-paused',
          'stale-command',
          'stale-pause',
          'command-consumed',
          'died-before-command',
        ].includes(result.reason)
      )
        setError(`Action unavailable: ${result.reason}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gameplay command failed.');
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }

  async function toggleKit() {
    const runtime = runtimeRef.current;
    if (!runtime || !ready || paused || commandLock.current || directorRef.current?.isBusy())
      return;
    commandLock.current = true;
    setBusy(true);
    try {
      if (kitPauseRef.current) {
        await kitPauseRef.current.release();
        kitPauseRef.current = null;
        if (
          kitSelection.stabilityDoses ||
          kitSelection.shieldDelta ||
          kitSelection.wear !== undefined
        ) {
          const command: SessionCommand = suppliesAvailable
            ? {
                type: 'journey-loadout',
                stabilityDoses: kitSelection.stabilityDoses,
                shieldDelta: kitSelection.shieldDelta,
                ...(kitSelection.wear !== undefined ? { wear: kitSelection.wear } : {}),
              }
            : { type: 'journey-gear', wear: kitSelection.wear! };
          const result = await runtime.bind(
            command,
            onInfinitySupplyCommit
              ? (result, previous) => onInfinitySupplyCommit(result.state, result.events, previous)
              : undefined,
          )();
          if (!result.accepted) throw new Error('Kit selection unavailable');
        }
        setKitOpen(false);
        setKitSelection(EMPTY_KIT_SELECTION);
        setKitError(null);
      } else {
        const lease = await runtime.hold('user');
        if (runtimeRef.current !== runtime || runtime.getState().status !== 'playing') {
          await lease.release();
          return;
        }
        kitPauseRef.current = lease;
        setKitBase({
          sp: infinitySupplies?.sp ?? 0,
          shields: infinitySupplies?.shield ?? 0,
          loaded: runtime.getState().journeyShields ?? 0,
          gearWear: runtime.getState().journeyGear?.queued ?? runtime.getState().journeyGear?.worn,
        });
        setKitSelection(EMPTY_KIT_SELECTION);
        setKitError(null);
        setKitOpen(true);
      }
      setState(runtime.getState());
    } catch {
      if (runtime.getState().status === 'playing') {
        try {
          if (!kitPauseRef.current) kitPauseRef.current = await runtime.hold('user');
          setKitOpen(true);
          setKitError('Couldn’t save your Kit. Your items are still here. Try closing again.');
        } catch {
          setKitOpen(false);
          setError('The crossing could not resume. Try again.');
        }
      } else setKitOpen(false);
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }

  function changeKitSupply(item: 'sp' | 'shield', direction: 1 | -1) {
    if (!kitOpen || busy || commandLock.current) return;
    setKitError(null);
    setKitSelection((previous) => {
      const stacking = !!parseTileExperiment(state.rulesetVersion)?.shieldStacks;
      const maxShields = stacking
        ? kitBase.shields
        : state.effects.some((effect) => effect.kind === 'shield_5s')
          ? 0
          : Math.min(1, kitBase.shields);
      const target =
        item === 'sp'
          ? Math.max(0, Math.min(Math.floor(kitBase.sp / 25), previous.stabilityDoses + direction))
          : Math.max(0, Math.min(maxShields, kitBase.loaded + previous.shieldDelta + direction));
      if (
        item === 'sp'
          ? target === previous.stabilityDoses
          : target === kitBase.loaded + previous.shieldDelta
      )
        return previous;
      return {
        ...previous,
        ...(item === 'sp' ? { stabilityDoses: target } : { shieldDelta: target - kitBase.loaded }),
        revision: previous.revision + 1,
        changed: item,
        direction: direction > 0 ? 'load' : 'return',
        notice:
          item === 'sp'
            ? direction > 0
              ? '+25 Stability ready'
              : '25 Stability put back'
            : direction > 0
              ? `Shield ready · ${target} loaded`
              : `Shield put back · ${target} loaded`,
      };
    });
  }

  async function togglePause(requestEndAfterPause = false) {
    if (requestEndAfterPause && paused) {
      setConfirmEnd(true);
      return;
    }
    if (paused) unlockAudio();
    const runtime = runtimeRef.current;
    if (!runtime || commandLock.current || directorRef.current?.isBusy()) return;
    commandLock.current = true;
    setBusy(true);
    try {
      if (pauseRef.current) {
        const lease = pauseRef.current;
        pauseRef.current = null;
        await lease.release();
        setPaused(false);
      } else {
        const lease = await runtime.hold('user');
        pauseRef.current = lease;
        setPaused(true);
      }
      if (requestEndAfterPause) setConfirmEnd(true);
      onCheckpoint(runtime.getState());
      lastCommittedActiveMs.current = runtime.getState().activeTimeMs;
      setState(runtime.getState());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pause failed.');
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }
  async function retry() {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      await runtime.refresh();
      if (kitPauseRef.current) {
        await kitPauseRef.current.release();
        kitPauseRef.current = null;
        setKitOpen(false);
      }
      setError(null);
      setReady(true);
      setState(runtime.getState());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Clock is unavailable.');
    }
  }
  const exit = useCallback(
    async (destination: 'home' | 'store' = 'home') => {
      if (exitLock.current) return;
      if (commandLock.current) {
        onExitCancelled();
        return;
      }
      exitLock.current = true;
      try {
        const runtime = runtimeRef.current;
        if (
          (runtime?.getState().status ?? state.status) === 'playing' &&
          !paused &&
          !window.confirm(t('app.saveLeaveConfirm'))
        ) {
          onExitCancelled();
          return;
        }
        if (runtime) {
          try {
            const latest = runtime.getState();
            if (shouldFinishPracticeOnExit(latest, destination)) {
              // Leaving a declined death finalizes its result instead of advertising a dead Resume.
              await runtime.bind({ type: 'end', forfeitGrantedReward: false })();
            }
            if (!paused) await runtime.hold('recovery');
            onCheckpoint(runtime.getState());
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to pause and save.');
            onExitCancelled();
            return;
          }
        }
        if (destination === 'store' && onStore) onStore();
        else onExit();
      } finally {
        exitLock.current = false;
      }
    },
    [state.status, paused, onCheckpoint, onExit, onStore, onExitCancelled, t],
  );

  async function useResource(resource: TestResource, amount: number): Promise<boolean> {
    const runtime = runtimeRef.current;
    if (
      !runtime ||
      !store ||
      !ready ||
      commandLock.current ||
      trial ||
      directorRef.current?.isBusy()
    )
      return false;
    const previous = runtime.getState();
    if (!previous.storeTest || (previous.status === 'playing' && !paused)) return false;
    commandLock.current = true;
    setBusy(true);
    setResourceMessage('');
    try {
      const result = await runtime.bind(
        { type: 'test-resource', resource, amount, sequence: previous.storeTest.sequence + 1 },
        store.commitResource,
      )();
      setState(result.state);
      if (!result.accepted) {
        setResourceMessage(`Action unavailable: ${result.reason}`);
        return false;
      }
      setResourceMessage(t('vault.resourceUsed'));
      return true;
    } catch (cause) {
      setResourceMessage(
        cause instanceof Error ? cause.message : 'Test resource could not be saved.',
      );
      return false;
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }

  async function watchPracticeAd() {
    const runtime = runtimeRef.current;
    if (
      trial ||
      !guestRewardedAd ||
      !runtime ||
      !ready ||
      commandLock.current ||
      exitLock.current ||
      directorRef.current?.isBusy() ||
      !guestAdOffer(runtime.getState())
    )
      return;
    if (navigator.onLine === false) {
      setGuestAdPhase('offline');
      return;
    }
    const request = new AbortController();
    guestAdRequest.current = request;
    commandLock.current = true;
    setBusy(true);
    setGuestAdPhase('watching');
    try {
      const result = await watchGuestContinuation(runtime, guestRewardedAd, request.signal);
      if (!request.signal.aborted && runtimeRef.current === runtime)
        setGuestAdPhase(result === 'unavailable' ? 'unavailable' : 'idle');
    } catch {
      if (!request.signal.aborted && runtimeRef.current === runtime) setGuestAdPhase('unavailable');
    } finally {
      if (guestAdRequest.current === request) {
        guestAdRequest.current = null;
        commandLock.current = false;
        setBusy(false);
        if (request.signal.aborted) setGuestAdPhase('idle');
      }
    }
  }

  const handledExitRequest = useRef(0);
  useEffect(() => {
    if (exitRequest === 0 || handledExitRequest.current === exitRequest) return;
    handledExitRequest.current = exitRequest;
    void exit();
  }, [exitRequest, exit]);
  if (journalOpen)
    return (
      <MysteryJournal
        state={state}
        reducedMotion={settings.reducedMotion}
        onClose={() => setJournalOpen(false)}
      />
    );
  if (QA_TOOLS_ENABLED && labOpen)
    return <MysteryLab onClose={() => setLabOpen(false)} reducedMotion={settings.reducedMotion} />;
  const savedGuestGrant = trial ? undefined : earnedGuestContinuation(state);
  const adOffer = !trial && guestRewardedAd ? guestAdOffer(state) : null;
  const canSupplyContinue =
    suppliesAvailable &&
    onInfinitySupplyCommit &&
    (infinitySupplies?.continue ?? 0) > 0 &&
    state.status === 'dead' &&
    state.revivesGranted < getMaxRevives(state.rulesetVersion);
  return (
    <InfinitySceneView
      trial={trial}
      guestContinuePanel={
        savedGuestGrant || adOffer || canSupplyContinue ? (
          <div className="cpi-revive-offer cpi-overlay-actions">
            {canSupplyContinue && (
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => {
                  unlockAudio();
                  void issue(
                    { type: 'journey-resource', resource: 'continue' },
                    (result, previous) =>
                      onInfinitySupplyCommit(result.state, result.events, previous),
                  );
                }}
              >
                Use continue · {infinitySupplies!.continue} left
              </button>
            )}
            {savedGuestGrant ? (
              <button
                type="button"
                data-cpi-overlay-primary
                disabled={!ready || busy}
                onClick={() => {
                  unlockAudio();
                  void issue({
                    type: 'apply-revive',
                    deathId: savedGuestGrant.deathId,
                    ordinal: savedGuestGrant.ordinal,
                    grantId: savedGuestGrant.grantId,
                  });
                }}
              >
                {t('rewards.resumeRestore', { sp: number(savedGuestGrant.sp) })}
              </button>
            ) : adOffer ? (
              <>
                <span>{t('rewards.guestLeft', { count: number(adOffer.grantsRemaining) })}</span>
                <button
                  type="button"
                  data-cpi-overlay-primary
                  disabled={!ready || busy}
                  onClick={() => void watchPracticeAd()}
                >
                  {guestAdPhase === 'watching'
                    ? t('rewards.loading')
                    : t('rewards.watchRestore', { sp: number(adOffer.restoreSp) })}
                </button>
                {(guestAdPhase === 'unavailable' || guestAdPhase === 'offline') && (
                  <span role="status">
                    {t(guestAdPhase === 'offline' ? 'rewards.guestOffline' : 'rewards.noFill')}
                  </span>
                )}
              </>
            ) : null}
          </div>
        ) : undefined
      }
      resourcePanel={
        store && state.storeTest && !trial ? (
          <RunReserves
            state={state}
            busy={busy}
            onUse={useResource}
            message={resourceMessage}
            onOpenStore={
              onStore
                ? () => {
                    void exit('store');
                  }
                : undefined
            }
          />
        ) : undefined
      }
      weather={weather}
      campaignMission={campaignMission}
      kitOpen={kitOpen}
      kitGearWear={kitSelection.wear}
      kitNotice={kitError ?? kitSelection.notice}
      kitError={!!kitError}
      onToggleKit={() => {
        void toggleKit();
      }}
      reserveHints={suppliesAvailable ? infinitySupplies?.hint : 0}
      bridgeStyle={bridgeStyle}
      onToggleJourneyGear={(wear) => {
        unlockAudio();
        if (kitOpen) {
          setKitError(null);
          setKitSelection((previous) => ({
            ...previous,
            wear: wear === kitBase.gearWear ? undefined : wear,
            revision: previous.revision + 1,
            changed: 'gear',
            direction: wear === kitBase.gearWear ? 'return' : 'load',
            notice:
              wear === kitBase.gearWear
                ? 'Gear change undone'
                : wear
                  ? 'Gear ready to wear'
                  : 'Gear ready to pack away',
          }));
        } else void issue({ type: 'journey-gear', wear });
      }}
      campaignSupplyPanel={
        suppliesAvailable &&
        infinitySupplies &&
        onInfinitySupplyCommit &&
        state.status === 'playing' &&
        (infinitySupplies.sp >= 25 || infinitySupplies.shield > 0) ? (
          <div className="cpi-journey-supplies" aria-label="Infinity supplies">
            {(['sp', 'shield'] as const).map((item) => {
              const stacking = !!parseTileExperiment(state.rulesetVersion)?.shieldStacks;
              const quantity =
                item === 'sp'
                  ? kitSelection.stabilityDoses
                  : kitBase.loaded + kitSelection.shieldDelta;
              const available =
                item === 'sp'
                  ? kitBase.sp - kitSelection.stabilityDoses * 25
                  : kitBase.shields - quantity;
              const canAdd =
                item === 'sp'
                  ? available >= 25
                  : available > 0 &&
                    (stacking ||
                      (quantity === 0 &&
                        !state.effects.some((effect) => effect.kind === 'shield_5s')));
              if ((item === 'sp' ? kitBase.sp < 25 : kitBase.shields === 0) && quantity === 0)
                return null;
              return (
                <article
                  className="cpi-kit-slot"
                  key={item}
                  data-change={kitSelection.changed === item ? kitSelection.direction : undefined}
                >
                  <button
                    type="button"
                    className="cpi-kit-load"
                    disabled={!ready || busy || !canAdd}
                    aria-label={item === 'sp' ? 'Load 25 Stability' : 'Load one shield'}
                    onClick={() => {
                      unlockAudio();
                      changeKitSupply(item, 1);
                    }}
                  >
                    <span className="cpi-kit-supply-art" data-item={item} aria-hidden="true" />
                    <strong>{item === 'sp' ? '+25 Stability' : 'Shield'}</strong>
                    <small>
                      {available} {item === 'sp' ? 'SP in bag' : 'in bag'}
                    </small>
                    <span
                      key={kitSelection.changed === item ? kitSelection.revision : 0}
                      className="cpi-kit-ready"
                      data-loaded={quantity > 0}
                    >
                      {quantity > 0
                        ? item === 'sp'
                          ? `+${quantity * 25} ready`
                          : `${quantity} loaded`
                        : 'Tap to load'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="cpi-kit-remove"
                    disabled={!ready || busy || quantity === 0}
                    aria-label={
                      item === 'sp' ? 'Remove one Stability dose' : 'Remove one loaded shield'
                    }
                    onClick={() => changeKitSupply(item, -1)}
                  >
                    −
                  </button>
                </article>
              );
            })}
          </div>
        ) : undefined
      }
      state={state}
      feedback={feedback}
      cinematic={cinematic}
      mysteryFeedback={mysteryFeedback}
      resourceCues={resourceCues}
      onMysteryLab={
        QA_TOOLS_ENABLED && import.meta.env.MODE !== 'production'
          ? () => setLabOpen(true)
          : undefined
      }
      onMysteryJournal={() => setJournalOpen(true)}
      onPact={(option) => {
        unlockAudio();
        void issue({ type: 'pact', option });
      }}
      signals={signals}
      hintCaptionRow={hintCaptionRow}
      ready={ready}
      busy={busy}
      paused={paused}
      error={error}
      onChoose={(side) => {
        unlockAudio();
        void issue({ type: 'choose', side });
      }}
      onHint={() => {
        unlockAudio();
        if (
          state.hints === 0 &&
          suppliesAvailable &&
          (infinitySupplies?.hint ?? 0) > 0 &&
          onInfinitySupplyCommit
        ) {
          void issue({ type: 'journey-hint' }, (result, previous) =>
            onInfinitySupplyCommit(result.state, result.events, previous),
          );
        } else void issue({ type: 'hint' });
      }}
      onMystery={() => {
        unlockAudio();
        void issue({ type: 'mystery' });
      }}
      onPause={() => {
        void togglePause();
      }}
      onRequestEnd={() => {
        if (!ready || busy || commandLock.current || !presentRunOutcome(state).canEnd) return;
        if (state.status === 'dead') {
          setConfirmEnd(true);
        } else {
          void togglePause(true);
        }
      }}
      onCancelEnd={() => setConfirmEnd(false)}
      confirmEnd={confirmEnd}
      onEnd={() => {
        if (!confirmEnd || !presentRunOutcome(state).canEnd) return;
        // The explicit confirmation includes forfeiture of any unused grant.
        // Core rejects unresolved pending rewards; no fake SSV success exists.
        setConfirmEnd(false);
        void issue({ type: 'end', forfeitGrantedReward: true });
      }}
      onViewRankings={() => {
        if (state.status === 'finished' && state.result) onViewRankings();
      }}
      personalBest={personalBest}
      newPersonalBest={newPersonalBest}
      onExit={() => {
        void exit();
      }}
      onRestart={() => {
        if (runtimeRef.current?.getState().status === 'dead') {
          void issue({ type: 'end', forfeitGrantedReward: false }).then(() => {
            if (runtimeRef.current?.getState().status === 'finished') onRestart();
          });
        } else onRestart();
      }}
      onRetry={() => {
        void retry();
      }}
      settings={settings}
      onSettingsChange={onSettingsChange}
    />
  );
}

/** A new attempt and an explicitly resumed checkpoint have distinct owners. */
export function InfinityPractice({
  trialTheme,
  onExit,
  onStore,
  onViewRankings,
  onExitCancelled,
  exitRequest = 0,
  initialState = null,
  onCheckpoint,
  guestRewardedAd,
  settings,
  onSettingsChange,
  fixedRulesetVersion,
  weather,
  campaignMission,
  bridgeStyle,
  infinitySupplies,
  onInfinitySupplyCommit,
  newJourney,
  worldTheme,
}: {
  trialTheme?: ThemeId;
  onExit: () => void;
  onStore?: () => void;
  onViewRankings: () => void;
  onExitCancelled?: () => void;
  exitRequest?: number;
  initialState?: RunState | null;
  onCheckpoint: (state: RunState, events?: readonly RunEvent[]) => void;
  guestRewardedAd?: GuestRewardedAd | null;
  settings: PracticeSettings;
  onSettingsChange: (next: PracticeSettings) => void;
  fixedRulesetVersion?: string;
  weather?: 'clear' | 'rain';
  campaignMission?: CampaignPresentation;
  bridgeStyle?: BridgeStyle;
  infinitySupplies?: InfinitySupplies;
  onInfinitySupplyCommit?: (
    state: RunState,
    events: readonly RunEvent[],
    previous: RunState,
  ) => void;
  newJourney?: () => RunState;
  worldTheme?: ThemeId;
}) {
  const themeId = useThemeId();
  const [attempt, setAttempt] = useState(0);
  const [retryState, setRetryState] = useState<RunState | null>(null);
  const restartLock = useRef(false);
  useEffect(() => {
    restartLock.current = false;
  }, [attempt]);
  return (
    <ThemeScope theme={trialTheme ?? worldTheme ?? themeId}>
      <InfinityRun
        trial={!!trialTheme}
        key={attempt}
        initialState={attempt === 0 ? initialState : retryState}
        onCheckpoint={onCheckpoint}
        guestRewardedAd={guestRewardedAd}
        settings={settings}
        onSettingsChange={onSettingsChange}
        fixedRulesetVersion={fixedRulesetVersion}
        weather={weather}
        campaignMission={campaignMission}
        bridgeStyle={bridgeStyle}
        infinitySupplies={infinitySupplies}
        onInfinitySupplyCommit={onInfinitySupplyCommit}
        onExit={onExit}
        onStore={onStore}
        onViewRankings={onViewRankings}
        onExitCancelled={onExitCancelled ?? (() => {})}
        exitRequest={exitRequest}
        onRestart={() => {
          if (restartLock.current) return;
          restartLock.current = true;
          if (newJourney) setRetryState(newJourney());
          setAttempt((n) => n + 1);
        }}
      />
    </ThemeScope>
  );
}
