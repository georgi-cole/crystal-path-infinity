import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ConsumptionCue, HintCue } from './mystery-feedback';
import { useLanguage } from './language-context';

export function HintCounter({ count, cue }: { count: number; cue?: HintCue }) {
  return (
    <span
      key={cue?.id ?? 'initial'}
      className={
        'cpi-hint-feedback-surface' +
        (cue
          ? cue.delta > 0
            ? ' is-hint-gain'
            : cue.delta < 0
              ? ' is-hint-loss'
              : ' is-hint-update'
          : '')
      }
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2.8 14.5 9.5 21.2 12 14.5 14.5 12 21.2 9.5 14.5 2.8 12 9.5 9.5Z" />
        <path d="M12 8v8M8 12h8" />
      </svg>
      <span className="cps-hint-count">{count}</span>
      {cue && cue.delta !== 0 && (
        <i className="cpi-hint-float" aria-hidden="true">
          {cue.delta > 0 ? '+' : '−'}
          {Math.abs(cue.delta)}
        </i>
      )}
    </span>
  );
}

export function EffectConsumption({
  cue,
  hidden = false,
}: {
  cue?: ConsumptionCue;
  hidden?: boolean;
}) {
  const { locale } = useLanguage();
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!cue) return;
    const timer = window.setTimeout(() => setDismissed(cue.id), 1450);
    return () => window.clearTimeout(timer);
  }, [cue]);
  if (!cue || hidden || dismissed === cue.id) return null;
  const shield = cue.kind === 'shield_5s';
  return (
    <div
      key={cue.id}
      className={'cpi-consumption ' + (shield ? 'is-shield' : 'is-lucky')}
      data-consumed={cue.kind}
      aria-hidden="true"
    >
      <div className="cpi-consumption-ring" />
      <svg
        className="cpi-consumption-core"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        {shield ? (
          <>
            <path d="M50 8 82 22v27c0 23-32 43-32 43S18 72 18 49V22Z" />
            <path d="m50 12-9 22 18 13-17 13 8 29" />
            <path d="m35 49 10 10 22-25" />
          </>
        ) : (
          <>
            <circle cx="50" cy="50" r="37" />
            <path d="m50 17 8 25 25 8-25 8-8 25-8-25-25-8 25-8Z" />
            <path d="m29 21 12 25-7 25m30-48-6 27 12 28" />
          </>
        )}
      </svg>
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (index * Math.PI) / 5;
        return (
          <span
            key={index}
            className="cpi-consumption-shard"
            style={
              {
                '--shard-x': `${Math.cos(angle) * (75 + (index % 3) * 15)}px`,
                '--shard-y': `${Math.sin(angle) * (65 + (index % 4) * 12)}px`,
                '--shard-turn': `${index * 49}deg`,
                '--shard-delay': `${(index % 3) * 25}ms`,
              } as CSSProperties
            }
          />
        );
      })}
      <strong>
        {shield
          ? locale === 'bg'
            ? 'ЩИТЪТ Е ИЗПОЛЗВАН'
            : 'SHIELD USED'
          : locale === 'bg'
            ? 'КЪСМЕТЪТ Е ИЗПОЛЗВАН'
            : 'LUCK CONSUMED'}
      </strong>
      <b>{shield ? '0 SP' : `${cue.spDelta >= 0 ? '+' : '−'}${Math.abs(cue.spDelta)} SP`}</b>
    </div>
  );
}
