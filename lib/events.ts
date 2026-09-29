import 'server-only';
import { exec, one } from './db';
import type { Workspace } from './workspace';

export interface TrackInput {
  type: string;
  name?: string | null;
  visitorId?: string | null;
  conversationId?: string | null;
  path?: string | null;
  channel?: 'voice' | 'text' | null;
  ok?: boolean | null;
  meta?: Record<string, unknown>;
}

/** Records an analytics event if that event type is enabled for the workspace. */
export async function track(ws: Workspace, e: TrackInput) {
  const def = ws.config.analytics.events.find((x) => x.key === e.type);
  if (def && !def.enabled) return;
  await exec(`INSERT INTO events (workspace_id, visitor_id, conversation_id, type, name, path, channel, ok, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)`, [
    ws.id,
    e.visitorId ?? null,
    e.conversationId ?? null,
    e.type.slice(0, 40),
    e.name?.slice(0, 120) ?? null,
    e.path?.slice(0, 300) ?? null,
    e.channel ?? null,
    e.ok ?? null,
    JSON.stringify(e.meta ?? {}),
  ]);
}

const SEARCH = /(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia)\./i;
const SOCIAL = /(facebook|instagram|linkedin|twitter|x\.com|t\.co|tiktok|youtube|pinterest|reddit|whatsapp)\./i;

/** Lead-source bucket from UTM tags and the referrer. */
export function classifySource(referrer: string | null, utm: { source?: string; medium?: string }, host: string) {
  const medium = (utm.medium ?? '').toLowerCase();
  const source = (utm.source ?? '').toLowerCase();
  if (/(cpc|ppc|paid|ads?)/.test(medium)) return 'paid_ads';
  if (/(social)/.test(medium) || SOCIAL.test(`${source}.`)) return 'social';
  if (medium === 'email' || source === 'newsletter') return 'email';
  if (!referrer) return source ? 'referral' : 'direct';
  let h = '';
  try {
    h = new URL(referrer).hostname;
  } catch {
    return 'direct';
  }
  if (!h || h === host) return 'direct';
  if (SEARCH.test(h)) return 'organic_search';
  if (SOCIAL.test(h)) return 'social';
  return 'referral';
}

/** Creates/updates the visitor row. A visit = first page view after 30 minutes of inactivity. */
export async function touchVisitor(ws: Workspace, id: string, info: { source: string; referrer: string | null; path: string; device: string }) {
  const row = await one<{ last_seen: number }>(`SELECT last_seen FROM visitors WHERE id=?`, [id]);
  if (!row) {
    await exec(`INSERT INTO visitors (id, workspace_id, source, referrer, landing_path, device) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`, [
      id,
      ws.id,
      info.source,
      info.referrer?.slice(0, 300) ?? null,
      info.path.slice(0, 300),
      info.device,
    ]);
    return { returning: false, newVisit: true };
  }
  const newVisit = Date.now() - Number(row.last_seen) > 30 * 60 * 1000;
  await exec(`UPDATE visitors SET last_seen=?, visits = visits + ? WHERE id=?`, [Date.now(), newVisit ? 1 : 0, id]);
  return { returning: true, newVisit };
}

export async function isReturningVisitor(id: string | null | undefined) {
  if (!id) return false;
  const r = await one<{ visits: number }>(`SELECT visits FROM visitors WHERE id=?`, [id]);
  return Number(r?.visits ?? 0) > 1;
}

export function deviceOf(ua: string | null) {
  const u = (ua ?? '').toLowerCase();
  if (/ipad|tablet/.test(u)) return 'tablet';
  if (/mobi|android|iphone/.test(u)) return 'mobile';
  return 'desktop';
}
