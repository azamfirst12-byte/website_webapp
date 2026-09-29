import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { q } from '@/lib/db';
import { ago } from '@/lib/format';
import { Empty, PageHeader, btnGhost } from '@/components/admin/ui';
import { markAllReadAction } from '../../actions';

export const metadata = { title: 'Notifications' };

export default async function Notifications() {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const rows = await q<{ id: number; type: string; title: string; body: string | null; link: string | null; read_at: number | null; created_at: number }>(
    `SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id=? AND workspace_id=? ORDER BY created_at DESC LIMIT 200`,
    [session.user.id, ws.id],
  );
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="New and high-intent leads, consultation requests, hand-overs, wins and assignments. Email alerts go to SALES_NOTIFY_EMAIL."
        actions={
          <form action={markAllReadAction}>
            <button className={btnGhost}>Mark all read</button>
          </form>
        }
      />
      {rows.length ? (
        <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1020]">
          {rows.map((n) => (
            <li key={n.id} className={n.read_at ? '' : 'bg-brand/[0.06]'}>
              <Link href={n.link || '#'} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03]">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-brand2'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-white">{n.title}</span>
                  {n.body && <span className="block whitespace-pre-line text-[12.5px] text-white/55">{n.body}</span>}
                </span>
                <span className="shrink-0 text-[11.5px] text-white/35">{ago(n.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No notifications yet.</Empty>
      )}
    </>
  );
}
