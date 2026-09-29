'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Section } from './Section';
import { useSite, type FormName } from './SiteProvider';
import { getConversationId } from '../assistant/session';

async function submitForm(form: FormName, fields: Record<string, string>) {
  const r = await fetch('/api/crm/form', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ form, fields, conversationId: getConversationId() }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
  return d as { leadId: number };
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function useFormState(form: FormName) {
  const { forms, setForm, formSent, setFormSent, setLeadId, resetForm } = useSite();
  const v = forms[form];
  const set = (k: string) => (e: { target: { value: string } }) => setForm(form, { [k]: e.target.value });
  return { v, set, sent: formSent[form], setSent: (b: boolean) => setFormSent(form, b), setLeadId, reset: () => resetForm(form) };
}

function Sent({ text, onAgain }: { text: string; onAgain: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
        <Icon name="check" className="h-7 w-7" strokeWidth={2.4} />
      </span>
      <p className="max-w-sm text-[15px] text-white/80">{text}</p>
      <button type="button" onClick={onAgain} className="text-[13px] font-semibold text-brand2 hover:underline">
        Send another message
      </button>
    </div>
  );
}

export function ContactForm() {
  const { ws } = useSite();
  const { v, set, sent, setSent, setLeadId, reset } = useFormState('contact');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  if (sent) return <Sent text={ws.contact.successMessage} onAgain={() => (reset(), setSent(false))} />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!consent) return setError('Please tick the box so we can contact you.');
    setBusy(true);
    try {
      const d = await submitForm('contact', { ...v, consent: 'yes' });
      setLeadId(d.leadId);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form data-form="contact" aria-label="Contact form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Your name *">
        <input name="name" required autoComplete="name" value={v.name ?? ''} onChange={set('name')} className="field" />
      </Field>
      <Field label="Email *">
        <input name="email" type="email" required autoComplete="email" value={v.email ?? ''} onChange={set('email')} className="field" />
      </Field>
      <Field label="Phone / WhatsApp">
        <input name="phone" type="tel" autoComplete="tel" value={v.phone ?? ''} onChange={set('phone')} className="field" placeholder="+92 300 1234567" />
      </Field>
      <Field label="Company">
        <input name="company" autoComplete="organization" value={v.company ?? ''} onChange={set('company')} className="field" />
      </Field>
      <Field label="Service">
        <select name="service" value={v.service ?? ''} onChange={set('service')} className="field">
          <option value="">Not sure yet</option>
          {ws.services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Budget">
        <select name="budget" value={v.budget ?? ''} onChange={set('budget')} className="field">
          <option value="">Select…</option>
          {ws.contact.budgets.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </Field>
      <Field label="Timeline">
        <select name="timeline" value={v.timeline ?? ''} onChange={set('timeline')} className="field">
          <option value="">Select…</option>
          {ws.contact.timelines.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </Field>
      <Field label="Team size">
        <select name="company_size" value={v.company_size ?? ''} onChange={set('company_size')} className="field">
          <option value="">Select…</option>
          {ws.contact.companySizes.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </Field>
      <Field label="What do you need?" className="sm:col-span-2">
        <textarea name="message" rows={4} value={v.message ?? ''} onChange={set('message')} className="field resize-y" placeholder="Tell us about your business and goals…" />
      </Field>
      <label data-ai="off" className="flex items-start gap-2.5 text-[13px] text-white/65 sm:col-span-2">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand-2))]" />
        I agree that {ws.brand.name} may contact me about this enquiry.
      </label>
      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-200 sm:col-span-2" role="alert">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button disabled={busy} className="btn-primary w-full !py-3 sm:w-auto">
          {busy ? 'Sending…' : 'Send message'} <Icon name="send" className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

export function BookingForm({ compact = false }: { compact?: boolean }) {
  const { ws } = useSite();
  const { v, set, sent, setSent, setLeadId, reset } = useFormState('booking');
  const { setForm } = useSite();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  if (sent)
    return (
      <Sent
        text={`Your consultation request${v.preferred_time ? ` for ${v.preferred_time}` : ''} is in. We'll confirm the time by email or WhatsApp shortly.`}
        onAgain={() => (reset(), setSent(false))}
      />
    );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!v.email && !v.phone) return setError('Please add an email or phone number so we can confirm.');
    if (!consent) return setError('Please tick the box so we can contact you.');
    setBusy(true);
    try {
      const d = await submitForm('booking', { ...v, consent: 'yes' });
      setLeadId(d.leadId);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const quick = ['Tomorrow morning', 'Tomorrow afternoon', 'This week', 'Next week'];
  return (
    <form data-form="booking" aria-label="Consultation booking form" onSubmit={onSubmit} className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
      <Field label="Your name *">
        <input name="name" required autoComplete="name" value={v.name ?? ''} onChange={set('name')} className="field" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" autoComplete="email" value={v.email ?? ''} onChange={set('email')} className="field" />
      </Field>
      <Field label="Phone / WhatsApp">
        <input name="phone" type="tel" autoComplete="tel" value={v.phone ?? ''} onChange={set('phone')} className="field" />
      </Field>
      <Field label="Topic">
        <select name="service" value={v.service ?? ''} onChange={set('service')} className="field">
          <option value="">General consultation</option>
          {ws.services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <div className={compact ? '' : 'sm:col-span-2'}>
        <Field label="Preferred day & time *">
          <input name="preferred_time" required value={v.preferred_time ?? ''} onChange={set('preferred_time')} className="field" placeholder="e.g. Thursday 3pm" />
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => setForm('booking', { preferred_time: q })} className="chip hover:border-brand2/40 hover:text-white">
              {q}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-white/45">
          {ws.booking.durationMin} min · {ws.booking.meetingType} · {ws.booking.availability}
        </p>
      </div>
      <Field label="Anything we should know?" className={compact ? '' : 'sm:col-span-2'}>
        <textarea name="message" rows={3} value={v.message ?? ''} onChange={set('message')} className="field resize-y" />
      </Field>
      <label data-ai="off" className={`flex items-start gap-2.5 text-[13px] text-white/65 ${compact ? '' : 'sm:col-span-2'}`}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand-2))]" />
        I agree that {ws.brand.name} may contact me to arrange this consultation.
      </label>
      {error && (
        <p className={`rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-200 ${compact ? '' : 'sm:col-span-2'}`} role="alert">
          {error}
        </p>
      )}
      <div className={compact ? '' : 'sm:col-span-2'}>
        <button disabled={busy} className="btn-primary w-full !py-3">
          <Icon name="calendar" className="h-4 w-4" /> {busy ? 'Requesting…' : 'Request consultation'}
        </button>
      </div>
    </form>
  );
}

