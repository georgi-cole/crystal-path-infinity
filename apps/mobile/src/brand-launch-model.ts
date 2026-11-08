/** Decorative Kolequant DNA → codons → the actual INFINITY home title. */
export const BRAND_LAUNCH_MS = 3000;
export const BRAND_CODONS = ['ATG', 'CAG', 'GGC', 'TCC', 'AAC', 'GCT'] as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const complementCodon = (value: string) =>
  value.replace(/[ATGC]/g, (base) => ({ A: 'T', T: 'A', G: 'C', C: 'G' })[base]!);

export function brandLaunchFrame(milliseconds: number, wordWidth = 480) {
  const time = Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0);
  const assembly = ease((time - 1050) / 1000);
  return {
    phase: time < 650 ? 'dna' : time < 1600 ? 'codons' : time < 2350 ? 'title' : 'handoff',
    markOpacity: 1 - ease((time - 540) / 500),
    brandOpacity: 1 - ease((time - 700) / 450),
    titleOpacity: ease((time - 1600) / 550),
    travel: ease((time - 2350) / 600),
    exit: ease((time - 2350) / 650),
    codons: Array.from({ length: 24 }, (_, index) => {
      const row = index % 6,
        strand = Math.floor(index / 6) % 2;
      const angle = (index / 24) * Math.PI * 2;
      const spread = ease((time - 620 - row * 22) / 550);
      const x = Math.sin((row / 5) * Math.PI * 2) * 25 * (strand ? -1 : 1);
      const y = -55 + row * 22;
      const orbitX = Math.cos(angle) * 125,
        orbitY = Math.sin(angle) * 70;
      return {
        text: strand ? complementCodon(BRAND_CODONS[row]) : BRAND_CODONS[row],
        x: mix(mix(x, orbitX, spread), ((index % 8) / 7 - 0.5) * wordWidth, assembly),
        y: mix(mix(y, orbitY, spread), (Math.floor(index / 8) - 1) * 13, assembly),
        opacity:
          ease((time - 610 - row * 22) / 220) * (1 - ease((time - 1800 - (index % 8) * 28) / 360)),
      };
    }),
  };
}
