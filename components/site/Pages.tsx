'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SectionId } from '@/lib/workspace-types';
import { money } from '@/lib/format';
import { Hero } from './Hero';
import { CtaBand, FaqSection, LogosStrip, ProcessSection, StatsSection, TestimonialsSection, WorkSection } from './Blocks';
import { ServiceCard, ServicesSection } from './Services';
import { PricingSection } from './Pricing';
import { BookingForm, ContactSection } from './Forms';
import { Icon } from './Icon';
import { useSite } from './SiteProvider';

export function HomeSections() {
  const { ws } = useSite();
  const render: Record<SectionId, () => ReactNode> = {
    hero: () => <Hero />,
    logos: () => <LogosStrip />,
    services: () => <ServicesSection />,
    process: () => <ProcessSection />,
    work: () => <WorkSection limit={3} />,
    pricing: () => <PricingSection />,
    stats: () => <StatsSection />,
    testimonials: () => <TestimonialsSection />,
    faq: () => <FaqSection />,
    cta: () => <CtaBand />,
    contact: () => <ContactSection />,
  };
  return (
    <>
      {ws.homeOrder
        .filter((id) => ws.sections[id]?.enabled !== false)
        .map((id) => (
          <div key={id}>{render[id]?.()}</div>
        ))}
    </>
  );
}

