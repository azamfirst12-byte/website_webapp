'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { useSite, pagePath } from '../site/SiteProvider';
import { filterServices } from '../site/Services';
import { filterWork } from '../site/Blocks';
import { planPrice } from '../site/Pricing';
import { trackEvent } from '../site/track';
import { ACTION_LABEL } from '@/lib/tool-defs';
import { money } from '@/lib/format';
import type { ActionName } from '@/lib/workspace-types';
import { clickElement, closeTopPopup, readPageText, readScreen, settle } from './dom-control';
import { findItem, highlight, scrollSettled, sectionsInView, textOf, visibleItems, visibleText, waitFor } from './view';

export type ToolResult = Record<string, unknown> & { ok?: boolean; error?: string };
type Args = Record<string, unknown>;

export interface EngineHooks {
  channel: () => 'voice' | 'text';
  conversationId: () => string | null;
  /** Shows a message (optionally with a button) in the chat panel. */
  notice: (text: string, action?: { label: string; href: string }) => void;
  /** Appends a line to the conversation transcript (quiet = saved but not shown). */
  logAction: (line: string, ok: boolean, quiet: boolean) => void;
  panel: (action: 'minimize' | 'expand' | 'mute_mic' | 'unmute_mic' | 'clear_chat') => ToolResult;
}

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

async function post<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error || `Request failed (${r.status})`);
  return d as T;
}

/**
 * The website action layer: translates the assistant's structured function calls into safe,
 * predefined website actions, with visual feedback and analytics. Nothing outside this list runs.
 */
