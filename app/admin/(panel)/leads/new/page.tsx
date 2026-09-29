import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { assignableStaff } from '@/lib/admin-users';
import { labelize } from '@/lib/format';
import { can } from '@/lib/permissions';
import { PageHeader, Panel, btnCls, inputCls } from '@/components/admin/ui';
import { createLeadAction } from '../../../actions';

export const metadata = { title: 'New lead' };

const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-[12px] font-semibold text-white/60">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

export default async function NewLead() {
  const session = await requireAdmin('leads.edit');
  const ws = await getActiveWorkspace();
  const c = ws.config;
  const staff = can(session.user.role, 'leads.assign') ? await assignableStaff() : [];
  return (
    <>
      <PageHeader title="New lead" subtitle="For enquiries that came by phone, email, events or referrals." />
      <Panel>
        <form action={createLeadAction} className="grid gap-4 sm:grid-cols-2">
          <L label="Name *">
            <input name="name" required className={inputCls} />
          </L>
          <L label="Company">
            <input name="company" className={inputCls} />
          </L>
          <L label="Email">
            <input name="email" type="email" className={inputCls} />
          </L>
          <L label="Phone / WhatsApp">
            <input name="phone" className={inputCls} />
          </L>
          <L label="Industry">
            <select name="industry" className={inputCls}>
              <option value="">—</option>
              {c.industries.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </select>
          </L>
          <L label="Customer type">
            <select name="customer_type" className={inputCls}>
              <option value="">—</option>
              {c.crm.customerTypes.map((t) => (
                <option key={t} value={t}>
                  {labelize(t)}
                </option>
              ))}
            </select>
          </L>
          <L label="Interested service">
            <select name="service" className={inputCls}>
              <option value="">—</option>
              {c.services.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </L>
          <L label="Lead source">
            <select name="source" defaultValue="manual" className={inputCls}>
              {c.crm.sources.map((s) => (
                <option key={s} value={s}>
                  {labelize(s)}
                </option>
              ))}
            </select>
          </L>
          <L label="Budget">
            <input name="budget" className={inputCls} placeholder="$3,000 – $7,500" />
          </L>
          <L label="Timeline">
            <input name="timeline" className={inputCls} placeholder="Within 1 month" />
          </L>
          <L label={`Estimated value (${c.pricing.currency})`}>
            <input name="value" type="number" min={0} step="1" className={inputCls} />
          </L>
          {staff.length > 0 && (
            <L label="Assign to">
              <select name="assigned_to" className={inputCls}>
                <option value="">Round-robin / unassigned</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.username}
                  </option>
                ))}
              </select>
            </L>
          )}
          <div className="sm:col-span-2">
            <L label="Requirements / notes">
              <textarea name="requirements" rows={4} className={inputCls} />
            </L>
          </div>
          <div className="sm:col-span-2">
            <button className={btnCls}>Create lead</button>
          </div>
        </form>
      </Panel>
    </>
  );
}
