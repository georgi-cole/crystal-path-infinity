import { useId } from 'react';
import type { ThemeId } from './store-catalog';
import { worldAsset } from './world-assets';
import { useWorldMotion } from './world-motion';
import './mystery-cache-art.css';
import { CACHE_ART, mysteryCacheAsset } from './mystery-cache-assets';

/** Material identity is World-specific; no reward, risk or RNG enters this renderer. */
export function RenderedMysteryCache({ theme, open = false }: { theme: ThemeId; open?: boolean }) {
  const clip = useId().replaceAll(':', '');
  const motion = useWorldMotion();
  return (
    <svg
      className={`cpi-world-cache cpi-rendered-cache world-${theme}${open ? ' is-open' : ''}${motion.reduced || motion.suspended ? ' is-still' : ''}`}
      viewBox={`0 0 ${CACHE_ART.width} ${CACHE_ART.height}`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <rect width={CACHE_ART.width} height={CACHE_ART.height} />
        </clipPath>
      </defs>
      <ellipse className="cpi-cache-contact" cx="50" cy="104" rx="29" ry="3" />
      <g clipPath={`url(#${clip})`}>
        <image
          className="cpi-cache-art-closed"
          href={worldAsset(mysteryCacheAsset(theme))}
          width={CACHE_ART.width * 2}
          height={CACHE_ART.height}
        />
        <image
          className="cpi-cache-art-open"
          href={worldAsset(mysteryCacheAsset(theme))}
          x={-CACHE_ART.width}
          width={CACHE_ART.width * 2}
          height={CACHE_ART.height}
        />
      </g>
    </svg>
  );
}
