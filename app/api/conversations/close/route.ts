import { after } from 'next/server';
import { closeConversation, summarizeConversation } from '@/lib/conversations';
import { bad, json, readJson } from '@/lib/http';
import { ownConversation, publicContext } from '@/lib/visitor-api';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Ends a conversation: saves the transcript now, writes the AI summary + next actions into the CRM in the background. */
export async function POST(req: Request) {
  const body = await readJson<{ conversationId?: string; transcript?: unknown[] }>(req);
  const { ws, visitor } = await publicContext();
  const c = await ownConversation(body?.conversationId, visitor, ws.id);
  if (!c) return bad('Conversation not found.', 404);
  if (c.status === 'closed') return json({ ok: true });
  await closeConversation(c.id, body?.transcript);
  after(() => summarizeConversation(c.id).catch((e) => console.error('[summary]', e)));
  return json({ ok: true });
}
