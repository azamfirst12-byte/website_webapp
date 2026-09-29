import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { listConversations } from '@/lib/conversations';
import { visibility } from '@/lib/crm';
import { ago, duration, labelize } from '@/lib/format';
import { DemoTag, Empty, PageHeader, Pager, Tabs, btnCls, inputCls } from '@/components/admin/ui';

export const metadata = { title: 'Conversations' };

const OUTCOME_CLS: Record<string, string> = {
  booking_requested: 'bg-emerald-400/15 text-emerald-200',
  lead_captured: 'bg-brand/25 text-violet-100',
  handoff: 'bg-amber-400/15 text-amber-100',
  information: 'bg-white/5 text-white/60',
  no_engagement: 'bg-white/5 text-white/40',
};

export default async function Conversations({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const sp = await searchParams;
  const { rows, total, page, pageSize } = await listConversations(ws, {
    channel: sp.channel,
    outcome: sp.outcome,
    q: sp.q,
    page: Number(sp.page) || 1,
    leadVisibleTo: session.user.role === 'sales' ? (() => {
      const v = visibility({ id: session.user.id, role: session.user.role }, 'l');
      return v;
    })() : undefined,
  });
  const params = Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'page')) as Record<string, string | undefined>;
  const tab = (ch?: string) => `/admin/conversations${ch ? `?channel=${ch}` : ''}`;
  return (
    <>
      <PageHeader title="AI & voice conversations" subtitle={`${total} conversations · transcripts, AI summaries and website actions`} />
      <Tabs
        current={sp.channel ?? 'all'}
        items={[
          { key: 'all', label: 'All', href: tab() },
          { key: 'voice', label: '🎙 Voice', href: tab('voice') },
          { key: 'text', label: '💬 Chat', href: tab('text') },
        ]}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        {sp.channel && <input type="hidden" name="channel" value={sp.channel} />}
        <input name="q" defaultValue={sp.q} placeholder="Search transcripts, intents, names…" className={`${inputCls} max-w-sm`} />
        <select name="outcome" defaultValue={sp.outcome ?? ''} className={`${inputCls} w-auto`} aria-label="Outcome">
          <option value="">Any outcome</option>
          {Object.keys(OUTCOME_CLS).map((o) => (
            <option key={o} value={o}>
              {labelize(o)}
            </option>
          ))}
        </select>
        <button className={btnCls}>Search</button>
      </form>
      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0b1020]">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead className="border-b border-white/[0.07] text-[11.5px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3">Started</th>
                <th className="px-3 py-3">Channel</th>
                <th className="px-3 py-3">Visitor / lead</th>
                <th className="px-3 py-3">Intent</th>
                <th className="px-3 py-3 text-right">Turns</th>
                <th className="px-3 py-3 text-right">Actions</th>
                <th className="px-3 py-3">Duration</th>
                <th className="px-3 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/conversations/${c.id}`} className="font-semibold text-white hover:underline">
                      {ago(c.started_at)}
                    </Link>
                    {c.status === 'open' && <span className="ml-2 rounded-full bg-emerald-400/15 px-1.5 text-[10px] font-bold uppercase text-emerald-200">Live</span>}
                  </td>
                  <td className="px-3 py-3 text-white/75">{c.channel === 'voice' ? '🎙 Voice' : '💬 Chat'}</td>
                  <td className="px-3 py-3">
                    {c.lead_id ? (
                      <Link href={`/admin/leads/${c.lead_id}`} className="text-white hover:underline">
                        {c.lead_name || `Lead #${c.lead_id}`}
                      </Link>
                    ) : (
                      <span className="text-white/40">Anonymous</span>
                    )}{' '}
                    <DemoTag show={c.is_demo} />
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-3 text-white/70">{c.intent ?? c.first_message ?? '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-white/70">{c.turn_count}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-white/70">
                    {c.action_count}
                    {c.failed_actions > 0 && <span className="ml-1 text-red-300">({c.failed_actions}✕)</span>}
                  </td>
                  <td className="px-3 py-3 text-white/55">{c.ended_at ? duration(c.ended_at - c.started_at) : '—'}</td>
                  <td className="px-3 py-3">
                    {c.outcome ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OUTCOME_CLS[c.outcome] ?? 'bg-white/5'}`}>{labelize(c.outcome)}</span> : <span className="text-white/35">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No conversations yet. They appear here as soon as a visitor talks to the assistant.</Empty>
      )}
      <Pager base="/admin/conversations" params={params} page={page} total={total} pageSize={pageSize} />
    </>
  );
}
