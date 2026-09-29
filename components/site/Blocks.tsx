'use client';

import Link from 'next/link';
import type { PublicWorkspace } from '@/lib/workspace-types';
import { Icon } from './Icon';
import { SampleBadge, Section } from './Section';
import { CtaButton } from './Hero';
import { useSite } from './SiteProvider';

export function LogosStrip() {
  const { ws } = useSite();
  const t = ws.sections.logos;
  if (!ws.logos.length) return null;
  const items = [...ws.logos, ...ws.logos];
  return (
    <section id="logos" data-section="logos" aria-label={t.heading} className="border-y border-white/[0.05] bg-white/[0.015] py-6">
      <div className="container-x flex flex-col items-center gap-4 sm:flex-row">
        <p className="shrink-0 text-[12px] font-semibold uppercase tracking-widest text-white/40">{t.heading}</p>
        <div className="relative w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-10 pr-10">
            {items.map((l, i) => (
              <span key={i} className="whitespace-nowrap font-head text-[17px] font-bold text-white/35">
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProcessSection() {
  const { ws } = useSite();
  return (
    <Section id="process" sectionKey="process" label="How it works">
      <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {ws.process.map((p, i) => (
          <li key={p.title} data-item={`step:${i + 1}`} data-item-label={`Step ${i + 1}: ${p.title}`} className="card relative p-6">
            <span className="font-head text-[44px] font-extrabold leading-none text-transparent [-webkit-text-stroke:1px_rgb(var(--brand-2)/0.6)]">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="mt-4 font-head text-[18px] font-bold text-white">{p.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-white/60">{p.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function filterWork(ws: PublicWorkspace, industry: string, query = '') {
  const w = query.toLowerCase();
  return ws.caseStudies.filter((c) => (industry === 'all' || c.industry === industry) && (!w || `${c.client} ${c.title} ${c.summary} ${c.industry}`.toLowerCase().includes(w)));
}

export function WorkSection({ limit }: { limit?: number }) {
  const { ws, workIndustry, setWorkIndustry } = useSite();
  if (!ws.caseStudies.length) return null;
  const used = new Set(ws.caseStudies.map((c) => c.industry));
  const list = filterWork(ws, workIndustry);
  const shown = limit && workIndustry === 'all' ? list.slice(0, limit) : list;
  const label = (k: string) => ws.industries.find((i) => i.key === k)?.label ?? k;
  return (
    <Section id="work" sectionKey="work" label="Examples and case studies">
      <div className="mb-8 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Filter examples by industry">
        {['all', ...ws.industries.map((i) => i.key).filter((k) => used.has(k))].map((k) => (
          <button
            key={k}
            role="tab"
            data-tab-group="work-industry"
            data-tab={k}
            aria-selected={workIndustry === k}
            onClick={() => setWorkIndustry(k)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${workIndustry === k ? 'bg-white text-black' : 'border border-white/10 text-white/70 hover:text-white'}`}
          >
            {k === 'all' ? 'All industries' : label(k)}
          </button>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <article key={c.slug} data-item={`case:${c.slug}`} data-item-label={`${c.client}: ${c.title}`} className="card group flex flex-col overflow-hidden">
            <div className="relative h-36 overflow-hidden bg-gradient-to-br from-brand/30 via-surface to-brand2/20 p-5">
              <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
              <div className="relative flex items-start justify-between">
                <span className="chip">{label(c.industry)}</span>
                <SampleBadge show={c.sample} />
              </div>
              <p className="relative mt-6 font-head text-[34px] font-extrabold leading-none text-white">
                {c.metric} <span className="text-[14px] font-semibold text-white/70">{c.metricLabel}</span>
              </p>
            </div>
            <div className="flex flex-1 flex-col p-6">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-white/40">{c.client}</p>
              <h3 className="mt-1 font-head text-[18px] font-bold leading-snug text-white">{c.title}</h3>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-white/60">{c.summary}</p>
              <ul className="mt-4 space-y-1.5 text-[13px] text-white/70">
                {c.results.map((r) => (
                  <li key={r} className="flex gap-2">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" strokeWidth={2.4} />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
      {limit && workIndustry === 'all' && list.length > limit && (
        <div className="mt-10 text-center">
          <Link href="/work" className="btn-ghost">
            See all examples <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
      )}
      {!shown.length && <p className="card p-8 text-center text-white/60">No examples in this industry yet.</p>}
    </Section>
  );
}

export function StatsSection() {
  const { ws } = useSite();
  return (
    <section id="stats" data-section="stats" aria-label={ws.sections.stats.heading} className="py-10">
      <div className="container-x">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.06] lg:grid-cols-4">
          {ws.stats.map((s) => (
            <div key={s.label} className="bg-bg/95 p-6 text-center sm:p-8">
              <p className="text-gradient font-head text-[34px] font-extrabold sm:text-[42px]">{s.value}</p>
              <p className="mt-1 text-[13px] text-white/55">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TestimonialsSection() {
  const { ws } = useSite();
  if (!ws.testimonials.length) return null;
  return (
    <Section id="testimonials" sectionKey="testimonials" label="Customer reviews">
      <div className="grid gap-5 md:grid-cols-2">
        {ws.testimonials.map((t) => (
          <figure key={t.id} data-item={`testimonial:${t.id}`} data-item-label={`Review by ${t.name}, ${t.role} at ${t.company}`} className="card relative p-7">
            <Icon name="quote" className="absolute right-6 top-6 h-8 w-8 text-white/10" />
            <div className="flex items-center gap-1 text-amber-300" aria-label={`${t.rating} out of 5 stars`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Icon key={i} name="star" className={`h-4 w-4 ${i < t.rating ? '' : 'opacity-20'}`} />
              ))}
              <span className="ml-2">
                <SampleBadge show={t.sample} />
              </span>
            </div>
            <blockquote className="mt-4 text-[16px] leading-relaxed text-white/85">“{t.quote}”</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand/40 to-brand2/30 font-head text-[14px] font-bold text-white">
                {t.name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              <span>
                <span className="block text-[14px] font-semibold text-white">{t.name}</span>
                <span className="block text-[12.5px] text-white/50">
                  {t.role}, {t.company}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

export function FaqSection({ category }: { category?: string }) {
  const { ws } = useSite();
  const list = category ? ws.faq.filter((f) => f.category === category) : ws.faq;
  if (!list.length) return null;
  return (
    <Section id="faq" sectionKey="faq" label="Frequently asked questions">
      <div className="mx-auto max-w-3xl space-y-3">
        {list.map((f) => (
          <details key={f.id} id={f.id} data-item={`faq:${f.id}`} data-item-label={f.q} className="card group p-0 open:border-brand2/30">
            <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-[15.5px] font-semibold text-white">
              {f.q}
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 transition group-open:rotate-45">
                <Icon name="x" className="h-3.5 w-3.5 rotate-45" />
              </span>
            </summary>
            <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-white/65">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

export function CtaBand() {
  const { ws } = useSite();
  const c = ws.cta;
  return (
    <section id="cta" data-section="cta" aria-label={c.heading} className="py-16">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-brand/35 via-surface to-brand2/25 px-6 py-14 text-center sm:px-14">
          <div className="bg-grid absolute inset-0 opacity-70" aria-hidden />
          <div className="relative">
            <h2 className="h-display mx-auto max-w-2xl text-3xl leading-tight sm:text-[42px]">{c.heading}</h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px] text-white/70">{c.subheading}</p>
            <div className="mt-8 flex justify-center">
              <CtaButton cta={c.button} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
