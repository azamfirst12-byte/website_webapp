import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { listTasks } from '@/lib/crm';
import { assignableStaff } from '@/lib/admin-users';
import { fmtDateTime, labelize } from '@/lib/format';
import { can } from '@/lib/permissions';
import { Empty, PageHeader, Panel, Tabs, btnCls, inputCls } from '@/components/admin/ui';
import { taskAction, toggleTaskAction } from '../../actions';

export const metadata = { title: 'Tasks & follow-ups' };

export default async function Tasks({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const { scope = 'mine' } = await searchParams;
  const manageAll = can(session.user.role, 'tasks.manage_all');
  const sc = (['mine', 'all', 'overdue', 'done'].includes(scope) ? scope : 'mine') as 'mine' | 'all' | 'overdue' | 'done';
  const [rows, staff] = await Promise.all([listTasks(ws, { id: session.user.id, role: session.user.role }, sc), manageAll ? assignableStaff() : Promise.resolve([])]);
  const now = Date.now();
  const groups = sc === 'done' ? [{ label: 'Completed', items: rows }] : [
    { label: 'Overdue', items: rows.filter((t) => t.due_at && t.due_at < now) },
    { label: 'Today', items: rows.filter((t) => t.due_at && t.due_at >= now && t.due_at < now + 86_400_000) },
    { label: 'Upcoming', items: rows.filter((t) => t.due_at && t.due_at >= now + 86_400_000) },
    { label: 'No due date', items: rows.filter((t) => !t.due_at) },
  ];
  return (
    <>
      <PageHeader title="Tasks, reminders & follow-ups" subtitle="Follow-ups are created automatically for every new lead; add your own below." />
      <Tabs
        current={sc}
        items={[
          { key: 'mine', label: 'My tasks', href: '/admin/tasks?scope=mine' },
          ...(manageAll ? [{ key: 'all', label: 'Everyone', href: '/admin/tasks?scope=all' }] : []),
          { key: 'overdue', label: 'Overdue', href: '/admin/tasks?scope=overdue' },
          { key: 'done', label: 'Completed', href: '/admin/tasks?scope=done' },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {rows.length === 0 && <Empty>No tasks here.</Empty>}
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <Panel key={g.label} title={`${g.label} · ${g.items.length}`}>
                <ul className="divide-y divide-white/[0.05]">
                  {g.items.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                      {session.user.role !== 'viewer' && (
                        <form action={toggleTaskAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="done" value={t.done_at ? '0' : '1'} />
                          <button aria-label={t.done_at ? 'Mark not done' : 'Mark done'} className={`grid h-5 w-5 place-items-center rounded-md border ${t.done_at ? 'border-emerald-400 bg-emerald-400/30 text-[11px]' : 'border-white/25 hover:border-emerald-400'}`}>
                            {t.done_at ? '✓' : ''}
                          </button>
                        </form>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${t.done_at ? 'text-white/45 line-through' : 'text-white'}`}>{t.title}</span>
                        <span className="text-[11.5px] text-white/45">
                          {labelize(t.type)}
                          {t.priority === 'high' && <b className="ml-1 text-red-300">· high priority</b>}
                          {t.lead_id && (
                            <>
                              {' · '}
                              <Link href={`/admin/leads/${t.lead_id}`} className="hover:text-white">
                                {t.lead_name || `Lead #${t.lead_id}`}
                              </Link>
                            </>
                          )}
                          {manageAll && ` · ${t.assignee ?? 'Unassigned'}`}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[12px] ${t.due_at && t.due_at < now && !t.done_at ? 'text-red-300' : 'text-white/50'}`}>{fmtDateTime(t.done_at ?? t.due_at)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
        </div>
        {can(session.user.role, 'leads.edit') && (
          <Panel title="New reminder">
            <form action={taskAction} className="space-y-2">
              <input name="title" required placeholder="e.g. Call back Omar about the proposal" className={inputCls} />
              <input name="due_at" type="datetime-local" className={inputCls} aria-label="Due" />
              <div className="grid grid-cols-2 gap-2">
                <select name="type" className={inputCls} aria-label="Type">
                  <option value="reminder">Reminder</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                </select>
                <select name="priority" defaultValue="normal" className={inputCls} aria-label="Priority">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              {staff.length > 0 && (
                <select name="assigned_to" defaultValue={session.user.id} className={inputCls} aria-label="Assign to">
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.username}
                    </option>
                  ))}
                </select>
              )}
              <button className={`${btnCls} w-full`}>Add</button>
            </form>
          </Panel>
        )}
      </div>
    </>
  );
}
