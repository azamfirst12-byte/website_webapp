import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { adminFromRequest } from '@/lib/auth';
import { adminContext, adminFunctionDeclarations, adminSystemPrompt } from '@/lib/admin-assistant';
import { TEXT_MODEL } from '@/lib/conversations';
import { bad, json, rateLimit, readJson } from '@/lib/http';
import { getActiveWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Keeps only the part types the chat uses, with size limits (the history comes from the browser). */
function cleanContents(raw: unknown): Content[] {
  if (!Array.isArray(raw)) return [];
  let budget = 90_000;
  const out: Content[] = [];
  for (const c of raw.slice(-40).reverse()) {
    if (!c || (c.role !== 'user' && c.role !== 'model') || !Array.isArray(c.parts)) continue;
    const parts: Part[] = [];
    for (const p of c.parts.slice(0, 12)) {
      if (typeof p?.text === 'string') parts.push({ text: p.text.slice(0, 6000), ...(p.thought ? { thought: true } : {}), ...(typeof p.thoughtSignature === 'string' ? { thoughtSignature: p.thoughtSignature } : {}) });
      else if (p?.functionCall?.name) parts.push({ functionCall: { name: String(p.functionCall.name).slice(0, 60), args: p.functionCall.args ?? {}, ...(p.functionCall.id ? { id: String(p.functionCall.id) } : {}) }, ...(typeof p.thoughtSignature === 'string' ? { thoughtSignature: p.thoughtSignature } : {}) });
      else if (p?.functionResponse?.name) parts.push({ functionResponse: { name: String(p.functionResponse.name).slice(0, 60), response: p.functionResponse.response ?? {}, ...(p.functionResponse.id ? { id: String(p.functionResponse.id) } : {}) } });
    }
    if (!parts.length) continue;
    budget -= JSON.stringify(parts).length;
    if (budget < 0) break;
    out.unshift({ role: c.role, parts });
  }
  // History must start with a plain user turn (not a dangling function response).
  while (out.length && (out[0].role !== 'user' || out[0].parts?.some((p) => p.functionResponse))) out.shift();
  return out;
}

/** Text channel of the admin copilot: one model turn (text and/or function calls). Tools run via /tool and in the page. */
export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) return bad('The assistant is not configured yet (GEMINI_API_KEY).', 503);
  const session = await adminFromRequest();
  if (!session) return bad('Not signed in.', 401);
  if (!rateLimit(`adminchat:${session.user.id}`, Number(process.env.ADMIN_ASSISTANT_PER_HOUR || 400), 60 * 60 * 1000)) return bad('Too many messages. Please wait a little.', 429);
  const body = await readJson<{ contents?: unknown }>(req);
  const contents = cleanContents(body?.contents);
  if (!contents.length) return bad('Empty message.');
  const ws = await getActiveWorkspace();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents,
      config: {
        systemInstruction: adminSystemPrompt(ws, session, 'text', await adminContext(ws, session)),
        tools: [{ functionDeclarations: adminFunctionDeclarations(ws) }],
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    });
    const parts = (res.candidates?.[0]?.content?.parts ?? []).map((p) => ({
      ...(p.text !== undefined ? { text: p.text } : {}),
      ...(p.thought ? { thought: true } : {}),
      ...(p.functionCall ? { functionCall: { name: p.functionCall.name, args: p.functionCall.args ?? {}, ...(p.functionCall.id ? { id: p.functionCall.id } : {}) } } : {}),
      ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
    }));
    return json({ parts });
  } catch (e) {
    console.error('[admin-assistant chat]', e);
    const detail = process.env.NODE_ENV !== 'production' ? ` (${String((e as Error).message ?? e).slice(0, 300)})` : '';
    return bad(`The assistant had a problem answering. Please try again.${detail}`, 502);
  }
}
