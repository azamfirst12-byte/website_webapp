import { requireAdmin } from '@/lib/auth';
import { getAdminById } from '@/lib/admin-users';
import { getActiveWorkspace } from '@/lib/workspace';
import { can, ROLE_HELP, ROLE_LABEL } from '@/lib/permissions';
import { tx } from '@/lib/db';
import { demoCounts } from '@/lib/demo-data';
import { mailConfigured } from '@/lib/mailer';
import { PageHeader, Panel } from '@/components/admin/ui';
import { AccountForm, PasswordForm } from '@/components/admin/AuthForms';
import { DemoButton } from '@/components/admin/DemoData';

export const metadata = { title: 'Account' };

export default async function Account() {
  const session = await requireAdmin();
  const me = (await getAdminById(session.user.id))!;
  const ws = await getActiveWorkspace();
  const demo = can(session.user.role, 'demo.manage') ? await tx((db) => demoCounts(db, ws.id)) : null;
  return (
    <>
      <PageHeader title="Your account" subtitle={`${ROLE_LABEL[me.role]} — ${ROLE_HELP[me.role]}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Profile">
          <AccountForm username={me.username} email={me.email} fullName={me.full_name} />
        </Panel>
        <Panel title="Password" subtitle="Changing it signs out your other devices">
          <PasswordForm />
          {!mailConfigured() && <p className="mt-3 text-[12px] text-amber-200/80">Email (SMTP) is not configured, so “Forgot password” emails can’t be sent. Recovery from the server: npm run reset-admin.</p>}
        </Panel>
        {demo && (
          <Panel title="Demo data" subtitle="Realistic sample data so dashboards and the CRM work from day one" className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['Visitors', demo.visitors],
                  ['Conversations', demo.conversations],
                  ['Leads', demo.leads],
                  ['Consultations', demo.appointments],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-white/45">{k}</p>
                  <p className="font-head text-[20px] font-bold text-white">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-white/55">
              Every sample row is labelled DEMO (people use @demo.example emails and +1 555-01xx numbers; demo staff can’t sign in). Removing it never touches real leads, conversations or settings.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <DemoButton op="load" label={demo.present ? 'Reset demo data' : 'Load demo data'} />
              {demo.present && <DemoButton op="remove" label="Remove demo data" danger />}
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
