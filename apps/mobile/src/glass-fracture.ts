export interface GlassPoint {
  readonly x: number;
  readonly y: number;
}
export interface GlassShard {
  readonly points: readonly GlassPoint[];
  readonly drift: number;
  readonly turn: number;
  readonly delay: number;
}
const mix = (a: GlassPoint, b: GlassPoint, t: number): GlassPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const noise = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** A closed, irregular impact mesh. All fragments together exactly cover the pane. */
export function fractureGlass(
  pane: readonly GlassPoint[],
  seed: number,
  divisions: 1 | 3 = 3,
): readonly GlassShard[] {
  const perimeter: GlassPoint[] = [];
  for (let edge = 0; edge < 4; edge++) {
    for (let split = 0; split < divisions; split++) {
      const t =
        split === 0 ? 0 : (split + (noise(seed + edge * 11 + split) - 0.5) * 0.45) / divisions;
      perimeter.push(mix(pane[edge], pane[(edge + 1) % 4], t));
    }
  }
  const center = mix(
    mix(pane[0], pane[1], 0.43 + noise(seed) * 0.14),
    mix(pane[3], pane[2], 0.43 + noise(seed) * 0.14),
    0.43 + noise(seed + 1) * 0.15,
  );
  const ring = perimeter.map((point, i) => mix(center, point, 0.24 + noise(seed + i * 3) * 0.2));
  return perimeter.flatMap((point, i) => {
    const next = (i + 1) % perimeter.length;
    return [
      [center, ring[i], ring[next]],
      [ring[i], point, perimeter[next], ring[next]],
    ].map((points, k) => ({
      points,
      drift: (point.x - center.x) * 0.32 + (noise(seed + i * 7 + k) - 0.5) * 45,
      turn: (noise(seed + i * 9 + k) - 0.5) * 150,
      delay: noise(seed + i * 13 + k) * 90,
    }));
  });
}
