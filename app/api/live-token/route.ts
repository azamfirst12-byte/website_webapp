import { GoogleGenAI } from '@google/genai';
import { buildLiveConfig, LIVE_MODEL, visitorContext } from '@/lib/assistant-prompt';
import { bad, clientIp, json, rateLimit, readJson, s } from '@/lib/http';
import { ownConversation, publicContext } from '@/lib/visitor-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Single-use ephemeral token for the Gemini Live API. The browser connects straight to Gemini
 * (lowest latency, no audio proxy) while the API key, system prompt, tools, voice and model stay
 * locked server-side inside the token.
 */
export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) return bad('The voice assistant is not configured yet.', 503);
  const body = await readJson<{ conversationId?: string; handle?: string | null }>(req);
  const { ws, visitor } = await publicContext();
  const c = await ownConversation(body?.conversationId, visitor, ws.id);
  if (!c || c.status !== 'open' || c.channel !== 'voice') return bad('Conversation not found.', 404);

  // Reconnects (token refresh / resumption) are allowed but capped.
  if (!rateLimit(`tok:${c.id}`, 20, 60 * 60 * 1000) || !rateLimit(`tokip:${await clientIp()}`, 60, 60 * 60 * 1000)) return bad('Rate limit reached.', 429);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const ctx = await visitorContext(ws, visitor);
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      liveConnectConstraints: { model: LIVE_MODEL, config: buildLiveConfig(ws, body?.handle ? s(body.handle, 400) : null, ctx) },
      httpOptions: { apiVersion: 'v1alpha' },
    },
  });
  return json({ token: token.name, model: LIVE_MODEL });
}
