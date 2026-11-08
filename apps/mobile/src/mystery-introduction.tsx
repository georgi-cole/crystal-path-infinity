import { DISCOVERY_INTRO_MS, mysteryTier } from '@crystal-path-infinity/game-core';
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
}: {
  discovery?: MysteryDiscovery;
  activeTimeMs: number;
  rulesetVersion: string;
}) {
  const { locale } = useLanguage();
  const intro = discovery?.introduction;
  if (!intro) return null;
  const bg = locale === 'bg';
  const copy = effectCopy(locale, intro.kind, rulesetVersion);
  const remaining = Math.max(0, intro.expiresAt - activeTimeMs);
  return (
    <aside
      className={'cpi-discovery-intro' + (copy.positive ? '' : ' is-dangerous')}
      data-tier={mysteryTier(intro.kind)}
      aria-label={bg ? 'Нова мистерия' : 'New discovery'}
      role="status"
    >
      <EffectGlyph kind={intro.kind} />
      <div>
        <small>{bg ? 'Откри нова мистерия' : 'A new discovery'}</small>
        <h2>{copy.title}</h2>
        <p>{mysteryDiscoverySummary(intro.kind, bg) ?? copy.detail}</p>
        <span>
          {bg ? 'Стъпи, когато си готов' : 'Step when you are ready'}{' '}
          <b>· {Math.ceil(remaining / 1000)}s</b>
        </span>
      </div>
      <i style={{ transform: `scaleX(${remaining / DISCOVERY_INTRO_MS})` }} aria-hidden="true" />
      <span className="visually-hidden">
        {bg
          ? 'Таймерите са спрени. Следващата стъпка активира ефекта; играта продължава автоматично до 4 секунди.'
          : 'Timers are paused. Your next step activates the effect; play resumes automatically within 4 seconds.'}
      </span>
    </aside>
  );
}
