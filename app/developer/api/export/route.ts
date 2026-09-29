import { getDeveloperSession } from '@/lib/dev-auth';
import { getWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Download a workspace config as JSON (for backups, or to seed another deployment). Webhook secrets are removed. */
export async function GET(req: Request) {
  if (!(await getDeveloperSession())) return new Response('Not signed in', { status: 401 });
  const id = new URL(req.url).searchParams.get('ws') ?? '';
  const ws = await getWorkspace(id);
  if (!ws) return new Response('Not found', { status: 404 });
  const config = structuredClone(ws.config);
  config.integrations.webhooks = config.integrations.webhooks.map((w) => ({ ...w, secret: '' }));
  return new Response(JSON.stringify({ id: ws.id, name: ws.name, exported_at: new Date().toISOString(), config }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="workspace-${ws.id}.json"`, 'Cache-Control': 'no-store' },
  });
}
