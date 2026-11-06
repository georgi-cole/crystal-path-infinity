import { useLayoutEffect, useRef } from 'react';
import { useLanguage } from './language-context';
import { countResultAt } from './scene-cinematics';

export function AnimatedResult({ value, reduced }: { value: string; reduced: boolean }) {
  const output = useRef<HTMLSpanElement>(null);
  const { number } = useLanguage();
  useLayoutEffect(() => {
    if (reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const node = output.current;
    if (!node) return;
    let frame = 0;
    let start: number | null = null;
    node.textContent = '00';
    function tick(time: number) {
      start ??= time;
      const p = Math.min(1, (time - start) / 1150);
      node!.textContent = number(countResultAt(value, 1 - (1 - p) ** 3)).padStart(2, '0');
      if (p < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, number]);
  return (
    <>
      <span ref={output} aria-hidden="true">
        {number(value).padStart(2, '0')}
      </span>
      <span className="visually-hidden">{number(value)}</span>
    </>
  );
}
