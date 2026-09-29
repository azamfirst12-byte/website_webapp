import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { exec, one, q } from './db';
import { newId } from './http';
import { addActivity, rescoreLead, upsertLead } from './crm';
import { emitWebhook } from './notify';
import { track } from './events';
import { getWorkspace, type Workspace } from './workspace';
import { INTENT_CATEGORIES } from './workspace-types';

export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

export interface TranscriptLine {
  role: 'user' | 'ai' | 'action';
  text: string;
  at: number;
  ok?: boolean;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  visitor_id: string;
  lead_id: number | null;
  channel: 'voice' | 'text';
  status: 'open' | 'closed';
  started_at: number;
  last_activity_at: number;
  ended_at: number | null;
  transcript: TranscriptLine[];
  turn_count: number;
  action_count: number;
  failed_actions: number;
  summary: ConversationSummary | null;
  intent: string | null;
  intent_category: string | null;
  outcome: string | null;
  success: boolean | null;
  handoff: boolean;
  language: string | null;
  entry_path: string | null;
  is_demo: boolean;
}

export interface ConversationSummary {
  summary: string;
  intent: string;
  intent_category: string;
  service_interest: string | null;
  qualification: { budget?: string | null; timeline?: string | null; company_size?: string | null; decision_maker?: boolean | null };
  next_actions: string[];
  questions: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  outcome: 'lead_captured' | 'booking_requested' | 'handoff' | 'information' | 'no_engagement';
  intent_level: 'low' | 'medium' | 'high';
  language: string;
  contact: { name?: string | null; email?: string | null; phone?: string | null; company?: string | null };
}

export async function createConversation(ws: Workspace, visitorId: string, channel: 'voice' | 'text', entryPath: string | null) {
  const id = newId(12);
  const lead = await one<{ id: number }>(`SELECT id FROM leads WHERE workspace_id=? AND visitor_id=? ORDER BY updated_at DESC LIMIT 1`, [ws.id, visitorId]);
  await exec(`INSERT INTO conversations (id, workspace_id, visitor_id, lead_id, channel, entry_path) VALUES (?, ?, ?, ?, ?, ?)`, [
    id,
    ws.id,
    visitorId,
    lead ? Number(lead.id) : null,
    channel,
    entryPath?.slice(0, 200) ?? null,
  ]);
  await track(ws, { type: 'conversation_start', name: channel, visitorId, conversationId: id, channel, path: entryPath });
  return id;
}

export async function getConversation(id: string) {
  return one<Conversation>(`SELECT * FROM conversations WHERE id=?`, [id]);
}

const cleanTranscript = (t: unknown): TranscriptLine[] =>
  (Array.isArray(t) ? t : [])
    .filter((m) => m && ['user', 'ai', 'action'].includes(m.role) && typeof m.text === 'string' && m.text.trim())
    .slice(-400)
    .map((m) => ({ role: m.role, text: String(m.text).slice(0, 4000), at: Number(m.at) || Date.now(), ...(typeof m.ok === 'boolean' ? { ok: m.ok } : {}) }));

/** Saves the transcript so far (voice syncs periodically; text after every turn). */
export async function syncTranscript(id: string, transcript: unknown) {
  const t = cleanTranscript(transcript);
  const turns = t.filter((m) => m.role === 'user').length;
  await exec(`UPDATE conversations SET transcript=?::jsonb, turn_count=?, last_activity_at=? WHERE id=? AND status='open'`, [JSON.stringify(t), turns, Date.now(), id]);
}

export async function countAction(id: string, ok: boolean) {
  await exec(`UPDATE conversations SET action_count = action_count + 1, failed_actions = failed_actions + ?, last_activity_at=? WHERE id=?`, [ok ? 0 : 1, Date.now(), id]);
}

/** Close, then summarise in the background (caller wraps in after()). */
export async function closeConversation(id: string, transcript?: unknown) {
  if (transcript !== undefined) await syncTranscript(id, transcript);
  const r = await one<{ id: string }>(`UPDATE conversations SET status='closed', ended_at=? WHERE id=? AND status='open' RETURNING id`, [Date.now(), id]);
  return !!r;
}