export function useActionEngine(hooks: EngineHooks) {
  const site = useSite();
  const router = useRouter();
  const latest = useRef(site);
  latest.current = site;
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const pendingQual = useRef<Record<string, unknown>>({});

  const navigate = useCallback(
    async (path: string) => {
      const target = path.split('#')[0].split('?')[0] || '/';
      if (location.pathname === target) return true;
      router.push(path);
      const ok = await waitFor(() => location.pathname === target, 5000);
      await waitFor(() => document.querySelector('main [data-section]'), 3000);
      await settle(250);
      return !!ok;
    },
    [router],
  );

  /** Page that holds a section id, per Developer › Actions (falls back to the home page). */
  const pageOfSection = useCallback((id: string) => {
    const ws = latest.current.ws;
    const m = ws.actions.sections.find((s) => s.id === id);
    if (m) return pagePath(ws, m.page);
    if (id === 'compare') return pagePath(ws, 'pricing');
    return '/';
  }, []);

  const ensureSection = useCallback(
    async (id: string) => {
      let el = document.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]`);
      if (!el) {
        await navigate(pageOfSection(id));
        el = await waitFor(() => document.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]`), 3000);
      }
      return el;
    },
    [navigate, pageOfSection],
  );

  /** Makes sure an item (plan:x, service:x, case:x, faq:x, testimonial:x) is on screen, navigating if needed. */
  const ensureItem = useCallback(
    async (target: string) => {
      let el = findItem(target);
      if (el) return el;
      const type = target.split(':')[0];
      const pageFor: Record<string, string> = {
        plan: document.querySelector('[data-section="pricing"]') ? location.pathname : pagePath(latest.current.ws, 'pricing'),
        service: pagePath(latest.current.ws, 'services'),
        case: pagePath(latest.current.ws, 'work'),
        testimonial: '/',
        faq: '/',
        step: '/',
      };
      const path = pageFor[type];
      if (!path) return null;
      if (type === 'service') {
        // Filters might be hiding it.
        latest.current.setServiceIndustry('all');
        latest.current.setServiceCategory('all');
        latest.current.setQuery('');
      }
      if (type === 'case') latest.current.setWorkIndustry('all');
      await navigate(path);
      el = await waitFor(() => findItem(target), 3000);
      return el;
    },
    [navigate],
  );

  const viewContext = useCallback(() => {
    const s = latest.current;
    const inView = sectionsInView();
    return {
      page: location.pathname,
      page_title: (document.querySelector('main h1')?.textContent ?? document.title).trim().slice(0, 120),
      section_in_view: inView[0]?.id ?? null,
      visible_sections: inView.map((x) => x.id).slice(0, 5),
      visible_items: visibleItems().slice(0, 12),
      focused_item: s.focusItem,
      open_popup: s.modal ? `${s.modal.kind}${s.modal.item ? `:${s.modal.item}` : ''}` : null,
      menu_open: s.menu,
      filters: { services_industry: s.serviceIndustry, services_category: s.serviceCategory, services_search: s.query || null, work_industry: s.workIndustry },
      billing: s.billing,
      forms: { contact: s.forms.contact, booking: s.forms.booking },
      lead_saved: !!s.leadId,
    };
  }, []);

  const exec = useCallback(
    async (name: ActionName, args: Args): Promise<ToolResult> => {
      const s = latest.current;
      const ws = s.ws;
      const h = hooksRef.current;
      const cur = ws.pricing.currency;

      switch (name) {
        case 'get_view_context':
          return { ok: true, ...viewContext() };

        case 'navigate_page': {
          const page = str(args.page);
          if (page === 'service') {
            const slug = str(args.slug);
            if (!ws.services.some((x) => x.slug === slug)) return { ok: false, error: `Unknown service "${slug}". Valid: ${ws.services.map((x) => x.slug).join(', ')}` };
            await navigate(`/services/${slug}`);
            return { ok: true, opened: `service ${slug}` };
          }
          const p = ws.pages.find((x) => x.key === page && x.enabled);
          if (!p) return { ok: false, error: `Unknown page "${page}".` };
          await navigate(p.path);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return { ok: true, opened: p.label, sections: sectionsInView().map((x) => x.id) };
        }

        case 'scroll_to_section': {
          const id = str(args.section);
          const el = await ensureSection(id);
          if (!el) return { ok: false, error: `Section "${id}" is not on this site.` };
          highlight(el);
          s.setFocusItem(null);
          await scrollSettled();
          return { ok: true, section: id, page: location.pathname, visible_items: visibleItems().slice(0, 8) };
        }

        case 'scroll_up':
        case 'scroll_down': {
          const amount = str(args.amount) || 'page';
          const dir = name === 'scroll_up' ? -1 : 1;
          if (amount === 'top' || (dir < 0 && amount === 'top')) window.scrollTo({ top: 0, behavior: 'smooth' });
          else if (amount === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          else window.scrollBy({ top: dir * window.innerHeight * (amount === 'little' ? 0.35 : 0.8), behavior: 'smooth' });
          await scrollSettled();
          return { ok: true, now_viewing: sectionsInView()[0]?.id ?? null };
        }

        case 'click_element': {
          const r = await clickElement(str(args.target));
          return r;
        }

        case 'highlight_element': {
          const target = str(args.target);
          const el = await ensureItem(target);
          if (!el) return { ok: false, error: `Nothing matches "${target}". Call get_view_context for item ids.` };
          highlight(el);
          const id = el.dataset.item ?? el.dataset.section ?? target;
          s.setFocusItem(id);
          await scrollSettled();
          return { ok: true, highlighted: id, label: el.dataset.itemLabel ?? null, text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 600) };
        }

        case 'open_modal': {
          const modal = str(args.modal) as 'booking' | 'contact' | 'compare' | 'service';
          if (modal === 'booking' && !ws.features.booking) return { ok: false, error: 'Booking is turned off. Use the contact form instead.' };
          if (modal === 'service') {
            const slug = str(args.item) || s.focusItem?.replace(/^service:/, '') || '';
            if (!ws.services.some((x) => x.slug === slug)) return { ok: false, error: 'Pass item = a service slug.' };
            s.openModal('service', slug);
          } else if (modal === 'compare') {
            if (!s.compare.items.length) s.setCompare({ kind: 'plans', items: ws.pricing.plans.map((p) => p.id) });
            s.openModal('compare');
          } else if (modal === 'booking' || modal === 'contact') s.openModal(modal);
          else return { ok: false, error: 'Unknown popup.' };
          await settle(200);
          return { ok: true, opened: modal };
        }

        case 'close_modal': {
          if (s.modal) {
            const closed = s.modal.kind;
            s.closeModal();
            return { ok: true, closed };
          }
          if (s.menu) {
            s.setMenu(null);
            return { ok: true, closed: 'menu' };
          }
          return closeTopPopup();
        }

        case 'open_menu': {
          const menu = str(args.menu) === 'services' ? 'services' : 'main';
          if (menu === 'services' && isDesktop()) s.setMenu('services');
          else if (!isDesktop()) s.setMenu('main');
          else {
            const nav = document.querySelector<HTMLElement>('header nav');
            if (nav) highlight(nav, false);
            return { ok: true, note: 'On this screen the main menu is always visible at the top; I highlighted it.', items: ws.pages.filter((p) => p.inNav && p.enabled).map((p) => p.label) };
          }
          return { ok: true, opened: menu, items: menu === 'services' ? ws.services.map((x) => x.name) : ws.pages.filter((p) => p.inNav && p.enabled).map((p) => p.label) };
        }

        case 'select_tab': {
          const group = str(args.group);
          const tab = str(args.tab).toLowerCase();
          if (group === 'billing') {
            const b = /year|annual/.test(tab) ? 'annual' : 'monthly';
            if (!document.querySelector('[data-tab-group="billing"]')) await ensureSection('pricing');
            s.setBilling(b);
            const el = document.querySelector<HTMLElement>('[data-tab-group="billing"]')?.parentElement;
            if (el) highlight(el);
            return { ok: true, billing: b, prices: ws.pricing.plans.map((p) => `${p.name}: ${planPrice(ws, p, b) ? `${money(planPrice(ws, p, b)!, cur)}/month` : 'custom'}`) };
          }
          if (group === 'category') {
            const cats = [...new Set(ws.services.map((x) => x.category))];
            const c = tab === 'all' ? 'all' : cats.find((x) => x.toLowerCase() === tab || x.toLowerCase().includes(tab));
            if (!c) return { ok: false, error: `No category "${tab}". Categories: ${cats.join(', ')}` };
            if (!document.querySelector('[data-section="services"]')) await ensureSection('services');
            s.setServiceCategory(c);
            await settle(150);
            const el = document.querySelector<HTMLElement>('[data-section="services"]');
            if (el) highlight(el);
            return { ok: true, category: c, services: filterServices(ws, s.serviceIndustry, c, '').map((x) => x.name) };
          }
          const el = document.querySelector<HTMLElement>(`[data-tab-group="${CSS.escape(group)}"][data-tab="${CSS.escape(tab)}"]`);
          if (!el) return { ok: false, error: 'No such tab on this page. Use read_screen.' };
          el.click();
          return { ok: true, selected: tab };
        }

        case 'filter_content': {
          const collection = str(args.collection) === 'work' ? 'work' : 'services';
          const industry = str(args.industry) || 'all';
          if (industry !== 'all' && !ws.industries.some((i) => i.key === industry)) return { ok: false, error: `Unknown industry. Use one of: ${ws.industries.map((i) => i.key).join(', ')}` };
          const label = ws.industries.find((i) => i.key === industry)?.label ?? 'all industries';
          if (collection === 'services') {
            s.setServiceIndustry(industry);
            s.setServiceCategory('all');
            const el = await ensureSection('services');
            if (el) highlight(el);
            const list = filterServices(ws, industry, 'all', '');
            return { ok: true, showing: `${list.length} services for ${label}`, services: list.map((x) => ({ slug: x.slug, name: x.name, from: money(x.startingPrice, cur) })) };
          }
          s.setWorkIndustry(industry);
          const el = await ensureSection('work');
          if (el) highlight(el);
          return { ok: true, showing: `examples for ${label}`, examples: filterWork(ws, industry).map((c) => `${c.client}: ${c.title}${c.sample ? ' (sample)' : ''}`) };
        }

        case 'search_content': {
          const query = str(args.query, 80);
          const collection = str(args.collection) || 'all';
          const services = filterServices(ws, 'all', 'all', query);
          const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
          const faq = ws.faq.filter((f) => words.some((w) => `${f.q} ${f.a}`.toLowerCase().includes(w)));
          const work = filterWork(ws, 'all', query);
          if (collection === 'faq' || (collection === 'all' && !services.length && faq.length)) {
            const sec = await ensureSection('faq');
            const first = faq[0] && (document.getElementById(faq[0].id) as HTMLDetailsElement | null);
            if (first) {
              first.open = true;
              highlight(first);
            } else if (sec) highlight(sec);
          } else if (collection === 'work') {
            s.setWorkIndustry('all');
            const el = await ensureSection('work');
            const first = work[0] && findItem(`case:${work[0].slug}`);
            if (first) highlight(first);
            else if (el) highlight(el);
          } else {
            s.setServiceIndustry('all');
            s.setServiceCategory('all');
            s.setQuery(query);
            await navigate(pagePath(ws, 'services'));
            const box = await waitFor(() => document.querySelector<HTMLElement>('[data-search="services"]'), 2000);
            if (box) highlight(box);
          }
          return {
            ok: true,
            services: services.slice(0, 6).map((x) => x.name),
            faq: faq.slice(0, 4).map((f) => ({ q: f.q, a: f.a })),
            examples: work.slice(0, 4).map((c) => c.title),
          };
        }

        case 'fill_form': {
          const form = str(args.form) === 'booking' ? 'booking' : 'contact';
          const raw = (args.fields && typeof args.fields === 'object' ? args.fields : {}) as Record<string, unknown>;
          const fields: Record<string, string> = {};
          for (const [k, v] of Object.entries(raw)) {
            if (typeof v !== 'string' || !v.trim()) continue;
            if (['password', 'card', 'cvv'].some((x) => k.toLowerCase().includes(x))) continue;
            fields[k === 'notes' ? 'message' : k] = v.trim().slice(0, 1000);
          }
          if (fields.service && !ws.services.some((x) => x.slug === fields.service)) {
            const m = ws.services.find((x) => x.name.toLowerCase().includes(fields.service.toLowerCase()));
            if (m) fields.service = m.slug;
            else delete fields.service;
          }
          if (form === 'booking' && !ws.features.booking) return { ok: false, error: 'Booking is turned off; use the contact form.' };
          const visibleForm = Array.from(document.querySelectorAll<HTMLElement>(`form[data-form="${form}"]`)).find((f) => {
            const r = f.getBoundingClientRect();
            return r.bottom > 0 && r.top < window.innerHeight;
          });
          if (!visibleForm) s.openModal(form);
          s.setFormSent(form, false);
          s.setForm(form, fields);
          const el = await waitFor(() => document.querySelector<HTMLElement>(`form[data-form="${form}"]`), 1500);
          if (el) highlight(el, !!visibleForm);
          return { ok: true, form, filled: Object.keys(fields), note: 'Not submitted. The visitor ticks the consent box and presses the button, or you save with submit_lead / request_booking after they agree.' };
        }

        case 'submit_lead': {
          if (args.consent !== true) return { ok: false, error: 'Ask the visitor whether they agree to be contacted first, then call again with consent=true.' };
          const body = { ...pendingQual.current, ...args, conversationId: h.conversationId(), channel: h.channel() };
          const d = await post<{ leadId: number; created: boolean }>('/api/crm/lead', body);
          s.setLeadId(d.leadId);
          const contact: Record<string, string> = {};
          for (const k of ['name', 'email', 'phone', 'company']) if (typeof args[k] === 'string' && args[k]) contact[k] = String(args[k]);
          if (Object.keys(contact).length) s.setForm('booking', contact);
          return { ok: true, saved: d.created ? 'new lead created' : 'lead updated', note: 'Tell the visitor their details were saved and what happens next.' };
        }

        case 'request_booking': {
          if (!ws.features.booking) return { ok: false, error: 'Booking is turned off.' };
          const body = { ...pendingQual.current, ...args, conversationId: h.conversationId(), channel: h.channel() };
          const d = await post<{ appointmentId: number; leadId: number }>('/api/crm/booking', body);
          s.setLeadId(d.leadId);
          const f: Record<string, string> = { preferred_time: str(args.preferred_time, 120) };
          for (const k of ['name', 'email', 'phone', 'service']) if (typeof args[k] === 'string' && args[k]) f[k] = String(args[k]);
          if (args.notes) f.message = str(args.notes, 500);
          s.setForm('booking', f);
          s.setFormSent('booking', true);
          s.openModal('booking');
          return { ok: true, requested: true, preferred_time: args.preferred_time, note: 'Confirmation is shown on screen. The team confirms the exact time by email/WhatsApp.' };
        }

        case 'read_content': {
          const scope = str(args.scope) || 'visible';
          const target = str(args.target);
          if (scope === 'page') return { ok: true, ...readPageText(3000) };
          if ((scope === 'section' || scope === 'item') && target) {
            const t = textOf(target);
            return t ? { ok: true, target, text: t } : { ok: false, error: `Nothing matches "${target}".` };
          }
          return { ok: true, page: location.pathname, sections: sectionsInView().map((x) => x.id).slice(0, 3), items: visibleItems().slice(0, 8), text: visibleText() };
        }

        case 'compare_items': {
          const kind = str(args.kind) === 'services' ? 'services' : 'plans';
          let ids = (Array.isArray(args.items) ? args.items : []).map((x) => String(x).replace(/^(plan|service):/, ''));
          if (!ids.length) {
            const vis = visibleItems(0.2).filter((i) => i.type === (kind === 'plans' ? 'plan' : 'service'));
            ids = vis.map((v) => v.id.split(':')[1]);
          }
          if (kind === 'plans') {
            ids = ids.filter((i) => ws.pricing.plans.some((p) => p.id === i));
            if (ids.length < 2) ids = ws.pricing.plans.map((p) => p.id);
            s.setCompare({ kind, items: ids });
            s.openModal('compare');
            const plans = ws.pricing.plans.filter((p) => ids.includes(p.id));
            return {
              ok: true,
              billing: s.billing,
              plans: plans.map((p) => ({
                id: p.id,
                name: p.name,
                price: planPrice(ws, p, s.billing) ? `${money(planPrice(ws, p, s.billing)!, cur)}/month` : 'custom',
                setup: p.setupFee ? money(p.setupFee, cur) : null,
                best_for: p.bestFor,
                features: p.features,
              })),
              differences: ws.pricing.comparison.map((r) => `${r.feature}: ${plans.map((p) => `${p.name} ${r.values[p.id] ?? '—'}`).join(' | ')}`),
            };
          }
          ids = ids.filter((i) => ws.services.some((x) => x.slug === i));
          if (ids.length < 2) return { ok: false, error: 'Pass 2–4 service slugs to compare.' };
          s.setCompare({ kind, items: ids.slice(0, 4) });
          s.openModal('compare');
          return {
            ok: true,
            services: ws.services.filter((x) => ids.includes(x.slug)).map((x) => ({ name: x.name, from: `${money(x.startingPrice, cur)} ${x.priceUnit}`, timeline: x.timeline, features: x.features })),
          };
        }

        case 'read_screen':
          return readScreen(str(args.filter) || undefined);

        case 'go_back':
          router.back();
          await settle(500);
          return { ok: true, page: location.pathname };

        case 'qualify_lead': {
          const q: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(args)) if (v !== undefined && v !== null && v !== '') q[k] = v;
          pendingQual.current = { ...pendingQual.current, ...q };
          await post('/api/crm/qualify', { ...q, conversationId: h.conversationId(), channel: h.channel() }).catch(() => {});
          return { ok: true, recorded: Object.keys(q) };
        }

        case 'record_intent':
          await post('/api/crm/intent', { category: str(args.category), question: str(args.question, 200), conversationId: h.conversationId(), channel: h.channel() }).catch(() => {});
          return { ok: true };

        case 'request_human_handoff': {
          const d = await post<{ whatsapp: string | null; email: string; phone: string }>('/api/crm/handoff', {
            reason: str(args.reason, 300),
            urgency: str(args.urgency) || 'normal',
            conversationId: h.conversationId(),
            channel: h.channel(),
          });
          if (d.whatsapp) h.notice('A team member will take it from here. Tap to continue on WhatsApp:', { label: 'Message us on WhatsApp', href: d.whatsapp });
          else h.notice(`Our team has been notified. You can also reach us at ${d.email}${d.phone ? ` or ${d.phone}` : ''}.`);
          return { ok: true, team_notified: true, whatsapp_button_shown: !!d.whatsapp };
        }

        case 'assistant_panel':
          return hooksRef.current.panel(str(args.action) as Parameters<EngineHooks['panel']>[0]);

        default:
          return { ok: false, error: `Unknown action ${name}` };
      }
    },
    [ensureItem, ensureSection, navigate, router, viewContext],
  );

  /** Runs one function call: permission check, visual feedback, analytics, transcript. */
  return useCallback(
    async (name: string, args: Args): Promise<ToolResult> => {
      const s = latest.current;
      const allowed = s.ws.assistant.allowedActions as string[];
      if (!allowed.includes(name)) return { ok: false, error: `Action "${name}" is not enabled for this website.` };
      const action = name as ActionName;
      const quiet = action === 'get_view_context' || action === 'read_screen' || action === 'record_intent' || action === 'qualify_lead';
      if (!quiet) s.showAction(ACTION_LABEL[action] ?? name);
      let result: ToolResult;
      try {
        result = await exec(action, args);
      } catch (e) {
        result = { ok: false, error: (e as Error).message };
      }
      const ok = result.ok !== false && !result.error;
      if (!quiet && !ok) s.showAction(`Couldn't: ${(ACTION_LABEL[action] ?? name).toLowerCase()}`, false);
      const argSummary = Object.entries(args)
        .filter(([k]) => !['email', 'phone', 'name'].includes(k))
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 40)}`)
        .join(', ');
      hooksRef.current.logAction(`${name}(${argSummary})`, ok, quiet);
      trackEvent({ type: 'action', name, ok, channel: hooksRef.current.channel(), conversationId: hooksRef.current.conversationId(), meta: ok ? {} : { error: String(result.error ?? '').slice(0, 160) } });
      return result;
    },
    [exec],
  );
}
