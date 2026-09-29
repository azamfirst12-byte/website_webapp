import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { getConversation } from '@/lib/conversations';
import { one } from '@/lib/db';
import { duration, fmtDateTime, labelize } from '@/lib/format';
import { can } from '@/lib/permissions';
import { ACTION_LABEL } from '@/lib/tool-defs';
import { DemoTag, Panel } from '@/components/admin/ui';

export const metadata = { title: 'Conversation' };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const { id } = await params;
  const c = await getConversation(id);
  if (!c || c.workspace_id !== ws.id) notFound();
  const lead = c.lead_id ? await one<{ id: number; name: string; email: string | null; assigned_to: number | null }>(`SELECT id, name, email, assigned_to FROM leads WHERE id=?`, [c.lead_id]) : null;
  if (lead && !can(session.user.role, 'leads.view_all') && !can(session.user.role, 'leads.edit_all') && lead.assigned_to !== null && Number(lead.assigned_to) !== session.user.id) notFound();
  const visitor = await one<{ source: string; device: string | null; visits: number; landing_path: string | null }>(`SELECT source, device, visits, landing_path FROM visitors WHERE id=?`, [c.visitor_id]);
  const s = c.summary;
  const actions = c.transcript.filter((m) => m.role === 'action');

  return (
    <>
      <Link href="/admin/conversations" className="text-[12.5px] text-white/50 hover:text-white">
        ← Conversations
      </Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-head text-[24px] font-extrabold text-white">{c.channel === 'voice' ? '🎙 Voice conversation' : '💬 Chat conversation'}</h1>
        {c.status === 'open' && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold uppercase text-emerald-200">Live</span>}
        {c.handoff && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-100">Hand-over requested</span>}
        <DemoTag show={c.is_demo} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title="Transcript" subtitle={`${fmtDateTime(c.started_at)} · ${c.turn_count} visitor turns · ${c.action_count} website actions`}>
          {c.transcript.length ? (
            <ol className="space-y-2.5">
              {c.transcript.map((m, i) =>
                m.role === 'action' ? (
                  <li key={i} className={`pl-2 text-[11.5px] ${m.ok === false ? 'text-red-300' : 'text-cyan-200/80'}`}>
                    ⚡ {ACTION_LABEL[m.text.split('(')[0] as keyof typeof ACTION_LABEL] ?? m.text.split('(')[0]} <span className="text-white/35">{m.text.slice(m.text.indexOf('('))}</span>
                    {m.ok === false && ' — failed'}
                  </li>
                ) : (
                  <li key={i} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug ${m.role === 'user' ? 'rounded-br-md bg-brand/35 text-white' : 'rounded-bl-md border border-white/10 bg-white/[0.04] text-white/90'}`} dir="auto">
                      <p className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white/40">{m.role === 'user' ? 'Visitor' : ws.config.assistant.name}</p>
                      {m.text}
                    </div>
                  </li>
                ),
              )}
            </ol>
          ) : (
            <p className="text-[13px] text-white/45">{c.status === 'open' ? 'The conversation is in progress; the transcript is saved every few seconds.' : 'No transcript.'}</p>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="AI summary">
            {s ? (
              <div className="space-y-3 text-[13.5px]">
                <p className="leading-relaxed text-white/85">{s.summary}</p>
                <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
                  <div>
                    <dt className="text-white/45">Intent</dt>
                    <dd className="text-white">{labelize(c.intent_category ?? s.intent_category)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Buying intent</dt>
                    <dd className="text-white">{labelize(s.intent_level)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Sentiment</dt>
                    <dd className="text-white">{labelize(s.sentiment)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Outcome</dt>
                    <dd className="text-white">{labelize(c.outcome)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Language</dt>
                    <dd className="text-white">{(c.language ?? s.language ?? '—').toUpperCase()}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Success</dt>
                    <dd className="text-white">{c.success === null ? '—' : c.success ? 'Yes' : 'No'}</dd>
                  </div>
                </dl>
                {s.next_actions?.length > 0 && (
                  <div>
                    <p className="text-[11.5px] font-semibold uppercase tracking-wider text-white/45">Next actions</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-white/80">
                      {s.next_actions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.questions?.length > 0 && (
                  <div>
                    <p className="text-[11.5px] font-semibold uppercase tracking-wider text-white/45">Questions asked</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-white/70">
                      {s.questions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-white/45">{c.status === 'open' ? 'Written when the conversation ends (or after 30 minutes of inactivity).' : 'Summary is being generated…'}</p>
            )}
          </Panel>
          <Panel title="Details">
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Lead</dt>
                <dd>
                  {lead ? (
                    <Link className="text-brand2 hover:underline" href={`/admin/leads/${lead.id}`}>
                      {lead.name || lead.email}
                    </Link>
                  ) : (
                    'Anonymous'
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Duration</dt>
                <dd className="text-white/85">{c.ended_at ? duration(c.ended_at - c.started_at) : 'In progress'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Started on</dt>
                <dd className="text-white/85">{c.entry_path ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Traffic source</dt>
                <dd className="text-white/85">{labelize(visitor?.source)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Device · visits</dt>
                <dd className="text-white/85">
                  {labelize(visitor?.device)} · {visitor?.visits ?? 1}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Website actions</dt>
                <dd className="text-white/85">
                  {actions.length} ({actions.filter((a) => a.ok === false).length} failed)
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
