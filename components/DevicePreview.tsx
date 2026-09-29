'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Mode = 'desktop' | 'tablet' | 'mobile';

const DEVICES: Record<Exclude<Mode, 'desktop'>, { w: number; h: number; label: string; radius: number }> = {
  tablet: { w: 820, h: 1180, label: 'Tablet · 820 × 1180', radius: 28 },
  mobile: { w: 390, h: 844, label: 'Mobile · 390 × 844', radius: 44 },
};

const KEY = 'ww_view_mode';

/**
 * Desktop / Tablet / Mobile view switcher.
 * Tablet and Mobile show the current page inside a device-sized frame (a real iframe,
 * so layouts, breakpoints and the voice assistant behave exactly as on that device).
 * Hidden inside the frame itself, and disabled with NEXT_PUBLIC_DEVICE_PREVIEW=off.
 */
export function DevicePreview() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('desktop');
  const [src, setSrc] = useState('/');
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEVICE_PREVIEW === 'off' || window.self !== window.top) return;
    setReady(true);
    try {
      const saved = localStorage.getItem(KEY) as Mode | null;
      if (saved && saved !== 'desktop') {
        setSrc(location.pathname + location.search);
        setMode(saved);
      }
    } catch {}
  }, []);

  // Fit the device frame inside the window.
  useEffect(() => {
    if (mode === 'desktop') return;
    const d = DEVICES[mode];
    const fit = () => setScale(Math.min(1, (window.innerHeight - 110) / d.h, (window.innerWidth - 32) / d.w));
    fit();
    window.addEventListener('resize', fit);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('resize', fit);
      document.body.style.overflow = '';
    };
  }, [mode]);

  const choose = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      // Carry the page the user is looking at into / out of the frame.
      let path = location.pathname + location.search;
      try {
        const inner = frame.current?.contentWindow?.location;
        if (inner && mode !== 'desktop') path = inner.pathname + inner.search;
      } catch {}
      try {
        localStorage.setItem(KEY, m);
      } catch {}
      if (m === 'desktop') {
        setMode('desktop');
        if (path !== location.pathname + location.search) location.assign(path);
        return;
      }
      setSrc(path);
      setMode(m);
    },
    [mode],
  );

  if (!ready) return null;

  const toolbar = (
    <div role="group" aria-label="View as" data-ai-skip className="flex items-center gap-1 rounded-full border border-white/15 bg-[#0c1020]/90 p-1 shadow-lg backdrop-blur">
      {(['desktop', 'tablet', 'mobile'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => choose(m)}
          aria-pressed={mode === m}
          title={m[0].toUpperCase() + m.slice(1)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
            mode === m ? 'bg-brand2 text-black' : 'text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          <DeviceIcon mode={m} />
          <span className="hidden sm:inline">{m === 'desktop' ? 'Desktop' : m === 'tablet' ? 'Tablet' : 'Mobile'}</span>
        </button>
      ))}
    </div>
  );

  if (mode === 'desktop') {
    // Small switcher in the bottom-left corner; only on screens wide enough to preview smaller devices.
    return <div className="fixed bottom-5 left-4 z-[55] hidden lg:block">{toolbar}</div>;
  }

  const d = DEVICES[mode];
  return (
    <div data-ai-skip className="fixed inset-0 z-[200] flex flex-col items-center bg-[#0b0f16]" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #13233a 0, transparent 60%)' }}>
      <div className="flex w-full items-center justify-center gap-4 px-4 py-3">
        {toolbar}
        <span className="hidden text-[11px] text-white/50 md:inline">{d.label}</span>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-hidden">
        <div style={{ width: d.w * scale, height: d.h * scale }}>
          <div
            className="origin-top-left overflow-hidden border-[10px] border-[#1c2433] bg-black shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
            style={{ width: d.w + 20, height: d.h + 20, borderRadius: d.radius, transform: `scale(${scale})` }}
          >
            <iframe
              key={mode}
              ref={frame}
              src={src}
              title={`${mode} preview`}
              allow="microphone; autoplay; clipboard-write"
              className="block h-full w-full border-0 bg-black"
              style={{ borderRadius: d.radius - 10 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceIcon({ mode }: { mode: Mode }) {
  const common = { viewBox: '0 0 24 24', className: 'h-4 w-4', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const;
  if (mode === 'desktop')
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    );
  if (mode === 'tablet')
    return (
      <svg {...common}>
        <rect x="5" y="2.5" width="14" height="19" rx="2" />
        <path d="M11 18.5h2" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </svg>
  );
}
