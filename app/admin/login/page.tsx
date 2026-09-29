import { redirect } from 'next/navigation';
import { getAdminSession, missingAuthConfig } from '@/lib/auth';
import { adminUsernames } from '@/lib/admin-users';
import { AuthShell } from '@/components/admin/AuthShell';
import { AdminSignInCard } from '@/components/admin/AuthForms';
import { ROLE_LABEL, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin sign in', robots: { index: false } };

/** User-ID chips: shown in development, on the live site only with ADMIN_SHOW_ACCOUNTS=on (never passwords). */
function showAccountChips() {
  const v = process.env.ADMIN_SHOW_ACCOUNTS;
  if (v === 'on') return true;
  if (v === 'off') return false;
  return process.env.NODE_ENV !== 'production';
}

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const missing = await missingAuthConfig();
  if (!missing.length && (await getAdminSession())) redirect('/admin');
  const { reset } = await searchParams;
  let accounts: { username: string; role: string }[] = [];
  if (!missing.length && showAccountChips()) {
    try {
      accounts = (await adminUsernames()).map((a) => ({ username: a.username, role: ROLE_LABEL[a.role as Role] ?? a.role }));
    } catch {}
  }
  const notice =
    missing.length > 0 ? (
      <div className="rounded-xl border border-amber-300/40 bg-amber-400/15 p-3 text-[13px] text-amber-50" role="alert">
        <p className="font-bold">Missing settings:</p>
        <ul className="mt-1 list-disc pl-4">
          {missing.map((m) => (
            <li key={m}>
              <code>{m}</code>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-amber-50/80">Add them to .env.local (or Vercel → Environment Variables) and restart / redeploy.</p>
      </div>
    ) : reset === '1' ? (
      <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-[13px] text-emerald-100" role="status">
        Password updated. Sign in with your new password.
      </p>
    ) : null;
  return (
    <AuthShell title="Business Admin" subtitle="Leads · pipeline · conversations · reports">
      <AdminSignInCard accounts={accounts} inviteEnabled={!!process.env.ADMIN_INVITE_CODE?.trim()} notice={notice} />
      <p className="mt-6 border-t border-white/10 pt-4 text-center text-[12px] text-white/40">Developers: use /developer (separate login).</p>
    </AuthShell>
  );
}
