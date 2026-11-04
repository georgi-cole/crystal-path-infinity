import type { EffectKind } from '@crystal-path-infinity/game-core';

/** Original line holograms, shared by the mystery reveal and its destination. */
export function EffectGlyph({ kind }: { kind: EffectKind }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'shield_5s' ? (
        <>
          <path d="M32 7 51 15v16c0 13-19 25-19 25S13 44 13 31V15L32 7Z" />
          <path d="m23 31 6 6 13-14M32 12v8M17 20v12" />
        </>
      ) : kind === 'regen_5s' || kind.startsWith('heal_') ? (
        <>
          <path d="M27 14h10v13h13v10H37v13H27V37H14V27h13V14Z" />
          <path d="M12 16a27 27 0 0 1 41 0M52 48a27 27 0 0 1-41 0" />
        </>
      ) : kind === 'lucky_5s' ? (
        <>
          <path d="m32 6 6 18 19 8-19 7-6 19-7-19-19-7 19-8 7-18Z" />
          <path d="m32 22 3 10-3 10-4-10 4-10ZM50 9v10M45 14h10" />
        </>
      ) : kind === 'fragility_5s' ? (
        <>
          <path d="m32 6 23 26-23 26L9 32 32 6Z" />
          <path d="m33 10-7 14 10 8-13 12 8 10M26 24l-9 2M36 32l10 5" />
        </>
      ) : kind === 'drain_5s' ? (
        <>
          <path d="M19 9v21l13 13 13-13V9M19 40l13 13 13-13M26 10v17M38 10v17" />
        </>
      ) : kind === 'inversion_5s' ? (
        <>
          <path d="M10 18h9c14 0 12 28 27 28h8m-9-9 9 9-9 9M10 46h9c5 0 9-5 12-12M35 23c3-4 6-5 11-5h8m-9-9 9 9-9 9" />
        </>
      ) : kind === 'gain_hint' || kind === 'lose_hint' ? (
        <>
          <path d="M5 32s11-17 27-17 27 17 27 17-11 17-27 17S5 32 5 32Z" />
          <circle cx="32" cy="32" r="8" />
          {kind === 'lose_hint' && <path d="m12 9 40 46" />}
        </>
      ) : (
        <>
          <path d="m35 6-20 28h14l-1 24 21-31H35V6Z" />
          <path d="M10 12v8M6 16h8M50 46v10M45 51h10" />
        </>
      )}
    </svg>
  );
}
