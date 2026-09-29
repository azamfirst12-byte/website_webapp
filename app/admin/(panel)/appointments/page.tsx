import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { listAppointments } from '@/lib/crm';
import { fmtDateTime, labelize, toLocalInput } from '@/lib/format';
import { can } from '@/lib/permissions';
import { Empty, PageHeader, Tabs, btnCls, inputCls } from '@/components/admin/ui';
import { appointmentAction } from '../../actions';

export const metadata = { title: 'Appointments' };

const STATUS_CLS: Record<string, string> = {
  requested: 'bg-amber-400/15 text-amber-100',
  confirmed: 'bg-brand2/15 text-cyan-100',
  completed: 'bg-emerald-400/15 text-emerald-200',
  cancelled: 'bg-white/5 text-white/45',
  no_show: 'bg-red-500/15 text-red-200',
};

export default async function Appointments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const { status = 'upcoming' } = await searchParams;
  const rows = await listAppointments(ws, { id: session.user.id, role: session.user.role }, status === 'all' ? undefined : status);
  const svc = new Map(ws.config.services.map((s) => [s.slug, s.name]));
  const editable = can(session.user.role, 'appointments.manage');
  return (
    <>
      <PageHeader title="Appointments & consultation requests" subtitle="Requested by visitors (voice, chat or forms). Confirm a time and add the meeting link." />
      <Tabs
        current={status}
        items={['upcoming', 'requested', 'confirmed', 'completed', 'cancelled', 'all'].map((k) => ({ key: k, label: labelize(k), href: `/admin/appointments?status=${k}` }))}
      />
      {rows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((a) => (
            <article key={a.id} className="rounded-2xl border border-white/[0.08] bg-[#0b1020] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/admin/leads/${a.lead_id}`} className="text-[15px] font-bold text-white hover:underline">
                    {a.lead_name}
                  </Link>
                  <p className="text-[12.5px] text-white/50">{[a.email, a.phone].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_CLS[a.status]}`}>{labelize(a.status)}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                <div>
                  <dt className="text-white/45">Topic</dt>
                  <dd className="text-white/85">{a.service ? (svc.get(a.service) ?? a.service) : a.topic}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Preferred</dt>
                  <dd className="text-white/85">{a.preferred_time ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Scheduled</dt>
                  <dd className="text-white/85">{a.scheduled_at ? fmtDateTime(a.scheduled_at) : 'Not yet'}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Via · owner</dt>
                  <dd className="text-white/85">
                    {labelize(a.channel ?? 'form')} · {a.assignee ?? 'Unassigned'}
                  </dd>
                </div>
              </dl>
              {a.notes && <p className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px] text-white/65">{a.notes}</p>}
              {a.meeting_link && (
                <a href={a.meeting_link} target="_blank" rel="noreferrer" className="mt-2 block truncate text-[12.5px] text-brand2 hover:underline">
                  {a.meeting_link}
                </a>
              )}
              {editable && (
                <form action={appointmentAction} className="mt-3 grid gap-2 border-t border-white/[0.06] pt-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="datetime-local" name="scheduled_at" defaultValue={toLocalInput(a.scheduled_at)} className={inputCls} aria-label="Scheduled time" />
                  <select name="status" defaultValue={a.status} className={inputCls} aria-label="Status">
                    {Object.keys(STATUS_CLS).map((s) => (
                      <option key={s} value={s}>
                        {labelize(s)}
                      </option>
                    ))}
                  </select>
                  <input name="meeting_link" defaultValue={a.meeting_link ?? ''} placeholder="Meeting link" className={`${inputCls} sm:col-span-2`} />
                  <button className={`${btnCls} sm:col-span-2`}>Save</button>
                </form>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>No appointments in this view.</Empty>
      )}
    </>
  );
}
