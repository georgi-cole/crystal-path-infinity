import { useLayoutEffect, useRef } from 'react';
import type { presentRowPressure } from '@crystal-path-infinity/game-core';
import type { SurvivalReward } from './run-signals';
import { useLanguage } from './language-context';
import { useThemeId } from './store-context';
import { isPetWorld } from './world-kits';

export function DeathClock({
  pressure,
}: {
  pressure: NonNullable<ReturnType<typeof presentRowPressure>>;
}) {
  const { t } = useLanguage();
  const petWorld = isPetWorld(useThemeId());
  const seconds = (pressure.remainingMs / 1000).toFixed(1);
  return (
    <div
      className={
        'cpi-pressure-clock' +
        (pressure.urgent ? ' is-urgent' : '') +
        (pressure.paused ? ' is-held' : '')
      }
      role="timer"
      aria-live="off"
      aria-label={t('game.rowPressure', { seconds })}
      data-death-remaining={pressure.remainingMs}
    >
      <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
        <circle className="cpi-pressure-track" cx="40" cy="40" r="33" />
        <circle
          className="cpi-pressure-arc"
          cx="40"
          cy="40"
          r="33"
          pathLength="100"
          strokeDasharray={`${pressure.fraction * 100} 100`}
        />
        {Array.from({ length: 5 }, (_, i) => (
          <path key={i} d="M40 3v5" transform={`rotate(${i * 72} 40 40)`} />
        ))}
      </svg>
      <div className="cpi-pressure-time" aria-hidden="true">
        {seconds}
        <small>{t(petWorld ? 'vault.petClock' : 'game.deathClock')}</small>
      </div>
      <span className="cpi-pressure-order" aria-hidden="true">
        {t(petWorld ? 'vault.petMove' : 'game.moveOrFall')}
      </span>
    </div>
  );
}

/** The visual counter follows an already-awarded bonus, never writes back SP. */
export function SpCounter({
  value,
  bonus,
  reduced,
}: {
  value: number;
  bonus: SurvivalReward | null;
  reduced: boolean;
}) {
  const node = useRef<HTMLSpanElement>(null);
  const seen = useRef<string | null>(null);
  const { number } = useLanguage();
  useLayoutEffect(() => {
    const target = node.current;
    if (!target) return;
    if (
      !bonus ||
      seen.current === bonus.id ||
      bonus.delta <= 0 ||
      reduced ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      target.textContent = number(value);
      return;
    }
    seen.current = bonus.id;
    const from = Math.min(value, bonus.fromSp);
    let displayed = from;
    let timer = 0;
    target.textContent = number(from);
    // At most five discrete additions; every point gets its own visible beat.
    function tick() {
      displayed = Math.min(value, displayed + 1);
      target!.textContent = number(displayed);
      if (displayed < value) timer = window.setTimeout(tick, 180);
    }
    if (displayed < value) timer = window.setTimeout(tick, 180);
    return () => window.clearTimeout(timer);
  }, [value, bonus, reduced, number]);
  return (
    <>
      <span ref={node} aria-hidden="true">
        {number(value)}
      </span>
      <span className="visually-hidden">{number(value)}</span>
    </>
  );
}
