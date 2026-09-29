import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { functionDeclarations, systemPrompt, visitorContext } from '@/lib/assistant-prompt';
import { TEXT_MODEL } from '@/lib/conversations';
import { bad, clientIp, json, rateLimit, readJson } from '@/lib/http';
import { ownConversation, publicContext } from '@/lib/visitor-api';
import { exec } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Keeps only the part types the chat uses, with size limits (the history comes from the browser). */
function cleanContents(raw: unknown): Content[] {
  if (!Array.isArray(raw)) return [];
  let budget = 60_000;
  const out: Content[] = [];
  for (const c of raw.slice(-40)) {
    if (!c || (c.role !== 'user' && c.role !== 'model') || !Array.isArray(c.parts)) continue;
    const parts: Part[] = [];
    for (const p of c.parts.slice(0, 12)) {
      if (typeof p?.text === 'string') parts.push({ text: p.text.slice(0, 4000), ...(p.thought ? { thought: true } : {}), ...(typeof p.thoughtSignature === 'string' ? { thoughtSignature: p.thoughtSignature } : {}) });
      else if (p?.functionCall?.name) parts.push({ functionCall: { name: String(p.functionCall.name).slice(0, 60), args: p.functionCall.args ?? {}, ...(p.functionCall.id ? { id: String(p.functionCall.id) } : {}) }, ...(typeof p.thoughtSignature === 'string' ? { thoughtSignature: p.thoughtSignature } : {}) });
      else if (p?.functionResponse?.name) parts.push({ functionResponse: { name: String(p.functionResponse.name).slice(0, 60), response: p.functionResponse.response ?? {}, ...(p.functionResponse.id ? { id: String(p.functionResponse.id) } : {}) } });
    }
    if (!parts.length) continue;
    budget -= JSON.stringify(parts).length;
    if (budget < 0) break;
    out.push({ role: c.role, parts });
  }
  // History must start with a user turn.
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/** Text channel: one model turn (text and/or function calls). Tools run in the browser, results come back in the next call. */
export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) return bad('The assistant is not configured yet.', 503);
  const body = await readJson<{ conversationId?: string; contents?: unknown }>(req);
  const { ws, visitor } = await publicContext();
  const c = await ownConversation(body?.conversationId, visitor, ws.id);
  if (!c || c.channel !== 'text') return bad('Conversation not found.', 404);
  if (c.status !== 'open') return bad('This conversation has ended. Start a new one.', 409);
  const max = Number(process.env.TEXT_MESSAGES_PER_IP_PER_HOUR || 120);
  if (!rateLimit(`chat:${await clientIp()}`, max, 60 * 60 * 1000)) return bad('Too many messages. Please wait a little.', 429);

  const contents = cleanContents(body?.contents);
  if (!contents.length) return bad('Empty message.');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents,
      config: {
        systemInstruction: systemPrompt(ws, 'text', await visitorContext(ws, visitor)),
        tools: [{ functionDeclarations: functionDeclarations(ws) }],
        temperature: 0.6,
        maxOutputTokens: 2048,
      },
    });
    const parts = (res.candidates?.[0]?.content?.parts ?? []).map((p) => ({
      ...(p.text !== undefined ? { text: p.text } : {}),
      ...(p.thought ? { thought: true } : {}),
      ...(p.functionCall ? { functionCall: { name: p.functionCall.name, args: p.functionCall.args ?? {}, ...(p.functionCall.id ? { id: p.functionCall.id } : {}) } } : {}),
      ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
    }));
    await exec(`UPDATE conversations SET last_activity_at=? WHERE id=?`, [Date.now(), c.id]);
    return json({ parts });
  } catch (e) {
    console.error('[chat]', e);
    return bad('The assistant had a problem answering. Please try again.', 502);
  }
}
