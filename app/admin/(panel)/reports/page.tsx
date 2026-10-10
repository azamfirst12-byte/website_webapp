import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { byService, bySource, byStage, channelComparison, intents, kpis, repPerformance, topPages, topSections, trafficSources, trends, voiceCommands, wonLostTrend } from '@/lib/analytics';
import { parseReportFilters, RANGES } from '@/lib/report-filters';
import { duration, labelize, money, pct } from '@/lib/format';
import { can } from '@/lib/permissions';
import { ACTION_LABEL } from '@/lib/tool-defs';
import { Kpi, PageHeader, Panel, btnCls, btnGhost, inputCls } from '@/components/admin/ui';
import { Donut, HBars, LineChart, SERIES } from '@/components/admin/DashCharts';

export const metadata = { title: 'Reports' };

type SP = Record<string, string | undefined>;
const p100 = (x: number) => `${Math.round(x * 1000) / 10}%`;
// Literal colors: SERIES comes from a 'use client' module, so it isn't a real array inside this server component.
const LINE = { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', yellow: '#c98500' };

export default async function Reports({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireAdmin('reports.view');
  const ws = await getActiveWorkspace();
  const sp = await searchParams;
  const f = parseReportFilters(sp);
  const c = ws.config;
  const cur = c.pricing.currency;
  const [k, t, svc, src, stages, it, cmds, ch, traffic, pages, sections, reps, wl] = await Promise.all([
    kpis(ws, f),
    trends(ws, f),
    byService(ws, f),
    bySource(ws, f),
    byStage(ws, f),
    intents(ws, f),
    voiceCommands(ws, f),
    channelComparison(ws, f),
    trafficSources(ws, f),
    topPages(ws, f),
    topSections(ws, f),
    repPerformance(ws, f),
    wonLostTrend(ws, f),
  ]);
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const labelMode = t.bucket === 'month' ? 'month' : 'day';

  return (
    <>
      <PageHeader
        title="Analytics & reports"
        subtitle="Visitor engagement, AI performance, lead conversion, pipeline and voice usage"
        actions={
          can(session.user.role, 'export') && (
            <a href={`/api/admin/export?${exportQs}`} className={btnGhost}>
              Export leads CSV
            </a>
          )
        }
      />

      <form className="mb-5 grid gap-2 rounded-2xl border border-white/[0.08] bg-[#0b1020] p-3 sm:grid-cols-2 lg:grid-cols-5">
        <select name="range" defaultValue={sp.from ? '' : (sp.range ?? '30d')} className={inputCls} aria-label="Date range">
          {Object.entries(RANGES).map(([key, r]) => (
            <option key={key} value={key}>
              {r.label}
            </option>
          ))}
          <option value="">Custom (dates →)</option>
        </select>
        <div className="flex gap-2">
          <input type="date" name="from" defaultValue={sp.from} className={inputCls} aria-label="From" />
          <input type="date" name="to" defaultValue={sp.to} className={inputCls} aria-label="To" />
        </div>
        <select name="bucket" defaultValue={sp.bucket ?? ''} className={inputCls} aria-label="Trend interval">
          <option value="">Auto interval</option>
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
        <select name="channel" defaultValue={sp.channel ?? ''} className={inputCls} aria-label="Channel">
          <option value="">Voice + text</option>
          <option value="voice">Voice only</option>
          <option value="text">Text only</option>
        </select>
        <select name="source" defaultValue={sp.source ?? ''} className={inputCls} aria-label="Lead source">
          <option value="">All lead sources</option>
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
        <select name="stage" defaultValue={sp.stage ?? ''} className={inputCls} aria-label="Sales stage">
          <option value="">All stages</option>
          {c.crm.stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="customer_type" defaultValue={sp.customer_type ?? ''} className={inputCls} aria-label="Customer type">
          <option value="">All customer types</option>
          {c.crm.customerTypes.map((s) => (
            <option key={s} value={s}>
              {labelize(s)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-1 text-[12.5px] text-white/60">
          <input type="checkbox" name="demo" value="hide" defaultChecked={sp.demo === 'hide'} /> Exclude demo data
        </label>
        <div className="flex gap-2">
          <button className={btnCls}>Apply</button>
          <Link href="/admin/reports" className={btnGhost}>
            Reset
          </Link>
        </div>
      </form>

      <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-white/40">Visitors & engagement</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Total visitors" value={k.visitors.toLocaleString()} />
        <Kpi label="Returning visitors" value={k.returningVisitors} hint={`${pct(k.returningVisitors, k.visitors)}%`} />
        <Kpi label="Page views" value={k.pageViews.toLocaleString()} hint={`${k.ctaClicks} CTA clicks`} />
        <Kpi label="Avg. engagement" value={duration(k.avgEngagementMs)} hint="Per visitor" />
        <Kpi label="AI conversations" value={k.conversations} hint={`${k.voiceSessions} voice · ${k.textSessions} text`} />
        <Kpi label="AI success rate" value={p100(k.aiSuccessRate)} tone={k.aiSuccessRate >= 0.6 ? 'good' : 'warn'} />
      </div>

      <h2 className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-widest text-white/40">Leads & sales</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Leads captured" value={k.leads} hint={`${p100(k.visitorToLeadRate)} of visitors`} />
        <Kpi label="Qualified leads" value={k.qualifiedLeads} hint={`${k.hotLeads} high-intent`} tone="good" />
        <Kpi label="Lead → client" value={p100(k.leadToClientRate)} hint={`${k.won} won · ${k.lost} lost`} />
        <Kpi label="Won value" value={money(k.wonValue, cur)} tone="good" />
        <Kpi label="Pipeline value" value={money(k.pipelineValue, cur)} hint={`${k.activeOpportunities} active opportunities · ${money(k.weightedPipelineValue, cur)} weighted`} />
        <Kpi label="Follow-up completion" value={p100(k.followUpCompletion)} hint={`${k.tasksDone}/${k.tasksDue} due · ${p100(k.followUpOnTime)} on time`} tone={k.followUpCompletion >= 0.8 ? 'good' : 'warn'} />
      </div>

      <h2 className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-widest text-white/40">Voice</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Voice sessions" value={k.voiceSessions} hint={`${pct(k.voiceSessions, k.conversations)}% of conversations`} />
        <Kpi label="Commands / session" value={k.commandsPerVoiceSession.toFixed(1)} hint={`${k.voiceActions} website actions`} />
        <Kpi label="Failed / unrecognised" value={p100(k.voiceActionFailRate)} tone={k.voiceActionFailRate > 0.15 ? 'bad' : 'good'} />
        <Kpi label="Voice-generated leads" value={k.voiceLeads} />
        <Kpi label="Voice → booking" value={p100(k.voiceToBookingRate)} hint={`${k.consultationRequests} consultation requests total`} />
        <Kpi label="Human hand-off rate" value={p100(k.handoffRate)} hint={`${k.handoffs} hand-overs`} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Lead trend" subtitle={`${labelize(t.bucket)}ly`}>
          <LineChart
            labelMode={labelMode}
            labels={t.labels}
            series={[
              { name: 'Leads', values: t.leads, color: LINE.blue },
              { name: 'Qualified', values: t.qualified, color: LINE.aqua },
              { name: 'Won', values: t.won, color: LINE.yellow },
            ]}
          />
        </Panel>
        <Panel title="Won vs lost" subtitle="Leads created in the period">
          <LineChart
            labelMode={labelMode}
            labels={wl.labels}
            series={[
              { name: 'Won', values: wl.won, color: LINE.aqua },
              { name: 'Lost', values: wl.lost, color: LINE.orange },
            ]}
          />
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <p className="mb-2 text-[12px] font-semibold text-white/60">Voice vs text conversations</p>
            <LineChart
              labelMode={labelMode}
              height={140}
              labels={t.labels}
              series={[
                { name: 'Voice', values: t.voice, color: SERIES[2] },
                { name: 'Text', values: t.text, color: SERIES[1] },
              ]}
            />
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Top-performing services" subtitle="Leads (won · won value)">
          <HBars data={svc.slice(0, 8).map((s) => ({ label: s.label, n: s.leads, sub: `${s.won} won · ${money(s.value, cur)}` }))} />
        </Panel>
        <Panel title="Pipeline by stage" subtitle="All current leads">
          <HBars data={stages.map((s) => ({ label: s.label, n: s.n, sub: money(s.value, cur) }))} color={SERIES[4]} />
        </Panel>
      </div>

      <Panel title="Lead source performance" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="text-[11.5px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="py-2">Source</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Qualified</th>
                <th className="py-2 text-right">Won</th>
                <th className="py-2 text-right">Conversion</th>
                <th className="py-2 text-right">Won value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {src.map((r) => (
                <tr key={r.source}>
                  <td className="py-2.5 text-white">{labelize(r.source)}</td>
                  <td className="py-2.5 text-right tabular-nums text-white/80">{r.leads}</td>
                  <td className="py-2.5 text-right tabular-nums text-white/80">{r.qualified}</td>
                  <td className="py-2.5 text-right tabular-nums text-white/80">{r.won}</td>
                  <td className="py-2.5 text-right tabular-nums text-white/60">{pct(r.won, r.leads)}%</td>
                  <td className="py-2.5 text-right tabular-nums text-white/80">{money(r.value, cur)}</td>
                </tr>
              ))}
              {!src.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-white/40">
                    No leads in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Voice vs text engagement">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="py-2">Channel</th>
                <th className="py-2 text-right">Sessions</th>
                <th className="py-2 text-right">Avg turns</th>
                <th className="py-2 text-right">Avg length</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Bookings</th>
                <th className="py-2 text-right">Success</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {ch.map((r) => (
                <tr key={r.channel}>
                  <td className="py-2.5 text-white">{r.channel === 'voice' ? '🎙 Voice' : '💬 Text'}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.sessions}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.avgTurns.toFixed(1)}</td>
                  <td className="py-2.5 text-right tabular-nums">{duration(r.avgMs)}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.leads}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.bookings}</td>
                  <td className="py-2.5 text-right tabular-nums">{p100(r.successRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Most common voice commands" subtitle="Successful · failed/unrecognised">
          <ul className="space-y-2">
            {cmds.map((cmd) => {
              const total = cmd.ok + cmd.failed;
              const max = Math.max(...cmds.map((x) => x.ok + x.failed), 1);
              return (
                <li key={cmd.name} className="text-[12px]">
                  <div className="mb-1 flex justify-between">
                    <span className="text-white/80">{cmd.name === 'unrecognized' ? 'Not understood' : (ACTION_LABEL[cmd.name as keyof typeof ACTION_LABEL] ?? cmd.name)}</span>
                    <span className="tabular-nums text-white/55">
                      {cmd.ok}
                      {cmd.failed > 0 && <span className="text-red-300"> · {cmd.failed} failed</span>}
                    </span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-white/5" style={{ width: `${Math.max(4, (100 * total) / max)}%` }}>
                    <div className="h-2 bg-[#199e70]" style={{ width: `${(100 * cmd.ok) / (total || 1)}%` }} />
                    <div className="h-2 bg-[#d95926]" style={{ width: `${(100 * cmd.failed) / (total || 1)}%` }} />
                  </div>
                </li>
              );
            })}
            {!cmds.length && <p className="py-6 text-center text-[12px] text-white/40">No voice commands in this period.</p>}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Intent categories" subtitle="What visitors ask about">
          <Donut centerLabel="questions" data={it.categories} />
        </Panel>
        <Panel title="Most common customer questions">
          <ol className="space-y-2 text-[13px]">
            {it.questions.map((qq, i) => (
              <li key={qq.label} className="flex items-start gap-3">
                <span className="w-5 shrink-0 text-right text-white/35">{i + 1}.</span>
                <span className="flex-1 text-white/85">{qq.label}</span>
                <span className="tabular-nums text-white/45">{qq.n}</span>
              </li>
            ))}
            {!it.questions.length && <p className="py-6 text-center text-[12px] text-white/40">No questions recorded yet.</p>}
          </ol>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Traffic sources" subtitle="Visitors">
          <HBars data={traffic.map((x) => ({ label: labelize(x.label), n: x.n }))} color={SERIES[1]} />
        </Panel>
        <Panel title="Top pages" subtitle="Page views">
          <HBars data={pages.map((x) => ({ label: x.label, n: x.n }))} color={SERIES[2]} />
        </Panel>
        <Panel title="Most viewed sections">
          <HBars data={sections.map((x) => ({ label: labelize(x.label), n: x.n }))} color={SERIES[3]} />
        </Panel>
      </div>

      {can(session.user.role, 'leads.view_all') && (
        <Panel title="Sales reps" className="mt-4">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="py-2">Rep</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Won</th>
                <th className="py-2 text-right">Won value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {reps.map((r) => (
                <tr key={r.name}>
                  <td className="py-2.5 text-white">{r.name}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.leads}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.won}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(r.value, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <p className="mt-4 text-[11.5px] text-white/35">
        Definitions: qualified = score ≥ {c.scoring.qualifiedThreshold} or at/after the Qualified stage · AI success = conversation captured a lead, a booking or a hand-over, or ran without
        mostly-failed actions and positive sentiment · engagement = visible time on pages. Pipeline figures are a current snapshot.
      </p>
    </>
  );
}
