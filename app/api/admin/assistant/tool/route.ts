import { adminFromRequest } from '@/lib/auth';
import { runAdminTool } from '@/lib/admin-assistant';
import { bad, json, rateLimit, readJson, s } from '@/lib/http';
import { getActiveWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Call = { name?: string; args?: Record<string, unknown> };

/**
 * Runs CRM tools for the admin copilot as the signed-in staff member (same permission rules as the admin screens).
 * Accepts one call ({name, args}) or a batch ({calls: [...]}) — a batch shares one sign-in check and runs in parallel.
 */
export async function POST(req: Request) {
  const session = await adminFromRequest();
  if (!session) return bad('Not signed in.', 401);
  const body = await readJson<Call & { calls?: Call[] }>(req);
  const calls = (Array.isArray(body?.calls) ? body.calls : [body ?? {}]).slice(0, 8);
  if (!rateLimit(`admintool:${session.user.id}`, 600, 60 * 60 * 1000)) return bad('Too many actions. Please wait a little.', 429);
  const ws = await getActiveWorkspace();
  const results = await Promise.all(
    calls.map(async (c) => {
      const name = s(c?.name, 60);
      if (!name) return { ok: false, error: 'Missing tool name.' };
      const args = c?.args && typeof c.args === 'object' && !Array.isArray(c.args) ? c.args : {};
      try {
        return await runAdminTool(ws, session, name, args);
      } catch (e) {
        console.error('[admin-assistant tool]', name, e);
        return { ok: false, error: 'That action failed on the server.' };
      }
    }),
  );
  return json(Array.isArray(body?.calls) ? { results } : results[0]);
}
