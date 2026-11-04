import { useEffect, useRef } from 'react';

const LIGHTS = ['#fa589c', '#62dfed', '#79e3af'];
type Point = { x: number; y: number };

/** Decorative, bounded canvas flight; no route data, game time or React frame updates. */
export function BridgeFlight({ reduced }: { reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const surface = canvas.current;
    const ctx = surface?.getContext('2d');
    if (!surface || !ctx) return;
    let frame = 0;
    let elapsed = 0;
    let last = 0;
    let lastDraw = 0;
    let width = 900,
      height = 700,
      ratio = 1;
    function draw(time: number) {
      ctx!.setTransform((ratio * width) / 900, 0, 0, (ratio * height) / 700, 0, 0);
      ctx!.clearRect(0, 0, 900, 700);
      ctx!.save();
      ctx!.translate(450, 500);
      ctx!.rotate(Math.sin(time * 0.16) * 0.025);
      ctx!.translate(-450, -500);
      const phase = (time * 0.58) % 1.15;
      const advance = Math.floor((time * 0.58) / 1.15);
      const project = (x: number, z: number): Point => {
        const scale = 1 / (1 + z * 0.65);
        const bend =
          (Math.sin(time * 0.13 + z * 0.12) - Math.sin(time * 0.13)) *
          125 *
          (1 - Math.exp(-Math.max(0, z) * 0.3));
        return {
          x: 450 + x * scale + bend + Math.sin(time * 0.21) * 24,
          y: 72 + Math.sin(time * 0.19) * 8 + 628 * scale,
        };
      };
      function polygon(points: Point[], fill: string | CanvasGradient, stroke?: string) {
        ctx!.beginPath();
        points.forEach((p, i) => (i ? ctx!.lineTo(p.x, p.y) : ctx!.moveTo(p.x, p.y)));
        ctx!.closePath();
        ctx!.fillStyle = fill;
        ctx!.fill();
        if (stroke) {
          ctx!.strokeStyle = stroke;
          ctx!.lineWidth = 0.9;
          ctx!.stroke();
        }
      }
      for (const side of [-1, 1]) {
        ctx!.beginPath();
        for (let i = 70; i >= 0; i--) {
          const p = project(side * 458, -0.65 + i * 0.29);
          if (i === 70) ctx!.moveTo(p.x, p.y);
          else ctx!.lineTo(p.x, p.y);
        }
        ctx!.strokeStyle = '#aaa6b62e';
        ctx!.lineWidth = 3;
        ctx!.stroke();
      }
      for (let i = 18; i >= 0; i--) {
        const z = 0.45 + i * 1.15 - phase;
        const color = LIGHTS[(advance + i) % 3];
        ctx!.globalAlpha = Math.max(0.15, 1 - i * 0.045);
        for (const side of [-1, 1]) {
          const left = side < 0 ? -430 : 24,
            right = side < 0 ? -24 : 430;
          const pts = [
            project(left, z + 0.85),
            project(right, z + 0.85),
            project(right, z),
            project(left, z),
          ];
          const gradient = ctx!.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
          gradient.addColorStop(0, '#dce6ef29');
          gradient.addColorStop(0.45, '#64707a22');
          gradient.addColorStop(1, '#111117bd');
          polygon(
            [pts[3], pts[2], { ...pts[2], y: pts[2].y + 4 }, { ...pts[3], y: pts[3].y + 4 }],
            color + '45',
          );
          polygon(pts, gradient, '#dbe1ef66');
          polygon(pts, color + '0b', color + '51');
          const mix = (a: Point, b: Point, p: number) => ({
            x: a.x + (b.x - a.x) * p,
            y: a.y + (b.y - a.y) * p,
          });
          polygon(
            [
              mix(pts[0], pts[1], 0.18),
              mix(pts[0], pts[1], 0.23),
              mix(pts[3], pts[2], 0.67),
              mix(pts[3], pts[2], 0.59),
            ],
            '#f2f6ff13',
          );
        }
        for (const side of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            const depth = z + k * 0.37,
              p = project(side * 472, depth);
            const scale = 1 / (1 + depth * 0.65),
              lamp = LIGHTS[(i + advance + k) % 3];
            ctx!.globalAlpha *= 0.88 + Math.sin(time * 1.8 + i * 1.7 + k) * 0.1;
            for (const [radius, alpha] of [
              [11, '12'],
              [5, '35'],
              [2.5, 'ed'],
            ] as const) {
              ctx!.beginPath();
              ctx!.ellipse(
                p.x,
                p.y - 3 * scale,
                radius * scale,
                radius * scale * 1.4,
                0,
                0,
                Math.PI * 2,
              );
              ctx!.fillStyle = lamp + alpha;
              ctx!.fill();
            }
          }
        }
      }
      ctx!.restore();
      ctx!.globalAlpha = 1;
    }
    function resize() {
      const bounds = surface!.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      ratio = Math.min(2, window.devicePixelRatio || 1);
      surface!.width = Math.round(width * ratio);
      surface!.height = Math.round(height * ratio);
      draw(elapsed);
    }
    function tick(now: number) {
      if (last) elapsed += Math.min(0.05, (now - last) / 1000);
      last = now;
      if (now - lastDraw >= 32) {
        draw(elapsed);
        lastDraw = now;
      }
      frame = requestAnimationFrame(tick);
    }
    function visibility() {
      cancelAnimationFrame(frame);
      last = 0;
      if (!reduced && !document.hidden) frame = requestAnimationFrame(tick);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    resize();
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [reduced]);
  return <canvas ref={canvas} className="cpi-bridge-flight" aria-hidden="true" />;
}