export function PageHero({ eyebrow, title, subtitle, crumbs }: { eyebrow?: string; title: string; subtitle?: string; crumbs?: { label: string; href?: string }[] }) {
  return (
    <section data-section="page-top" aria-label={title} className="relative overflow-hidden pb-6 pt-12 sm:pt-16">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[380px] w-[680px] -translate-x-1/2 rounded-full bg-brand/25 blur-[120px]" aria-hidden />
      <div className="container-x relative text-center">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-4 flex justify-center gap-2 text-[12.5px] text-white/45">
            {crumbs.map((c, i) => (
              <span key={c.label} className="flex items-center gap-2">
                {i > 0 && <Icon name="chevronRight" className="h-3 w-3" />}
                {c.href ? (
                  <Link href={c.href} className="hover:text-white">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-white/70">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="h-display mx-auto mt-4 max-w-3xl text-[36px] leading-[1.08] sm:text-[52px]">{title}</h1>
        {subtitle && <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-white/65 sm:text-[17px]">{subtitle}</p>}
      </div>
    </section>
  );
}

export function ServicesPage() {
  const { ws } = useSite();
  return (
    <>
      <PageHero eyebrow="Services" title={ws.sections.services.heading} subtitle={ws.sections.services.subheading} crumbs={[{ label: 'Home', href: '/' }, { label: 'Services' }]} />
      <ServicesSection full />
      <CtaBand />
    </>
  );
}

export function ServiceDetail({ slug }: { slug: string }) {
  const { ws, openModal, setForm } = useSite();
  const s = ws.services.find((x) => x.slug === slug);
  if (!s) return null;
  const cur = ws.pricing.currency;
  const related = ws.caseStudies.filter((c) => c.services.includes(s.slug));
  const others = ws.services.filter((x) => x.slug !== s.slug && x.category === s.category).slice(0, 3);
  const ind = (k: string) => ws.industries.find((i) => i.key === k)?.label ?? k;
  return (
    <>
      <PageHero eyebrow={s.category} title={s.name} subtitle={s.summary} crumbs={[{ label: 'Home', href: '/' }, { label: 'Services', href: '/services' }, { label: s.name }]} />
      <section id="service-detail" data-section="service-detail" aria-label={s.name} className="py-10">
        <div className="container-x grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div data-item={`service:${s.slug}`} data-item-label={s.name} className="card p-7 sm:p-9">
            <h2 className="font-head text-[22px] font-bold text-white">What you get</h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-white/70">{s.description}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {s.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] p-3 text-[14px] text-white/80">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand2" strokeWidth={2.4} />
                  {f}
                </li>
              ))}
            </ul>
            <h3 className="mt-8 text-[13px] font-semibold uppercase tracking-wider text-white/45">Great for</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {s.industries.map((i) => (
                <span key={i} className="chip">
                  {ind(i)}
                </span>
              ))}
            </div>
          </div>
          <aside className="card h-fit p-7 lg:sticky lg:top-24">
            <p className="text-[12px] text-white/45">Starting from</p>
            <p className="font-head text-[36px] font-extrabold text-white">{money(s.startingPrice, cur)}</p>
            <p className="text-[13px] text-white/55">{s.priceUnit}</p>
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13.5px] text-white/75">
              <Icon name="clock" className="h-4 w-4 text-brand2" /> Timeline: {s.timeline}
            </div>
            <button
              className="btn-primary mt-6 w-full !py-3"
              data-cta={`service-book-${s.slug}`}
              onClick={() => {
                setForm('booking', { service: s.slug });
                openModal(ws.features.booking ? 'booking' : 'contact');
              }}
            >
              Book a free consultation
            </button>
            <Link href="/pricing" className="btn-ghost mt-2 w-full">
              See monthly plans
            </Link>
          </aside>
        </div>
      </section>
      {related.length > 0 && (
        <section id="examples" data-section="examples" aria-label="Examples" className="py-10">
          <div className="container-x">
            <h2 className="h-display mb-6 text-2xl">Examples</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {related.map((c) => (
                <div key={c.slug} data-item={`case:${c.slug}`} data-item-label={c.title} className="card p-6">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-white/40">{c.client}</p>
                  <p className="mt-1 font-head text-[18px] font-bold text-white">{c.title}</p>
                  <p className="mt-2 text-[14px] text-white/60">{c.summary}</p>
                  <p className="mt-3 font-head text-[22px] font-extrabold text-brand2">
                    {c.metric} <span className="text-[13px] font-medium text-white/60">{c.metricLabel}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {others.length > 0 && (
        <section id="related" data-section="related" aria-label="Related services" className="py-10">
          <div className="container-x">
            <h2 className="h-display mb-6 text-2xl">Related services</h2>
            <div className="grid gap-5 md:grid-cols-3">
              {others.map((o, i) => (
                <ServiceCard key={o.slug} s={o} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}
      <CtaBand />
    </>
  );
}

export function PricingPage() {
  const { ws } = useSite();
  return (
    <>
      <PageHero eyebrow="Pricing" title={ws.sections.pricing.heading} subtitle={ws.sections.pricing.subheading} crumbs={[{ label: 'Home', href: '/' }, { label: 'Pricing' }]} />
      <PricingSection withCompare />
      <FaqSection />
      <CtaBand />
    </>
  );
}

export function WorkPage() {
  const { ws } = useSite();
  return (
    <>
      <PageHero eyebrow="Work" title={ws.sections.work.heading} subtitle={ws.sections.work.subheading} crumbs={[{ label: 'Home', href: '/' }, { label: 'Work' }]} />
      <WorkSection />
      <TestimonialsSection />
      <CtaBand />
    </>
  );
}

export function AboutPage() {
  const { ws } = useSite();
  const a = ws.about;
  return (
    <>
      <PageHero eyebrow="About" title={a.heading} subtitle={a.intro} crumbs={[{ label: 'Home', href: '/' }, { label: 'About' }]} />
      <section id="about" data-section="about" aria-label="About us" className="py-10">
        <div className="container-x grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div className="card p-8 text-[16px] leading-relaxed text-white/75">
            {a.body.split('\n').map((p, i) => (
              <p key={i} className="mb-4 last:mb-0">
                {p}
              </p>
            ))}
          </div>
          <div className="grid gap-4">
            {a.values.map((v, i) => (
              <div key={v.title} data-item={`value:${i + 1}`} data-item-label={v.title} className="card p-6">
                <h3 className="font-head text-[17px] font-bold text-white">{v.title}</h3>
                <p className="mt-1.5 text-[14px] text-white/60">{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <StatsSection />
      <ProcessSection />
      <CtaBand />
    </>
  );
}

export function ContactPage() {
  const { ws } = useSite();
  return (
    <>
      <PageHero eyebrow="Contact" title={ws.sections.contact.heading} subtitle={ws.sections.contact.subheading} crumbs={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} />
      <ContactSection />
    </>
  );
}

export function BookPage() {
  const { ws } = useSite();
  return (
    <>
      <PageHero eyebrow="Consultation" title={ws.booking.heading} subtitle={ws.booking.intro} crumbs={[{ label: 'Home', href: '/' }, { label: 'Book' }]} />
      <section id="booking" data-section="booking" aria-label="Booking form" className="py-8">
        <div className="container-x max-w-3xl">
          <div className="card p-6 sm:p-8">
            <BookingForm />
          </div>
        </div>
      </section>
    </>
  );
}
