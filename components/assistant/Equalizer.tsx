'use client';

import { useEffect, useRef } from 'react';

/**
 * Live equalizer bars. `getBands(n)` returns n values 0–1 from the real audio
 * (assistant voice or microphone). Animates with requestAnimationFrame, no React re-renders.
 */
export function Equalizer({
  getBands,
  bars = 5,
  color = '#3db8d9',
  idleColor = 'rgba(255,255,255,0.45)',
  className = 'h-5 w-6',
}: {
  getBands: (n: number) => { values: number[]; source: 'ai' | 'mic' | 'idle' };
  bars?: number;
  color?: string;
  idleColor?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const smooth = useRef<number[]>(new Array(bars).fill(0));

  useEffect(() => {
    let raf = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = () => {
      const { values, source } = getBands(bars);
      for (let i = 0; i < bars; i++) {
        const target = values[i] ?? 0;
        // quick attack, slower release — looks like a real meter
        const cur = smooth.current[i];
        smooth.current[i] = target > cur ? cur + (target - cur) * 0.6 : cur + (target - cur) * 0.18;
        const el = refs.current[i];
        if (el) {
          const h = reduced ? (source === 'idle' ? 0.2 : 0.6) : 0.18 + smooth.current[i] * 0.82;
          el.style.transform = `scaleY(${h.toFixed(3)})`;
          el.style.backgroundColor = source === 'ai' ? color : source === 'mic' ? '#ffffff' : idleColor;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getBands, bars, color, idleColor]);

  return (
    <span className={`inline-flex items-center justify-center gap-[3px] ${className}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="block h-full w-[3px] origin-center rounded-full"
          style={{ transform: 'scaleY(0.18)', backgroundColor: idleColor, transition: 'background-color 150ms' }}
        />
      ))}
    </span>
  );
}
