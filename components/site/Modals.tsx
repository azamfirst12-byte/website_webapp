'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { money } from '@/lib/format';
import { Icon } from './Icon';
import { BookingForm, ContactForm } from './Forms';
import { CompareTable } from './Pricing';
import { useSite } from './SiteProvider';

function Dialog({ label, onClose, children, wide = false }: { label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = o;
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close popup" tabIndex={-1} onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0c1020] p-6 shadow-2xl outline-none sm:rounded-3xl sm:p-8 ${wide ? 'sm:max-w-4xl' : 'sm:max-w-xl'}`}
      >
        <button onClick={onClose} aria-label="Close" data-close className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/70 hover:text-white">
          <Icon name="x" className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function Modals() {
  const { ws, modal, closeModal, compare, openModal, setForm } = useSite();
  if (!modal) return null;
  const cur = ws.pricing.currency;

  if (modal.kind === 'booking')
    return (
      <Dialog label="Book a consultation" onClose={closeModal}>
        <h2 className="h-display pr-10 text-2xl">{ws.booking.heading}</h2>
        <p className="mb-6 mt-2 text-[14px] text-white/60">{ws.booking.intro}</p>
        <BookingForm compact />
      </Dialog>
    );

  if (modal.kind === 'contact')
    return (
      <Dialog label="Contact form" onClose={closeModal} wide>
        <h2 className="h-display pr-10 text-2xl">{ws.sections.contact.heading}</h2>
        <p className="mb-6 mt-2 text-[14px] text-white/60">{ws.sections.contact.subheading}</p>
        <ContactForm />
      </Dialog>
    );

  if (modal.kind === 'compare') {
    if (compare.kind === 'services') {
      const list = ws.services.filter((s) => compare.items.includes(s.slug));
      return (
        <Dialog label="Compare services" onClose={closeModal} wide>
          <h2 className="h-display pr-10 text-2xl">Compare services</h2>
          <div className={`mt-6 grid gap-4 ${list.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {list.map((s) => (
              <div key={s.slug} data-item={`service:${s.slug}`} data-item-label={s.name} className="card p-5">
                <Icon name={s.icon} className="h-6 w-6 text-brand2" />
                <h3 className="mt-3 font-head text-[17px] font-bold text-white">{s.name}</h3>
                <dl className="mt-3 space-y-2 text-[13px]">
                  <div>
                    <dt className="text-white/45">From</dt>
                    <dd className="font-semibold text-white">
                      {money(s.startingPrice, cur)} {s.priceUnit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Timeline</dt>
                    <dd className="text-white/85">{s.timeline}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Includes</dt>
                    <dd>
                      <ul className="mt-1 space-y-1 text-white/75">
                        {s.features.map((f) => (
                          <li key={f} className="flex gap-1.5">
                            <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand2" strokeWidth={2.5} />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </Dialog>
      );
    }
    return (
      <Dialog label="Compare plans" onClose={closeModal} wide>
        <h2 className="h-display mb-6 pr-10 text-2xl">Compare plans</h2>
        <CompareTable ids={compare.items} />
        <p className="mt-4 text-[12.5px] text-white/45">{ws.pricing.note}</p>
      </Dialog>
    );
  }

  if (modal.kind === 'service') {
    const s = ws.services.find((x) => x.slug === modal.item) ?? ws.services[0];
    if (!s) return null;
    return (
      <Dialog label={`Service: ${s.name}`} onClose={closeModal}>
        <div data-item={`service:${s.slug}`} data-item-label={s.name}>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/20 text-brand2">
            <Icon name={s.icon} className="h-6 w-6" />
          </span>
          <h2 className="h-display mt-4 pr-10 text-2xl">{s.name}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-white/70">{s.description}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="text-white/45">From</p>
              <p className="font-semibold text-white">
                {money(s.startingPrice, cur)} {s.priceUnit}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="text-white/45">Timeline</p>
              <p className="font-semibold text-white">{s.timeline}</p>
            </div>
          </div>
          <ul className="mt-5 space-y-2 text-[14px] text-white/75">
            {s.features.map((f) => (
              <li key={f} className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand2" strokeWidth={2.4} />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-2">
            {ws.features.booking && (
              <button
                className="btn-primary"
                onClick={() => {
                  setForm('booking', { service: s.slug });
                  openModal('booking');
                }}
              >
                Book a consultation
              </button>
            )}
            <Link href={`/services/${s.slug}`} className="btn-ghost" onClick={closeModal}>
              Full details
            </Link>
          </div>
        </div>
      </Dialog>
    );
  }
  return null;
}
