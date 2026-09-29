import { requireAdmin } from '@/lib/auth';
import { listStaff } from '@/lib/admin-users';
import { ago } from '@/lib/format';
import { ROLE_HELP, ROLE_LABEL, ROLES } from '@/lib/permissions';
import { DemoTag, PageHeader, Panel, btnGhost, inputCls } from '@/components/admin/ui';
import { CreateStaffForm, ResetStaffPassword } from '@/components/admin/TeamForms';
import { updateStaffAction } from '../../actions';

export const metadata = { title: 'Team' };

export default async function Team() {
  const session = await requireAdmin('team.manage');
  const staff = await listStaff();
  return (
    <>
      <PageHeader title="Team & permissions" subtitle="Staff accounts for this dashboard. Developer accounts are separate and managed in /developer." />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="text-[11.5px] uppercase tracking-wider text-white/45">
                <tr>
                  <th className="py-2 pr-3">Person</th>
                  <th className="py-2 pr-3">Role & status</th>
                  <th className="py-2 pr-3 text-right">Open leads</th>
                  <th className="py-2 pr-3">Last sign-in</th>
                  <th className="py-2">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {staff.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-white">
                        {u.full_name || u.username} {u.id === session.user.id && <span className="text-[11px] text-white/40">(you)</span>} <DemoTag show={u.is_demo} />
                      </p>
                      <p className="text-[12px] text-white/45">
                        {u.username}
                        {u.email ? ` · ${u.email}` : ''}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <form action={updateStaffAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <select name="role" defaultValue={u.role} className={`${inputCls} w-auto`} aria-label="Role">
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <select name="active" defaultValue={u.active ? '1' : '0'} className={`${inputCls} w-auto`} aria-label="Status">
                          <option value="1">Active</option>
                          <option value="0">Disabled</option>
                        </select>
                        <button className={btnGhost}>Save</button>
                      </form>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-white/70">{u.open_leads}</td>
                    <td className="py-3 pr-3 text-white/55">{ago(u.last_login_at)}</td>
                    <td className="py-3">{!u.is_demo && <ResetStaffPassword id={u.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Add a staff member">
            <CreateStaffForm />
          </Panel>
          <Panel title="Roles">
            <ul className="space-y-2 text-[12.5px]">
              {ROLES.map((r) => (
                <li key={r}>
                  <b className="text-white">{ROLE_LABEL[r]}</b> <span className="text-white/55">— {ROLE_HELP[r]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-white/45">New leads are assigned round-robin to active Sales reps (configurable in Developer › CRM).</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
