'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Cta } from '@/lib/workspace-types';
import { Icon } from './Icon';
import { useSite } from './SiteProvider';

export function CtaButton({ cta, primary = true, className = '' }: { cta: Cta; primary?: boolean; className?: string }) {
  const { openModal } = useSite();
  const router = useRouter();
  const cls = `${primary ? 'btn-primary' : 'btn-ghost'} !px-6 !py-3 text-[15px] ${className}`;
  if (cta.action === 'href' && cta.href)
    return (
      <Link href={cta.href} className={cls} data-cta={cta.label}>
        {cta.label}
        {primary && <Icon name="arrow" className="h-4 w-4" />}
      </Link>
    );
  return (
    <button
      type="button"
      className={cls}
      data-cta={cta.label}
      onClick={() => {
        if (cta.action === 'booking') openModal('booking');
        else {
          const el = document.getElementById('contact');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
          else router.push('/contact');
        }
      }}
    >
      {cta.label}
      {primary && <Icon name="arrow" className="h-4 w-4" />}
    </button>
  );
}

export function Hero() {
  const { ws, setAssistantOpen } = useSite();
  const h = ws.hero;
  const f = ws.features;
  return (
    <section id="hero" data-section="hero" aria-label="Introduction" className="relative overflow-hidden pb-16 pt-10 sm:pb-24 sm:pt-16">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand/30 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute -right-40 top-20 h-[440px] w-[440px] rounded-full bg-brand2/20 blur-[120px]" aria-hidden />
      <div className="container-x relative grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div className="animate-fadeUp">
          {h.eyebrow && (
            <span className="eyebrow">
              <span className="h-1.5 w-1.5 animate-glow rounded-full bg-brand2" /> {h.eyebrow}
            </span>
          )}
          <h1 className="h-display mt-5 text-[40px] leading-[1.04] sm:text-[58px] lg:text-[64px]">
            {h.heading} <span className="text-gradient">{h.highlight}</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/70 sm:text-[18px]">{h.subheading}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <CtaButton cta={h.primaryCta} />
            {h.secondaryCta?.label && <CtaButton cta={h.secondaryCta} primary={false} />}
          </div>
          {h.bullets.length > 0 && (
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-white/70">
              {h.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-brand2/15 text-brand2">
                    <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          )}
          {(f.voice || f.textChat) && (
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              data-cta="hero-try-voice"
              className="group mt-9 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2 pr-5 text-left transition hover:border-brand2/40 hover:bg-white/[0.06]"
            >
              <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand2 text-white">
                <span className="absolute inset-0 animate-pulseRing rounded-xl bg-brand2/40" aria-hidden />
                <Icon name={f.voice ? 'mic' : 'chat'} className="relative h-5 w-5" />
              </span>
              <span>
                <span className="block text-[14px] font-semibold text-white">Try it: talk to this website</span>
                <span className="block text-[12.5px] text-white/55">Say “Show me your pricing” or “I need a website for my gym”</span>
              </span>
            </button>
          )}
        </div>
        <div className="relative">
          {h.media === 'image' && h.mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={h.mediaUrl} alt="" className="w-full rounded-3xl border border-white/10 object-cover shadow-2xl" />
          ) : h.media === 'video' && h.mediaUrl ? (
            <video src={h.mediaUrl} className="w-full rounded-3xl border border-white/10 shadow-2xl" autoPlay muted loop playsInline />
          ) : (
            <HeroVisual />
          )}
        </div>
      </div>
    </section>
  );
}

/** Illustration: a browser window where a visitor talks and the page reacts. Pure CSS/HTML. */
function HeroVisual() {
  const { ws } = useSite();
  const plan = ws.pricing.plans.find((p) => p.highlighted) ?? ws.pricing.plans[0];
  const cur = ws.pricing.currency;
  return (
    <div className="relative mx-auto max-w-[560px] animate-floaty" aria-hidden>
      <div className="absolute -inset-6 rounded-[36px] bg-gradient-to-br from-brand/30 via-transparent to-brand2/25 blur-2xl" />
      <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[#0b1020]/90 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 flex-1 truncate rounded-md bg-white/[0.05] px-3 py-1 text-[11px] text-white/40">{(process.env.NEXT_PUBLIC_SITE_URL || 'yourbusiness.com').replace(/^https?:\/\//, '')}/pricing</span>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_0.9fr]">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded-full bg-white/10" />
            <div className="h-6 w-44 rounded-full bg-white/15" />
            {ws.pricing.plans.slice(0, 3).map((p) => (
              <div key={p.id} className={`rounded-xl border p-3 ${p.id === plan?.id ? 'border-brand2/70 bg-brand2/[0.08] shadow-[0_0_0_4px_rgb(var(--brand-2)/0.12)]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-white/85">{p.name}</span>
                  <span className="text-[12px] font-bold text-white">{p.monthly ? `${cur}${p.monthly}/mo` : 'Custom'}</span>
                </div>
                <div className="mt-2 h-1.5 w-3/4 rounded-full bg-white/[0.08]" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-sm bg-gradient-to-r from-brand to-[#6a4df0] px-3 py-2 text-[12px] text-white">Which plan is better for a small business?</div>
            <div className="flex items-center gap-1.5 text-[10.5px] text-brand2">
              <Icon name="sparkles" className="h-3.5 w-3.5" /> Highlighting {plan?.name}
            </div>
            <div className="max-w-[95%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] leading-snug text-white/85">
              For a small team I&apos;d pick <b className="text-white">{plan?.name}</b>: it adds lead scoring and consultation booking. Want me to book a quick call?
            </div>
            <div className="mt-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1.5 pl-3">
              <span className="flex h-6 flex-1 items-center gap-[3px]">
                {[0.4, 0.8, 0.55, 1, 0.65, 0.9, 0.45, 0.75, 0.5, 0.85, 0.35, 0.6].map((v, i) => (
                  <span key={i} className="w-[3px] animate-glow rounded-full bg-brand2" style={{ height: `${v * 100}%`, animationDelay: `${i * 90}ms` }} />
                ))}
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand to-brand2 text-white">
                <Icon name="mic" className="h-4 w-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden rounded-2xl border border-white/10 bg-[#0d1224]/95 px-4 py-3 shadow-xl sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">New lead · score</p>
        <p className="mt-1 flex items-center gap-2 font-head text-[20px] font-extrabold text-white">
          86 <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">HOT</span>
        </p>
      </div>
      <div className="absolute -right-3 -top-4 hidden rounded-2xl border border-white/10 bg-[#0d1224]/95 px-4 py-3 shadow-xl sm:block">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-white">
          <Icon name="calendar" className="h-4 w-4 text-brand2" /> Consultation requested
        </p>
        <p className="text-[11px] text-white/50">Thursday, 3:00 pm</p>
      </div>
    </div>
  );
}
