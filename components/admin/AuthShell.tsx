import type { ReactNode } from 'react';

/** Signed-out screens for /admin (violet) and /developer (amber) — deliberately different so nobody confuses them. */
export function AuthShell({ title, subtitle, children, variant = 'admin' }: { title: string; subtitle?: string; children: ReactNode; variant?: 'admin' | 'developer' }) {
  const bg =
    variant === 'developer'
      ? 'radial-gradient(900px 500px at 10% -10%, rgba(245,158,11,0.35), transparent 60%), radial-gradient(800px 600px at 110% 110%, rgba(16,185,129,0.25), transparent 55%), #07090f'
      : 'radial-gradient(1000px 600px at 10% -10%, rgba(124,92,255,0.45), transparent 60%), radial-gradient(900px 600px at 110% 110%, rgba(34,211,238,0.3), transparent 55%), #070912';
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10 text-white" style={{ background: bg }}>
      <div className="w-full max-w-[430px] rounded-3xl border border-white/12 bg-white/[0.05] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
        <div className="flex items-center gap-3.5">
          <div
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-lg ${variant === 'developer' ? 'bg-gradient-to-br from-amber-400 to-emerald-500' : 'bg-gradient-to-br from-[#7c5cff] to-[#22d3ee]'}`}
            aria-hidden
          >
            {variant === 'developer' ? (
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-black" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-head text-[22px] font-extrabold leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="text-[13px] text-white/60">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

export const authCls = {
  label: 'block text-[13px] font-medium text-white/80',
  input:
    'mt-1.5 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/40 focus:ring-2 focus:ring-white/15',
  primary: 'w-full rounded-xl bg-white py-2.5 text-[15px] font-semibold text-black transition hover:bg-white/90 disabled:opacity-50',
};
