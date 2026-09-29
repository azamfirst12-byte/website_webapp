'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '../site/Icon';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

export function AdminNav({ items, brand, user, children, accent = 'admin' }: { items: NavItem[]; brand: string; user: { name: string; role: string }; children?: React.ReactNode; accent?: 'admin' | 'developer' }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const isActive = (href: string) => (href === '/admin' || href === '/developer' ? path === href : path.startsWith(href));
  const mark = accent === 'developer' ? 'from-amber-400 to-emerald-500 text-black' : 'from-[#7c5cff] to-[#22d3ee] text-white';
  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label={accent === 'developer' ? 'Developer' : 'Admin'}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition ${isActive(i.href) ? 'bg-white/[0.08] text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white'}`}
        >
          <Icon name={i.icon} className="h-[18px] w-[18px]" />
          <span className="flex-1">{i.label}</span>
          {!!i.badge && <span className="rounded-full bg-red-500 px-1.5 text-[10.5px] font-bold text-white">{i.badge > 99 ? '99+' : i.badge}</span>}
        </Link>
      ))}
    </nav>
  );
  const head = (
    <div className="flex items-center gap-2.5 px-2">
      <span className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${mark}`}>
        <Icon name={accent === 'developer' ? 'code' : 'chart'} className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-head text-[14px] font-extrabold text-white">{brand}</span>
        <span className="block text-[11px] text-white/45">{accent === 'developer' ? 'Developer Control Center' : 'Business Admin'}</span>
      </span>
    </div>
  );
  const foot = (
    <div className="mt-auto border-t border-white/[0.07] pt-3">
      <div className="px-3 pb-2">
        <p className="truncate text-[13px] font-semibold text-white">{user.name}</p>
        <p className="text-[11px] text-white/45">{user.role}</p>
      </div>
      {children}
    </div>
  );
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col gap-5 border-r border-white/[0.07] bg-[#080b15] px-3 py-5 lg:flex">
        {head}
        {nav}
        {foot}
      </aside>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.07] bg-[#080b15]/95 px-4 py-3 backdrop-blur lg:hidden">
        {head}
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10">
          <Icon name={open ? 'x' : 'menu'} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col gap-5 overflow-y-auto border-r border-white/10 bg-[#080b15] px-3 py-5">
            {head}
            {nav}
            {foot}
          </aside>
        </div>
      )}
    </>
  );
}
