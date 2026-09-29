'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { pagePath, useSite } from './SiteProvider';

export function Logo({ className = '' }: { className?: string }) {
  const { ws } = useSite();
  const b = ws.brand;
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`} aria-label={`${b.name} home`}>
      {b.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logoUrl} alt={b.name} className="h-8 w-auto" />
      ) : (
        <>
          <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand to-brand2 shadow-[0_6px_24px_-6px_rgb(var(--brand)/0.8)]">
            <span className="absolute inset-[3px] rounded-[9px] bg-bg/40" />
            <Icon name="wave" className="relative h-5 w-5 text-white" strokeWidth={2.4} />
          </span>
          <span className="font-head text-[19px] font-extrabold tracking-tight text-white">
            {b.logoText || b.name}
            {b.logoText && b.logoText !== b.name && <span className="text-gradient"> {b.name.replace(b.logoText, '').trim()}</span>}
          </span>
        </>
      )}
    </Link>
  );
}

export function Header() {
  const { ws, menu, setMenu, openModal, setAssistantOpen } = useSite();
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);
  const nav = ws.pages.filter((p) => p.enabled && p.inNav);
  const f = ws.features;

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setMenu(null), [path, setMenu]);
  // Click outside closes the services dropdown.
  useEffect(() => {
    if (menu !== 'services') return;
    const on = (e: MouseEvent) => {
      if (!servicesRef.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [menu, setMenu]);

  return (
    <>
      {f.announcementBar && ws.announcement.text && (
        <div className="relative z-40 border-b border-white/5 bg-gradient-to-r from-brand/25 via-brand2/15 to-accent/20 text-center text-[13px] text-white/90">
          <div className="container-x flex items-center justify-center gap-3 py-2">
            <span className="hidden h-1.5 w-1.5 animate-glow rounded-full bg-brand2 sm:inline-block" aria-hidden />
            <span className="truncate">{ws.announcement.text}</span>
            {ws.announcement.ctaLabel && (
              <a
                href={ws.announcement.href || '#'}
                data-cta="announcement"
                onClick={(e) => {
                  if (ws.announcement.href === '#assistant' || !ws.announcement.href) {
                    e.preventDefault();
                    setAssistantOpen(true);
                  }
                }}
                className="shrink-0 font-semibold text-white underline decoration-brand2/60 underline-offset-4 hover:decoration-brand2"
              >
                {ws.announcement.ctaLabel} →
              </a>
            )}
          </div>
        </div>
      )}
      <header
        className={`sticky top-0 z-40 transition-colors duration-300 ${scrolled ? 'border-b border-white/[0.07] bg-bg/80 backdrop-blur-xl' : 'border-b border-transparent bg-transparent'}`}
      >
        <div className="container-x flex h-16 items-center gap-6">
          <Logo />
          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
            {nav.map((p) =>
              p.key === 'services' ? (
                <div key={p.key} className="relative" ref={servicesRef}>
                  <button
                    type="button"
                    data-menu="services"
                    aria-expanded={menu === 'services'}
                    aria-haspopup="true"
                    onClick={() => setMenu(menu === 'services' ? null : 'services')}
                    className={`flex items-center gap-1 rounded-full px-3.5 py-2 text-[14px] font-medium transition hover:bg-white/[0.06] hover:text-white ${path.startsWith('/services') ? 'text-white' : 'text-white/70'}`}
                  >
                    {p.label}
                    <Icon name="chevronDown" className={`h-4 w-4 transition ${menu === 'services' ? 'rotate-180' : ''}`} />
                  </button>
                  {menu === 'services' && (
                    <div role="menu" aria-label="Services" className="absolute left-0 top-12 w-[560px] rounded-2xl border border-white/10 bg-[#0c1020]/95 p-3 shadow-2xl backdrop-blur-xl">
                      <div className="grid grid-cols-2 gap-1">
                        {ws.services.map((s) => (
                          <Link
                            key={s.slug}
                            role="menuitem"
                            href={`/services/${s.slug}`}
                            onClick={() => setMenu(null)}
                            className="group flex gap-3 rounded-xl p-3 transition hover:bg-white/[0.05]"
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand2 ring-1 ring-inset ring-white/10">
                              <Icon name={s.icon} className="h-[18px] w-[18px]" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[13.5px] font-semibold text-white">{s.name}</span>
                              <span className="line-clamp-2 text-[12px] leading-snug text-white/55">{s.summary}</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                      <Link href={pagePath(ws, 'services')} role="menuitem" onClick={() => setMenu(null)} className="mt-2 flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-brand2 hover:bg-white/[0.07]">
                        All services <Icon name="arrow" className="h-4 w-4" />
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={p.key}
                  href={p.path}
                  className={`rounded-full px-3.5 py-2 text-[14px] font-medium transition hover:bg-white/[0.06] hover:text-white ${path === p.path ? 'text-white' : 'text-white/70'}`}
                >
                  {p.label}
                </Link>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {(f.voice || f.textChat) && (
              <button type="button" onClick={() => setAssistantOpen(true)} className="btn-ghost hidden !px-3.5 sm:inline-flex" data-cta="header-assistant">
                <Icon name={f.voice ? 'mic' : 'chat'} className="h-4 w-4 text-brand2" />
                Talk to {ws.assistant.name}
              </button>
            )}
            {f.booking && (
              <button type="button" onClick={() => openModal('booking')} className="btn-primary hidden !px-4 md:inline-flex" data-cta="header-book">
                Book a call
              </button>
            )}
            <button
              type="button"
              data-menu="main"
              onClick={() => setMenu(menu === 'main' ? null : 'main')}
              aria-expanded={menu === 'main'}
              aria-label={menu === 'main' ? 'Close menu' : 'Open menu'}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white lg:hidden"
            >
              <Icon name={menu === 'main' ? 'x' : 'menu'} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {menu === 'main' && (
        <div role="dialog" aria-label="Menu" className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close menu" onClick={() => setMenu(null)} />
          <div className="absolute right-0 top-0 flex h-full w-[86%] max-w-sm flex-col gap-1 overflow-y-auto border-l border-white/10 bg-[#0b0f1d] p-5">
            <div className="mb-4 flex items-center justify-between">
              <Logo />
              <button onClick={() => setMenu(null)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full border border-white/10">
                <Icon name="x" />
              </button>
            </div>
            <Link href="/" className="rounded-xl px-3 py-3 text-[15px] font-semibold text-white hover:bg-white/5">
              Home
            </Link>
            {nav.map((p) => (
              <Link key={p.key} href={p.path} className="rounded-xl px-3 py-3 text-[15px] font-semibold text-white hover:bg-white/5">
                {p.label}
              </Link>
            ))}
            <p className="mt-4 px-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">Services</p>
            {ws.services.map((s) => (
              <Link key={s.slug} href={`/services/${s.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-white/80 hover:bg-white/5">
                <Icon name={s.icon} className="h-4 w-4 text-brand2" />
                {s.name}
              </Link>
            ))}
            <div className="mt-auto grid gap-2 pt-6">
              {f.booking && (
                <button onClick={() => openModal('booking')} className="btn-primary">
                  Book a consultation
                </button>
              )}
              {(f.voice || f.textChat) && (
                <button
                  onClick={() => {
                    setMenu(null);
                    setAssistantOpen(true);
                  }}
                  className="btn-ghost"
                >
                  <Icon name="mic" className="h-4 w-4" /> Talk to {ws.assistant.name}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