function summaryPrompt(ws: Workspace, c: Conversation) {
  const lines = c.transcript
    .map((m) => (m.role === 'user' ? `Visitor: ${m.text}` : m.role === 'ai' ? `Assistant: ${m.text}` : `[Website action: ${m.text}${m.ok === false ? ' — FAILED' : ''}]`))
    .join('\n');
  return `You summarise sales conversations between a website visitor and ${ws.config.brand.name}'s AI assistant for the sales team.
Services offered (slug: name): ${ws.config.services.map((s) => `${s.slug}: ${s.name}`).join('; ')}.
Return ONLY JSON with these keys:
summary (2-3 sentences for a salesperson), intent (one sentence: what the visitor wants),
intent_category (one of: ${INTENT_CATEGORIES.join(', ')}), service_interest (a slug from the list or null),
qualification {budget, timeline, company_size, decision_maker (true/false/null)},
next_actions (1-3 short, concrete actions for the sales team), questions (the visitor's main questions, short, max 5),
sentiment (positive|neutral|negative), outcome (lead_captured|booking_requested|handoff|information|no_engagement),
intent_level (low|medium|high: buying intent), language (ISO 639-1 the visitor mainly used),
contact {name, email, phone, company} only if the visitor stated them, else null values.

Conversation:
${lines}`;
}

/** Generates the AI summary and writes it to the conversation, the lead and the activity timeline. */
export async function summarizeConversation(id: string) {
  const c = await getConversation(id);
  if (!c || c.summary) return;
  const ws = await getWorkspace(c.workspace_id);
  if (!ws) return;
  const userTurns = c.transcript.filter((m) => m.role === 'user').length;
  if (!userTurns) {
    await exec(`UPDATE conversations SET outcome='no_engagement', success=FALSE WHERE id=?`, [id]);
    return;
  }
  let s: ConversationSummary | null = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: summaryPrompt(ws, c),
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      });
      s = JSON.parse(res.text || '{}') as ConversationSummary;
    } catch (e) {
      console.error('[summary] failed', e);
    }
  }
  if (!s) {
    // Fallback without AI: first visitor message as intent (contact details redacted).
    const first = (c.transcript.find((m) => m.role === 'user')?.text ?? '').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[phone]');
    s = {
      summary: `Visitor said: "${first.slice(0, 200)}"`,
      intent: first.slice(0, 160),
      intent_category: 'other',
      service_interest: null,
      qualification: {},
      next_actions: c.lead_id ? ['Review the conversation and follow up'] : [],
      questions: [first.slice(0, 120)],
      sentiment: 'neutral',
      outcome: c.lead_id ? 'lead_captured' : 'information',
      intent_level: 'low',
      language: 'en',
      contact: {},
    };
  }
  const cat = (INTENT_CATEGORIES as readonly string[]).includes(s.intent_category) ? s.intent_category : 'other';
  const booked = !!(await one(`SELECT 1 FROM appointments WHERE conversation_id=?`, [id]));
  const outcome = c.handoff ? 'handoff' : booked ? 'booking_requested' : c.lead_id ? 'lead_captured' : s.outcome || 'information';
  const success = ['lead_captured', 'booking_requested', 'handoff'].includes(outcome) || (s.sentiment !== 'negative' && userTurns >= 2 && c.failed_actions <= c.action_count / 2);
  await exec(`UPDATE conversations SET summary=?::jsonb, intent=?, intent_category=COALESCE(intent_category, ?), outcome=?, success=?, language=COALESCE(?, language) WHERE id=?`, [
    JSON.stringify(s),
    s.intent?.slice(0, 300) ?? null,
    cat,
    outcome,
    success,
    s.language?.slice(0, 10) ?? null,
    id,
  ]);
  for (const question of (s.questions ?? []).slice(0, 5)) {
    await track(ws, { type: 'intent', name: cat, visitorId: c.visitor_id, conversationId: id, channel: c.channel, meta: { question: String(question).slice(0, 200), from: 'summary' } });
  }

  // Attach to the CRM: an existing lead gets the summary; contact details stated in the chat create one.
  let leadId = c.lead_id;
  const contact = s.contact ?? {};
  if (!leadId && (contact.email || contact.phone)) {
    const r = await upsertLead(
      ws,
      {
        visitorId: c.visitor_id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        service: s.service_interest,
        budget: s.qualification?.budget,
        timeline: s.qualification?.timeline,
        companySize: s.qualification?.company_size,
        intentLevel: s.intent_level,
        channel: c.channel,
      },
      { conversationId: id },
    );
    leadId = r.id || null;
  }
  if (leadId) {
    await exec(
      `UPDATE leads SET summary=?, next_action=?, intent_level = CASE WHEN intent_level = 'high' THEN intent_level ELSE COALESCE(?, intent_level) END,
         interested_service = COALESCE(interested_service, ?), budget = COALESCE(budget, ?), timeline = COALESCE(timeline, ?), last_interaction_at=?, updated_at=? WHERE id=?`,
      [
        s.summary?.slice(0, 2000) ?? null,
        (s.next_actions ?? [])[0]?.slice(0, 300) ?? null,
        s.intent_level ?? null,
        s.service_interest && ws.config.services.some((x) => x.slug === s!.service_interest) ? s.service_interest : null,
        s.qualification?.budget?.slice(0, 80) ?? null,
        s.qualification?.timeline?.slice(0, 80) ?? null,
        Date.now(),
        Date.now(),
        leadId,
      ],
    );
    await addActivity(ws, {
      leadId,
      conversationId: id,
      type: 'ai_summary',
      title: `${c.channel === 'voice' ? 'Voice' : 'Chat'} conversation summary`,
      body: `${s.summary}${s.next_actions?.length ? `\n\nNext actions:\n${s.next_actions.map((a) => `• ${a}`).join('\n')}` : ''}`,
      meta: { intent: s.intent, category: cat, sentiment: s.sentiment, outcome },
    });
    await rescoreLead(ws, leadId);
  }
  emitWebhook(ws, 'conversation.closed', { id, channel: c.channel, lead_id: leadId, outcome, summary: s.summary, intent: s.intent, next_actions: s.next_actions });
}

