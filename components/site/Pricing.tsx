'use client';

import type { Plan, PublicWorkspace } from '@/lib/workspace-types';
import { money } from '@/lib/format';
import { Icon } from './Icon';
import { Section } from './Section';
import { useSite } from './SiteProvider';

export function planPrice(ws: PublicWorkspace, p: Plan, billing: 'monthly' | 'annual') {
  if (!p.monthly) return null;
  return billing === 'annual' ? Math.round(p.monthly * (1 - ws.pricing.annualDiscountPct / 100)) : p.monthly;
}

export function BillingTabs() {
  const { ws, billing, setBilling } = useSite();
  return (
    <div role="tablist" aria-label="Billing period" className="mx-auto flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      {(['monthly', 'annual'] as const).map((b) => (
        <button
          key={b}
          role="tab"
          data-tab-group="billing"
          data-tab={b}
          aria-selected={billing === b}
          onClick={() => setBilling(b)}
          className={`rounded-full px-5 py-2 text-[13.5px] font-semibold transition ${billing === b ? 'bg-white text-black' : 'text-white/65 hover:text-white'}`}
        >
          {b === 'monthly' ? 'Monthly' : 'Annual'}
          {b === 'annual' && ws.pricing.annualDiscountPct > 0 && <span className={`ml-1.5 text-[11px] ${billing === b ? 'text-emerald-600' : 'text-emerald-300'}`}>−{ws.pricing.annualDiscountPct}%</span>}
        </button>
      ))}
    </div>
  );
}

export function PlanCard({ p, index }: { p: Plan; index: number }) {
  const { ws, billing, openModal, setForm } = useSite();
  const price = planPrice(ws, p, billing);
  const cur = ws.pricing.currency;
  return (
    <article
      data-item={`plan:${p.id}`}
      data-item-label={`${p.name} plan — ${price ? `${money(price, cur)}/month` : 'custom pricing'}${p.setupFee ? ` + ${money(p.setupFee, cur)} setup` : ''}`}
      className={`relative flex flex-col rounded-3xl border p-6 transition ${
        p.highlighted ? 'border-brand2/50 bg-gradient-to-b from-brand/[0.16] to-surface/90 shadow-[0_30px_80px_-40px_rgb(var(--brand)/0.9)]' : 'border-white/[0.08] bg-surface/70'
      }`}
    >
      {p.highlighted && <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-brand to-brand2 px-3 py-1 text-[11px] font-bold text-white">Most popular</span>}
      <p className="sr-only">Option {index + 1}</p>
      <h3 className="font-head text-[20px] font-bold text-white">{p.name}</h3>
      <p className="mt-1 min-h-[40px] text-[13.5px] leading-snug text-white/60">{p.tagline}</p>
      <div className="mt-5 flex items-end gap-1.5">
        {price ? (
          <>
            <span className="font-head text-[42px] font-extrabold leading-none tracking-tight text-white">{money(price, cur)}</span>
            <span className="pb-1 text-[13px] text-white/50">/month{billing === 'annual' ? ', billed yearly' : ''}</span>
          </>
        ) : (
          <span className="font-head text-[34px] font-extrabold leading-none text-white">Custom</span>
        )}
      </div>
      <p className="mt-2 text-[12.5px] text-white/45">{p.setupFee ? `+ ${money(p.setupFee, cur)} one-time setup` : p.monthly ? 'No setup fee' : 'Tailored quote after a consultation'}</p>
      <p className="mt-4 rounded-xl bg-white/[0.04] px-3 py-2 text-[12.5px] text-white/70">
        <span className="text-white/45">Best for:</span> {p.bestFor}
      </p>
      <ul className="mt-5 flex-1 space-y-2.5 text-[14px] text-white/75">
        {p.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand2" strokeWidth={2.4} />
            {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-cta={`plan-${p.id}`}
        onClick={() => {
          setForm('booking', { message: `Interested in the ${p.name} plan (${billing} billing).` });
          openModal(ws.features.booking ? 'booking' : 'contact');
        }}
        className={`${p.highlighted ? 'btn-primary' : 'btn-ghost'} mt-7 w-full !py-3`}
      >
        {p.ctaLabel}
      </button>
    </article>
  );
}

export function CompareTable({ ids }: { ids?: string[] }) {
  const { ws, billing } = useSite();
  const plans = ids?.length ? ws.pricing.plans.filter((p) => ids.includes(p.id)) : ws.pricing.plans;
  const cur = ws.pricing.currency;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
      <table className="w-full min-w-[560px] text-left text-[14px]">
        <thead>
          <tr className="border-b border-white/[0.08] bg-white/[0.03]">
            <th className="px-4 py-3 font-semibold text-white/60">Feature</th>
            {plans.map((p) => (
              <th key={p.id} data-item={`plan:${p.id}`} className={`px-4 py-3 font-head font-bold ${p.highlighted ? 'text-brand2' : 'text-white'}`}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-white/[0.05]">
            <td className="px-4 py-3 text-white/60">Price / month</td>
            {plans.map((p) => {
              const v = planPrice(ws, p, billing);
              return (
                <td key={p.id} className="px-4 py-3 font-semibold text-white">
                  {v ? money(v, cur) : 'Custom'}
                </td>
              );
            })}
          </tr>
          <tr className="border-b border-white/[0.05]">
            <td className="px-4 py-3 text-white/60">One-time setup</td>
            {plans.map((p) => (
              <td key={p.id} className="px-4 py-3 text-white/80">
                {p.setupFee ? money(p.setupFee, cur) : p.monthly ? '—' : 'Custom'}
              </td>
            ))}
          </tr>
          {ws.pricing.comparison.map((row) => (
            <tr key={row.feature} className="border-b border-white/[0.05] last:border-0">
              <td className="px-4 py-3 text-white/60">{row.feature}</td>
              {plans.map((p) => {
                const v = row.values[p.id] ?? '—';
                return (
                  <td key={p.id} className={`px-4 py-3 ${v === '—' ? 'text-white/30' : 'text-white/85'}`}>
                    {v === 'Yes' ? <Icon name="check" className="h-4 w-4 text-emerald-300" strokeWidth={2.6} /> : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PricingSection({ withCompare = false }: { withCompare?: boolean }) {
  const { ws, openModal, setCompare } = useSite();
  const n = ws.pricing.plans.length;
  return (
    <>
      <Section id="pricing" sectionKey="pricing" label="Pricing plans">
        <BillingTabs />
        <div className={`mt-10 grid gap-5 sm:grid-cols-2 ${n >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {ws.pricing.plans.map((p, i) => (
            <PlanCard key={p.id} p={p} index={i} />
          ))}
        </div>
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          {ws.features.compare && !withCompare && (
            <button
              type="button"
              onClick={() => {
                setCompare({ kind: 'plans', items: ws.pricing.plans.map((p) => p.id) });
                openModal('compare');
              }}
              className="btn-ghost"
            >
              <Icon name="compare" className="h-4 w-4" /> Compare all plans
            </button>
          )}
          {ws.pricing.note && <p className="max-w-2xl text-[13px] text-white/45">{ws.pricing.note}</p>}
        </div>
      </Section>
      {withCompare && (
        <section id="compare" data-section="compare" aria-label="Plan comparison" className="pb-10">
          <div className="container-x">
            <h2 className="h-display mb-6 text-center text-2xl sm:text-3xl">Compare plans</h2>
            <CompareTable />
          </div>
        </section>
      )}
    </>
  );
}
