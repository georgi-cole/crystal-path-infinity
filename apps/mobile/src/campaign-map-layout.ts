export const ATLAS_SIZE = { width: 1180, height: 1680 };
export const ATLAS_SCALE = 0.9;
// Authored world coordinates, shared by the landmarks and their connecting paths.
// The route doubles back around the islands instead of spacing missions on a rail.
export const CROSSING_LOCATIONS = [
  [180, 1500],
  [295, 1435],
  [440, 1470],
  [555, 1380],
  [695, 1320],
  [850, 1350],
  [975, 1250],
  [870, 1150],
  [730, 1100],
  [575, 1165],
  [435, 1070],
  [300, 1000],
  [165, 900],
  [290, 815],
  [450, 860],
  [590, 775],
  [745, 715],
  [915, 770],
  [1010, 645],
  [870, 535],
  [700, 505],
  [555, 575],
  [405, 505],
  [270, 425],
  [365, 315],
  [515, 275],
  [665, 330],
  [820, 260],
  [955, 165],
  [790, 100],
  [635, 156],
  [473, 113],
  [306, 178],
] as const;

/** Only used on selection/resize, never while the native viewport scrolls. */
export function crossingScrollTarget(index: number, width: number, height: number) {
  const [x, y] = CROSSING_LOCATIONS[index];
  const bound = (position: number, viewport: number, size: number) =>
    Math.max(0, Math.min(size * ATLAS_SCALE - viewport, position * ATLAS_SCALE - viewport / 2));
  return { left: bound(x, width, ATLAS_SIZE.width), top: bound(y, height, ATLAS_SIZE.height) };
}
export function crossingPath(index: number): string {
  const [x, y] = CROSSING_LOCATIONS[index];
  const [nextX, nextY] = CROSSING_LOCATIONS[index + 1];
  const middle = (y + nextY) / 2;
  return `M${x} ${y} C${x} ${middle} ${nextX} ${middle} ${nextX} ${nextY}`;
}
