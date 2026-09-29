import { syncTranscript } from '@/lib/conversations';
import { bad, json, readJson } from '@/lib/http';
import { ownConversation, publicContext } from '@/lib/visitor-api';

export const runtime = 'nodejs';

/** Saves the transcript so far (voice: every ~20 s and when the tab is hidden; text: after each turn). */
export async function POST(req: Request) {
  const body = await readJson<{ conversationId?: string; transcript?: unknown[] }>(req);
  const { ws, visitor } = await publicContext();
  const c = await ownConversation(body?.conversationId, visitor, ws.id);
  if (!c) return bad('Conversation not found.', 404);
  if (c.status === 'open') await syncTranscript(c.id, body?.transcript);
  return json({ ok: true });
}
