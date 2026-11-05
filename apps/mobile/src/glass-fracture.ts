export interface GlassPoint {
  readonly x: number;
  readonly y: number;
}
export interface GlassShard {
  readonly points: readonly GlassPoint[];
  readonly drift: number;
  readonly turn: number;
  readonly delay: number;
  readonly retained: boolean;
  readonly glint: number;
  readonly fall: number;
}
const mix = (a: GlassPoint, b: GlassPoint, t: number): GlassPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function glassSeed(identity: string): number {
  let hash = 2166136261;
  for (const c of identity) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
function clip(points: readonly GlassPoint[], a: number, b: number, c: number): GlassPoint[] {
  const result: GlassPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length];
    const d = a * p.x + b * p.y - c,
      e = a * q.x + b * q.y - c;
    if (d <= 1e-10) result.push(p);
    if (d <= 1e-10 !== e <= 1e-10) result.push(mix(p, q, d / (d - e)));
  }
  return result;
}
const area = (points: readonly GlassPoint[]) =>
  Math.abs(
    points.reduce((s, p, i) => {
      const q = points[(i + 1) % points.length];
      return s + p.x * q.y - q.x * p.y;
    }, 0),
  ) / 2;

/** Seeded impact-biased Voronoi cells with uneven radial/concentric distributions.
 * Boundary cells split into tiny anchored chips. Falling + anchored pieces tile
 * the original pane exactly. No gameplay RNG or per-frame random calls. */
export function glassPattern(seed: number, detail: 1 | 3 = 3): readonly GlassShard[] {
  let cursor = seed >>> 0;
  const random = () => {
    cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0;
    return cursor / 4294967296;
  };
  const impact = { x: 0.27 + random() * 0.46, y: 0.28 + random() * 0.43 };
  const sites: GlassPoint[] = [impact];
  const rotation = random() * Math.PI * 2;
  const rings = detail === 1 ? 1 : 2;
  for (let ring = 0; ring < rings; ring++) {
    const count = detail === 1 ? 5 : 5 + ring * 3 + Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
      const angle = rotation + ((i + (random() - 0.5) * 0.6) * Math.PI * 2) / count;
      const radius =
        detail === 1 ? 0.5 : ring === 0 ? 0.13 + random() * 0.18 : 0.4 + random() * 0.3;
      const point = {
        x: Math.max(0.008, Math.min(0.992, impact.x + Math.cos(angle) * radius)),
        y: Math.max(
          0.008,
          Math.min(0.992, impact.y + Math.sin(angle) * radius * (0.7 + random() * 0.65)),
        ),
      };
      if (sites.every((s) => Math.hypot(s.x - point.x, s.y - point.y) > 0.004)) sites.push(point);
    }
  }
  const unit = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const retainEdges = random() > 0.1;
  const margin = 0.022 + random() * 0.035;
  const shards: GlassShard[] = [];
  function add(points: GlassPoint[], retained: boolean) {
    if (points.length < 3 || area(points) < 1e-12) return;
    const center = points.reduce(
      (s, p) => ({ x: s.x + p.x / points.length, y: s.y + p.y / points.length }),
      { x: 0, y: 0 },
    );
    shards.push({
      points,
      retained,
      drift: (center.x - impact.x) * 140 + (random() - 0.5) * 45,
      turn: (random() - 0.5) * 270,
      delay: random() * 95,
      glint: random(),
      fall: 0.75 + random() * 0.5,
    });
  }
  for (const site of sites) {
    let cell = unit;
    for (const other of sites) {
      if (other === site) continue;
      cell = clip(
        cell,
        other.x - site.x,
        other.y - site.y,
        (other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y) / 2,
      );
      if (cell.length === 0) break;
    }
    if (detail === 1) {
      add(cell, false);
      continue;
    }
    for (const [a, b, c] of [
      [-1, 0, -margin],
      [1, 0, 1 - margin],
      [0, -1, -margin],
      [0, 1, 1 - margin],
    ]) {
      const edge = clip(cell, -a, -b, -c);
      add(edge, retainEdges && random() > 0.17);
      cell = clip(cell, a, b, c);
    }
    add(cell, false);
  }
  return shards;
}

export function projectGlassPattern(
  pattern: readonly GlassShard[],
  pane: readonly GlassPoint[],
): readonly GlassShard[] {
  return pattern.map((shard) => ({
    ...shard,
    points: shard.points.map((p) =>
      mix(mix(pane[0], pane[1], p.x), mix(pane[3], pane[2], p.x), p.y),
    ),
  }));
}
export function fractureGlass(
  pane: readonly GlassPoint[],
  seed: number,
  detail: 1 | 3 = 3,
): readonly GlassShard[] {
  return projectGlassPattern(glassPattern(seed, detail), pane);
}
