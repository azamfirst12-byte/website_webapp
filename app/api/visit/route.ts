import { headers } from 'next/headers';
import { classifySource, deviceOf, touchVisitor, track } from '@/lib/events';
import { json, readJson, s } from '@/lib/http';
import { publicContext } from '@/lib/visitor-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Page view: creates the anonymous visitor (cookie) and records the visit and its source. */
export async function POST(req: Request) {
  const body = await readJson<{ path?: string; referrer?: string | null; utm?: { source?: string; medium?: string } }>(req);
  const { ws, visitor } = await publicContext();
  const h = await headers();
  const path = s(body?.path, 300) || '/';
  const host = h.get('host') ?? '';
  const source = classifySource(s(body?.referrer, 500) || null, { source: s(body?.utm?.source, 60), medium: s(body?.utm?.medium, 60) }, host.split(':')[0]);
  await touchVisitor(ws, visitor, { source, referrer: s(body?.referrer, 300) || null, path, device: deviceOf(h.get('user-agent')) });
  await track(ws, { type: 'page_view', visitorId: visitor, path, meta: { source } });
  return json({ ok: true });
}
