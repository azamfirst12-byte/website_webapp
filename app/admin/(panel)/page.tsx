import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { byStage, kpis, recentFeed, trends } from '@/lib/analytics';
import { listAppointments, listLeads, listTasks } from '@/lib/crm';
import { ago, duration, fmtDateTime, labelize, money, pct } from '@/lib/format';
import { can } from '@/lib/permissions';
import { Empty, Kpi, PageHeader, Panel, ScoreBadge, btnCls, btnGhost, DemoTag } from '@/components/admin/ui';
import { HBars, LineChart, SERIES } from '@/components/admin/DashCharts';
import { toggleTaskAction } from '../actions';

export const metadata = { title: 'Dashboard' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const { denied } = await searchParams;
  const c = ws.config;
  const viewer = { id: session.user.id, role: session.user.role };
  const f = { from: Date.now() - 30 * 86_400_000, to: Date.now() + 1, bucket: 'day' as const };
  const [k, t, stages, feed, hot, tasks, appts] = await Promise.all([
    kpis(ws, f),
    trends(ws, f),
    byStage(ws, f),
    recentFeed(ws, 10),
    listLeads(ws, { sort: 'score', openOnly: true }, viewer, 6),
    listTasks(ws, viewer, 'mine'),
    listAppointments(ws, viewer, 'upcoming'),
  ]);
  const cur = c.pricing.currency;
  const s = c.scoring;
  const openStages = stages.filter((x) => c.crm.stages.find((y) => y.key === x.key)?.kind === 'open');

  return (
    <>
      {denied && <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-[13px] text-red-200">Your role doesn&apos;t have access to that page.</p>}
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${session.user.name.split(' ')[0]}`}
        subtitle={`${c.brand.name} · last 30 days`}
        actions={
          <>
            {can(session.user.role, 'leads.edit') && (
              <Link href="/admin/leads/new" className={btnCls}>
                + New lead
              </Link>
            )}
            {can(session.user.role, 'reports.view') && (
              <Link href="/admin/reports" className={btnGhost}>
                Full reports
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Visitors" value={k.visitors.toLocaleString()} hint={`${k.returningVisitors} returning`} />
        <Kpi label="AI conversations" value={k.conversations} hint={`${k.voiceSessions} voice · ${k.textSessions} text`} />
        <Kpi label="Leads captured" value={k.leads} hint={`${pct(k.leads, k.visitors)}% of visitors`} />
        <Kpi label="Qualified" value={k.qualifiedLeads} hint={`${k.hotLeads} high-intent`} tone="good" />
        <Kpi label="Won" value={k.won} hint={`${money(k.wonValue, cur)} · ${pct(k.won, k.leads)}% conv.`} tone="good" />
        <Kpi label="Open pipeline" value={money(k.pipelineValue, cur)} hint={`${money(k.weightedPipelineValue, cur)} weighted`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Leads & conversations" subtitle="Daily, last 30 days">
          <LineChart
            labels={t.labels}
            series={[
              { name: 'Leads', values: t.leads, color: SERIES[0] },
              { name: 'Voice conversations', values: t.voice, color: SERIES[2] },
              { name: 'Text conversations', values: t.text, color: SERIES[1] },
            ]}
          />
        </Panel>
        <Panel title="Pipeline by stage" subtitle="Open leads, current">
          <HBars data={openStages.map((x) => ({ label: x.label, n: x.n, sub: money(x.value, cur) }))} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px]">
            <div className="rounded-xl bg-white/[0.04] p-2">
              <p className="text-white/45">AI success</p>
              <p className="font-head text-[17px] font-bold text-white">{Math.round(k.aiSuccessRate * 100)}%</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-2">
              <p className="text-white/45">Consultations</p>
              <p className="font-head text-[17px] font-bold text-white">{k.consultationRequests}</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-2">
              <p className="text-white/45">Avg. chat</p>
              <p className="font-head text-[17px] font-bold text-white">{duration(k.avgConversationMs)}</p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Hottest leads" actions={<Link href="/admin/leads?sort=score" className="text-[12px] font-semibold text-brand2">All →</Link>}>
          {hot.rows.length ? (
            <ul className="space-y-2">
              {hot.rows.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/leads/${l.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/[0.04]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand/40 to-brand2/30 text-[12px] font-bold">
                      {(l.name || l.email || '?').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold text-white">
                        {l.name || l.email || l.phone} <DemoTag show={l.is_demo} />
                      </span>
                      <span className="block truncate text-[11.5px] text-white/45">
                        {l.company ?? labelize(l.source)} · {ago(l.created_at)}
                      </span>
                    </span>
                    <ScoreBadge score={l.score} qualified={s.qualifiedThreshold} hot={s.highIntentThreshold} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No leads yet.</Empty>
          )}
        </Panel>

        <Panel title="My follow-ups" actions={<Link href="/admin/tasks" className="text-[12px] font-semibold text-brand2">All →</Link>}>
          {tasks.length ? (
            <ul className="space-y-1.5">
              {tasks.slice(0, 7).map((tk) => {
                const overdue = tk.due_at && tk.due_at < Date.now();
                return (
                  <li key={tk.id} className="flex items-start gap-2.5 rounded-xl p-2 hover:bg-white/[0.03]">
                    <form action={toggleTaskAction}>
                      <input type="hidden" name="id" value={tk.id} />
                      <input type="hidden" name="done" value="1" />
                      <button aria-label="Mark done" className="mt-0.5 grid h-5 w-5 place-items-center rounded-md border border-white/25 hover:border-emerald-400 hover:bg-emerald-400/20" />
                    </form>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-white">{tk.title}</span>
                      <span className={`text-[11.5px] ${overdue ? 'text-red-300' : 'text-white/45'}`}>
                        {tk.due_at ? `${overdue ? 'Overdue · ' : ''}${fmtDateTime(tk.due_at)}` : 'No due date'}
                        {tk.lead_id && (
                          <>
                            {' · '}
                            <Link href={`/admin/leads/${tk.lead_id}`} className="hover:text-white">
                              {tk.lead_name}
                            </Link>
                          </>
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Nothing due. Nice.</Empty>
          )}
        </Panel>

        <Panel title="Upcoming consultations" actions={<Link href="/admin/appointments" className="text-[12px] font-semibold text-brand2">All →</Link>}>
          {appts.length ? (
            <ul className="space-y-2">
              {appts.slice(0, 6).map((a) => (
                <li key={a.id} className="rounded-xl border border-white/[0.06] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/admin/leads/${a.lead_id}`} className="truncate text-[13.5px] font-semibold text-white hover:underline">
                      {a.lead_name}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${a.status === 'requested' ? 'bg-amber-400/15 text-amber-200' : 'bg-emerald-400/15 text-emerald-200'}`}>{a.status}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-white/55">{a.scheduled_at ? fmtDateTime(a.scheduled_at) : `Preferred: ${a.preferred_time ?? '—'}`}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No upcoming consultations.</Empty>
          )}
        </Panel>
      </div>

      <Panel title="Latest activity" className="mt-4">
        {feed.length ? (
          <ul className="divide-y divide-white/[0.05]">
            {feed.map((e, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase ${e.kind === 'lead' ? 'bg-brand/20 text-violet-200' : e.kind === 'booking' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-brand2/15 text-cyan-100'}`}
                >
                  {e.kind}
                </span>
                <Link href={e.kind === 'conversation' ? `/admin/conversations/${e.ref}` : `/admin/leads/${e.ref}`} className="min-w-0 flex-1 truncate text-white hover:underline">
                  {e.title}
                </Link>
                <span className="hidden truncate text-white/45 sm:block sm:max-w-[40%]">{labelize(e.detail)}</span>
                <span className="shrink-0 text-[11.5px] text-white/35">{ago(e.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No activity yet.</Empty>
        )}
      </Panel>
      <p className="mt-3 text-[11.5px] text-white/35">
        Pipeline: {c.crm.stages.map((x) => x.label).join(' → ')} · qualified at score {s.qualifiedThreshold}, high-intent at {s.highIntentThreshold}.
      </p>
    </>
  );
}
