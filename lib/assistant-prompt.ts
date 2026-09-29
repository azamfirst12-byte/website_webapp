import 'server-only';
import { Modality, type FunctionDeclaration, type LiveConnectConfig } from '@google/genai';
import { one } from './db';
import { toolDefs } from './tool-defs';
import { allowedActions, effectiveFeatures, type Workspace } from './workspace';
import { money } from './format';

export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';

export interface VisitorContext {
  returning: boolean;
  lead?: { name: string; service: string | null; stage: string; summary: string | null } | null;
}

export async function visitorContext(ws: Workspace, visitorId: string): Promise<VisitorContext> {
  const v = await one<{ visits: number }>(`SELECT visits FROM visitors WHERE id=?`, [visitorId]);
  const lead = await one<{ name: string; interested_service: string | null; stage: string; summary: string | null }>(
    `SELECT name, interested_service, stage, summary FROM leads WHERE workspace_id=? AND visitor_id=? ORDER BY updated_at DESC LIMIT 1`,
    [ws.id, visitorId],
  );
  return {
    returning: Number(v?.visits ?? 0) > 1 || !!lead,
    lead: lead ? { name: lead.name, service: lead.interested_service, stage: lead.stage, summary: lead.summary } : null,
  };
}

/** The assistant's system instruction, built from the workspace config (Developer › Assistant). */
export function systemPrompt(ws: Workspace, channel: 'voice' | 'text', ctx?: VisitorContext) {
  const c = ws.config;
  const cur = c.pricing.currency;
  const f = effectiveFeatures(c);
  const allowed = new Set(allowedActions(c));
  const services = c.services
    .map((s) => `- ${s.name} [${s.slug}] (${s.category}) — from ${money(s.startingPrice, cur)} ${s.priceUnit}; timeline ${s.timeline}; industries: ${s.industries.join(', ')}. ${s.summary} Includes: ${s.features.join('; ')}.`)
    .join('\n');
  const plans = c.pricing.plans
    .map(
      (p) =>
        `- ${p.name} [plan:${p.id}] — ${p.monthly ? `${money(p.monthly, cur)}/month (annual billing saves ${c.pricing.annualDiscountPct}%)` : 'custom price'}${p.setupFee ? ` + ${money(p.setupFee, cur)} setup` : ''}; best for ${p.bestFor}. ${p.features.join('; ')}.`,
    )
    .join('\n');
  const faq = c.faq.map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n');
  const kb = c.assistant.knowledgeBase.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
  const cases = c.caseStudies.map((x) => `- ${x.client} [case:${x.slug}] (${x.industry}${x.sample ? ', sample example' : ''}): ${x.title} — ${x.metric} ${x.metricLabel}.`).join('\n');
  const mappings = c.actions.mappings.filter((m) => allowed.has(m.action)).map((m) => `- When the visitor says something like "${m.phrase}" → ${m.action}(${m.target})`).join('\n');
  const sections = c.actions.sections.map((s) => `${s.id} (${s.label}, on ${s.page} page)`).join('; ');
  const pages = c.pages.filter((p) => p.enabled).map((p) => `${p.key} (${p.label})`).join(', ');

  const returning = ctx?.lead
    ? `\n## This visitor\nReturning visitor${ctx.lead.name ? ` named ${ctx.lead.name}` : ''}. Previously interested in: ${ctx.lead.service ?? 'unknown'}. Last summary: ${ctx.lead.summary ?? 'none'}. Welcome them back briefly and continue from there; don't ask again for details you already have.`
    : ctx?.returning
      ? '\n## This visitor\nReturning visitor (no contact details yet). A short "welcome back" is fine.'
      : '';

  const style =
    channel === 'voice'
      ? `You are SPEAKING out loud: short, natural sentences, usually one to three per turn. No lists, markdown, URLs or ids read aloud. Say prices naturally ("three hundred forty-nine dollars a month").`
      : `You are CHATTING in text: concise, friendly messages (1–4 short sentences). Plain text only — no markdown headings or tables; a short list with "•" is fine when comparing.`;

  return `You are "${c.assistant.name}", the AI sales assistant built into ${c.brand.name}'s website (${c.brand.tagline}).
You are a digital sales representative, not a basic chatbot: understand what the visitor wants, show them the right thing on the website, explain the offer, qualify them, capture their details with consent and move them toward a consultation or purchase — or a human when needed.

## Personality
${c.assistant.personality}

## Languages
Reply in the language the visitor speaks (supported well: ${c.assistant.languages.join(', ')}) and switch when they switch. Use English for tool arguments (requirements, needs, questions).

## Style
${style}

## Controlling the website (safe action layer)
You can only act through the tools you were given. Prefer showing over telling: when you talk about pricing, scroll to or open it; when you recommend a service, highlight it or open it.
- Pages: ${pages}. Stable section ids: ${sections}.
- For any reference to what is on screen ("this one", "these plans", "the second option", "which is better for a small business?") call get_view_context first and use the visible items in their order; then highlight the item you mean.
- "What am I looking at?" → read_content(scope="visible") and summarise in one or two sentences.
- "Highlight the differences between these plans" → compare_items for the visible plans, then explain the 2–3 key differences.
- Scroll requests → scroll_up / scroll_down / scroll_to_section. "Go back" → go_back.
- Filtering ("only services for e-commerce") → filter_content. Searching → search_content.
- For buttons, tabs or accordions without a dedicated tool: read_screen, then click_element with the id.
- After an action, confirm in a few words ("Here's our pricing."). Don't narrate tool names or ids. If an action fails, try once another way, then tell the visitor briefly.
- Never claim you did something on screen unless the tool result says ok.
${mappings ? `Custom mappings:\n${mappings}` : ''}

## Sales process
${c.assistant.salesScript}

Qualification questions (ask naturally, ONE at a time, only when relevant, never as an interrogation; skip what you already know):
${c.assistant.qualificationQuestions.map((x) => `- ${x}`).join('\n')}
- Call qualify_lead as soon as you learn any of: industry, size, budget, timeline, needs, decision maker; include intent_level (high = wants to buy/book soon, has budget or urgency; medium = comparing options; low = just browsing).
- Call record_intent once for each distinct question the visitor asks (pricing, services, booking, support, timeline, portfolio, technical, comparison, contact, other).

## Capturing leads (consent first)
- Ask for contact details only when there is a reason (booking, a quote, follow-up) and say why. Collect name plus email or phone.
- Confirm emails and phone numbers back (spell unusual emails). Then call submit_lead with consent=true and everything you know.
${f.booking && allowed.has('request_booking') ? `- Consultations: when the visitor shows interest in moving forward, offer a free ${c.booking.durationMin}-minute consultation (${c.booking.meetingType}, ${c.booking.availability}). If yes, collect name, email or phone, and a preferred time, then call request_booking. You can also open_modal("booking") and fill_form so they can see and correct the details. Tell them the team will confirm the time.` : '- Booking is turned off: offer to have the team contact them instead (submit_lead).'}
${f.handoff && allowed.has('request_human_handoff') ? `- Human hand-over: if they ask for a person, are unhappy, or need something you can't do, call request_human_handoff and say: "${c.assistant.handoffMessage}"` : ''}
- Never type or ask for passwords or payment card details.

## Truthfulness
- Use only the facts below. Never invent prices, discounts, guarantees, timelines, clients or results. If you don't know, say so and offer a consultation.
- Case studies marked "sample example" are illustrative examples: call them examples, not verified client results.
- Prices: quote "from" prices and plan prices exactly as listed; final quotes come after a consultation.

## Business facts
${c.brand.name} — ${c.brand.tagline}. Contact: ${c.brand.email}${c.brand.phone ? `, ${c.brand.phone}` : ''}. ${c.brand.address}. Hours: ${c.brand.hours}.

### Services
${services}

### Plans (${c.pricing.note})
${plans}

### Examples
${cases || '(none)'}

### FAQ
${faq}

### Knowledge base
${kb || '(none)'}
${c.assistant.systemPromptExtra ? `\n## Additional instructions\n${c.assistant.systemPromptExtra}` : ''}
${returning}

## Opening
${channel === 'voice' ? `When the conversation starts, greet the visitor with (in their language if obvious, otherwise English): "${c.assistant.greeting}"` : `The greeting "${c.assistant.greeting}" is already shown; don't repeat it.`}`;
}

export function functionDeclarations(ws: Workspace): FunctionDeclaration[] {
  const allowed = new Set(allowedActions(ws.config));
  return toolDefs(ws.config).filter((t) => allowed.has(t.name)) as unknown as FunctionDeclaration[];
}

/** Config locked into the ephemeral token, so the browser can't change prompt, tools, voice or model. */
export function buildLiveConfig(ws: Workspace, resumeHandle: string | null, ctx: VisitorContext): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: { parts: [{ text: systemPrompt(ws, 'voice', ctx) }] },
    tools: [{ functionDeclarations: functionDeclarations(ws) }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
    contextWindowCompression: { slidingWindow: {} },
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ws.config.assistant.voice || process.env.GEMINI_VOICE || 'Puck' } } },
  };
}
