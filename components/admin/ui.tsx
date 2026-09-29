import Link from 'next/link';
import type { ReactNode } from 'react';
import { labelize } from '@/lib/format';
import type { Stage } from '@/lib/workspace-types';

// Shared building blocks for the admin + developer dashboards (server-safe).

export const inputCls = 'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13.5px] text-white outline-none placeholder:text-white/30 focus:border-brand2/60';
export const btnCls = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-black transition hover:bg-white/90 disabled:opacity-50';
export const btnGhost = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-3.5 py-2 text-[13px] font-semibold text-white/85 transition hover:bg-white/[0.08]';
export const btnDanger = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-500/85 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-red-500';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-head text-[26px] font-extrabold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-white/55">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, subtitle, children, className = '', actions }: { title?: string; subtitle?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-white/[0.08] bg-[#0b1020] p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[14px] font-bold text-white">{title}</h2>}
            {subtitle && <p className="text-[11.5px] text-white/45">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const toneCls = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-red-300' : 'text-white';
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b1020] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</p>
      <p className={`mt-1.5 font-head text-[26px] font-extrabold tabular-nums leading-none ${toneCls}`}>{value}</p>
      {hint && <p className="mt-1.5 text-[11.5px] text-white/45">{hint}</p>}
    </div>
  );
}

export function StageBadge({ stage, stages }: { stage: string; stages: Stage[] }) {
  const s = stages.find((x) => x.key === stage);
  const color = s?.color ?? '#64748b';
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-semibold" style={{ borderColor: `${color}66`, background: `${color}22`, color: '#fff' }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {s?.label ?? labelize(stage)}
    </span>
  );
}

export function ScoreBadge({ score, qualified, hot }: { score: number; qualified: number; hot: number }) {
  const cls = score >= hot ? 'bg-red-500/20 text-red-200 ring-red-400/40' : score >= qualified ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' : score >= qualified / 2 ? 'bg-amber-400/15 text-amber-100 ring-amber-300/30' : 'bg-white/5 text-white/60 ring-white/10';
  const label = score >= hot ? 'Hot' : score >= qualified ? 'Qualified' : score >= qualified / 2 ? 'Warm' : 'Cold';
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums ring-1 ring-inset ${cls}`} title={label}>
      {score}
      <span className="font-medium opacity-75">{label}</span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-[13px] text-white/45">{children}</p>;
}

export function DemoTag({ show }: { show?: boolean }) {
  if (!show) return null;
  return <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Demo</span>;
}

/** Query-string link helper for filters and pagination. */
export function qs(base: string, params: Record<string, string | number | undefined | null>, patch: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

export function Pager({ base, params, page, total, pageSize }: { base: string; params: Record<string, string | undefined>; page: number; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between text-[12.5px] text-white/55" aria-label="Pagination">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link className={btnGhost} href={qs(base, params, { page: page - 1 })}>
            ← Previous
          </Link>
        )}
        {page < pages && (
          <Link className={btnGhost} href={qs(base, params, { page: page + 1 })}>
            Next →
          </Link>
        )}
      </span>
    </nav>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string; count?: number }[]; current: string }) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${current === t.key ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}>
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 opacity-60">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
