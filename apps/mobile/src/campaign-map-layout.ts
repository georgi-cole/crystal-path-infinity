export const ATLAS_SIZE = { width: 1180, height: 1680 };
export const ATLAS_ZOOM = { min: 0.7, max: 1.3, initial: 0.9 };
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
] as const;

export interface MapCamera {
  x: number;
  y: number;
  zoom: number;
}
export function boundMapCamera(camera: MapCamera, width: number, height: number): MapCamera {
  const zoom = Math.max(ATLAS_ZOOM.min, Math.min(ATLAS_ZOOM.max, camera.zoom));
  const bound = (position: number, viewport: number, world: number) =>
    world * zoom <= viewport
      ? (viewport - world * zoom) / 2
      : Math.max(viewport - world * zoom, Math.min(0, position));
  return {
    x: bound(camera.x, width, ATLAS_SIZE.width),
    y: bound(camera.y, height, ATLAS_SIZE.height),
    zoom,
  };
}
export function zoomMapAt(camera: MapCamera, zoom: number, x: number, y: number): MapCamera {
  const next = Math.max(ATLAS_ZOOM.min, Math.min(ATLAS_ZOOM.max, zoom));
  const ratio = next / camera.zoom;
  return { x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio, zoom: next };
}
export function crossingPath(index: number): string {
  const [x, y] = CROSSING_LOCATIONS[index];
  const [nextX, nextY] = CROSSING_LOCATIONS[index + 1];
  const middle = (y + nextY) / 2;
  return `M${x} ${y} C${x} ${middle} ${nextX} ${middle} ${nextX} ${nextY}`;
}