export function ContactSection() {
  const { ws, setAssistantOpen } = useSite();
  const b = ws.brand;
  return (
    <Section id="contact" sectionKey="contact" label="Contact">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <aside className="card flex flex-col gap-5 p-7">
          <h3 className="font-head text-[20px] font-bold text-white">Talk to a human, or to {ws.assistant.name}</h3>
          <p className="text-[14.5px] leading-relaxed text-white/60">Prefer talking? Tap the assistant and say what you need. It can fill this form for you and book a consultation.</p>
          {(ws.features.voice || ws.features.textChat) && (
            <button type="button" onClick={() => setAssistantOpen(true)} className="btn-ghost w-fit">
              <Icon name="mic" className="h-4 w-4 text-brand2" /> Talk to {ws.assistant.name}
            </button>
          )}
          <ul className="mt-2 space-y-3 text-[14px] text-white/75">
            {b.email && (
              <li className="flex items-center gap-3">
                <Icon name="mail" className="h-4 w-4 text-brand2" />
                <a href={`mailto:${b.email}`}>{b.email}</a>
              </li>
            )}
            {b.phone && (
              <li className="flex items-center gap-3">
                <Icon name="phone" className="h-4 w-4 text-brand2" />
                {b.phone}
              </li>
            )}
            {b.hours && (
              <li className="flex items-center gap-3">
                <Icon name="clock" className="h-4 w-4 text-brand2" />
                {b.hours}
              </li>
            )}
            {b.address && (
              <li className="flex items-start gap-3">
                <Icon name="map" className="mt-0.5 h-4 w-4 text-brand2" />
                {b.address}
              </li>
            )}
          </ul>
        </aside>
        <div className="card p-6 sm:p-8">
          <ContactForm />
        </div>
      </div>
    </Section>
  );
}
