import type { ReactNode } from 'react';

export function DevHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-head text-[26px] font-extrabold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[13.5px] text-white/50">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function DevCard({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/[0.08] bg-[#0d1017] p-5 ${className}`}>
      {title && <h2 className="mb-3 text-[15px] font-bold text-white">{title}</h2>}
      {children}
    </section>
  );
}

export const devBtn = 'inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-2 text-[13px] font-bold text-black hover:bg-amber-300 disabled:opacity-40';
export const devGhost = 'inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3.5 py-2 text-[13px] font-semibold text-white/80 hover:bg-white/[0.06]';
export const devInput = 'w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[13.5px] text-white outline-none placeholder:text-white/30 focus:border-amber-300/60';

export function DevTabs({ items, current }: { items: { key: string; label: string }[]; current: string }) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
      {items.map((t) => (
        <a key={t.key} href={`?tab=${t.key}`} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${current === t.key ? 'bg-amber-400 text-black' : 'text-white/60 hover:text-white'}`}>
          {t.label}
        </a>
      ))}
    </div>
  );
}
