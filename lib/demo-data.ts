import 'server-only';
import crypto from 'node:crypto';
import type { Db } from './db';
import { computeScore } from './scoring';
import type { WorkspaceConfig } from './workspace-types';

/**
 * Demo data (brief §12): ~60 days of visitors, AI conversations (voice + text), leads across the
 * whole pipeline, consultations, tasks, activity timelines, notifications and analytics events.
 *
 * Every row has is_demo = TRUE (demo staff too), people use @demo.example emails and +1 555-01xx
 * numbers, so "Remove demo data" deletes exactly these rows and never touches real ones.
 */

const DAY = 86_400_000;
const DAYS = 60;

// Deterministic random so every load has the same shape.
let seedState = 20260929;
function rnd() {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;
function weighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[pairs.length - 1][0];
}
const rid = (n = 12) => crypto.randomBytes(n).toString('base64url').slice(0, n);
/** Multi-row INSERT buffer: thousands of demo rows in a handful of round trips (fast on Neon cold starts). */
class Batch {
  private rows: unknown[][] = [];
  constructor(
    private db: Db,
    private head: string,
    private placeholders: string,
  ) {}
  async add(...values: unknown[]) {
    this.rows.push(values);
    if (this.rows.length >= 300) await this.flush();
  }
  async flush() {
    if (!this.rows.length) return;
    const rows = this.rows.splice(0);
    await this.db.exec(`${this.head} VALUES ${rows.map(() => `(${this.placeholders})`).join(', ')}`, rows.flat());
  }
}

/** A time in the last DAYS days, weighted towards recent days, during daytime (UTC+5-ish). */
function when(maxDaysAgo = DAYS, minDaysAgo = 0) {
  const d = minDaysAgo + Math.floor(Math.pow(rnd(), 1.35) * (maxDaysAgo - minDaysAgo));
  const base = Date.now() - d * DAY;
  const day = new Date(base);
  day.setUTCHours(int(4, 16), int(0, 59), int(0, 59), 0);
  return Math.min(day.getTime(), Date.now() - int(5, 120) * 60_000);
}

const FIRST = ['Ayesha', 'Daniel', 'Sofia', 'Hamza', 'Elena', 'Omar', 'Priya', 'Lucas', 'Zainab', 'Mateo', 'Hannah', 'Bilal', 'Chloe', 'Yusuf', 'Mei', 'Arjun', 'Laura', 'Farah', 'Noah', 'Sana', 'Ibrahim', 'Grace', 'Tariq', 'Ines', 'Kenji', 'Maya', 'Ahmed', 'Clara', 'Rehan', 'Julia'];
const LAST = ['Khan', 'Morgan', 'Alvarez', 'Siddiqui', 'Novak', 'Haddad', 'Raman', 'Becker', 'Malik', 'Rossi', 'Fischer', 'Qureshi', 'Dubois', 'Ozturk', 'Chen', 'Mehta', 'Silva', 'Hussain', 'Wright', 'Farooq', 'Tanaka', 'Lopez', 'Iqbal', 'Moreau', 'Park', 'Ansari'];
const COMPANIES: Record<string, string[]> = {
  fitness: ['Iron Temple Gym', 'FlowState Yoga', 'CoreLab Fitness', 'Peak Performance Studio'],
  ecommerce: ['Threadline Apparel', 'Nook & Clay Home', 'GreenLeaf Organics', 'Kicks District'],
  healthcare: ['Lumen Skin Clinic', 'CarePoint Physio', 'Smile Studio Dental', 'Harmony Wellness Center'],
  'real-estate': ['Skyline Properties', 'Bayview Realty', 'Crescent Homes', 'Metro Lettings'],
  hospitality: ['Saffron House', 'The Daily Grind Café', 'Olive & Ember', 'Coastline Catering'],
  professional: ['Mirza & Co Accountants', 'Northgate Legal', 'Brightpath Consulting', 'Apex HR Partners'],
  education: ['Future Minds Academy', 'LinguaPro Institute', 'CodeCamp Karachi', 'Scholars Tutoring'],
  saas: ['Tasklane', 'Billwise', 'Rostery', 'Datanest'],
};
const NEEDS: Record<string, string[]> = {
  fitness: ['Online class booking and membership sign-ups', 'Let people book a free trial by voice from the website', 'A website that sells personal training packages'],
  ecommerce: ['Move from Instagram DMs to a proper WooCommerce store', 'Product finder assistant to reduce returns', 'Faster store with abandoned cart follow-up'],
  healthcare: ['Consultation requests without phone calls', 'Treatment pages with prices and an assistant for FAQs', 'Patient enquiries in Urdu and English'],
  'real-estate': ['Qualify buyers by budget and area before agents call', 'Listings site with voice search', 'CRM for agents with automatic follow-ups'],
  hospitality: ['Catering enquiry form and menu assistant', 'Table bookings and events page', 'Multilingual menu questions'],
  professional: ['Lead capture for tax season', 'Website refresh and a chat assistant for common questions', 'Pipeline for consultation requests'],
  education: ['Course enquiries and trial class booking', 'Parents ask about fees and timings by voice', 'Student portal'],
  saas: ['Demo booking assistant that qualifies by company size', 'Pricing page assistant for plan comparison', 'Onboarding portal'],
};
const SERVICE_BY_INDUSTRY: Record<string, string[]> = {
  fitness: ['ai-voice-web-app', 'business-website', 'ecommerce-store'],
  ecommerce: ['ecommerce-store', 'ai-sales-assistant', 'seo-growth'],
  healthcare: ['ai-sales-assistant', 'business-website', 'ai-voice-web-app'],
  'real-estate': ['ai-sales-assistant', 'crm-automation', 'ai-voice-web-app'],
  hospitality: ['ai-voice-web-app', 'business-website'],
  professional: ['crm-automation', 'business-website', 'seo-growth'],
  education: ['custom-web-app', 'ai-voice-web-app', 'business-website'],
  saas: ['ai-sales-assistant', 'custom-web-app', 'crm-automation'],
};
const BUDGETS = ['$1,000 – $3,000', '$3,000 – $7,500', '$7,500 – $15,000', 'Under $1,000', '$15,000+'];
const TIMELINES = ['As soon as possible', 'Within 1 month', '1–3 months', '3–6 months', 'Just exploring'];
const SIZES = ['Just me', '2–10', '11–50', '51–200'];
const TIMES = ['Tomorrow at 11am', 'Thursday afternoon', 'Monday 3pm', 'Saturday morning', 'Next Tuesday 5pm', 'Wednesday 12:30'];
const LOST = ['Chose a cheaper freelancer', 'Budget postponed to next quarter', 'No response after proposal'];

