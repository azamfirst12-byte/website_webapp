import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { listLeads, type LeadFilters } from '@/lib/crm';
import { assignableStaff } from '@/lib/admin-users';
import { ago, fmtDateTime, labelize, money } from '@/lib/format';
import { can } from '@/lib/permissions';
import { DemoTag, Empty, PageHeader, Pager, ScoreBadge, StageBadge, btnCls, btnGhost, inputCls } from '@/components/admin/ui';

export const metadata = { title: 'Leads' };

type SP = Record<string, string | undefined>;

export default async function Leads({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const sp = await searchParams;
  const c = ws.config;
  const f: LeadFilters = {
    q: sp.q,
    stage: sp.stage,
    source: sp.source,
    service: sp.service,
    assigned: sp.assigned,
    channel: sp.channel,
    customerType: sp.customer_type,
    band: sp.band as LeadFilters['band'],
    sort: (sp.sort as LeadFilters['sort']) || 'recent',
    page: Number(sp.page) || 1,
    demo: sp.demo === 'hide' ? 'hide' : undefined,
  };
  const [{ rows, total, page, pageSize }, staff] = await Promise.all([listLeads(ws, f, { id: session.user.id, role: session.user.role }), assignableStaff()]);
  const svc = new Map(c.services.map((s) => [s.slug, s.name]));
  const params = Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'page')) as SP;
  const exportQs = new URLSearchParams(Object.entries({ source: sp.source, service: sp.service, stage: sp.stage, customer_type: sp.customer_type, channel: sp.channel, range: '365d', demo: sp.demo }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <PageHeader
        title="Leads & customers"
        subtitle={`${total} ${total === 1 ? 'lead' : 'leads'}${session.user.role === 'sales' ? ' assigned to you or unassigned' : ''}`}
        actions={
          <>
            {can(session.user.role, 'export') && (
              <a href={`/api/admin/export?${exportQs}`} className={btnGhost}>
                Export CSV
              </a>
            )}
            {can(session.user.role, 'leads.edit') && (
              <Link href="/admin/leads/new" className={btnCls}>
                + New lead
              </Link>
            )}
          </>
        }
      />
      <form className="mb-4 grid gap-2 rounded-2xl border border-white/[0.08] bg-[#0b1020] p-3 sm:grid-cols-2 lg:grid-cols-6">
        <input name="q" defaultValue={sp.q} placeholder="Search name, email, phone, company…" className={`${inputCls} lg:col-span-2`} />
        <select name="stage" defaultValue={sp.stage ?? ''} className={inputCls} aria-label="Stage">
          <option value="">All stages</option>
          {c.crm.stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="band" defaultValue={sp.band ?? ''} className={inputCls} aria-label="Score">
          <option value="">Any score</option>
          <option value="hot">Hot (≥{c.scoring.highIntentThreshold})</option>
          <option value="qualified">Qualified</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
        <select name="source" defaultValue={sp.source ?? ''} className={inputCls} aria-label="Source">
          <option value="">All sources</option>
          {c.crm.sources.map((s) => (
            <option key={s} value={s}>
              {labelize(s)}
            </option>
          ))}
        </select>
        <select name="service" defaultValue={sp.service ?? ''} className={inputCls} aria-label="Service">
          <option value="">All services</option>
          {c.services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="assigned" defaultValue={sp.assigned ?? ''} className={inputCls} aria-label="Assigned to">
          <option value="">Anyone</option>
          <option value="me">Me</option>
          <option value="unassigned">Unassigned</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.username}
            </option>
          ))}
        </select>
        <select name="channel" defaultValue={sp.channel ?? ''} className={inputCls} aria-label="Channel">
          <option value="">All channels</option>
          <option value="voice">Voice</option>
          <option value="text">Text chat</option>
          <option value="form">Forms</option>
        </select>
        <select name="customer_type" defaultValue={sp.customer_type ?? ''} className={inputCls} aria-label="Customer type">
          <option value="">All customer types</option>
          {c.crm.customerTypes.map((s) => (
            <option key={s} value={s}>
              {labelize(s)}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sp.sort ?? 'recent'} className={inputCls} aria-label="Sort">
          <option value="recent">Newest first</option>
          <option value="score">Highest score</option>
          <option value="value">Highest value</option>
          <option value="follow_up">Next follow-up</option>
        </select>
        <label className="flex items-center gap-2 px-1 text-[12.5px] text-white/60">
          <input type="checkbox" name="demo" value="hide" defaultChecked={sp.demo === 'hide'} /> Hide demo
        </label>
        <div className="flex gap-2">
          <button className={btnCls}>Filter</button>
          <Link href="/admin/leads" className={btnGhost}>
            Reset
          </Link>
        </div>
      </form>

      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0b1020]">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead className="border-b border-white/[0.07] text-[11.5px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3 font-semibold">Lead</th>
                <th className="px-3 py-3 font-semibold">Score</th>
                <th className="px-3 py-3 font-semibold">Stage</th>
                <th className="px-3 py-3 font-semibold">Interested in</th>
                <th className="px-3 py-3 font-semibold">Source</th>
                <th className="px-3 py-3 text-right font-semibold">Value</th>
                <th className="px-3 py-3 font-semibold">Owner</th>
                <th className="px-3 py-3 font-semibold">Next follow-up</th>
                <th className="px-3 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/leads/${l.id}`} className="flex items-center gap-1.5 font-semibold text-white hover:underline">
                      {l.name || l.email || l.phone || `Lead #${l.id}`} <DemoTag show={l.is_demo} />
                    </Link>
                    <p className="text-[12px] text-white/45">{[l.company, l.email].filter(Boolean).join(' · ') || '—'}</p>
                  </td>
                  <td className="px-3 py-3">
                    <ScoreBadge score={l.score} qualified={c.scoring.qualifiedThreshold} hot={c.scoring.highIntentThreshold} />
                  </td>
                  <td className="px-3 py-3">
                    <StageBadge stage={l.stage} stages={c.crm.stages} />
                  </td>
                  <td className="px-3 py-3 text-white/75">{l.interested_service ? (svc.get(l.interested_service) ?? l.interested_service) : '—'}</td>
                  <td className="px-3 py-3 text-white/65">
                    {labelize(l.source)}
                    {l.channel && l.channel !== 'form' && <span className="ml-1 rounded bg-white/5 px-1 text-[10.5px] uppercase text-white/50">{l.channel}</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-white/85">{money(l.value, c.pricing.currency)}</td>
                  <td className="px-3 py-3 text-white/65">{l.assignee_name ?? <span className="text-white/35">Unassigned</span>}</td>
                  <td className={`px-3 py-3 ${l.next_follow_up_at && l.next_follow_up_at < Date.now() ? 'text-red-300' : 'text-white/65'}`}>{l.next_follow_up_at ? fmtDateTime(l.next_follow_up_at) : '—'}</td>
                  <td className="px-3 py-3 text-white/45">{ago(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No leads match these filters.</Empty>
      )}
      <Pager base="/admin/leads" params={params} page={page} total={total} pageSize={pageSize} />
    </>
  );
}
