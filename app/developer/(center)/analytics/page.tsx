import { editingWorkspace } from '@/lib/dev-workspace';
import { analyticsSchema } from '@/lib/dev-schemas';
import { q } from '@/lib/db';
import { ConfigEditor } from '@/components/developer/SchemaForm';
import { DevCard, DevHeader } from '@/components/developer/DevUi';

export const metadata = { title: 'Analytics events' };

export default async function AnalyticsPage() {
  const { ws } = await editingWorkspace();
  const counts = await q<{ type: string; n: number; last: number }>(
    `SELECT type, COUNT(*) AS n, MAX(created_at) AS last FROM events WHERE workspace_id=? AND created_at > ? GROUP BY type ORDER BY n DESC`,
    [ws.id, Date.now() - 30 * 86_400_000],
  );
  return (
    <>
      <DevHeader title="Analytics configuration" subtitle="Which events are recorded. Reports in /admin are built from these events plus conversations, leads, tasks and appointments." />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ConfigEditor key={`${ws.id}:${ws.updated_at}`} path="analytics" title="Event definitions" value={ws.config.analytics} defs={analyticsSchema()} />
        <DevCard title="Events received (last 30 days)">
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-white/[0.05]">
              {counts.map((r) => (
                <tr key={r.type}>
                  <td className="py-2 font-mono text-[12px] text-amber-200">{r.type}</td>
                  <td className="py-2 text-right tabular-nums text-white/80">{Number(r.n).toLocaleString()}</td>
                </tr>
              ))}
              {!counts.length && (
                <tr>
                  <td className="py-6 text-center text-white/40">No events yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </DevCard>
      </div>
    </>
  );
}
