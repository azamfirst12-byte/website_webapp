'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../site/Icon';
import { ago } from '@/lib/format';

interface N {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: number | null;
  created_at: number;
}

/** Bell with unread count; polls every 30 s while the tab is visible. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/notifications', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.items);
      setUnread(d.unread);
    } catch {}
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);

  const markAll = async () => {
    await fetch('/api/admin/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
    void load();
  };

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/80 hover:text-white">
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10.5px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#0c1122] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
            <p className="text-[13px] font-bold text-white">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-[12px] font-semibold text-brand2 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-white/45">You're all caught up.</li>}
            {items.map((n) => (
              <li key={n.id} className={`border-b border-white/[0.05] ${n.read_at ? '' : 'bg-brand/[0.06]'}`}>
                <Link
                  href={n.link || '/admin/notifications'}
                  onClick={() => {
                    setOpen(false);
                    if (!n.read_at) void fetch('/api/admin/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [n.id] }) }).then(load);
                  }}
                  className="block px-4 py-3 hover:bg-white/[0.04]"
                >
                  <p className="text-[13px] font-semibold text-white">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[12px] text-white/55">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-white/35">{ago(n.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/admin/notifications" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-center text-[12.5px] font-semibold text-white/70 hover:bg-white/[0.04]">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
