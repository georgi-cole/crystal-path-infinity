import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BRAND_LAUNCH_MS, brandLaunchFrame } from './brand-launch-model';
import { BrandLaunchActive } from './brand-launch-state';
import { practiceStorage } from './app-profile';
import { readPracticeSettings } from './practice-save';
import './brand-launch.css';

export function BrandLaunch({ onComplete }: { onComplete: () => void }) {
  const screen = useRef<HTMLElement>(null);
  const titleLayer = useRef<HTMLDivElement>(null);
  const fallback = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = screen.current,
      layer = titleLayer.current,
      placeholder = fallback.current;
    if (!element || !layer || !placeholder) {
      onComplete();
      return;
    }
    let active = true,
      frame = 0,
      title: HTMLElement | null = null,
      clone: HTMLElement | null = null;
    let previousVisibility = '',
      width = 0,
      height = 0;
    let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      reduced ||= readPracticeSettings(practiceStorage()).settings.reducedMotion;
    } catch {
      /* A brand intro never requires storage. */
    }
    element.dataset.reduced = String(reduced);
    const started = performance.now();
    const restore = () => {
      if (title) title.style.visibility = previousVisibility;
      clone?.remove();
      clone = null;
    };
    const finish = () => {
      if (!active) return;
      active = false;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      restore();
      onComplete();
    };
    const timer = window.setTimeout(finish, BRAND_LAUNCH_MS);
    const findTitle = () => {
      if (title?.isConnected) return;
      restore();
      title = document.querySelector<HTMLElement>('#menu-title');
      if (!title) return;
      const rect = title.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        title = null;
        return;
      }
      const computed = window.getComputedStyle(title);
      clone = title.cloneNode(true) as HTMLElement;
      clone.removeAttribute('id');
      clone.removeAttribute('data-menu-heading');
      clone.removeAttribute('tabindex');
      clone.setAttribute('aria-hidden', 'true');
      Object.assign(clone.style, {
        font: computed.font,
        letterSpacing: computed.letterSpacing,
        textTransform: computed.textTransform,
        color: computed.color,
        background: computed.background,
        backgroundClip: 'text',
        WebkitTextFillColor: computed.webkitTextFillColor,
        filter: computed.filter,
        padding: computed.padding,
        boxSizing: computed.boxSizing,
        whiteSpace: 'nowrap',
        margin: '0',
        maxWidth: 'none',
        width: rect.width + 'px',
        height: rect.height + 'px',
        visibility: 'visible',
      });
      width = rect.width;
      height = rect.height;
      previousVisibility = title.style.visibility;
      title.style.visibility = 'hidden';
      placeholder.hidden = true;
      layer.append(clone);
    };
    const paint = (now: number) => {
      if (!active) return;
      try {
        findTitle();
        if (title && clone) {
          const rect = title.getBoundingClientRect();
          width = rect.width;
          height = rect.height;
          clone.style.width = width + 'px';
          clone.style.height = height + 'px';
        }
        const elapsed = Math.min(BRAND_LAUNCH_MS, now - started);
        const actualWidth = width || placeholder.offsetWidth || 340;
        const actualHeight = height || placeholder.offsetHeight || 76;
        const scale = Math.min(1, Math.min(640, window.innerWidth - 40) / actualWidth);
        const sceneWidth = Math.min(600, window.innerWidth - 40);
        const state = brandLaunchFrame(elapsed, ((actualWidth * scale) / sceneWidth) * 600);
        element.dataset.phase = state.phase;
        element.style.setProperty('--launch-mark', String(reduced ? 1 : state.markOpacity));
        element.style.setProperty('--launch-brand', String(reduced ? 1 : state.brandOpacity));
        element.style.setProperty('--launch-exit', String(reduced ? 0 : state.exit));
        layer.style.opacity = String(reduced ? 0 : state.titleOpacity);
        const destination = title?.getBoundingClientRect();
        const travel = destination ? state.travel : 0;
        const centerX = (window.innerWidth - actualWidth * scale) / 2;
        const centerY = window.innerHeight * 0.44 - (actualHeight * scale) / 2;
        const x = centerX + ((destination?.left ?? centerX) - centerX) * travel;
        const y = centerY + ((destination?.top ?? centerY) - centerY) * travel;
        layer.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale + (1 - scale) * travel})`;
        element.querySelectorAll<SVGTextElement>('[data-brand-codon]').forEach((node, index) => {
          const codon = state.codons[index];
          node.setAttribute('transform', `translate(${codon.x.toFixed(2)} ${codon.y.toFixed(2)})`);
          node.setAttribute('opacity', String(reduced ? 0 : codon.opacity));
        });
        if (elapsed >= BRAND_LAUNCH_MS) finish();
        else frame = window.requestAnimationFrame(paint);
      } catch {
        finish();
      }
    };
    const visibility = () => {
      if (document.hidden) finish();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', finish);
    frame = window.requestAnimationFrame(paint);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      restore();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', finish);
    };
  }, [onComplete]);
  return (
    <section
      ref={screen}
      className="cpi-brand-launch"
      role="status"
      aria-label="Kolequant · Crystal Path Infinity"
    >
      <div className="cpi-brand-backdrop" aria-hidden="true" />
      <div className="cpi-brand-dna" aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}brand/kolequant-dna.webp`}
          width="64"
          height="128"
          alt=""
        />
        <span>KOLEQUANT</span>
      </div>
      <svg className="cpi-brand-code" viewBox="-300 -170 600 340" aria-hidden="true">
        {brandLaunchFrame(0).codons.map((codon, index) => (
          <text
            key={index}
            data-brand-codon
            textAnchor="middle"
            dominantBaseline="middle"
            opacity="0"
          >
            {codon.text}
          </text>
        ))}
      </svg>
      <div ref={titleLayer} className="cpi-brand-title" aria-hidden="true">
        <div ref={fallback} className="cpi-brand-title-fallback">
          INFINITY
        </div>
      </div>
    </section>
  );
}

/** Mounted once per cold page start; navigation, resume and theme changes do not replay it. */
export function BrandLaunchGate({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(true);
  const finish = useCallback(() => setActive(false), []);
  return (
    <BrandLaunchActive.Provider value={active}>
      <div className="cpi-launch-app" inert={active} aria-hidden={active || undefined}>
        {children}
      </div>
      {active && <BrandLaunch onComplete={finish} />}
    </BrandLaunchActive.Provider>
  );
}
