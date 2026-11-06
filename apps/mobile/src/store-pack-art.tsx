import { useId } from 'react';
import type { StoreProduct } from './store-catalog';

/** Small, original catalogue illustrations; quantity and prices remain live text. */
export function StorePackArt({ kind, tier }: { kind: StoreProduct['kind']; tier: number }) {
  const id = useId();
  return (
    <svg className="cpi-pack-art" viewBox="0 0 120 100" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--pack-light)" />
          <stop offset="1" stopColor="var(--pack-accent)" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <ellipse cx="65" cy="84" rx="41" ry="5" fill="var(--pack-accent)" opacity=".12" />
      {kind === 'credit' ? (
        <g transform="rotate(-16 60 50)">
          {Array.from({ length: Math.min(tier + 1, 4) }, (_, i) => (
            <path
              key={i}
              d="M28 25h62v13a8 8 0 0 0 0 16v14H28V54a8 8 0 0 0 0-16Z"
              transform={`translate(${i * -4} ${i * 5})`}
              fill={`url(#${id})`}
              stroke="var(--pack-light)"
              strokeOpacity=".7"
            />
          ))}
          <path
            d="M57 39a13 13 0 1 1-7 18m-1-17 8-2-1 8"
            fill="none"
            stroke="#241a19"
            strokeWidth="3"
          />
          <path d="M77 29v35" stroke="#241a19" strokeDasharray="2 3" opacity=".5" />
        </g>
      ) : kind === 'sp' ? (
        <g stroke="var(--pack-light)" strokeWidth=".8">
          {tier > 1 && <path d="m23 44 14-9 14 9-14 35Z" fill={`url(#${id})`} opacity=".5" />}
          {tier > 3 && <path d="m81 41 12-8 13 8-13 32Z" fill={`url(#${id})`} opacity=".65" />}
          <path d="m39 31 24-16 25 16-25 50Z" fill={`url(#${id})`} />
          <path d="m39 31 24 8 25-8M63 15v24l-9-8 9 50 10-50-10 8" fill="none" opacity=".7" />
          <path
            d="m25 20 2-6 2 6 6 2-6 2-2 6-2-6-6-2Zm69 48 2-5 2 5 5 2-5 2-2 5-2-5-5-2Z"
            fill="var(--pack-light)"
            stroke="none"
          />
        </g>
      ) : (
        <g fill="none" stroke="var(--pack-light)">
          <ellipse cx="62" cy="49" rx="41" ry="19" transform="rotate(-24 62 49)" opacity=".4" />
          <path d="m27 49 35-25 35 25-35 25Z" fill={`url(#${id})`} />
          <circle cx="62" cy="49" r="12" fill="#211a30" />
          <path d="m62 40 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="var(--pack-light)" />
          {tier > 0 && <path d="m83 20 2-5 2 5 5 2-5 2-2 5-2-5-5-2Z" fill="var(--pack-light)" />}
        </g>
      )}
    </svg>
  );
}
