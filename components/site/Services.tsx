'use client';

import Link from 'next/link';
import type { PublicWorkspace, Service } from '@/lib/workspace-types';
import { money } from '@/lib/format';
import { Icon } from './Icon';
import { Section } from './Section';
import { useSite } from './SiteProvider';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Same filter the action layer uses (filter_content / search_content / select_tab category). */
export function filterServices(ws: PublicWorkspace, industry: string, category: string, query: string) {
  const words = norm(query).split(' ').filter((w) => w.length > 1);
  return ws.services.filter((s) => {
    if (industry !== 'all' && !s.industries.includes(industry)) return false;
    if (category !== 'all' && s.category !== category) return false;
    if (words.length) {
      const hay = norm(`${s.name} ${s.category} ${s.summary} ${s.description} ${s.features.join(' ')} ${s.industries.join(' ')}`);
      return words.every((w) => hay.includes(w));
    }
    return true;
  });
}

export function ServiceCard({ s, index }: { s: Service; index?: number }) {
  const { ws, openModal } = useSite();
  return (
    <article
      data-item={`service:${s.slug}`}
      data-item-label={`${s.name} — from ${money(s.startingPrice, ws.pricing.currency)} ${s.priceUnit}`}
      className="card group relative flex flex-col p-6 transition duration-300 hover:-translate-y-1 hover:border-brand2/30 hover:shadow-[0_20px_60px_-30px_rgb(var(--brand-2)/0.6)]"
    >
      {s.popular && <span className="absolute right-5 top-5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent">Popular</span>}
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand/25 to-brand2/15 text-brand2 ring-1 ring-inset ring-white/10">
        <Icon name={s.icon} className="h-6 w-6" />
      </span>
      <p className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-white/40">
        {s.category}
        {index !== undefined && <span className="sr-only"> · option {index + 1}</span>}
      </p>
      <h3 className="mt-1 font-head text-[19px] font-bold leading-snug text-white">{s.name}</h3>
      <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-white/65">{s.summary}</p>
      <ul className="mt-4 space-y-1.5 text-[13.5px] text-white/70">
        {s.features.slice(0, 3).map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand2" strokeWidth={2.4} />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-end justify-between gap-3 border-t border-white/[0.06] pt-4">
        <div>
          <p className="text-[11px] text-white/45">From</p>
          <p className="font-head text-[20px] font-bold text-white">
            {money(s.startingPrice, ws.pricing.currency)} <span className="text-[12px] font-medium text-white/45">{s.priceUnit}</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => openModal('service', s.slug)} className="btn-ghost !px-3 !py-2 text-[12.5px]" aria-label={`Quick view: ${s.name}`}>
            Quick view
          </button>
          <Link href={`/services/${s.slug}`} className="btn-primary !px-3 !py-2 text-[12.5px]" aria-label={`Details: ${s.name}`}>
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ServicesSection({ full = false }: { full?: boolean }) {
  const { ws, serviceIndustry, setServiceIndustry, serviceCategory, setServiceCategory, query, setQuery } = useSite();
  const categories = ['all', ...new Set(ws.services.map((s) => s.category))];
  const list = filterServices(ws, serviceIndustry, serviceCategory, full ? query : '');
  const filtered = serviceIndustry !== 'all' || serviceCategory !== 'all' || (full && !!query);
  const shown = full || filtered ? list : list.slice(0, 6);
  const industry = ws.industries.find((i) => i.key === serviceIndustry);

  return (
    <Section id="services" sectionKey="services" label="Services">
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-center gap-2" role="tablist" aria-label="Service categories">
          {categories.map((c) => (
            <button
              key={c}
              role="tab"
              data-tab-group="category"
              data-tab={c}
              aria-selected={serviceCategory === c}
              onClick={() => setServiceCategory(c)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${serviceCategory === c ? 'bg-white text-black' : 'border border-white/10 text-white/70 hover:text-white'}`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Filter by industry</span>
            <select value={serviceIndustry} onChange={(e) => setServiceIndustry(e.target.value)} className="field appearance-none pr-10" name="industry" aria-label="Industry">
              <option value="all">All industries</option>
              {ws.industries.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-white/40" />
          </label>
          {full && (
            <label className="relative flex-[1.4]">
              <span className="sr-only">Search services</span>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-white/40" />
              <input type="search" data-search="services" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services…" className="field pl-10" aria-label="Search services" />
            </label>
          )}
        </div>
        {filtered && (
          <p className="text-center text-[13px] text-white/55" aria-live="polite">
            Showing {list.length} service{list.length === 1 ? '' : 's'}
            {industry ? ` for ${industry.label.toLowerCase()}` : ''}
            {serviceCategory !== 'all' ? ` in ${serviceCategory}` : ''}
            {full && query ? ` matching “${query}”` : ''} ·{' '}
            <button
              className="font-semibold text-brand2 hover:underline"
              onClick={() => {
                setServiceIndustry('all');
                setServiceCategory('all');
                setQuery('');
              }}
            >
              Clear filters
            </button>
          </p>
        )}
      </div>
      {shown.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s, i) => (
            <ServiceCard key={s.slug} s={s} index={i} />
          ))}
        </div>
      ) : (
        <p className="card p-10 text-center text-white/60">No services match those filters.</p>
      )}
      {!full && !filtered && ws.services.length > 6 && (
        <div className="mt-10 text-center">
          <Link href="/services" className="btn-ghost">
            View all {ws.services.length} services <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
      )}
    </Section>
  );
}
