import { countAction } from '@/lib/conversations';
import { track } from '@/lib/events';
import { json, rateLimit, readJson, s, visitorId, clientIp } from '@/lib/http';
import { getActiveWorkspace } from '@/lib/workspace';
import { getConversation } from '@/lib/conversations';

export const runtime = 'nodejs';

const ALLOWED = new Set(['section_view', 'cta_click', 'engagement', 'action']);

/** Only small primitive values are stored (no nested objects from the browser). */
function cleanMeta(meta: Record<string, unknown>) {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta).slice(0, 10)) {
    if (typeof v === 'string') out[k.slice(0, 30)] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k.slice(0, 30)] = v;
    else if (typeof v === 'boolean') out[k.slice(0, 30)] = v;
  }
  return out;
}

/** Batched browser events (section views, CTA clicks, engagement time, assistant actions). */
export async function POST(req: Request) {
  const v = await visitorId(false);
  if (!v) return json({ ok: true, skipped: 'no visitor' });
  if (!rateLimit(`ev:${await clientIp()}`, 600, 60 * 60 * 1000)) return json({ ok: false }, 429);
  const body = await readJson<{ events?: Record<string, unknown>[] }>(req);
  const ws = await getActiveWorkspace();
  const convOk = new Map<string, boolean>();
  for (const e of (Array.isArray(body?.events) ? body!.events : []).slice(0, 40)) {
    const type = s(e.type, 30);
    if (!ALLOWED.has(type)) continue;
    let conversationId = s(e.conversationId, 40) || null;
    if (conversationId) {
      if (!convOk.has(conversationId)) {
        const c = await getConversation(conversationId);
        convOk.set(conversationId, !!c && c.visitor_id === v.id);
      }
      if (!convOk.get(conversationId)) conversationId = null;
    }
    const meta = e.meta && typeof e.meta === 'object' ? (e.meta as Record<string, unknown>) : {};
    if (type === 'engagement') {
      const ms = Math.max(0, Math.min(Number(meta.ms) || 0, 30 * 60_000));
      if (!ms) continue;
      meta.ms = ms;
    }
    const channel = e.channel === 'voice' || e.channel === 'text' ? e.channel : null;
    await track(ws, {
      type,
      name: s(e.name, 120) || null,
      visitorId: v.id,
      conversationId,
      path: s(e.path, 300) || null,
      channel,
      ok: typeof e.ok === 'boolean' ? e.ok : null,
      meta: cleanMeta(meta),
    }).catch(() => {});
    if (type === 'action' && conversationId && !['get_view_context', 'read_screen', 'qualify_lead', 'record_intent'].includes(s(e.name, 60))) {
      await countAction(conversationId, e.ok !== false);
    }
  }
  return json({ ok: true });
}