const COMMANDS: [string, string, string, number][] = [
  ['Scroll down.', 'scroll_down', 'Scrolling down.', 12],
  ['Open the services section.', 'scroll_to_section(services)', 'Here are our services.', 10],
  ['Show me customer reviews.', 'scroll_to_section(testimonials)', 'Here is what clients say.', 9],
  ['What am I looking at right now?', 'read_content(visible)', 'This is our pricing section with four plans, from Starter to Enterprise.', 7],
  ['Open the contact form.', 'open_modal(contact)', 'The contact form is open.', 6],
  ['Show me only services for e-commerce businesses.', 'filter_content(services, ecommerce)', 'These are the services we recommend for e-commerce.', 7],
  ['Go to the pricing page.', 'navigate_page(pricing)', 'Here is the pricing page.', 9],
  ['Switch to annual billing.', 'select_tab(billing, annual)', 'Annual prices are showing now.', 5],
  ['Tell me more about the second option.', 'highlight_element(plan:growth)', 'The second option is Growth, our most popular plan.', 6],
  ['Search for WooCommerce.', 'search_content(woocommerce)', 'I found our e-commerce store service.', 4],
  ['Open the menu.', 'open_menu(main)', 'The menu is open.', 3],
  ['Close that.', 'close_modal', 'Closed.', 4],
  ['Scroll up.', 'scroll_up', 'Scrolling up.', 4],
  ['Show me the FAQ.', 'scroll_to_section(faq)', 'Here are the most common questions.', 5],
  ['Click see pricing.', 'click_element(See pricing)', 'Done.', 3],
  ['Show me your work.', 'navigate_page(work)', 'Here are some example projects.', 5],
];
const QUESTIONS: [string, string, number][] = [
  ['pricing', 'How much does it cost?', 20],
  ['pricing', 'What is the difference between Growth and Scale?', 10],
  ['services', 'Can you add this to my existing WordPress site?', 12],
  ['timeline', 'How long does it take to launch?', 11],
  ['booking', 'Can I book a call this week?', 9],
  ['technical', 'Does it understand Urdu?', 8],
  ['portfolio', 'Do you have examples in my industry?', 8],
  ['comparison', 'Which plan is better for a small business?', 9],
  ['support', 'What happens after launch?', 5],
  ['technical', 'Does it work with WooCommerce?', 6],
  ['contact', 'Can I talk to someone on WhatsApp?', 4],
];
const PAGES = ['/', '/', '/', '/services', '/pricing', '/pricing', '/work', '/about', '/contact', '/services/ai-voice-web-app', '/services/ecommerce-store'];
const SECTIONS = ['hero', 'services', 'pricing', 'testimonials', 'faq', 'contact', 'work', 'process'];

const DEMO_STAFF = [
  { username: 'demo.sara', full_name: 'Sara Ahmed (demo)', role: 'sales' },
  { username: 'demo.bilal', full_name: 'Bilal Khan (demo)', role: 'sales' },
  { username: 'demo.emma', full_name: 'Emma Wright (demo)', role: 'manager' },
];

