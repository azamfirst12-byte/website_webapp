import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/admin/AuthShell';
import { DevLoginForm } from '@/components/developer/DevLoginForm';
import { getDeveloperSession, missingDevConfig } from '@/lib/dev-auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Developer sign in', robots: { index: false } };

export default async function DevLogin() {
  const missing = await missingDevConfig();
  if (!missing.length && (await getDeveloperSession())) redirect('/developer');
  return (
    <AuthShell variant="developer" title="Developer Control Center" subtitle="Site structure · AI behaviour · actions · integrations">
      {missing.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-300/40 bg-amber-400/15 p-3 text-[13px] text-amber-50" role="alert">
          <p className="font-bold">Missing settings:</p>
          <ul className="mt-1 list-disc pl-4">
            {missing.map((m) => (
              <li key={m}>
                <code>{m}</code>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-amber-50/80">Developer accounts are separate from admin accounts. Add these to the environment and redeploy.</p>
        </div>
      )}
      <DevLoginForm />
      <p className="mt-6 border-t border-white/10 pt-4 text-center text-[12px] text-white/40">Business staff: use /admin.</p>
    </AuthShell>
  );
}
