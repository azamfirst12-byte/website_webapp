import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { getLead, leadConversations, leadTimeline, listTasks } from '@/lib/crm';
import { assignableStaff } from '@/lib/admin-users';
import { q } from '@/lib/db';
import { SIGNAL_LABELS } from '@/lib/scoring';
import { ago, fmtDateTime, labelize, money, toLocalInput } from '@/lib/format';
import { can } from '@/lib/permissions';
import type { ScoreSignal } from '@/lib/workspace-types';
import { DemoTag, Empty, Panel, ScoreBadge, StageBadge, btnCls, btnDanger, btnGhost, inputCls } from '@/components/admin/ui';
import { assignAction, deleteLeadAction, noteAction, saveLeadAction, stageAction, taskAction, toggleTaskAction } from '../../../actions';

export const metadata = { title: 'Lead' };

const F = ({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) => (
  <label className={`block text-[11.5px] font-semibold uppercase tracking-wider text-white/45 ${wide ? 'sm:col-span-2' : ''}`}>
    {label}
    <div className="mt-1 normal-case tracking-normal">{children}</div>
  </label>
);

const ICON: Record<string, string> = {
  lead_created: '✨',
  lead_updated: '✏️',
  stage_change: '➜',
  score_change: '📈',
  ai_summary: '🤖',
  booking: '📅',
  note: '📝',
  call: '📞',
  email: '✉️',
  meeting: '🤝',
  task: '☑️',
  task_done: '✅',
  assignment: '👤',
  handoff: '🙋',
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const { id: idStr } = await params;
  const id = Number(idStr);
  const lead = Number.isFinite(id) ? await getLead(ws, id) : undefined;
  if (!lead) notFound();
  const role = session.user.role;
  const mine = lead.assigned_to === null || Number(lead.assigned_to) === session.user.id;
  if (!can(role, 'leads.view_all') && !can(role, 'leads.edit_all') && !mine) notFound();
  const editable = can(role, 'leads.edit') && (can(role, 'leads.edit_all') || mine);
  const c = ws.config;
  const cur = c.pricing.currency;
  const [timeline, convs, tasks, appts, staff] = await Promise.all([
    leadTimeline(id),
    leadConversations(id),
    listTasks(ws, { id: session.user.id, role }, 'mine', id),
    q<{ id: number; status: string; preferred_time: string | null; scheduled_at: number | null; topic: string }>(`SELECT id, status, preferred_time, scheduled_at, topic FROM appointments WHERE lead_id=? ORDER BY created_at DESC`, [id]),
    can(role, 'leads.assign') ? assignableStaff() : Promise.resolve([]),
  ]);
  const svcName = c.services.find((s) => s.slug === lead.interested_service)?.name;
  const stage = c.crm.stages.find((s) => s.key === lead.stage);
  const breakdown = Object.entries(lead.score_breakdown ?? {}) as [ScoreSignal, number][];

  return (
    <>
      <div className="mb-5">
        <Link href="/admin/leads" className="text-[12.5px] text-white/50 hover:text-white">
          ← Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-head text-[26px] font-extrabold tracking-tight text-white">{lead.name || lead.email || lead.phone || `Lead #${lead.id}`}</h1>
          <ScoreBadge score={lead.score} qualified={c.scoring.qualifiedThreshold} hot={c.scoring.highIntentThreshold} />
          <StageBadge stage={lead.stage} stages={c.crm.stages} />
          <DemoTag show={lead.is_demo} />
        </div>
        <p className="mt-1 text-[13px] text-white/55">
          {[lead.company, lead.industry && labelize(lead.industry), `via ${labelize(lead.source)}`, `created ${ago(lead.created_at)}`].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
          {lead.email && (
            <a href={`mailto:${lead.email}`} className={btnGhost}>
              ✉️ {lead.email}
            </a>
          )}
          {lead.phone && (
            <>
              <a href={`tel:${lead.phone}`} className={btnGhost}>
                📞 {lead.phone}
              </a>
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className={btnGhost}>
                WhatsApp
              </a>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          {/* Stage, owner, value */}
          <Panel>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-white/45">Sales stage</p>
                {editable ? (
                  <form action={stageAction} className="mt-1.5 flex gap-2">
                    <input type="hidden" name="id" value={lead.id} />
                    <select name="stage" defaultValue={lead.stage} className={inputCls} aria-label="Stage">
                      {c.crm.stages.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button className={btnCls}>Set</button>
                  </form>
                ) : (
                  <p className="mt-1.5">
                    <StageBadge stage={lead.stage} stages={c.crm.stages} />
                  </p>
                )}
                {lead.lost_reason && <p className="mt-1 text-[12px] text-red-300">Lost: {lead.lost_reason}</p>}
              </div>
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-white/45">Assigned rep</p>
                {staff.length ? (
                  <form action={assignAction} className="mt-1.5 flex gap-2">
                    <input type="hidden" name="id" value={lead.id} />
                    <select name="assigned_to" defaultValue={lead.assigned_to ?? ''} className={inputCls} aria-label="Assigned rep">
                      <option value="">Unassigned</option>
                      {staff.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.username}
                        </option>
                      ))}
                    </select>
                    <button className={btnGhost}>Save</button>
                  </form>
                ) : (
                  <p className="mt-2 text-[14px] text-white">{lead.assignee_name ?? 'Unassigned'}</p>
                )}
              </div>
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-white/45">Opportunity value</p>
                <p className="mt-1.5 font-head text-[24px] font-extrabold text-white">{money(lead.value, cur)}</p>
                <p className="text-[11.5px] text-white/45">
                  {stage?.probability ?? 0}% probability · weighted {money((lead.value * (stage?.probability ?? 0)) / 100, cur)}
                </p>
              </div>
            </div>
            {editable && lead.stage !== 'lost' && c.crm.stages.some((s) => s.kind === 'lost') && (
              <details className="mt-4 text-[12.5px] text-white/60">
                <summary className="cursor-pointer hover:text-white">Mark as lost with a reason…</summary>
                <form action={stageAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={lead.id} />
                  <input type="hidden" name="stage" value={c.crm.stages.find((s) => s.kind === 'lost')!.key} />
                  <input name="lost_reason" required placeholder="Reason (e.g. chose a competitor)" className={inputCls} />
                  <button className={btnDanger}>Mark lost</button>
                </form>
              </details>
            )}
          </Panel>

          {/* AI summary */}
          <Panel title="Conversation summary & next action" subtitle="Written by the AI after each conversation; editable">
            {lead.summary ? <p className="whitespace-pre-line text-[14px] leading-relaxed text-white/85">{lead.summary}</p> : <p className="text-[13px] text-white/45">No summary yet.</p>}
            {lead.next_action && (
              <p className="mt-3 rounded-xl border border-brand2/25 bg-brand2/[0.07] px-3 py-2 text-[13px] text-white">
                <b className="text-brand2">Next action:</b> {lead.next_action}
              </p>
            )}
            <p className="mt-3 text-[12.5px] text-white/50">
              Next follow-up: <span className={lead.next_follow_up_at && lead.next_follow_up_at < Date.now() ? 'text-red-300' : 'text-white/80'}>{fmtDateTime(lead.next_follow_up_at)}</span> · Last
              interaction: {ago(lead.last_interaction_at)}
            </p>
          </Panel>

          {/* Profile */}
          <Panel title="Profile">
            {editable ? (
              <form action={saveLeadAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={lead.id} />
                <F label="Name">
                  <input name="name" defaultValue={lead.name} className={inputCls} />
                </F>
                <F label="Company">
                  <input name="company" defaultValue={lead.company ?? ''} className={inputCls} />
                </F>
                <F label="Email">
                  <input name="email" type="email" defaultValue={lead.email ?? ''} className={inputCls} />
                </F>
                <F label="Phone">
                  <input name="phone" defaultValue={lead.phone ?? ''} className={inputCls} />
                </F>
                <F label="Industry">
                  <input name="industry" defaultValue={lead.industry ?? ''} list="industries" className={inputCls} />
                </F>
                <F label="Customer type">
                  <select name="customer_type" defaultValue={lead.customer_type ?? ''} className={inputCls}>
                    <option value="">—</option>
                    {c.crm.customerTypes.map((t) => (
                      <option key={t} value={t}>
                        {labelize(t)}
                      </option>
                    ))}
                  </select>
                </F>
                <F label="Interested service">
                  <select name="interested_service" defaultValue={lead.interested_service ?? ''} className={inputCls}>
                    <option value="">—</option>
                    {c.services.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </F>
                <F label="Lead source">
                  <select name="source" defaultValue={lead.source} className={inputCls}>
                    {[...new Set([...c.crm.sources, lead.source])].map((s) => (
                      <option key={s} value={s}>
                        {labelize(s)}
                      </option>
                    ))}
                  </select>
                </F>
                <F label="Budget">
                  <input name="budget" defaultValue={lead.budget ?? ''} className={inputCls} />
                </F>
                <F label="Timeline">
                  <input name="timeline" defaultValue={lead.timeline ?? ''} className={inputCls} />
                </F>
                <F label="Team size">
                  <input name="company_size" defaultValue={lead.company_size ?? ''} className={inputCls} />
                </F>
                <F label="Decision maker">
                  <select name="decision_maker" defaultValue={lead.decision_maker === true ? 'yes' : lead.decision_maker === false ? 'no' : ''} className={inputCls}>
                    <option value="">Unknown</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </F>
                <F label={`Value (${cur})`}>
                  <input name="value" type="number" min={0} defaultValue={lead.value} className={inputCls} />
                </F>
                <F label="Next follow-up">
                  <input name="next_follow_up_at" type="datetime-local" defaultValue={toLocalInput(lead.next_follow_up_at)} className={inputCls} />
                </F>
                {c.crm.customFields.map((cf) => (
                  <F key={cf.key} label={cf.label}>
                    {cf.type === 'select' ? (
                      <select name={`custom_${cf.key}`} defaultValue={String(lead.custom?.[cf.key] ?? '')} className={inputCls}>
                        <option value="">—</option>
                        {(cf.options ?? []).map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input name={`custom_${cf.key}`} type={cf.type === 'number' ? 'number' : cf.type === 'date' ? 'date' : 'text'} defaultValue={String(lead.custom?.[cf.key] ?? '')} className={inputCls} />
                    )}
                  </F>
                ))}
                <F label="Tags (comma separated)" wide>
                  <input name="tags" defaultValue={(lead.tags ?? []).join(', ')} className={inputCls} />
                </F>
                <F label="Next action" wide>
                  <input name="next_action" defaultValue={lead.next_action ?? ''} className={inputCls} />
                </F>
                <F label="Requirements" wide>
                  <textarea name="requirements" rows={4} defaultValue={lead.requirements ?? ''} className={inputCls} />
                </F>
                <datalist id="industries">
                  {c.industries.map((i) => (
                    <option key={i.key} value={i.key}>
                      {i.label}
                    </option>
                  ))}
                </datalist>
                <div className="sm:col-span-2">
                  <button className={btnCls}>Save profile</button>
                </div>
              </form>
            ) : (
              <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
                {(
                  [
                    ['Email', lead.email],
                    ['Phone', lead.phone],
                    ['Company', lead.company],
                    ['Industry', lead.industry],
                    ['Customer type', lead.customer_type && labelize(lead.customer_type)],
                    ['Service', svcName],
                    ['Budget', lead.budget],
                    ['Timeline', lead.timeline],
                    ['Tags', (lead.tags ?? []).join(', ')],
                    ['Requirements', lead.requirements],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11.5px] uppercase tracking-wider text-white/45">{k}</dt>
                    <dd className="text-white/85">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>

          <Panel title="Lead score" subtitle={`Qualified at ${c.scoring.qualifiedThreshold} · high-intent at ${c.scoring.highIntentThreshold} · rules in Developer › CRM`}>
            {breakdown.length ? (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {breakdown.map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-[12.5px]">
                    <span className="text-white/75">{SIGNAL_LABELS[k] ?? k}</span>
                    <span className="font-semibold text-emerald-300">+{v}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-white/45">No scoring signals yet.</p>
            )}
          </Panel>

          {can(role, 'leads.delete') && (
            <form action={deleteLeadAction} className="text-right">
              <input type="hidden" name="id" value={lead.id} />
              <button className="text-[12px] text-red-300/80 hover:text-red-300">Delete lead permanently</button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Tasks & follow-ups">
            {tasks.length ? (
              <ul className="mb-3 space-y-1.5">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 text-[13px]">
                    <form action={toggleTaskAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="done" value="1" />
                      <button aria-label="Mark done" className="grid h-5 w-5 place-items-center rounded-md border border-white/25 hover:border-emerald-400 hover:bg-emerald-400/20" />
                    </form>
                    <span className="flex-1 text-white">{t.title}</span>
                    <span className={`text-[11.5px] ${t.due_at && t.due_at < Date.now() ? 'text-red-300' : 'text-white/45'}`}>{t.due_at ? fmtDateTime(t.due_at) : ''}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-[13px] text-white/45">No open tasks.</p>
            )}
            {editable && (
              <form action={taskAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input name="title" required placeholder="e.g. Send proposal" className={inputCls} />
                <input name="due_at" type="datetime-local" className={inputCls} aria-label="Due" />
                <select name="type" className={inputCls} aria-label="Type">
                  <option value="follow_up">Follow-up</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="reminder">Reminder</option>
                </select>
                <button className={btnGhost}>Add task</button>
              </form>
            )}
          </Panel>

          {appts.length > 0 && (
            <Panel title="Consultations" actions={<Link href="/admin/appointments" className="text-[12px] font-semibold text-brand2">Manage →</Link>}>
              <ul className="space-y-2 text-[13px]">
                {appts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-white/85">{a.scheduled_at ? fmtDateTime(a.scheduled_at) : `Preferred: ${a.preferred_time ?? '—'}`}</span>
                    <span className="text-[11px] font-bold uppercase text-white/60">{a.status}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {convs.length > 0 && (
            <Panel title="AI conversations">
              <ul className="space-y-2 text-[13px]">
                {convs.map((cv) => (
                  <li key={cv.id}>
                    <Link href={`/admin/conversations/${cv.id}`} className="block rounded-xl bg-white/[0.03] px-3 py-2 hover:bg-white/[0.06]">
                      <span className="flex items-center justify-between">
                        <span className="font-semibold text-white">{cv.channel === 'voice' ? '🎙 Voice' : '💬 Chat'}</span>
                        <span className="text-[11.5px] text-white/45">{fmtDateTime(cv.started_at)}</span>
                      </span>
                      <span className="block truncate text-[12px] text-white/55">
                        {cv.intent ?? labelize(cv.outcome ?? cv.status)} · {cv.turn_count} turns · {cv.action_count} actions
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Activity">
            {editable && (
              <form action={noteAction} className="mb-4 space-y-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <textarea name="body" required rows={2} placeholder="Add a note, or log a call / email / meeting…" className={inputCls} />
                <div className="flex gap-2">
                  <select name="kind" className={`${inputCls} w-auto`} aria-label="Type">
                    <option value="note">Note</option>
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                  </select>
                  <button className={btnCls}>Add</button>
                </div>
              </form>
            )}
            {timeline.length ? (
              <ol className="relative space-y-3 border-l border-white/10 pl-4">
                {timeline.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[25px] top-0 grid h-[18px] w-[18px] place-items-center rounded-full bg-[#0b1020] text-[11px]">{ICON[a.type] ?? '•'}</span>
                    <p className="text-[13px] font-semibold text-white">{a.title}</p>
                    {a.body && <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-white/65">{a.body}</p>}
                    <p className="mt-0.5 text-[11px] text-white/35">
                      {fmtDateTime(a.created_at)}
                      {a.by_name ? ` · ${a.by_name}` : ''}
                      {a.conversation_id && (
                        <>
                          {' · '}
                          <Link href={`/admin/conversations/${a.conversation_id}`} className="hover:text-white">
                            transcript
                          </Link>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>No activity yet.</Empty>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
