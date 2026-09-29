import { createConversation } from '@/lib/conversations';
import { bad, clientIp, json, rateLimit, readJson, s } from '@/lib/http';
import { publicContext } from '@/lib/visitor-api';
import { effectiveFeatures } from '@/lib/workspace';

export const runtime = 'nodejs';

/** Start an assistant conversation (voice or text). Voice sessions are rate-limited per IP to protect credits. */
export async function POST(req: Request) {
  const body = await readJson<{ channel?: string; path?: string }>(req);
  const channel = body?.channel === 'text' ? 'text' : 'voice';
  const { ws, visitor } = await publicContext();
  const f = effectiveFeatures(ws.config);
  if (channel === 'voice' && !f.voice) return bad('Voice is turned off for this website.', 403);
  if (channel === 'text' && !f.textChat) return bad('Chat is turned off for this website.', 403);
  const ip = await clientIp();
  if (channel === 'voice') {
    if (!process.env.GEMINI_API_KEY) return bad('The voice assistant is not configured yet.', 503);
    const max = Number(process.env.LIVE_SESSIONS_PER_IP_PER_HOUR || 12);
    if (!rateLimit(`voice:${ip}`, max, 60 * 60 * 1000)) return bad('Too many voice sessions from this network. Please try again later or use chat.', 429);
  } else if (!rateLimit(`textconv:${ip}`, 30, 60 * 60 * 1000)) return bad('Too many chats. Please try again later.', 429);
  const id = await createConversation(ws, visitor, channel, s(body?.path, 200) || null);
  return json({ conversationId: id });
}
