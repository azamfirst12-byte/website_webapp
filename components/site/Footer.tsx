'use client';

import Link from 'next/link';
import { Icon } from './Icon';
import { Logo } from './Header';
import { useSite } from './SiteProvider';

export function Footer() {
  const { ws, openModal } = useSite();
  const b = ws.brand;
  const social = Object.entries(b.social).filter(([, url]) => url);
  const hasSamples = ws.testimonials.some((t) => t.sample) || ws.caseStudies.some((c) => c.sample);
  const pages = ws.pages.filter((p) => p.enabled && p.key !== 'home');
  return (
    <footer className="relative mt-24 border-t border-white/[0.07] bg-black/20">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-white/60">{b.tagline}</p>
          {social.length > 0 && (
            <div className="mt-5 flex gap-2">
              {social.map(([k, url]) => (
                <a key={k} href={url} target="_blank" rel="noreferrer" aria-label={k} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/70 hover:text-white">
                  <Icon name={k === 'x' ? 'xsocial' : k} className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-white/40">Company</p>
          <ul className="mt-4 space-y-2.5 text-[14px]">
            {pages.map((p) => (
              <li key={p.key}>
                <Link href={p.path} className="text-white/70 hover:text-white">
                  {p.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/privacy" className="text-white/70 hover:text-white">
                Privacy
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-white/40">Services</p>
          <ul className="mt-4 space-y-2.5 text-[14px]">
            {ws.services.slice(0, 6).map((s) => (
              <li key={s.slug}>
                <Link href={`/services/${s.slug}`} className="text-white/70 hover:text-white">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-white/40">Contact</p>
          <ul className="mt-4 space-y-3 text-[14px] text-white/70">
            {b.email && (
              <li className="flex items-center gap-2.5">
                <Icon name="mail" className="h-4 w-4 text-brand2" />
                <a href={`mailto:${b.email}`} className="hover:text-white">
                  {b.email}
                </a>
              </li>
            )}
            {b.phone && (
              <li className="flex items-center gap-2.5">
                <Icon name="phone" className="h-4 w-4 text-brand2" />
                <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="hover:text-white">
                  {b.phone}
                </a>
              </li>
            )}
            {b.address && (
              <li className="flex items-start gap-2.5">
                <Icon name="map" className="mt-0.5 h-4 w-4 shrink-0 text-brand2" />
                {b.address}
              </li>
            )}
            {b.hours && (
              <li className="flex items-center gap-2.5">
                <Icon name="clock" className="h-4 w-4 text-brand2" />
                {b.hours}
              </li>
            )}
          </ul>
          {ws.features.booking && (
            <button onClick={() => openModal('booking')} className="btn-primary mt-5 !py-2 text-[13px]">
              Book a consultation
            </button>
          )}
        </div>
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="container-x flex flex-col gap-2 py-5 text-[12px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {b.name}. All rights reserved.
          </p>
          {ws.features.demoContentNotice && hasSamples && <p>Testimonials and case studies marked “Sample” are illustrative placeholders.</p>}
        </div>
      </div>
    </footer>
  );
}
