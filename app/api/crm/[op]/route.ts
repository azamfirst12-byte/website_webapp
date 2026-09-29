import { addActivity, createBookingRequest, upsertLead, type LeadInput } from '@/lib/crm';
import { exec, one } from '@/lib/db';
import { track } from '@/lib/events';
import { bad, clientIp, json, rateLimit, readJson, s } from '@/lib/http';
import { emitWebhook, notify } from '@/lib/notify';
import { whatsappLink } from '@/lib/site';
import { ownConversation, publicContext } from '@/lib/visitor-api';
import { INTENT_CATEGORIES } from '@/lib/workspace-types';

export const runtime = 'nodejs';

type Body = Record<string, unknown>;
const bool = (v: unknown) => (v === true || v === 'true' || v === 'yes' ? true : v === false || v === 'false' || v === 'no' ? false : null);

/** Maps assistant/form fields to a LeadInput. */
function leadInput(b: Body, visitor: string, channel: LeadInput['channel'], source?: string): LeadInput {
  const intent = s(b.intent_level, 10);
  return {
    visitorId: visitor,
    name: s(b.name, 120),
    email: s(b.email, 200),
    phone: s(b.phone, 40),
    company: s(b.company, 160),
    industry: s(b.industry, 80),
    customerType: s(b.customer_type, 40),
    companySize: s(b.company_size, 40),
    service: s(b.service, 120),
    requirements: s(b.requirements, 3000) || s(b.needs, 3000) || s(b.message, 3000),
    budget: s(b.budget, 80),
    timeline: s(b.timeline, 80),
    decisionMaker: bool(b.decision_maker),
    intentLevel: intent === 'low' || intent === 'medium' || intent === 'high' ? intent : null,
    channel,
    source,
    consent: bool(b.consent) === true,
  };
}

/**
 * Public CRM endpoints used by the assistant's action layer and the site forms:
 *   lead · qualify · intent · handoff · booking · form
 * Everything is tied to the visitor cookie; a visitor can only touch their own conversation and lead.
 */