/** Closes conversations idle for 30+ minutes (tab closed without "End") and summarises them. */
export async function sweepStaleConversations(limit = 5) {
  const stale = await q<{ id: string }>(
    `UPDATE conversations SET status='closed', ended_at=last_activity_at
     WHERE id IN (SELECT id FROM conversations WHERE status='open' AND last_activity_at < ? ORDER BY last_activity_at LIMIT ?) RETURNING id`,
    [Date.now() - 30 * 60_000, limit],
  );
  for (const r of stale) await summarizeConversation(r.id).catch((e) => console.error('[sweep]', e));
  // Closed but never summarised (e.g. the summary call timed out).
  const missing = await q<{ id: string }>(`SELECT id FROM conversations WHERE status='closed' AND summary IS NULL AND outcome IS NULL AND ended_at > ? LIMIT 3`, [Date.now() - 7 * 86_400_000]);
  for (const r of missing) await summarizeConversation(r.id).catch(() => {});
}

// ─────────────── Admin queries ───────────────

export async function listConversations(ws: Workspace, f: { channel?: string; outcome?: string; q?: string; page?: number; leadVisibleTo?: { sql: string; params: unknown[] } }, pageSize = 30) {
  const where = ['c.workspace_id = ?'];
  const params: unknown[] = [ws.id];
  if (f.channel) where.push('c.channel = ?'), params.push(f.channel);
  if (f.outcome) where.push('c.outcome = ?'), params.push(f.outcome);
  if (f.q) where.push(`(c.intent ILIKE ? OR c.transcript::text ILIKE ? OR l.name ILIKE ?)`), params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  if (f.leadVisibleTo) where.push(`(c.lead_id IS NULL OR ${f.leadVisibleTo.sql})`), params.push(...f.leadVisibleTo.params);
  const page = Math.max(1, f.page ?? 1);
  const rows = await q<Omit<Conversation, 'transcript'> & { lead_name: string | null; first_message: string | null }>(
    `SELECT c.id, c.workspace_id, c.visitor_id, c.lead_id, c.channel, c.status, c.started_at, c.last_activity_at, c.ended_at, c.turn_count, c.action_count,
            c.failed_actions, c.summary, c.intent, c.intent_category, c.outcome, c.success, c.handoff, c.language, c.entry_path, c.is_demo,
            l.name AS lead_name, (SELECT x->>'text' FROM jsonb_array_elements(c.transcript) x WHERE x->>'role' = 'user' LIMIT 1) AS first_message
     FROM conversations c LEFT JOIN leads l ON l.id = c.lead_id
     WHERE ${where.join(' AND ')} ORDER BY c.started_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const total = await one<{ n: number }>(`SELECT COUNT(*) AS n FROM conversations c LEFT JOIN leads l ON l.id = c.lead_id WHERE ${where.join(' AND ')}`, params);
  return { rows, total: Number(total?.n ?? 0), page, pageSize };
}

export async function conversationActions(id: string) {
  return q<{ name: string; ok: boolean | null; meta: Record<string, unknown>; created_at: number }>(
    `SELECT name, ok, meta, created_at FROM events WHERE conversation_id=? AND type='action' ORDER BY created_at`,
    [id],
  );
}
