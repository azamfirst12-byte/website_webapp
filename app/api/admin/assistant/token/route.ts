import { GoogleGenAI } from '@google/genai';
import { adminFromRequest } from '@/lib/auth';
import { adminContext, buildAdminLiveConfig, LIVE_MODEL } from '@/lib/admin-assistant';
import { bad, json, rateLimit, readJson, s } from '@/lib/http';
import { getActiveWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Single-use Gemini Live token for the admin CRM copilot. Only signed-in staff get one;
 * the CRM prompt, tools and voice are locked inside the token, and every CRM tool call
 * still goes through /api/admin/assistant/tool with the staff member's permissions.
 */
export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) return bad('The voice assistant is not configured yet (GEMINI_API_KEY).', 503);
  const session = await adminFromRequest();
  if (!session) return bad('Not signed in.', 401);
  if (!rateLimit(`admintok:${session.user.id}`, 40, 60 * 60 * 1000)) return bad('Rate limit reached.', 429);
  const body = await readJson<{ handle?: string | null }>(req);
  const ws = await getActiveWorkspace();
  const ctx = await adminContext(ws, session);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      liveConnectConstraints: { model: LIVE_MODEL, config: buildAdminLiveConfig(ws, session, ctx, body?.handle ? s(body.handle, 400) : null) },
      httpOptions: { apiVersion: 'v1alpha' },
    },
  });
  return json({ token: token.name, model: LIVE_MODEL });
}
