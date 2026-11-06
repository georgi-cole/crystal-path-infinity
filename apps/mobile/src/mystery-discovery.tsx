import { practiceStorage, QA_TOOLS_ENABLED } from './app-profile';
import { useEffect, useRef, useState } from 'react';
import { DISCOVERY_RULESET_VERSION, mysteryTier } from '@crystal-path-infinity/game-core';
import type { EffectKind, RunState } from '@crystal-path-infinity/game-core';
import { useLanguage } from './language-context';
import { EffectGlyph } from './mystery-effects';
import { effectCopy } from './mystery.messages';
import { mysteryDiscoverySummary } from './mystery-discovery-copy';
import { discoveriesFromRun, discoveredKinds, readMysteryJournal } from './mystery-journal-model';
import { MysteryLab } from './mystery-lab';
import './mystery-discovery.css';

export function MysteryJournal({
  onClose,
  state,
  known: provided,
  reducedMotion = false,
}: {
  onClose?: () => void;
  state?: RunState;
  reducedMotion?: boolean;
  known?: readonly EffectKind[];
}) {
  const { locale } = useLanguage(),
    bg = locale === 'bg';
  const [known] = useState(() => {
    let stored: EffectKind[] = [];
    try {
      if (typeof window !== 'undefined') stored = readMysteryJournal(practiceStorage());
    } catch {
      /* Saved run discoveries are still available. */
    }
    return discoveredKinds(provided ?? [...stored, ...(state ? discoveriesFromRun(state) : [])]);
  });
  const [demo, setDemo] = useState<EffectKind | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!demo) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [demo]);
  if (QA_TOOLS_ENABLED && demo)
    return (
      <MysteryLab
        initialKind={demo}
        availableKinds={known}
        onClose={() => setDemo(null)}
        reducedMotion={reducedMotion}
      />
    );
  return (
    <section className="cpi-mystery-journal">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {bg ? 'Открити мистерии' : 'Discovered mysteries'}
        </h1>
        {onClose && (
          <button type="button" onClick={onClose}>
            {bg ? 'Назад към играта' : 'Back to my run'}
          </button>
        )}
      </header>
      <p>
        {bg
          ? 'Тук се записва само това, което вече си намерил по моста.'
          : 'Only mysteries you have found on the bridge are recorded here.'}
      </p>
      {!known.length && (
        <div className="cpi-journal-empty">
          <span aria-hidden="true">◇</span>
          <p>
            {bg ? 'Първата ти находка ще се появи тук.' : 'Your first discovery will appear here.'}
          </p>
        </div>
      )}
      <div className="cpi-journal-grid">
        {known.map((kind) => {
          const copy = effectCopy(locale, kind, DISCOVERY_RULESET_VERSION);
          return (
            <article key={kind} data-tier={mysteryTier(kind)}>
              <header>
                <EffectGlyph kind={kind} />
                <h2>{copy.title}</h2>
              </header>
              <p>{mysteryDiscoverySummary(kind, bg) ?? copy.detail}</p>
              <details>
                <summary>{bg ? 'Подробности' : 'Details'}</summary>
                <p>{copy.detail}</p>
              </details>
              {QA_TOOLS_ENABLED && (
                <button
                  type="button"
                  onClick={() => setDemo(kind)}
                  aria-label={`${bg ? 'Изпробвай' : 'Try'} ${copy.title}`}
                >
                  {bg ? 'Изпробвай' : 'Try it'} ↗
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
