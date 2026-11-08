import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { discoveryTiming, mysteryTier } from '@crystal-path-infinity/game-core';
import type { MysteryDiscovery } from '@crystal-path-infinity/game-core';
import { useLanguage } from './language-context';
import { EffectGlyph } from './mystery-effects';
import { effectCopy } from './mystery.messages';
import { mysteryDiscoverySummary } from './mystery-discovery-copy';
import './mystery-discovery.css';

export function DiscoveryIntroduction({
  discovery,
  activeTimeMs,
  rulesetVersion,
  reducedMotion = false,
}: {
  discovery?: MysteryDiscovery;
  activeTimeMs: number;
  rulesetVersion: string;
  reducedMotion?: boolean;
}) {
  const { locale } = useLanguage();
  const intro = discovery?.introduction;
  const target = useRef<HTMLSpanElement>(null);
  const [flight, setFlight] = useState<{
    startedAt: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    midX: number;
    midY: number;
  } | null>(null);
  const [arrivedAt, setArrivedAt] = useState<number | null>(null);
  const startedAt = intro?.startedAt;
  useLayoutEffect(() => {
    if (
      startedAt === undefined ||
      reducedMotion ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const board = document.querySelector<HTMLElement>('.cps-board');
    const source =
      board?.querySelector<HTMLElement>('.cpi-bridge-row.is-current .cpi-bridge-mystery') ??
      board?.querySelector<HTMLElement>('.cpi-bridge-row.is-current') ??
      board?.querySelector<HTMLElement>('.cpi-bridge-mystery');
    const destination = target.current;
    if (!source || !destination) return;
    const frame = window.requestAnimationFrame(() => {
      const from = source.getBoundingClientRect();
      const to = destination.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      setFlight({
        startedAt,
        x: from.left + from.width / 2 - 24,
        y: from.top + from.height / 2 - 24,
        dx,
        dy,
        midX: dx * 0.55,
        midY: dy * 0.55,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [startedAt, reducedMotion]);
  if (!intro) return null;
  const bg = locale === 'bg';
  const copy = effectCopy(locale, intro.kind, rulesetVersion);
  const tier = mysteryTier(intro.kind);
  const dangerous = !copy.positive;
  const dramatic = dangerous || tier === 'anomaly';
  const summary = mysteryDiscoverySummary(intro.kind, bg, rulesetVersion) ?? copy.detail;
  const remaining = Math.max(0, intro.expiresAt - activeTimeMs);
  const timing = discoveryTiming(rulesetVersion);
  const reading = activeTimeMs < intro.startedAt + timing.holdMs;
  const arrived = !reducedMotion && arrivedAt === intro.startedAt;
  const activeFlight =
    !reducedMotion && flight?.startedAt === intro.startedAt && !arrived ? flight : null;
  return (
    <>
      <aside
        className={
          'cpi-discovery-intro' +
          (dangerous ? ' is-dangerous' : '') +
          (dramatic ? ' is-dramatic' : '') +
          (activeFlight ? ' is-in-flight' : '') +
          (arrived ? ' is-arrived' : '')
        }
        data-tier={tier}
        aria-label={bg ? 'Нова мистерия' : 'New discovery'}
        role="status"
      >
        <span className="cpi-discovery-symbol" ref={target} aria-hidden="true">
          <EffectGlyph kind={intro.kind} />
        </span>
        <span className="cpi-discovery-copy">
          <small>{bg ? 'Откри нова мистерия' : 'A new discovery'}</small>
          <strong>{copy.title}</strong>
          <span className="cpi-discovery-countdown">
            {reading
              ? bg
                ? 'Стъпи, когато си готов'
                : 'Step when you are ready'
              : bg
                ? 'Описание'
                : 'Description'}{' '}
            · <b>{Math.ceil(remaining / 1000)}s</b>
          </span>
          <span className="cpi-discovery-summary">{summary}</span>
        </span>
        {reading && (
          <span className="visually-hidden">
            {bg
              ? `Таймерите изчакват до ${timing.holdMs / 1000} секунди или до следващата ти стъпка.`
              : `Timers wait up to ${timing.holdMs / 1000} seconds or until your next step.`}
          </span>
        )}
      </aside>
      {activeFlight &&
        createPortal(
          <span
            className={
              'cpi-discovery-flight' +
              (dangerous ? ' is-dangerous' : '') +
              (dramatic ? ' is-dramatic' : '')
            }
            data-tier={tier}
            style={
              {
                left: `${activeFlight.x}px`,
                top: `${activeFlight.y}px`,
                '--flight-x': `${activeFlight.dx}px`,
                '--flight-y': `${activeFlight.dy}px`,
                '--flight-mid-x': `${activeFlight.midX}px`,
                '--flight-mid-y': `${activeFlight.midY}px`,
              } as CSSProperties
            }
            aria-hidden="true"
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) setArrivedAt(intro.startedAt);
            }}
          >
            <EffectGlyph kind={intro.kind} />
          </span>,
          document.body,
        )}
    </>
  );
}
