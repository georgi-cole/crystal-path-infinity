import type { TileSide } from '@crystal-path-infinity/game-core';

const WIDTH = 900;
const HEIGHT = 700;
const HORIZON = 72;

/** One projective camera for tile faces, thickness, rails and HTML hit regions. */
export function projectBridgePoint(x: number, z: number, elevation = 0) {
  const scale = 1 / (1 + z * 0.65);
  return { x: WIDTH / 2 + x * scale, y: HORIZON + (HEIGHT - HORIZON - elevation) * scale };
}

export function bridgePane(distance: number, side: TileSide) {
  const near = 0.45 + distance * 1.15;
  const far = near + 0.85;
  const [left, right] = side === 'left' ? [-430, -24] : [24, 430];
  return [
    projectBridgePoint(left, far),
    projectBridgePoint(right, far),
    projectBridgePoint(right, near),
    projectBridgePoint(left, near),
  ];
}

/** Exact adjacency: saved runs and large-index jumps never animate a fake step. */
export function advancesOneRow(previous: string, current: string): boolean {
  return BigInt(current) === BigInt(previous) + 1n;
}
