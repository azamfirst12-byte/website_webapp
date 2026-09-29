import { adminFromRequest } from '@/lib/auth';
import { exec, one, q } from '@/lib/db';
import { bad, json, readJson } from '@/lib/http';
import { getActiveWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await adminFromRequest();
  if (!s) return bad('Not signed in.', 401);
  const ws = await getActiveWorkspace();
  const [items, unread] = await Promise.all([
    q(`SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id=? AND workspace_id=? ORDER BY created_at DESC LIMIT 15`, [s.user.id, ws.id]),
    one<{ n: number }>(`SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND workspace_id=? AND read_at IS NULL`, [s.user.id, ws.id]),
  ]);
  return json({ items, unread: Number(unread?.n ?? 0) });
}

export async function POST(req: Request) {
  const s = await adminFromRequest();
  if (!s) return bad('Not signed in.', 401);
  const body = await readJson<{ ids?: number[]; all?: boolean }>(req);
  if (body?.all) await exec(`UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL`, [Date.now(), s.user.id]);
  else {
    for (const id of (body?.ids ?? []).slice(0, 50)) await exec(`UPDATE notifications SET read_at=? WHERE id=? AND user_id=?`, [Date.now(), Number(id), s.user.id]);
  }
  return json({ ok: true });
}