export async function POST(req: Request, { params }: { params: Promise<{ op: string }> }) {
  const { op } = await params;
  const b = (await readJson<Body>(req)) ?? {};
  const { ws, visitor } = await publicContext();
  const ip = await clientIp();
  if (!rateLimit(`crm:${ip}`, 120, 60 * 60 * 1000)) return bad('Too many requests.', 429);
  const conv = b.conversationId ? await ownConversation(b.conversationId, visitor, ws.id) : null;
  const channel = conv?.channel ?? (b.channel === 'voice' || b.channel === 'text' ? b.channel : null);
  const ctx = { conversationId: conv?.id ?? null };

  switch (op) {
    case 'lead': {
      if (bool(b.consent) !== true) return bad('Consent is required before saving contact details.');
      const r = await upsertLead(ws, leadInput(b, visitor, channel ?? 'text'), ctx);
      if (!r.id) return bad(r.error ?? 'Could not save the lead.');
      return json({ leadId: r.id, created: r.created });
    }

    case 'qualify': {
      // Updates the visitor's existing lead; before contact details exist the browser keeps it and sends it with submit_lead.
      const existing = await one<{ id: number }>(`SELECT id FROM leads WHERE workspace_id=? AND visitor_id=? LIMIT 1`, [ws.id, visitor]);
      if (!existing) return json({ ok: true, stored: 'pending' });
      const input = leadInput(b, visitor, channel);
      delete input.consent;
      await upsertLead(ws, input, ctx);
      return json({ ok: true, stored: 'lead' });
    }

    case 'intent': {
      const cat = (INTENT_CATEGORIES as readonly string[]).includes(s(b.category, 20)) ? s(b.category, 20) : 'other';
      await track(ws, { type: 'intent', name: cat, visitorId: visitor, conversationId: conv?.id, channel, meta: { question: s(b.question, 200) } });
      if (conv) await exec(`UPDATE conversations SET intent_category = COALESCE(intent_category, ?) WHERE id=?`, [cat, conv.id]);
      return json({ ok: true });
    }

    case 'handoff': {
      const reason = s(b.reason, 300) || 'Visitor asked for a person';
      const urgency = s(b.urgency, 10) || 'normal';
      const lead = await one<{ id: number; name: string; email: string | null; phone: string | null; assigned_to: number | null }>(
        `SELECT id, name, email, phone, assigned_to FROM leads WHERE workspace_id=? AND visitor_id=? ORDER BY updated_at DESC LIMIT 1`,
        [ws.id, visitor],
      );
      if (conv) await exec(`UPDATE conversations SET handoff=TRUE WHERE id=?`, [conv.id]);
      await track(ws, { type: 'handoff', name: urgency, visitorId: visitor, conversationId: conv?.id, channel, meta: { reason } });
      if (lead) await addActivity(ws, { leadId: lead.id, type: 'handoff', title: `Asked for a human (${urgency})`, body: reason, conversationId: conv?.id });
      await notify(ws, {
        type: 'handoff',
        title: `🙋 Hand-over requested${lead?.name ? `: ${lead.name}` : ''}${urgency === 'high' ? ' (urgent)' : ''}`,
        body: [reason, lead?.email && `Email: ${lead.email}`, lead?.phone && `Phone: ${lead.phone}`].filter(Boolean).join('\n'),
        link: conv ? `/admin/conversations/${conv.id}` : lead ? `/admin/leads/${lead.id}` : '/admin/conversations',
        assignedTo: lead?.assigned_to ?? null,
      });
      emitWebhook(ws, 'handoff.requested', { conversation_id: conv?.id, lead_id: lead?.id ?? null, reason, urgency });
      const wa = ws.config.features.whatsappHandoff
        ? whatsappLink(ws.config.brand.whatsapp, `Hi ${ws.config.brand.name}, I was talking to your website assistant and would like to speak to someone.${lead?.name ? ` My name is ${lead.name}.` : ''}`)
        : null;
      return json({ ok: true, whatsapp: wa, email: ws.config.brand.email, phone: ws.config.brand.phone });
    }

    case 'booking': {
      if (!ws.config.features.booking) return bad('Booking is turned off.', 403);
      const preferred = s(b.preferred_time, 120);
      if (!preferred) return bad('Ask the visitor for a preferred day and time.');
      const input = leadInput(b, visitor, channel ?? 'text');
      input.consent = true; // they asked us to arrange a call with the details they gave
      let leadId = (await one<{ id: number }>(`SELECT id FROM leads WHERE workspace_id=? AND visitor_id=? ORDER BY updated_at DESC LIMIT 1`, [ws.id, visitor]))?.id ?? 0;
      if (input.name || input.email || input.phone || leadId) {
        const r = await upsertLead(ws, input, ctx);
        leadId = r.id || leadId;
      }
      if (!leadId) return bad('I need the visitor’s name and an email or phone number first.');
      const lead = await one<{ email: string | null; phone: string | null }>(`SELECT email, phone FROM leads WHERE id=?`, [leadId]);
      if (!lead?.email && !lead?.phone) return bad('I need an email or phone number so the team can confirm the time.');
      const appointmentId = await createBookingRequest(ws, {
        leadId: Number(leadId),
        conversationId: conv?.id,
        preferredTime: preferred,
        service: s(b.service, 120) || null,
        notes: s(b.notes, 1000) || s(b.message, 1000) || null,
        channel,
        visitorId: visitor,
      });
      return json({ appointmentId, leadId: Number(leadId) });
    }

    case 'form': {
      if (!rateLimit(`form:${ip}`, 12, 60 * 60 * 1000)) return bad('Too many submissions. Please try again later.', 429);
      const form = b.form === 'booking' ? 'booking' : 'contact';
      const f = (b.fields && typeof b.fields === 'object' ? b.fields : {}) as Body;
      if (f.consent !== 'yes') return bad('Please agree to be contacted.');
      if (!s(f.name, 120)) return bad('Please enter your name.');
      if (form === 'contact' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(f.email, 200))) return bad('Please enter a valid email address.');
      if (form === 'booking' && !s(f.email, 200) && !s(f.phone, 40)) return bad('Please add an email or phone number.');
      if (form === 'booking' && !s(f.preferred_time, 120)) return bad('Please add a preferred day and time.');
      const input = leadInput(f, visitor, 'form', form === 'booking' ? 'booking_form' : 'contact_form');
      input.consent = true;
      const r = await upsertLead(ws, input, ctx);
      if (!r.id) return bad(r.error ?? 'Could not save your details.');
      if (form === 'booking' && ws.config.features.booking) {
        await createBookingRequest(ws, {
          leadId: r.id,
          conversationId: conv?.id,
          preferredTime: s(f.preferred_time, 120),
          service: s(f.service, 120) || null,
          notes: s(f.message, 1000) || null,
          channel: 'form',
          visitorId: visitor,
        });
      } else if (s(f.message, 3000)) {
        await addActivity(ws, { leadId: r.id, type: 'note', title: 'Contact form message', body: s(f.message, 3000) });
      }
      return json({ leadId: r.id });
    }

    default:
      return bad('Unknown operation.', 404);
  }
}