type Stage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
const STAGE_PLAN: Stage[] = [
  ...Array<Stage>(6).fill('new'),
  ...Array<Stage>(6).fill('contacted'),
  ...Array<Stage>(3).fill('qualified'),
  ...Array<Stage>(4).fill('proposal'),
  ...Array<Stage>(3).fill('negotiation'),
  ...Array<Stage>(4).fill('won'),
  ...Array<Stage>(3).fill('lost'),
];
const ORDER: Stage[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won'];

function transcript(opts: { industry: string; company: string; service: string; serviceName: string; name: string; email: string; phone: string; booked: boolean; lead: boolean; handoff: boolean; assistant: string; start: number }) {
  const lines: { role: 'user' | 'ai' | 'action'; text: string; at: number; ok?: boolean }[] = [];
  let t = opts.start;
  const say = (role: 'user' | 'ai' | 'action', text: string, ok?: boolean) => {
    t += int(4, 25) * 1000;
    lines.push({ role, text, at: t, ...(ok === undefined ? {} : { ok }) });
  };
  const need = pick(NEEDS[opts.industry] ?? NEEDS.professional);
  say('ai', `Hi, I'm ${opts.assistant}. You can talk to me or to this website. What kind of business are you growing?`);
  say('user', `Hi, I run ${opts.company}. ${need}.`);
  say('action', 'record_intent(services)', true);
  say('action', `scroll_to_section(services)`, true);
  say('ai', `Got it. For that, most businesses like yours start with our ${opts.serviceName}. I've highlighted it on the screen.`);
  say('action', `highlight_element(service:${opts.service})`, true);
  if (chance(0.7)) {
    say('user', pick(['How much does it cost?', 'What would this cost roughly?', 'Show me your pricing.']));
    say('action', 'record_intent(pricing)', true);
    say('action', 'scroll_to_section(pricing)', true);
    say('ai', 'Here are our plans. Most growing businesses pick Growth at 349 dollars a month plus a one-time setup; annual billing saves 20 percent.');
    if (chance(0.5)) {
      say('user', 'Highlight the differences between these plans.');
      say('action', 'compare_items(plans)', true);
      say('ai', 'The main differences are voice minutes, staff seats and booking: Growth adds lead scoring, consultation booking and WhatsApp hand-over.');
    }
  }
  for (let k = int(0, 3); k > 0; k--) {
    const [phrase, action, reply] = weighted(COMMANDS.map((c) => [c, c[3]] as [[string, string, string, number], number]));
    const ok = !chance(0.07);
    say('user', phrase);
    say('action', action, ok);
    say('ai', ok ? reply : 'Sorry, I could not do that. Could you say it another way?');
  }
  if (chance(0.12)) {
    say('user', 'Open the case studies for my industry.');
    say('action', `filter_content(work, ${opts.industry})`, false);
    say('ai', 'Sorry, that filter did not work. Let me open the examples page instead.');
    say('action', 'navigate_page(work)', true);
  }
  say('ai', 'When would you like to launch, and do you have a budget range in mind?');
  say('user', `${pick(['Ideally within a month', 'In the next two or three months', 'As soon as possible', 'No rush, maybe in a few months'])}, budget around ${pick(BUDGETS)}.`);
  say('action', 'qualify_lead', true);
  if (opts.lead) {
    say('ai', 'Would you like our team to prepare a plan for you? I just need your name and an email or phone number.');
    say('user', `Sure, I'm ${opts.name}, ${opts.email}, and my number is ${opts.phone}.`);
    say('ai', `Thanks ${opts.name.split(' ')[0]}. Just to confirm, that's ${opts.email}?`);
    say('user', 'Yes, that is right.');
    say('action', 'submit_lead', true);
  }
  if (opts.booked) {
    say('ai', 'Would you like a free 30-minute consultation to see a live demo for your business?');
    say('user', `Yes, ${pick(TIMES).toLowerCase()} works for me.`);
    say('action', 'open_modal(booking)', true);
    say('action', 'fill_form(booking)', true);
    say('action', 'request_booking', true);
    say('ai', 'Done. I have requested your consultation; the team will confirm the time by email shortly.');
  } else if (opts.handoff) {
    say('user', 'Can I just talk to a person on WhatsApp?');
    say('action', 'request_human_handoff', true);
    say('ai', 'Of course. I have let the team know; you can also message us on WhatsApp and a human will reply shortly.');
  } else {
    say('user', pick(['Thanks, I will think about it.', 'Great, that helps. Thank you!', 'OK, I will discuss it with my partner.']));
    say('ai', 'Happy to help. You can talk to me again any time on this website.');
  }
  return lines;
}

export async function removeDemoData(db: Db) {
  const counts: Record<string, number> = {};
  for (const t of ['notifications', 'events', 'integration_logs', 'tasks', 'appointments', 'activities', 'conversations', 'leads', 'visitors']) {
    if (t === 'integration_logs') continue;
    counts[t] = await db.exec(`DELETE FROM ${t} WHERE is_demo`);
  }
  counts.staff = await db.exec(`DELETE FROM admin_users WHERE is_demo`);
  return counts;
}

export async function demoCounts(db: Db, workspaceId: string) {
  const r = await db.one<Record<string, number>>(
    `SELECT (SELECT COUNT(*) FROM visitors WHERE is_demo AND workspace_id=?) AS visitors,
            (SELECT COUNT(*) FROM conversations WHERE is_demo AND workspace_id=?) AS conversations,
            (SELECT COUNT(*) FROM leads WHERE is_demo AND workspace_id=?) AS leads,
            (SELECT COUNT(*) FROM appointments WHERE is_demo AND workspace_id=?) AS appointments`,
    [workspaceId, workspaceId, workspaceId, workspaceId],
  );
  const out = { visitors: Number(r?.visitors ?? 0), conversations: Number(r?.conversations ?? 0), leads: Number(r?.leads ?? 0), appointments: Number(r?.appointments ?? 0) };
  return { ...out, present: out.visitors + out.leads + out.conversations > 0 };
}

/** Loads (or reloads) the demo data set into a workspace. */
export async function loadDemoData(db: Db, ws: string, config: WorkspaceConfig) {
  seedState = 20260929;
  await removeDemoData(db);
  const assistant = config.assistant.name || 'Nova';
  const services = new Map(config.services.map((s) => [s.slug, s]));
  const serviceFor = (industry: string) => {
    const opts = (SERVICE_BY_INDUSTRY[industry] ?? []).filter((s) => services.has(s));
    return opts.length ? pick(opts) : (config.services[0]?.slug ?? null);
  };
  const industries = config.industries.map((i) => i.key).filter((k) => COMPANIES[k]);
  const allIndustries = industries.length ? industries : Object.keys(COMPANIES);
  const stageKeys = new Set(config.crm.stages.map((s) => s.key));
  const stageOf = (s: Stage) => (stageKeys.has(s) ? s : (config.crm.stages[0]?.key ?? 'new'));

  // ── demo staff (cannot sign in: password hash is not a valid scrypt hash)
  const staffIds: number[] = [];
  for (const s of DEMO_STAFF) {
    const r = await db.one<{ id: number }>(
      `INSERT INTO admin_users (username, email, full_name, role, password_hash, is_demo) VALUES (?, ?, ?, ?, '!demo-account-cannot-sign-in', TRUE)
       ON CONFLICT ((lower(username))) DO UPDATE SET is_demo = TRUE RETURNING id`,
      [s.username, `${s.username}@demo.example`, s.full_name, s.role],
    );
    staffIds.push(Number(r!.id));
  }
  const reps = staffIds.slice(0, 2);

  // ── visitors + browsing events
  const nVisitors = 170;
  const visitors: { id: string; first: number; source: string; returning: boolean }[] = [];
  const sources: [string, number][] = [['organic_search', 34], ['direct', 24], ['social', 18], ['paid_ads', 12], ['referral', 9], ['email', 3]];
  let events = 0;
  const evBatch = new Batch(db, `INSERT INTO events (workspace_id, visitor_id, conversation_id, type, name, path, channel, ok, meta, created_at, is_demo)`, '?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, TRUE');
  const visBatch = new Batch(db, `INSERT INTO visitors (id, workspace_id, first_seen, last_seen, visits, source, landing_path, device, is_demo)`, '?, ?, ?, ?, ?, ?, ?, ?, TRUE');
  const actBatch = new Batch(db, `INSERT INTO activities (workspace_id, lead_id, conversation_id, type, title, body, meta, by_user_id, created_at, is_demo)`, '?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, TRUE');
  const taskBatch = new Batch(db, `INSERT INTO tasks (workspace_id, lead_id, title, type, priority, due_at, assigned_to, done_at, created_at, is_demo)`, '?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE');
  const ev = async (e: { type: string; name?: string | null; visitor?: string | null; conv?: string | null; path?: string | null; channel?: string | null; ok?: boolean | null; meta?: Record<string, unknown>; at: number }) => {
    events++;
    await evBatch.add(
      ws,
      e.visitor ?? null,
      e.conv ?? null,
      e.type,
      e.name ?? null,
      e.path ?? null,
      e.channel ?? null,
      e.ok ?? null,
      JSON.stringify(e.meta ?? {}),
      e.at,
    );
  };
  for (let i = 0; i < nVisitors; i++) {
    const id = `demo${rid(10)}`;
    const first = when();
    const returning = chance(0.28);
    const visits = returning ? int(2, 5) : 1;
    const source = weighted(sources);
    const device = weighted([['mobile', 58], ['desktop', 36], ['tablet', 6]] as [string, number][]);
    const landing = pick(PAGES);
    await visBatch.add(id, ws, first, Math.min(Date.now(), first + (visits - 1) * int(1, 6) * DAY), visits, source, landing, device);
    visitors.push({ id, first, source, returning });
    for (let v = 0; v < visits; v++) {
      const at = Math.min(Date.now() - 60_000, first + v * int(1, 5) * DAY);
      const pages = int(1, 5);
      let t = at;
      for (let p = 0; p < pages; p++) {
        const path = p === 0 ? landing : pick(PAGES);
        await ev({ type: 'page_view', visitor: id, path, at: t, meta: { source } });
        if (chance(0.55)) await ev({ type: 'section_view', name: pick(SECTIONS), visitor: id, path, at: t + 8000 });
        if (chance(0.12)) await ev({ type: 'cta_click', name: pick(['Book a free consultation', 'See pricing', 'Choose Growth', 'Talk to us']), visitor: id, path, at: t + 15000 });
        const ms = int(8, 110) * 1000;
        await ev({ type: 'engagement', visitor: id, path, at: t + ms, meta: { ms } });
        t += ms + int(2, 20) * 1000;
      }
    }
  }

  await visBatch.flush();

  // ── leads (stage plan) — some come from conversations, some from forms/other sources
  const leadsPlan = STAGE_PLAN.map((stage, i) => {
    const industry = pick(allIndustries);
    const first = pick(FIRST);
    const last = pick(LAST);
    const company = pick(COMPANIES[industry]);
    const tier = ORDER.indexOf(stage === 'lost' ? 'contacted' : stage);
    const fromConversation = i % 3 !== 2; // two thirds come from the assistant
    const channel: 'voice' | 'text' | null = fromConversation ? (chance(0.64) ? 'voice' : 'text') : null;
    const source = channel === 'voice' ? 'voice_assistant' : channel === 'text' ? 'text_chat' : weighted([['contact_form', 5], ['booking_form', 3], ['referral', 3], ['organic_search', 1], ['paid_ads', 1]] as [string, number][]);
    return {
      stage,
      tier,
      industry,
      name: `${first} ${last}`,
      email: `${first}.${last}${i}@demo.example`.toLowerCase(),
      phone: `+1555010${String(i).padStart(2, '0')}`,
      company,
      service: serviceFor(industry),
      channel,
      source,
      budget: tier >= 2 ? pick(BUDGETS.slice(0, 3).concat(BUDGETS[4])) : chance(0.3) ? pick(['Under $1,000', 'Not sure yet']) : null,
      timeline: tier >= 2 ? pick(TIMELINES.slice(0, 3)) : chance(0.5) ? pick(TIMELINES.slice(2)) : null,
      size: pick(SIZES),
      decision: tier >= 2 ? true : null,
      intent: tier >= 3 ? 'high' : tier === 2 ? (chance(0.5) ? 'medium' : 'high') : chance(0.6) ? 'low' : 'medium',
      hasPhone: tier >= 2 || chance(0.4),
      hasCompany: tier >= 1 || chance(0.5),
      requirements: pick(NEEDS[industry]),
      booked: false,
      created: when(DAYS, stage === 'new' ? 0 : 3),
      customerType: weighted([['small_business', 60], ['mid_market', 18], ['startup', 12], ['enterprise', 4], ['agency', 6]] as [string, number][]),
    };
  });
  // Six consultation requests: completed for won/negotiation, confirmed for proposal, requested for qualified.
  const byStage = (st: Stage, n: number) => leadsPlan.filter((l) => l.stage === st).slice(0, n);
  for (const l of [...byStage('won', 2), ...byStage('negotiation', 1), ...byStage('proposal', 1), ...byStage('qualified', 2)]) l.booked = true;

  let convCount = 0;
  const leadIds: number[] = [];
  for (let i = 0; i < leadsPlan.length; i++) {
    const L = leadsPlan[i];
    const visitor = pick(visitors.filter((v) => v.first <= L.created)) ?? visitors[0];
    const rep = L.stage === 'new' && chance(0.4) ? null : pick(reps);
    const svc = L.service ? services.get(L.service) : undefined;
    const value = Math.round((svc?.startingPrice ?? 1000) * (L.tier >= 3 ? 1 + rnd() * 1.6 : 1));
    const { score, breakdown } = computeScore(
      {
        email: L.email,
        phone: L.hasPhone ? L.phone : null,
        company: L.hasCompany ? L.company : null,
        interested_service: L.service,
        requirements: L.requirements,
        budget: L.budget,
        timeline: L.timeline,
        decision_maker: L.decision,
        intent_level: L.intent,
        booking_requested: L.booked,
        voice_actions: L.channel === 'voice' ? int(3, 9) : 0,
        returning_visitor: visitor.returning,
      },
      config.scoring,
    );
    const stageChanged = Math.min(Date.now() - 3600_000, L.created + int(1, 12) * DAY);
    const nextFollow = ['won', 'lost'].includes(L.stage) ? null : Date.now() + int(-3, 6) * DAY + int(1, 8) * 3600_000;
    const r = await db.one<{ id: number }>(
      `INSERT INTO leads (workspace_id, visitor_id, name, email, phone, company, industry, customer_type, company_size, source, channel, interested_service,
         requirements, budget, timeline, decision_maker, intent_level, score, score_breakdown, stage, value, assigned_to, last_interaction_at, next_follow_up_at,
         summary, next_action, tags, lost_reason, won_at, stage_changed_at, consent, created_at, updated_at, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, TRUE, ?, ?, TRUE) RETURNING id`,
      [
        ws,
        visitor.id,
        L.name,
        L.email,
        L.hasPhone ? L.phone : null,
        L.hasCompany ? L.company : null,
        L.industry,
        L.customerType,
        L.size,
        L.source,
        L.channel ?? 'form',
        L.service,
        L.requirements,
        L.budget,
        L.timeline,
        L.decision,
        L.intent,
        score,
        JSON.stringify(breakdown),
        stageOf(L.stage),
        value,
        rep,
        L.stage === 'new' ? L.created : stageChanged,
        nextFollow,
        `${L.name.split(' ')[0]} from ${L.company} wants: ${L.requirements.toLowerCase()}. ${L.budget ? `Budget ${L.budget}. ` : ''}${L.timeline ? `Timeline: ${L.timeline.toLowerCase()}.` : ''}`,
        L.stage === 'won' ? 'Kick-off call and onboarding checklist' : L.stage === 'lost' ? null : L.tier >= 3 ? 'Follow up on the proposal' : 'Call to confirm requirements and budget',
        JSON.stringify([L.industry, ...(L.intent === 'high' ? ['hot'] : [])]),
        L.stage === 'lost' ? pick(LOST) : null,
        L.stage === 'won' ? stageChanged : null,
        L.stage === 'new' ? L.created : stageChanged,
        L.created,
        stageChanged,
      ],
    );
    const leadId = Number(r!.id);
    leadIds.push(leadId);
    const act = async (type: string, title: string, at: number, body?: string | null, by?: number | null, conv?: string | null, meta: Record<string, unknown> = {}) =>
      actBatch.add(ws, leadId, conv ?? null, type, title, body ?? null, JSON.stringify(meta), by ?? null, at);

    let convId: string | null = null;
    if (L.channel) {
      convId = `demo${rid(10)}`;
      convCount++;
      const start = L.created - int(3, 10) * 60_000;
      const lines = transcript({
        industry: L.industry,
        company: L.company,
        service: L.service ?? '',
        serviceName: svc?.name ?? 'services',
        name: L.name,
        email: L.email,
        phone: L.phone,
        booked: L.booked,
        lead: true,
        handoff: !L.booked && chance(0.12),
        assistant,
        start,
      });
      const acts = lines.filter((x) => x.role === 'action');
      const failed = acts.filter((x) => x.ok === false).length;
      const end = lines[lines.length - 1].at + 5000;
      const outcome = L.booked ? 'booking_requested' : 'lead_captured';
      const summary = {
        summary: `${L.name} (${L.company}) asked about ${svc?.name ?? 'our services'} for their ${L.industry.replace('-', ' ')} business. ${L.budget ? `Budget ${L.budget}; ` : ''}${L.timeline ? `timeline ${L.timeline.toLowerCase()}.` : ''}`,
        intent: L.requirements,
        intent_category: pick(['services', 'pricing', 'booking']),
        service_interest: L.service,
        qualification: { budget: L.budget, timeline: L.timeline, company_size: L.size, decision_maker: L.decision },
        next_actions: [L.booked ? 'Confirm the consultation time' : 'Call to confirm requirements', 'Send a tailored proposal'],
        questions: ['How much does it cost?'],
        sentiment: 'positive',
        outcome,
        intent_level: L.intent,
        language: weighted([['en', 70], ['ur', 20], ['ar', 5], ['es', 5]] as [string, number][]),
        contact: { name: L.name, email: L.email, phone: L.phone, company: L.company },
      };
      await db.exec(
        `INSERT INTO conversations (id, workspace_id, visitor_id, lead_id, channel, status, started_at, last_activity_at, ended_at, transcript, turn_count, action_count, failed_actions,
           summary, intent, intent_category, outcome, success, handoff, language, entry_path, is_demo)
         VALUES (?, ?, ?, ?, ?, 'closed', ?, ?, ?, ?::jsonb, ?, ?, ?, ?::jsonb, ?, ?, ?, TRUE, ?, ?, ?, TRUE)`,
        [
          convId,
          ws,
          visitor.id,
          leadId,
          L.channel,
          start,
          end,
          end,
          JSON.stringify(lines),
          lines.filter((x) => x.role === 'user').length,
          acts.length,
          failed,
          JSON.stringify(summary),
          summary.intent,
          summary.intent_category,
          outcome,
          lines.some((x) => x.text === 'request_human_handoff'),
          summary.language,
          pick(PAGES),
        ],
      );
      await ev({ type: 'conversation_start', name: L.channel, visitor: visitor.id, conv: convId, channel: L.channel, at: start });
      for (const a of acts) {
        const name = a.text.split('(')[0];
        await ev({ type: 'action', name, visitor: visitor.id, conv: convId, channel: L.channel, ok: a.ok ?? true, at: a.at });
      }
      await ev({ type: 'intent', name: 'services', visitor: visitor.id, conv: convId, channel: L.channel, at: start + 20000, meta: { question: 'What do you offer for my business?' } });
      const [cat, qn] = weighted(QUESTIONS.map(([c, qq, w]) => [[c, qq], w] as [[string, string], number]));
      await ev({ type: 'intent', name: cat, visitor: visitor.id, conv: convId, channel: L.channel, at: start + 60000, meta: { question: qn } });
      if (lines.some((x) => x.text === 'request_human_handoff')) await ev({ type: 'handoff', visitor: visitor.id, conv: convId, channel: L.channel, at: end - 10000 });
      await act('ai_summary', `${L.channel === 'voice' ? 'Voice' : 'Chat'} conversation summary`, end + 30000, `${summary.summary}\n\nNext actions:\n${summary.next_actions.map((x) => `• ${x}`).join('\n')}`, null, convId, {
        outcome,
      });
    }
    await ev({ type: 'lead_captured', name: L.source, visitor: visitor.id, conv: convId, channel: L.channel, at: L.created });
    await act('lead_created', `Lead captured via ${L.channel === 'voice' ? 'the voice assistant' : L.channel === 'text' ? 'the chat assistant' : L.source.replace(/_/g, ' ')}`, L.created, null, null, convId);
    if (rep) await act('assignment', 'Assigned automatically (round-robin)', L.created + 1000, null, null, null, { to: rep });

    // Walk the pipeline to the planned stage.
    const path = L.stage === 'lost' ? ORDER.slice(0, 2).concat(['lost' as Stage]) : ORDER.slice(0, L.tier + 1);
    let t = L.created;
    for (let s = 1; s < path.length; s++) {
      t = Math.min(stageChanged, t + int(1, 4) * DAY);
      if (path[s] === 'contacted') await act('call', 'Call logged', t - 600_000, pick(['Discussed goals and current website.', 'Left a voicemail, then spoke on WhatsApp.', 'Walked through the demo on a call.']), rep);
      if (path[s] === 'proposal') await act('email', 'Email logged', t - 600_000, `Sent proposal for ${svc?.name ?? 'the project'}.`, rep);
      const fromLabel = config.crm.stages.find((x) => x.key === path[s - 1])?.label ?? path[s - 1];
      const toLabel = config.crm.stages.find((x) => x.key === path[s])?.label ?? path[s];
      await act('stage_change', `Stage: ${fromLabel} → ${toLabel}`, s === path.length - 1 ? stageChanged : t, L.stage === 'lost' && s === path.length - 1 ? `Reason: ${pick(LOST)}` : null, rep, null, {
        from: path[s - 1],
        to: path[s],
      });
    }

    // Tasks: open follow-up for open leads, done ones for history.
    if (!['won', 'lost'].includes(L.stage)) {
      await taskBatch.add(ws, leadId, L.tier >= 3 ? `Follow up on proposal with ${L.name}` : `Follow up with ${L.name}`, 'follow_up', L.intent === 'high' ? 'high' : 'normal', nextFollow, rep, null, L.created);
    }
    for (let k = 0; k < Math.min(3, L.tier); k++) {
      const due = L.created + (k + 1) * DAY;
      await taskBatch.add(
        ws,
        leadId,
        ['Intro call', 'Send portfolio examples', 'Prepare proposal'][k],
        ['call', 'email', 'follow_up'][k],
        'normal',
        due,
        rep,
        Math.min(Date.now() - 3600_000, due + (chance(0.8) ? -int(1, 10) : int(1, 30)) * 3600_000),
        L.created,
      );
    }

    if (L.booked) {
      const status = L.stage === 'won' || L.stage === 'negotiation' ? 'completed' : L.stage === 'proposal' || L.stage === 'lost' ? 'confirmed' : 'requested';
      const preferred = pick(TIMES);
      const scheduled = status === 'requested' ? null : status === 'completed' ? L.created + int(1, 3) * DAY : Date.now() + int(1, 5) * DAY;
      await db.exec(
        `INSERT INTO appointments (workspace_id, lead_id, conversation_id, topic, service, preferred_time, scheduled_at, duration_min, status, channel, meeting_link, created_at, updated_at, is_demo)
         VALUES (?, ?, ?, 'Free consultation', ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [ws, leadId, convId, L.service, preferred, scheduled, config.booking.durationMin, status, L.channel ?? 'form', status === 'requested' ? null : 'https://meet.example.com/demo-call', L.created + 60000, L.created + 60000],
      );
      await act('booking', `Consultation requested for ${preferred}`, L.created + 60000, null, null, convId);
      await ev({ type: 'booking_request', name: L.service, visitor: visitor.id, conv: convId, channel: L.channel, at: L.created + 60000 });
    }
  }

  // ── conversations that did not become leads (information / browsing)
  const target = 52;
  const voiceTarget = 32;
  const existingVoice = leadsPlan.filter((l) => l.channel === 'voice').length;
  let voiceLeft = Math.max(0, voiceTarget - existingVoice);
  while (convCount < target) {
    const visitor = pick(visitors);
    const channel: 'voice' | 'text' = voiceLeft > 0 && (chance(0.7) || convCount >= target - voiceLeft) ? 'voice' : 'text';
    if (channel === 'voice') voiceLeft--;
    const industry = pick(allIndustries);
    const service = serviceFor(industry) ?? '';
    const start = Math.max(visitor.first, when());
    const handoff = chance(0.07);
    const lines = transcript({
      industry,
      company: pick(COMPANIES[industry]),
      service,
      serviceName: services.get(service)?.name ?? 'services',
      name: '',
      email: '',
      phone: '',
      booked: false,
      lead: false,
      handoff,
      assistant,
      start,
    }).slice(0, chance(0.3) ? int(3, 6) : undefined);
    const acts = lines.filter((x) => x.role === 'action');
    // Some voice commands are not understood at all.
    const unrecognized = channel === 'voice' && chance(0.18) ? 1 : 0;
    const failed = acts.filter((x) => x.ok === false).length + unrecognized;
    const end = lines[lines.length - 1].at + 4000;
    const userTurns = lines.filter((x) => x.role === 'user').length;
    const outcome = handoff ? 'handoff' : userTurns ? 'information' : 'no_engagement';
    const convId = `demo${rid(10)}`;
    const [cat, qn] = weighted(QUESTIONS.map(([c, qq, w]) => [[c, qq], w] as [[string, string], number]));
    await db.exec(
      `INSERT INTO conversations (id, workspace_id, visitor_id, lead_id, channel, status, started_at, last_activity_at, ended_at, transcript, turn_count, action_count, failed_actions,
         summary, intent, intent_category, outcome, success, handoff, language, entry_path, is_demo)
       VALUES (?, ?, ?, NULL, ?, 'closed', ?, ?, ?, ?::jsonb, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        convId,
        ws,
        visitor.id,
        channel,
        start,
        end,
        end,
        JSON.stringify(lines),
        userTurns,
        acts.length + unrecognized,
        failed,
        JSON.stringify({ summary: `Visitor asked: ${qn}`, intent: qn, intent_category: cat, next_actions: [], questions: [qn], sentiment: 'neutral', outcome, intent_level: 'low', language: 'en', contact: {} }),
        qn,
        cat,
        outcome,
        handoff || (userTurns >= 2 && chance(0.7)),
        handoff,
        weighted([['en', 72], ['ur', 18], ['ar', 5], ['hi', 5]] as [string, number][]),
        pick(PAGES),
      ],
    );
    await ev({ type: 'conversation_start', name: channel, visitor: visitor.id, conv: convId, channel, at: start });
    for (const a of acts) await ev({ type: 'action', name: a.text.split('(')[0], visitor: visitor.id, conv: convId, channel, ok: a.ok ?? true, at: a.at });
    if (unrecognized) await ev({ type: 'action', name: 'unrecognized', visitor: visitor.id, conv: convId, channel, ok: false, at: start + 30000, meta: { said: pick(['make it bigger', 'play the video', 'go to the shop']) } });
    await ev({ type: 'intent', name: cat, visitor: visitor.id, conv: convId, channel, at: start + 15000, meta: { question: qn } });
    if (handoff) await ev({ type: 'handoff', visitor: visitor.id, conv: convId, channel, at: end - 8000 });
    convCount++;
  }

  await Promise.all([evBatch.flush(), actBatch.flush(), taskBatch.flush()]);

  // ── notifications for real admins/managers (so the bell has something to show)
  const admins = await db.q<{ id: number }>(`SELECT id FROM admin_users WHERE active AND NOT is_demo AND role IN ('admin','manager')`);
  const recent = await db.q<{ id: number; name: string; score: number; created_at: number }>(`SELECT id, name, score, created_at FROM leads WHERE is_demo AND workspace_id=? ORDER BY created_at DESC LIMIT 6`, [ws]);
  for (const a of admins) {
    for (const [k, l] of recent.entries()) {
      await db.exec(`INSERT INTO notifications (workspace_id, user_id, type, title, body, link, read_at, created_at, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`, [
        ws,
        a.id,
        k === 0 ? 'lead_hot' : 'lead_new',
        k === 0 ? `🔥 High-intent lead: ${l.name} (score ${l.score})` : `New lead: ${l.name}`,
        'Demo notification',
        `/admin/leads/${l.id}`,
        k > 2 ? Date.now() : null,
        Number(l.created_at),
      ]);
    }
  }

  return { visitors: nVisitors, conversations: convCount, leads: leadIds.length, events };
}
